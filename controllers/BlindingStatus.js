const BlindingStatus = require("../models/BlindingStatus")
const Study = require("../models/Study") // Required for validating study existence
const mongoose = require("mongoose");
const crypto = require("crypto"); // or use uuid if preferred



// @desc    Get all blinding statuses
// @route   GET /api/blinding-statuses
// @access  Private
exports.getBlindingStatuses = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { blinding_status: { $regex: req.query.search, $options: "i" } },
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

    const blindingStatuses = await BlindingStatus.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created",
        options: { sort: { date_created: -1 } }
      })
      .lean()

    const total = await BlindingStatus.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: blindingStatuses.length,
      total,
      pagination,
      data: blindingStatuses,
    })
  } catch (error) {
    console.error("Error in getBlindingStatuses:", error)
    next(error)
  }
}

// @desc    Get single blinding status
// @route   GET /api/blinding-statuses/:id
// @access  Private
exports.getBlindingStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blinding status ID format",
      })
    }

    const blindingStatus = await BlindingStatus.findById(req.params.id).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
      })
    }

    res.status(200).json({
      success: true,
      data: blindingStatus,
    })
  } catch (error) {
    console.error("Error in getBlindingStatus:", error)
    next(error)
  }
}

// @desc    Create blinding status
// @route   POST /api/blinding-statuses
// @access  Private/Admin
exports.createBlindingStatus = async (req, res, next) => {
  try {
    const { blinding_status, description, isActive, studies = [] } = req.body

    // Validation
    if (!blinding_status || blinding_status.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Blinding status name is required",
      })
    }

    const existingStatus = await BlindingStatus.findOne({
      blinding_status: { $regex: new RegExp(`^${blinding_status.trim()}$`, "i") },
    })

    if (existingStatus) {
      return res.status(400).json({
        success: false,
        message: "Blinding status with this name already exists",
      })
    }

    // Convert study IDs to ObjectId if needed
    const studyObjectIds = studies.map((id) => new mongoose.Types.ObjectId(id))

    const blindingStatusRecord = await BlindingStatus.create({
      blinding_status: blinding_status.trim(),
      description: description ? description.trim() : "",
      isActive: isActive !== undefined ? isActive : true,
      studies: studyObjectIds,
    })

    // Optional activity log
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(
        `created_blinding_status:${blindingStatusRecord.blinding_status}`,
        req.ip,
        req.get("User-Agent")
      )
    }

    res.status(201).json({
      success: true,
      data: blindingStatusRecord,
    })
  } catch (error) {
    console.error("Error in createBlindingStatus:", error)
    next(error)
  }
}

// @desc    Update blinding status
// @route   PUT /api/blinding-statuses/:id
// @access  Private/Admin
exports.updateBlindingStatus = async (req, res, next) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blinding status ID format",
      })
    }

    const { blinding_status, description, isActive, studies } = req.body

    if (blinding_status && blinding_status.trim()) {
      const existingStatus = await BlindingStatus.findOne({
        _id: { $ne: req.params.id },
        blinding_status: { $regex: new RegExp(`^${blinding_status.trim()}$`, "i") },
      })

      if (existingStatus) {
        return res.status(400).json({
          success: false,
          message: "Blinding status with this name already exists",
        })
      }
    }

    const updateData = {}
    if (blinding_status !== undefined && blinding_status.trim()) updateData.blinding_status = blinding_status.trim()
    if (description !== undefined) updateData.description = description ? description.trim() : ""
    if (isActive !== undefined) updateData.isActive = isActive

    // ✅ Add study association update
    if (studies && Array.isArray(studies)) {
      updateData.studies = studies.map((id) => new mongoose.Types.ObjectId(id))
    }

    const blindingStatus = await BlindingStatus.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
      })
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(`updated_blinding_status:${blindingStatus.blinding_status}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      data: blindingStatus,
    })
  } catch (error) {
    console.error("Error in updateBlindingStatus:", error)
    next(error)
  }
}

// @desc    Delete blinding status
// @route   DELETE /api/blinding-statuses/:id
// @access  Private/Admin

exports.deleteBlindingStatus = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blinding status ID format",
      })
    }

    const blindingStatus = await BlindingStatus.findById(id).populate("studies")

    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
      })
    }

    // OPTIONAL: Remove this status from associated studies before deletion
    if (blindingStatus.studies && blindingStatus.studies.length > 0) {
      await Study.updateMany(
        { _id: { $in: blindingStatus.studies.map((s) => s._id) } },
        { $pull: { blindingstatuses: blindingStatus._id } }
      )
    }

    await BlindingStatus.findByIdAndDelete(id)

    // Log activity
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(`deleted_blinding_status:${blindingStatus.blinding_status}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      message: "Blinding status deleted successfully",
    })
  } catch (error) {
    console.error("Error in deleteBlindingStatus:", error)
    next(error)
  }
}



// @desc    Toggle blinding status
// @route   PATCH /api/blinding-statuses/:id/toggle-status
// @access  Private/Admin
exports.toggleBlindingStatusStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blinding status ID format",
      })
    }

    const blindingStatus = await BlindingStatus.findById(req.params.id)

    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
      })
    }

    blindingStatus.isActive = !blindingStatus.isActive
    await blindingStatus.save()

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `${blindingStatus.isActive ? "activated" : "deactivated"}_blinding_status:${blindingStatus.blinding_status}`,
        req.ip,
        req.get("User-Agent"),
      )
    }

    res.status(200).json({
      success: true,
      data: blindingStatus,
    })
  } catch (error) {
    console.error("Error in toggleBlindingStatus:", error)
    next(error)
  }
}

// @desc    Get blinding status statistics
// @route   GET /api/blinding-statuses/stats
// @access  Private
exports.getBlindingStatusStats = async (req, res, next) => {
  try {
    // Check if getStatistics method exists on BlindingStatus model
    let stats = {}
    if (typeof BlindingStatus.getStatistics === 'function') {
      stats = await BlindingStatus.getStatistics()
    } else {
      // Fallback manual statistics
      const totalStatuses = await BlindingStatus.countDocuments()
      const activeStatuses = await BlindingStatus.countDocuments({ isActive: true })
      const inactiveStatuses = totalStatuses - activeStatuses
      
      stats = {
        totalStatuses,
        activeStatuses,
        inactiveStatuses
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentStatuses = await BlindingStatus.countDocuments({
      date_created: { $gte: thirtyDaysAgo },
    })

    const statusDistribution = await BlindingStatus.aggregate([
      {
        $project: {
          blinding_status: 1,
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
        recentStatuses,
        statusDistribution,
      },
    })
  } catch (error) {
    console.error("Error in getBlindingStatusStats:", error)
    next(error)
  }
}

// @desc    Add study to status
// @route   POST /api/blinding-statuses/:id/studies/:studyId
// @access  Private/Admin
exports.addStudyToStatus = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const blindingStatus = await BlindingStatus.findById(id)
    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
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
    if (!blindingStatus.studies) {
      blindingStatus.studies = []
    }

    // Check if study is already in this status
    const studyExists = blindingStatus.studies.some(
      study => study.toString() === studyId
    )

    if (studyExists) {
      return res.status(400).json({
        success: false,
        message: "Study is already in this status",
      })
    }

    blindingStatus.studies.push(studyId)
    await blindingStatus.save()

    // Populate the updated blinding status
    await blindingStatus.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_study_to_blinding_status:${blindingStatus.blinding_status}:${study.study_name || study.protocol_number}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: blindingStatus,
      message: "Study added to status successfully"
    })
  } catch (error) {
    console.error("Error in addStudyToStatus:", error)
    next(error)
  }
}

// @desc    Bulk add studies to status
// @route   POST /api/blinding-statuses/:id/studies/bulk
// @access  Private/Admin
exports.bulkAddStudiesToStatus = async (req, res, next) => {
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
        message: "Invalid blinding status ID format",
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

    const blindingStatus = await BlindingStatus.findById(id)
    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
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
    if (!blindingStatus.studies) {
      blindingStatus.studies = []
    }

    // Filter out studies that are already in the status
    const existingStudyIds = blindingStatus.studies.map(study => study.toString())
    const newStudyIds = studyIds.filter(studyId => !existingStudyIds.includes(studyId))

    if (newStudyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All studies are already in this status",
      })
    }

    // Add new studies
    blindingStatus.studies.push(...newStudyIds)
    await blindingStatus.save()

    // Populate the updated blinding status
    await blindingStatus.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_studies_to_blinding_status:${blindingStatus.blinding_status}:${newStudyIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: blindingStatus,
      message: `${newStudyIds.length} studies added to status successfully`,
      addedCount: newStudyIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddStudiesToStatus:", error)
    next(error)
  }
}

// @desc    Remove study from status
// @route   DELETE /api/blinding-statuses/:id/studies/:studyId
// @access  Private/Admin
exports.removeStudyFromStatus = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const blindingStatus = await BlindingStatus.findById(id)
    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!blindingStatus.studies) {
      blindingStatus.studies = []
    }

    const originalLength = blindingStatus.studies.length
    blindingStatus.studies = blindingStatus.studies.filter(
      study => study.toString() !== studyId
    )

    // Check if study was actually removed
    if (blindingStatus.studies.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Study not found in this status",
      })
    }

    await blindingStatus.save()

    // Populate the updated blinding status
    await blindingStatus.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_study_from_blinding_status:${blindingStatus.blinding_status}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: blindingStatus,
      message: "Study removed from status successfully"
    })
  } catch (error) {
    console.error("Error in removeStudyFromStatus:", error)
    next(error)
  }
}

// @desc    Get available studies (not in any status)
// @route   GET /api/blinding-statuses/available-studies
// @access  Private
exports.getAvailableStudies = async (req, res, next) => {
  try {
    // Get all blinding statuses and extract assigned study IDs
    const allStatuses = await BlindingStatus.find({}, 'studies').lean()
    const assignedStudyIds = allStatuses
      .flatMap(status => status.studies || [])
      .map(id => id.toString())

    // Get studies not assigned to any status
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

// @desc    Get studies in a specific status
// @route   GET /api/blinding-statuses/:id/studies
// @access  Private
exports.getStudiesInStatus = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blinding status ID format",
      })
    }

    const blindingStatus = await BlindingStatus.findById(id)
      .populate({
        path: 'studies',
        select: 'study_name protocol_number study_title date_created status',
        options: { sort: { date_created: -1 } }
      })

    if (!blindingStatus) {
      return res.status(404).json({
        success: false,
        message: "Blinding status not found",
      })
    }

    res.status(200).json({
      success: true,
      status: {
        _id: blindingStatus._id,
        blinding_status: blindingStatus.blinding_status,
        description: blindingStatus.description,
        isActive: blindingStatus.isActive
      },
      count: blindingStatus.studies ? blindingStatus.studies.length : 0,
      data: blindingStatus.studies || [],
    })
  } catch (error) {
    console.error("Error in getStudiesInStatus:", error)
    next(error)
  }
}

// @desc    Sync and fix blinding status relationships
// @route   POST /api/blinding-statuses/sync-relationships
// @access  Private/Admin
exports.syncBlindingStatusRelationships = async (req, res, next) => {
  try {
    const issues = []
    const fixes = []

    // Get all blinding statuses
    const blindingStatuses = await BlindingStatus.find({})

    for (const status of blindingStatuses) {
      if (!status.studies || !Array.isArray(status.studies)) {
        // Fix: Initialize empty studies array
        status.studies = []
        await status.save()
        fixes.push(`Initialized studies array for status: ${status.blinding_status}`)
        continue
      }

      // Check if all referenced studies exist
      const studyIds = status.studies.map(id => id.toString())
      const existingStudies = await Study.find({ _id: { $in: studyIds } })
      const existingStudyIds = existingStudies.map(study => study._id.toString())
      
      const missingStudyIds = studyIds.filter(id => !existingStudyIds.includes(id))
      
      if (missingStudyIds.length > 0) {
        issues.push({
          status: status.blinding_status,
          issue: 'References non-existent studies',
          missingStudyIds
        })

        // Fix: Remove non-existent study references
        status.studies = status.studies.filter(id => existingStudyIds.includes(id.toString()))
        await status.save()
        fixes.push(`Removed ${missingStudyIds.length} invalid study references from status: ${status.blinding_status}`)
      }
    }

    // Check for duplicate study assignments
    const allStudyAssignments = {}
    const duplicateIssues = []

    for (const status of blindingStatuses) {
      if (status.studies && status.studies.length > 0) {
        for (const studyId of status.studies) {
          const studyIdStr = studyId.toString()
          if (allStudyAssignments[studyIdStr]) {
            duplicateIssues.push({
              studyId: studyIdStr,
              statuses: [allStudyAssignments[studyIdStr], status.blinding_status]
            })
          } else {
            allStudyAssignments[studyIdStr] = status.blinding_status
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
      message: 'Blinding status relationship sync completed',
      issues: issues,
      fixes: fixes,
      summary: {
        totalStatuses: blindingStatuses.length,
        issuesFound: issues.length,
        fixesApplied: fixes.length
      }
    })
  } catch (error) {
    console.error("Error in syncBlindingStatusRelationships:", error)
    next(error)
  }
}