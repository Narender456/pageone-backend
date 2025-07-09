const StudyPhase = require("../models/StudyPhase")
const Study = require("../models/Study") // Required for validating study existence
const mongoose = require("mongoose");
const crypto = require("crypto"); // or use uuid if preferred



// @desc    Get all study phases
// @route   GET /api/study-phases
// @access  Private
exports.getStudyPhases = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { study_phase: { $regex: req.query.search, $options: "i" } },
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

    const studyPhases = await StudyPhase.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created",
        options: { sort: { date_created: -1 } }
      })
      .lean()

    const total = await StudyPhase.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: studyPhases.length,
      total,
      pagination,
      data: studyPhases,
    })
  } catch (error) {
    console.error("Error in getStudyPhases:", error)
    next(error)
  }
}

// @desc    Get single study phase
// @route   GET /api/study-phases/:id
// @access  Private
exports.getStudyPhase = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study phase ID format",
      })
    }

    const studyPhase = await StudyPhase.findById(req.params.id).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
      })
    }

    res.status(200).json({
      success: true,
      data: studyPhase,
    })
  } catch (error) {
    console.error("Error in getStudyPhase:", error)
    next(error)
  }
}

// @desc    Create study phase
// @route   POST /api/study-phases
// @access  Private/Admin
exports.createStudyPhase = async (req, res, next) => {
  try {
    const { study_phase, description, isActive, studies = [] } = req.body

    // Validation
    if (!study_phase || study_phase.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Study phase name is required",
      })
    }

    const existingPhase = await StudyPhase.findOne({
      study_phase: { $regex: new RegExp(`^${study_phase.trim()}$`, "i") },
    })

    if (existingPhase) {
      return res.status(400).json({
        success: false,
        message: "Study phase with this name already exists",
      })
    }

    // Convert study IDs to ObjectId if needed
    const studyObjectIds = studies.map((id) => new mongoose.Types.ObjectId(id))

    const studyPhase = await StudyPhase.create({
      study_phase: study_phase.trim(),
      description: description ? description.trim() : "",
      isActive: isActive !== undefined ? isActive : true,
      studies: studyObjectIds,
    })

    // Optional activity log
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(
        `created_study_phase:${studyPhase.study_phase}`,
        req.ip,
        req.get("User-Agent")
      )
    }

    res.status(201).json({
      success: true,
      data: studyPhase,
    })
  } catch (error) {
    console.error("Error in createStudyPhase:", error)
    next(error)
  }
}

// @desc    Update study phase
// @route   PUT /api/study-phases/:id
// @access  Private/Admin
exports.updateStudyPhase = async (req, res, next) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study phase ID format",
      })
    }

    const { study_phase, description, isActive, studies } = req.body

    if (study_phase && study_phase.trim()) {
      const existingPhase = await StudyPhase.findOne({
        _id: { $ne: req.params.id },
        study_phase: { $regex: new RegExp(`^${study_phase.trim()}$`, "i") },
      })

      if (existingPhase) {
        return res.status(400).json({
          success: false,
          message: "Study phase with this name already exists",
        })
      }
    }

    const updateData = {}
    if (study_phase !== undefined && study_phase.trim()) updateData.study_phase = study_phase.trim()
    if (description !== undefined) updateData.description = description ? description.trim() : ""
    if (isActive !== undefined) updateData.isActive = isActive

    // ✅ Add study association update
    if (studies && Array.isArray(studies)) {
      updateData.studies = studies.map((id) => new mongoose.Types.ObjectId(id))
    }

    const studyPhase = await StudyPhase.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
      })
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(`updated_study_phase:${studyPhase.study_phase}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      data: studyPhase,
    })
  } catch (error) {
    console.error("Error in updateStudyPhase:", error)
    next(error)
  }
}

// @desc    Delete study phase
// @route   DELETE /api/study-phases/:id
// @access  Private/Admin

exports.deleteStudyPhase = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study phase ID format",
      })
    }

    const studyPhase = await StudyPhase.findById(id).populate("studies")

    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
      })
    }

    // OPTIONAL: Remove this phase from associated studies before deletion
    if (studyPhase.studies && studyPhase.studies.length > 0) {
      await Study.updateMany(
        { _id: { $in: studyPhase.studies.map((s) => s._id) } },
        { $pull: { studyphase: studyPhase._id } }
      )
    }

    await StudyPhase.findByIdAndDelete(id)

    // Log activity
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(`deleted_study_phase:${studyPhase.study_phase}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      message: "Study phase deleted successfully",
    })
  } catch (error) {
    console.error("Error in deleteStudyPhase:", error)
    next(error)
  }
}



// @desc    Toggle study phase status
// @route   PATCH /api/study-phases/:id/toggle-status
// @access  Private/Admin
exports.toggleStudyPhaseStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study phase ID format",
      })
    }

    const studyPhase = await StudyPhase.findById(req.params.id)

    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
      })
    }

    studyPhase.isActive = !studyPhase.isActive
    await studyPhase.save()

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `${studyPhase.isActive ? "activated" : "deactivated"}_study_phase:${studyPhase.study_phase}`,
        req.ip,
        req.get("User-Agent"),
      )
    }

    res.status(200).json({
      success: true,
      data: studyPhase,
    })
  } catch (error) {
    console.error("Error in toggleStudyPhaseStatus:", error)
    next(error)
  }
}

// @desc    Get study phase statistics
// @route   GET /api/study-phases/stats
// @access  Private
exports.getStudyPhaseStats = async (req, res, next) => {
  try {
    // Check if getStatistics method exists on StudyPhase model
    let stats = {}
    if (typeof StudyPhase.getStatistics === 'function') {
      stats = await StudyPhase.getStatistics()
    } else {
      // Fallback manual statistics
      const totalPhases = await StudyPhase.countDocuments()
      const activePhases = await StudyPhase.countDocuments({ isActive: true })
      const inactivePhases = totalPhases - activePhases
      
      stats = {
        totalPhases,
        activePhases,
        inactivePhases
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentPhases = await StudyPhase.countDocuments({
      date_created: { $gte: thirtyDaysAgo },
    })

    const phaseDistribution = await StudyPhase.aggregate([
      {
        $project: {
          study_phase: 1,
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
        recentPhases,
        phaseDistribution,
      },
    })
  } catch (error) {
    console.error("Error in getStudyPhaseStats:", error)
    next(error)
  }
}

// @desc    Add study to phase
// @route   POST /api/study-phases/:id/studies/:studyId
// @access  Private/Admin
exports.addStudyToPhase = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const studyPhase = await StudyPhase.findById(id)
    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
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
    if (!studyPhase.studies) {
      studyPhase.studies = []
    }

    // Check if study is already in this phase
    const studyExists = studyPhase.studies.some(
      study => study.toString() === studyId
    )

    if (studyExists) {
      return res.status(400).json({
        success: false,
        message: "Study is already in this phase",
      })
    }

    studyPhase.studies.push(studyId)
    await studyPhase.save()

    // Populate the updated study phase
    await studyPhase.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_study_to_phase:${studyPhase.study_phase}:${study.study_name || study.protocol_number}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyPhase,
      message: "Study added to phase successfully"
    })
  } catch (error) {
    console.error("Error in addStudyToPhase:", error)
    next(error)
  }
}

// @desc    Bulk add studies to phase
// @route   POST /api/study-phases/:id/studies/bulk
// @access  Private/Admin
exports.bulkAddStudiesToPhase = async (req, res, next) => {
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
        message: "Invalid study phase ID format",
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

    const studyPhase = await StudyPhase.findById(id)
    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
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
    if (!studyPhase.studies) {
      studyPhase.studies = []
    }

    // Filter out studies that are already in the phase
    const existingStudyIds = studyPhase.studies.map(study => study.toString())
    const newStudyIds = studyIds.filter(studyId => !existingStudyIds.includes(studyId))

    if (newStudyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All studies are already in this phase",
      })
    }

    // Add new studies
    studyPhase.studies.push(...newStudyIds)
    await studyPhase.save()

    // Populate the updated study phase
    await studyPhase.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_studies_to_phase:${studyPhase.study_phase}:${newStudyIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyPhase,
      message: `${newStudyIds.length} studies added to phase successfully`,
      addedCount: newStudyIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddStudiesToPhase:", error)
    next(error)
  }
}

// @desc    Remove study from phase
// @route   DELETE /api/study-phases/:id/studies/:studyId
// @access  Private/Admin
exports.removeStudyFromPhase = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const studyPhase = await StudyPhase.findById(id)
    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!studyPhase.studies) {
      studyPhase.studies = []
    }

    const originalLength = studyPhase.studies.length
    studyPhase.studies = studyPhase.studies.filter(
      study => study.toString() !== studyId
    )

    // Check if study was actually removed
    if (studyPhase.studies.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Study not found in this phase",
      })
    }

    await studyPhase.save()

    // Populate the updated study phase
    await studyPhase.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_study_from_phase:${studyPhase.study_phase}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyPhase,
      message: "Study removed from phase successfully"
    })
  } catch (error) {
    console.error("Error in removeStudyFromPhase:", error)
    next(error)
  }
}

// @desc    Get available studies (not in any phase)
// @route   GET /api/study-phases/available-studies
// @access  Private
exports.getAvailableStudies = async (req, res, next) => {
  try {
    // Get all study phases and extract assigned study IDs
    const allPhases = await StudyPhase.find({}, 'studies').lean()
    const assignedStudyIds = allPhases
      .flatMap(phase => phase.studies || [])
      .map(id => id.toString())

    // Get studies not assigned to any phase
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

// @desc    Get studies in a specific phase
// @route   GET /api/study-phases/:id/studies
// @access  Private
exports.getStudiesInPhase = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study phase ID format",
      })
    }

    const studyPhase = await StudyPhase.findById(id)
      .populate({
        path: 'studies',
        select: 'study_name protocol_number study_title date_created status',
        options: { sort: { date_created: -1 } }
      })

    if (!studyPhase) {
      return res.status(404).json({
        success: false,
        message: "Study phase not found",
      })
    }

    res.status(200).json({
      success: true,
      phase: {
        _id: studyPhase._id,
        study_phase: studyPhase.study_phase,
        description: studyPhase.description,
        isActive: studyPhase.isActive
      },
      count: studyPhase.studies ? studyPhase.studies.length : 0,
      data: studyPhase.studies || [],
    })
  } catch (error) {
    console.error("Error in getStudiesInPhase:", error)
    next(error)
  }
}

// @desc    Sync and fix study phase relationships
// @route   POST /api/study-phases/sync-relationships
// @access  Private/Admin
exports.syncStudyPhaseRelationships = async (req, res, next) => {
  try {
    const issues = []
    const fixes = []

    // Get all study phases
    const studyPhases = await StudyPhase.find({})

    for (const phase of studyPhases) {
      if (!phase.studies || !Array.isArray(phase.studies)) {
        // Fix: Initialize empty studies array
        phase.studies = []
        await phase.save()
        fixes.push(`Initialized studies array for phase: ${phase.study_phase}`)
        continue
      }

      // Check if all referenced studies exist
      const studyIds = phase.studies.map(id => id.toString())
      const existingStudies = await Study.find({ _id: { $in: studyIds } })
      const existingStudyIds = existingStudies.map(study => study._id.toString())
      
      const missingStudyIds = studyIds.filter(id => !existingStudyIds.includes(id))
      
      if (missingStudyIds.length > 0) {
        issues.push({
          phase: phase.study_phase,
          issue: 'References non-existent studies',
          missingStudyIds
        })

        // Fix: Remove non-existent study references
        phase.studies = phase.studies.filter(id => existingStudyIds.includes(id.toString()))
        await phase.save()
        fixes.push(`Removed ${missingStudyIds.length} invalid study references from phase: ${phase.study_phase}`)
      }
    }

    // Check for duplicate study assignments
    const allStudyAssignments = {}
    const duplicateIssues = []

    for (const phase of studyPhases) {
      if (phase.studies && phase.studies.length > 0) {
        for (const studyId of phase.studies) {
          const studyIdStr = studyId.toString()
          if (allStudyAssignments[studyIdStr]) {
            duplicateIssues.push({
              studyId: studyIdStr,
              phases: [allStudyAssignments[studyIdStr], phase.study_phase]
            })
          } else {
            allStudyAssignments[studyIdStr] = phase.study_phase
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
      message: 'Study phase relationship sync completed',
      issues: issues,
      fixes: fixes,
      summary: {
        totalPhases: studyPhases.length,
        issuesFound: issues.length,
        fixesApplied: fixes.length
      }
    })
  } catch (error) {
    console.error("Error in syncStudyPhaseRelationships:", error)
    next(error)
  }
}