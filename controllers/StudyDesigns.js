const StudyDesigns = require("../models/StudyDesigns")
const Study = require("../models/Study") // Required for validating study existence
const mongoose = require("mongoose");
const crypto = require("crypto"); // or use uuid if preferred



// @desc    Get all study designs
// @route   GET /api/study-designs
// @access  Private
exports.getStudyDesigns = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { study_design: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } },
      ]
    }

    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true"
    }

    if (req.query.startDate || req.query.endDate) {
      query.date_created = {}
      if (req.query.startDate) {
        query.date_created.$gte = new Date(req.query.startDate)
      }
      if (req.query.endDate) {
        query.date_created.$lte = new Date(req.query.endDate)
      }
    }

    const sortBy = req.query.sortBy || "date_created"
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1
    const sort = { [sortBy]: sortOrder }

    const studyDesigns = await StudyDesigns.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created",
        options: { sort: { date_created: -1 } }
      })
      .lean()

    const total = await StudyDesigns.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: studyDesigns.length,
      total,
      pagination,
      data: studyDesigns,
    })
  } catch (error) {
    console.error("Error in getStudyDesigns:", error)
    next(error)
  }
}

// @desc    Get single study design
// @route   GET /api/study-designs/:id
// @access  Private
exports.getStudyDesign = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study design ID format",
      })
    }

    const studyDesign = await StudyDesigns.findById(req.params.id).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    res.status(200).json({
      success: true,
      data: studyDesign,
    })
  } catch (error) {
    console.error("Error in getStudyDesign:", error)
    next(error)
  }
}

// @desc    Create study design
// @route   POST /api/study-designs
// @access  Private/Admin
exports.createStudyDesign = async (req, res, next) => {
  try {
    const { study_design, description, isActive, studies = [] } = req.body

    // Validation
    if (!study_design || study_design.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Study design name is required",
      })
    }

    const existingDesign = await StudyDesigns.findOne({
      study_design: { $regex: new RegExp(`^${study_design.trim()}$`, "i") },
    })

    if (existingDesign) {
      return res.status(400).json({
        success: false,
        message: "Study design with this name already exists",
      })
    }

    // Convert study IDs to ObjectId if needed
    const studyObjectIds = studies.map((id) => new mongoose.Types.ObjectId(id))

    const studyDesign = await StudyDesigns.create({
      study_design: study_design.trim(),
      description: description ? description.trim() : "",
      isActive: isActive !== undefined ? isActive : true,
      studies: studyObjectIds,
    })

    // Optional activity log
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(
        `created_study_design:${studyDesign.study_design}`,
        req.ip,
        req.get("User-Agent")
      )
    }

    res.status(201).json({
      success: true,
      data: studyDesign,
    })
  } catch (error) {
    console.error("Error in createStudyDesign:", error)
    next(error)
  }
}

// @desc    Update study design
// @route   PUT /api/study-designs/:id
// @access  Private/Admin
exports.updateStudyDesign = async (req, res, next) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study design ID format",
      })
    }

    const { study_design, description, isActive, studies } = req.body

    if (study_design && study_design.trim()) {
      const existingDesign = await StudyDesigns.findOne({
        _id: { $ne: req.params.id },
        study_design: { $regex: new RegExp(`^${study_design.trim()}$`, "i") },
      })

      if (existingDesign) {
        return res.status(400).json({
          success: false,
          message: "Study design with this name already exists",
        })
      }
    }

    const updateData = {}
    if (study_design !== undefined && study_design.trim()) updateData.study_design = study_design.trim()
    if (description !== undefined) updateData.description = description ? description.trim() : ""
    if (isActive !== undefined) updateData.isActive = isActive

    // ✅ Add study association update
    if (studies && Array.isArray(studies)) {
      updateData.studies = studies.map((id) => new mongoose.Types.ObjectId(id))
    }

    const studyDesign = await StudyDesigns.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(`updated_study_design:${studyDesign.study_design}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      data: studyDesign,
    })
  } catch (error) {
    console.error("Error in updateStudyDesign:", error)
    next(error)
  }
}

// @desc    Delete study design
// @route   DELETE /api/study-designs/:id
// @access  Private/Admin

exports.deleteStudyDesign = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study design ID format",
      })
    }

    const studyDesign = await StudyDesigns.findById(id).populate("studies")

    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    // OPTIONAL: Remove this design from associated studies before deletion
    if (studyDesign.studies && studyDesign.studies.length > 0) {
      await Study.updateMany(
        { _id: { $in: studyDesign.studies.map((s) => s._id) } },
        { $pull: { studydesigns: studyDesign._id } }
      )
    }

    await StudyDesigns.findByIdAndDelete(id)

    // Log activity
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(`deleted_study_design:${studyDesign.study_design}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      message: "Study design deleted successfully",
    })
  } catch (error) {
    console.error("Error in deleteStudyDesign:", error)
    next(error)
  }
}



// @desc    Toggle study design status
// @route   PATCH /api/study-designs/:id/toggle-status
// @access  Private/Admin
exports.toggleStudyDesignStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study design ID format",
      })
    }

    const studyDesign = await StudyDesigns.findById(req.params.id)

    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    studyDesign.isActive = !studyDesign.isActive
    await studyDesign.save()

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `${studyDesign.isActive ? "activated" : "deactivated"}_study_design:${studyDesign.study_design}`,
        req.ip,
        req.get("User-Agent"),
      )
    }

    res.status(200).json({
      success: true,
      data: studyDesign,
    })
  } catch (error) {
    console.error("Error in toggleStudyDesignStatus:", error)
    next(error)
  }
}

// @desc    Get study design statistics
// @route   GET /api/study-designs/stats
// @access  Private
exports.getStudyDesignStats = async (req, res, next) => {
  try {
    // Check if getStatistics method exists on StudyDesigns model
    let stats = {}
    if (typeof StudyDesigns.getStatistics === 'function') {
      stats = await StudyDesigns.getStatistics()
    } else {
      // Fallback manual statistics
      const totalDesigns = await StudyDesigns.countDocuments()
      const activeDesigns = await StudyDesigns.countDocuments({ isActive: true })
      const inactiveDesigns = totalDesigns - activeDesigns
      
      stats = {
        totalDesigns,
        activeDesigns,
        inactiveDesigns
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentDesigns = await StudyDesigns.countDocuments({
      date_created: { $gte: thirtyDaysAgo },
    })

    const designDistribution = await StudyDesigns.aggregate([
      {
        $project: {
          study_design: 1,
          studyCount: { 
            $cond: {
              if: { $isArray: "$studies" },
              then: { $size: "$studies" },
              else: 0
            }
          },
          isActive: 1,
        },
      },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: ["$studyCount", 0] }, then: "No Studies" },
                { case: { $lte: ["$studyCount", 5] }, then: "1-5 Studies" },
                { case: { $lte: ["$studyCount", 10] }, then: "6-10 Studies" },
                { case: { $gt: ["$studyCount", 10] }, then: "10+ Studies" },
              ],
              default: "Unknown",
            },
          },
          count: { $sum: 1 },
        },
      },
    ])

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        recentDesigns,
        designDistribution,
      },
    })
  } catch (error) {
    console.error("Error in getStudyDesignStats:", error)
    next(error)
  }
}

// @desc    Add study to design
// @route   POST /api/study-designs/:id/studies/:studyId
// @access  Private/Admin
exports.addStudyToDesign = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const studyDesign = await StudyDesigns.findById(id)
    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    const study = await Study.findById(studyId)
    if (!study) {
      return res.status(404).json({
        success: false,
        message: "Study not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!studyDesign.studies) {
      studyDesign.studies = []
    }

    // Check if study is already in this design
    const studyExists = studyDesign.studies.some(
      study => study.toString() === studyId
    )

    if (studyExists) {
      return res.status(400).json({
        success: false,
        message: "Study is already in this design",
      })
    }

    studyDesign.studies.push(studyId)
    await studyDesign.save()

    // Populate the updated study design
    await studyDesign.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_study_to_design:${studyDesign.study_design}:${study.study_name || study.protocol_number}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyDesign,
      message: "Study added to design successfully"
    })
  } catch (error) {
    console.error("Error in addStudyToDesign:", error)
    next(error)
  }
}

// @desc    Bulk add studies to design
// @route   POST /api/study-designs/:id/studies/bulk
// @access  Private/Admin
exports.bulkAddStudiesToDesign = async (req, res, next) => {
  try {
    const { id } = req.params
    const { studyIds } = req.body

    if (!Array.isArray(studyIds) || studyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "studyIds must be a non-empty array",
      })
    }

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study design ID format",
      })
    }

    const invalidIds = studyIds.filter(studyId => !studyId.match(/^[0-9a-fA-F]{24}$/))
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid study ID format",
        invalidIds
      })
    }

    const studyDesign = await StudyDesigns.findById(id)
    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    // Verify all studies exist
    const studies = await Study.find({ _id: { $in: studyIds } })
    const foundStudyIds = studies.map(study => study._id.toString())
    const missingStudyIds = studyIds.filter(id => !foundStudyIds.includes(id))

    if (missingStudyIds.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Some studies not found",
        missingStudyIds
      })
    }

    // Initialize studies array if it doesn't exist
    if (!studyDesign.studies) {
      studyDesign.studies = []
    }

    // Filter out studies that are already in the design
    const existingStudyIds = studyDesign.studies.map(study => study.toString())
    const newStudyIds = studyIds.filter(studyId => !existingStudyIds.includes(studyId))

    if (newStudyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All studies are already in this design",
      })
    }

    // Add new studies
    studyDesign.studies.push(...newStudyIds)
    await studyDesign.save()

    // Populate the updated study design
    await studyDesign.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_studies_to_design:${studyDesign.study_design}:${newStudyIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyDesign,
      message: `${newStudyIds.length} studies added to design successfully`,
      addedCount: newStudyIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddStudiesToDesign:", error)
    next(error)
  }
}

// @desc    Remove study from design
// @route   DELETE /api/study-designs/:id/studies/:studyId
// @access  Private/Admin
exports.removeStudyFromDesign = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const studyDesign = await StudyDesigns.findById(id)
    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!studyDesign.studies) {
      studyDesign.studies = []
    }

    const originalLength = studyDesign.studies.length
    studyDesign.studies = studyDesign.studies.filter(
      study => study.toString() !== studyId
    )

    // Check if study was actually removed
    if (studyDesign.studies.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Study not found in this design",
      })
    }

    await studyDesign.save()

    // Populate the updated study design
    await studyDesign.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_study_from_design:${studyDesign.study_design}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyDesign,
      message: "Study removed from design successfully"
    })
  } catch (error) {
    console.error("Error in removeStudyFromDesign:", error)
    next(error)
  }
}

// @desc    Get available studies (not in any design)
// @route   GET /api/study-designs/available-studies
// @access  Private
exports.getAvailableStudies = async (req, res, next) => {
  try {
    // Get all study designs and extract assigned study IDs
    const allDesigns = await StudyDesigns.find({}, 'studies').lean()
    const assignedStudyIds = allDesigns
      .flatMap(design => design.studies || [])
      .map(id => id.toString())

    // Get studies not assigned to any design
    const availableStudies = await Study.find({
      _id: { $nin: assignedStudyIds }
    })
    .select('study_name protocol_number study_title date_created status')
    .sort({ date_created: -1 })

    res.status(200).json({
      success: true,
      count: availableStudies.length,
      data: availableStudies,
    })
  } catch (error) {
    console.error("Error in getAvailableStudies:", error)
    next(error)
  }
}

// @desc    Get studies in a specific design
// @route   GET /api/study-designs/:id/studies
// @access  Private
exports.getStudiesInDesign = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study design ID format",
      })
    }

    const studyDesign = await StudyDesigns.findById(id)
      .populate({
        path: 'studies',
        select: 'study_name protocol_number study_title date_created status',
        options: { sort: { date_created: -1 } }
      })

    if (!studyDesign) {
      return res.status(404).json({
        success: false,
        message: "Study design not found",
      })
    }

    res.status(200).json({
      success: true,
      design: {
        _id: studyDesign._id,
        study_design: studyDesign.study_design,
        description: studyDesign.description,
        isActive: studyDesign.isActive
      },
      count: studyDesign.studies ? studyDesign.studies.length : 0,
      data: studyDesign.studies || [],
    })
  } catch (error) {
    console.error("Error in getStudiesInDesign:", error)
    next(error)
  }
}

// @desc    Sync and fix study design relationships
// @route   POST /api/study-designs/sync-relationships
// @access  Private/Admin
exports.syncStudyDesignRelationships = async (req, res, next) => {
  try {
    const issues = []
    const fixes = []

    // Get all study designs
    const studyDesigns = await StudyDesigns.find({})

    for (const design of studyDesigns) {
      if (!design.studies || !Array.isArray(design.studies)) {
        // Fix: Initialize empty studies array
        design.studies = []
        await design.save()
        fixes.push(`Initialized studies array for design: ${design.study_design}`)
        continue
      }

      // Check if all referenced studies exist
      const studyIds = design.studies.map(id => id.toString())
      const existingStudies = await Study.find({ _id: { $in: studyIds } })
      const existingStudyIds = existingStudies.map(study => study._id.toString())
      
      const missingStudyIds = studyIds.filter(id => !existingStudyIds.includes(id))
      
      if (missingStudyIds.length > 0) {
        issues.push({
          design: design.study_design,
          issue: 'References non-existent studies',
          missingStudyIds
        })

        // Fix: Remove non-existent study references
        design.studies = design.studies.filter(id => existingStudyIds.includes(id.toString()))
        await design.save()
        fixes.push(`Removed ${missingStudyIds.length} invalid study references from design: ${design.study_design}`)
      }
    }

    // Check for duplicate study assignments
    const allStudyAssignments = {}
    const duplicateIssues = []

    for (const design of studyDesigns) {
      if (design.studies && design.studies.length > 0) {
        for (const studyId of design.studies) {
          const studyIdStr = studyId.toString()
          if (allStudyAssignments[studyIdStr]) {
            duplicateIssues.push({
              studyId: studyIdStr,
              designs: [allStudyAssignments[studyIdStr], design.study_design]
            })
          } else {
            allStudyAssignments[studyIdStr] = design.study_design
          }
        }
      }
    }

    if (duplicateIssues.length > 0) {
      issues.push({
        type: 'duplicate_assignments',
        issues: duplicateIssues
      })
    }

    res.status(200).json({
      success: true,
      message: 'Study design relationship sync completed',
      issues: issues,
      fixes: fixes,
      summary: {
        totalDesigns: studyDesigns.length,
        issuesFound: issues.length,
        fixesApplied: fixes.length
      }
    })
  } catch (error) {
    console.error("Error in syncStudyDesignRelationships:", error)
    next(error)
  }
}