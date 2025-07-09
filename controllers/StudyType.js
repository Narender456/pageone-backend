const StudyType = require("../models/StudyType")
const Study = require("../models/Study") // Required for validating study existence
const mongoose = require("mongoose");
const crypto = require("crypto"); // or use uuid if preferred

// @desc    Get all study types
// @route   GET /api/study-types
// @access  Private
exports.getStudyTypes = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { study_type: { $regex: req.query.search, $options: "i" } },
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

    const studyTypes = await StudyType.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created",
        options: { sort: { date_created: -1 } }
      })
      .lean()

    const total = await StudyType.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: studyTypes.length,
      total,
      pagination,
      data: studyTypes,
    })
  } catch (error) {
    console.error("Error in getStudyTypes:", error)
    next(error)
  }
}

// @desc    Get single study type
// @route   GET /api/study-types/:id
// @access  Private
exports.getStudyType = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study type ID format",
      })
    }

    const studyType = await StudyType.findById(req.params.id).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
      })
    }

    res.status(200).json({
      success: true,
      data: studyType,
    })
  } catch (error) {
    console.error("Error in getStudyType:", error)
    next(error)
  }
}

// @desc    Create study type
// @route   POST /api/study-types
// @access  Private/Admin
exports.createStudyType = async (req, res, next) => {
  try {
    // Handle both study_type and study_Type (case insensitive)
    const studyTypeName = req.body.study_type || req.body.study_Type
    const { description, isActive, studies = [] } = req.body

    console.log('Received payload:', req.body) // Debug log

    // Validation
    if (!studyTypeName || studyTypeName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Study type name is required",
        errors: ["Study type name is required"]
      })
    }

    // Check for existing study type
    const existingType = await StudyType.findOne({
      study_type: { $regex: new RegExp(`^${studyTypeName.trim()}$`, "i") },
    })

    if (existingType) {
      return res.status(400).json({
        success: false,
        message: "Study type with this name already exists",
        errors: ["Study type with this name already exists"]
      })
    }

    // Validate study IDs if provided
    let studyObjectIds = []
    if (studies && studies.length > 0) {
      // Validate each study ID
      for (const studyId of studies) {
        if (!mongoose.Types.ObjectId.isValid(studyId)) {
          return res.status(400).json({
            success: false,
            message: `Invalid study ID: ${studyId}`,
            errors: [`Invalid study ID: ${studyId}`]
          })
        }
        studyObjectIds.push(new mongoose.Types.ObjectId(studyId))
      }

      // Check if studies exist
      const existingStudies = await Study.find({ _id: { $in: studyObjectIds } })
      if (existingStudies.length !== studyObjectIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more studies not found",
          errors: ["One or more studies not found"]
        })
      }
    }

    const studyType = await StudyType.create({
      study_type: studyTypeName.trim(),
      description: description ? description.trim() : "",
      isActive: isActive !== undefined ? isActive : true,
      studies: studyObjectIds,
    })

    // Populate the created study type
    await studyType.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Optional activity log
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(
        `created_study_type:${studyType.study_type}`,
        req.ip,
        req.get("User-Agent")
      )
    }

    res.status(201).json({
      success: true,
      data: studyType,
    })
  } catch (error) {
    console.error("Error in createStudyType:", error)
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message)
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors
      })
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Study type with this name already exists",
        errors: ["Study type with this name already exists"]
      })
    }

    next(error)
  }
}

// @desc    Update study type
// @route   PUT /api/study-types/:id
// @access  Private/Admin
exports.updateStudyType = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study type ID format",
      })
    }

    // Handle both study_type and study_Type (case insensitive)
    const studyTypeName = req.body.study_type || req.body.study_Type
    const { description, isActive, studies } = req.body

    if (studyTypeName && studyTypeName.trim()) {
      const existingType = await StudyType.findOne({
        _id: { $ne: req.params.id },
        study_type: { $regex: new RegExp(`^${studyTypeName.trim()}$`, "i") },
      })

      if (existingType) {
        return res.status(400).json({
          success: false,
          message: "Study type with this name already exists",
        })
      }
    }

    const updateData = {}
    if (studyTypeName !== undefined && studyTypeName.trim()) {
      updateData.study_type = studyTypeName.trim()
    }
    if (description !== undefined) {
      updateData.description = description ? description.trim() : ""
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive
    }

    // Add study association update
    if (studies && Array.isArray(studies)) {
      // Validate study IDs
      const studyObjectIds = []
      for (const studyId of studies) {
        if (!mongoose.Types.ObjectId.isValid(studyId)) {
          return res.status(400).json({
            success: false,
            message: `Invalid study ID: ${studyId}`,
          })
        }
        studyObjectIds.push(new mongoose.Types.ObjectId(studyId))
      }
      updateData.studies = studyObjectIds
    }

    const studyType = await StudyType.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
      })
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(`updated_study_type:${studyType.study_type}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      data: studyType,
    })
  } catch (error) {
    console.error("Error in updateStudyType:", error)
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message)
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors
      })
    }

    next(error)
  }
}

// @desc    Delete study type
// @route   DELETE /api/study-types/:id
// @access  Private/Admin
exports.deleteStudyType = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study type ID format",
      })
    }

    const studyType = await StudyType.findById(id).populate("studies")

    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
      })
    }

    // OPTIONAL: Remove this type from associated studies before deletion
    if (studyType.studies && studyType.studies.length > 0) {
      await Study.updateMany(
        { _id: { $in: studyType.studies.map((s) => s._id) } },
        { $pull: { studytype: studyType._id } }
      )
    }

    await StudyType.findByIdAndDelete(id)

    // Log activity
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(`deleted_study_type:${studyType.study_type}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      message: "Study type deleted successfully",
    })
  } catch (error) {
    console.error("Error in deleteStudyType:", error)
    next(error)
  }
}

// @desc    Toggle study type status
// @route   PATCH /api/study-types/:id/toggle-status
// @access  Private/Admin
exports.toggleStudyTypeStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study type ID format",
      })
    }

    const studyType = await StudyType.findById(req.params.id)

    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
      })
    }

    studyType.isActive = !studyType.isActive
    await studyType.save()

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `${studyType.isActive ? "activated" : "deactivated"}_study_type:${studyType.study_type}`,
        req.ip,
        req.get("User-Agent"),
      )
    }

    res.status(200).json({
      success: true,
      data: studyType,
    })
  } catch (error) {
    console.error("Error in toggleStudyTypeStatus:", error)
    next(error)
  }
}

// @desc    Get study type statistics
// @route   GET /api/study-types/stats
// @access  Private
exports.getStudyTypeStats = async (req, res, next) => {
  try {
    // Check if getStatistics method exists on StudyType model
    let stats = {}
    if (typeof StudyType.getStatistics === 'function') {
      stats = await StudyType.getStatistics()
    } else {
      // Fallback manual statistics
      const totalTypes = await StudyType.countDocuments()
      const activeTypes = await StudyType.countDocuments({ isActive: true })
      const inactiveTypes = totalTypes - activeTypes
      
      stats = {
        totalTypes,
        activeTypes,
        inactiveTypes
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentTypes = await StudyType.countDocuments({
      date_created: { $gte: thirtyDaysAgo },
    })

    const typeDistribution = await StudyType.aggregate([
      {
        $project: {
          study_type: 1,
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
        recentTypes,
        typeDistribution,
      },
    })
  } catch (error) {
    console.error("Error in getStudyTypeStats:", error)
    next(error)
  }
}

// @desc    Add study to type
// @route   POST /api/study-types/:id/studies/:studyId
// @access  Private/Admin
exports.addStudyToType = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(studyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const studyType = await StudyType.findById(id)
    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
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
    if (!studyType.studies) {
      studyType.studies = []
    }

    // Check if study is already in this type
    const studyExists = studyType.studies.some(
      study => study.toString() === studyId
    )

    if (studyExists) {
      return res.status(400).json({
        success: false,
        message: "Study is already in this type",
      })
    }

    studyType.studies.push(studyId)
    await studyType.save()

    // Populate the updated study type
    await studyType.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_study_to_type:${studyType.study_type}:${study.study_name || study.protocol_number}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyType,
      message: "Study added to type successfully"
    })
  } catch (error) {
    console.error("Error in addStudyToType:", error)
    next(error)
  }
}
// @desc    Bulk add studies to type
// @route   POST /api/study-types/:id/studies/bulk
// @access  Private/Admin
exports.bulkAddStudiesToType = async (req, res, next) => {
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
        message: "Invalid study type ID format",
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

    const studyType = await StudyType.findById(id)
    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
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
    if (!studyType.studies) {
      studyType.studies = []
    }

    // Filter out studies that are already in the type
    const existingStudyIds = studyType.studies.map(study => study.toString())
    const newStudyIds = studyIds.filter(studyId => !existingStudyIds.includes(studyId))

    if (newStudyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All studies are already in this type",
      })
    }

    // Add new studies
    studyType.studies.push(...newStudyIds)
    await studyType.save()

    // Populate the updated study type
    await studyType.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_studies_to_type:${studyType.study_type}:${newStudyIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyType,
      message: `${newStudyIds.length} studies added to type successfully`,
      addedCount: newStudyIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddStudiesToType:", error)
    next(error)
  }
}

// @desc    Remove study from type
// @route   DELETE /api/study-types/:id/studies/:studyId
// @access  Private/Admin
exports.removeStudyFromType = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const studyType = await StudyType.findById(id)
    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!studyType.studies) {
      studyType.studies = []
    }

    const originalLength = studyType.studies.length
    studyType.studies = studyType.studies.filter(
      study => study.toString() !== studyId
    )

    // Check if study was actually removed
    if (studyType.studies.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Study not found in this type",
      })
    }

    await studyType.save()

    // Populate the updated study type
    await studyType.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_study_from_type:${studyType.study_type}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: studyType,
      message: "Study removed from type successfully"
    })
  } catch (error) {
    console.error("Error in removeStudyFromType:", error)
    next(error)
  }
}

// @desc    Get available studies (not in any type)
// @route   GET /api/study-types/available-studies
// @access  Private
exports.getAvailableStudies = async (req, res, next) => {
  try {
    // Get all study types and extract assigned study IDs
    const allTypes = await StudyType.find({}, 'studies').lean()
    const assignedStudyIds = allTypes
      .flatMap(type => type.studies || [])
      .map(id => id.toString())

    // Get studies not assigned to any type
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

// @desc    Get studies in a specific type
// @route   GET /api/study-types/:id/studies
// @access  Private
exports.getStudiesInType = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid study type ID format",
      })
    }

    const studyType = await StudyType.findById(id)
      .populate({
        path: 'studies',
        select: 'study_name protocol_number study_title date_created status',
        options: { sort: { date_created: -1 } }
      })

    if (!studyType) {
      return res.status(404).json({
        success: false,
        message: "Study type not found",
      })
    }

    res.status(200).json({
      success: true,
      type: {
        _id: studyType._id,
        study_type: studyType.study_type,
        description: studyType.description,
        isActive: studyType.isActive
      },
      count: studyType.studies ? studyType.studies.length : 0,
      data: studyType.studies || [],
    })
  } catch (error) {
    console.error("Error in getStudiesInType:", error)
    next(error)
  }
}

// @desc    Sync and fix study type relationships
// @route   POST /api/study-types/sync-relationships
// @access  Private/Admin
exports.syncStudyTypeRelationships = async (req, res, next) => {
  try {
    const issues = []
    const fixes = []

    // Get all study types
    const studyTypes = await StudyType.find({})

    for (const type of studyTypes) {
      if (!type.studies || !Array.isArray(type.studies)) {
        // Fix: Initialize empty studies array
        type.studies = []
        await type.save()
        fixes.push(`Initialized studies array for type: ${type.study_type}`)
        continue
      }

      // Check if all referenced studies exist
      const studyIds = type.studies.map(id => id.toString())
      const existingStudies = await Study.find({ _id: { $in: studyIds } })
      const existingStudyIds = existingStudies.map(study => study._id.toString())
      
      const missingStudyIds = studyIds.filter(id => !existingStudyIds.includes(id))
      
      if (missingStudyIds.length > 0) {
        issues.push({
          type: type.study_type,
          issue: 'References non-existent studies',
          missingStudyIds
        })

        // Fix: Remove non-existent study references
        type.studies = type.studies.filter(id => existingStudyIds.includes(id.toString()))
        await type.save()
        fixes.push(`Removed ${missingStudyIds.length} invalid study references from type: ${type.study_type}`)
      }
    }

    // Check for duplicate study assignments
    const allStudyAssignments = {}
    const duplicateIssues = []

    for (const type of studyTypes) {
      if (type.studies && type.studies.length > 0) {
        for (const studyId of type.studies) {
          const studyIdStr = studyId.toString()
          if (allStudyAssignments[studyIdStr]) {
            duplicateIssues.push({
              studyId: studyIdStr,
              types: [allStudyAssignments[studyIdStr], type.study_type]
            })
          } else {
            allStudyAssignments[studyIdStr] = type.study_type
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
      message: 'Study type relationship sync completed',
      issues: issues,
      fixes: fixes,
      summary: {
        totalTypes: studyTypes.length,
        issuesFound: issues.length,
        fixesApplied: fixes.length
      }
    })
  } catch (error) {
    console.error("Error in syncStudyTypeRelationships:", error)
    next(error)
  }
}