const Sponsor = require("../models/Sponsor")
const Study = require("../models/Study") // Required for validating study existence
const mongoose = require("mongoose");
const crypto = require("crypto"); // or use uuid if preferred



// @desc    Get all sponsors
// @route   GET /api/sponsors
// @access  Private
exports.getSponsors = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { sponsor_name: { $regex: req.query.search, $options: "i" } },
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

    const sponsors = await Sponsor.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created",
        options: { sort: { date_created: -1 } }
      })
      .lean()

    const total = await Sponsor.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: sponsors.length,
      total,
      pagination,
      data: sponsors,
    })
  } catch (error) {
    console.error("Error in getSponsors:", error)
    next(error)
  }
}

// @desc    Get single sponsor
// @route   GET /api/sponsors/:id
// @access  Private
exports.getSponsor = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sponsor ID format",
      })
    }

    const sponsor = await Sponsor.findById(req.params.id).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      })
    }

    res.status(200).json({
      success: true,
      data: sponsor,
    })
  } catch (error) {
    console.error("Error in getSponsor:", error)
    next(error)
  }
}

// @desc    Create sponsor
// @route   POST /api/sponsors
// @access  Private/Admin
exports.createSponsor = async (req, res, next) => {
  try {
    const { sponsor_name, description, isActive, studies = [] } = req.body

    // Validation
    if (!sponsor_name || sponsor_name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Sponsor name is required",
      })
    }

    const existingSponsor = await Sponsor.findOne({
      sponsor_name: { $regex: new RegExp(`^${sponsor_name.trim()}$`, "i") },
    })

    if (existingSponsor) {
      return res.status(400).json({
        success: false,
        message: "Sponsor with this name already exists",
      })
    }

    // Convert study IDs to ObjectId if needed
    const studyObjectIds = studies.map((id) => new mongoose.Types.ObjectId(id))

    const sponsorRecord = await Sponsor.create({
      sponsor_name: sponsor_name.trim(),
      description: description ? description.trim() : "",
      isActive: isActive !== undefined ? isActive : true,
      studies: studyObjectIds,
    })

    // Optional activity log
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(
        `created_sponsor:${sponsorRecord.sponsor_name}`,
        req.ip,
        req.get("User-Agent")
      )
    }

    res.status(201).json({
      success: true,
      data: sponsorRecord,
    })
  } catch (error) {
    console.error("Error in createSponsor:", error)
    next(error)
  }
}

// @desc    Update sponsor
// @route   PUT /api/sponsors/:id
// @access  Private/Admin
exports.updateSponsor = async (req, res, next) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sponsor ID format",
      })
    }

    const { sponsor_name, description, isActive, studies } = req.body

    if (sponsor_name && sponsor_name.trim()) {
      const existingSponsor = await Sponsor.findOne({
        _id: { $ne: req.params.id },
        sponsor_name: { $regex: new RegExp(`^${sponsor_name.trim()}$`, "i") },
      })

      if (existingSponsor) {
        return res.status(400).json({
          success: false,
          message: "Sponsor with this name already exists",
        })
      }
    }

    const updateData = {}
    if (sponsor_name !== undefined && sponsor_name.trim()) updateData.sponsor_name = sponsor_name.trim()
    if (description !== undefined) updateData.description = description ? description.trim() : ""
    if (isActive !== undefined) updateData.isActive = isActive

    // ✅ Add study association update
    if (studies && Array.isArray(studies)) {
      updateData.studies = studies.map((id) => new mongoose.Types.ObjectId(id))
    }

    const sponsor = await Sponsor.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      })
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(`updated_sponsor:${sponsor.sponsor_name}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      data: sponsor,
    })
  } catch (error) {
    console.error("Error in updateSponsor:", error)
    next(error)
  }
}

// @desc    Delete sponsor
// @route   DELETE /api/sponsors/:id
// @access  Private/Admin

exports.deleteSponsor = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sponsor ID format",
      })
    }

    const sponsor = await Sponsor.findById(id).populate("studies")

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      })
    }

    // OPTIONAL: Remove this sponsor from associated studies before deletion
    if (sponsor.studies && sponsor.studies.length > 0) {
      await Study.updateMany(
        { _id: { $in: sponsor.studies.map((s) => s._id) } },
        { $pull: { sponsors: sponsor._id } }
      )
    }

    await Sponsor.findByIdAndDelete(id)

    // Log activity
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(`deleted_sponsor:${sponsor.sponsor_name}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      message: "Sponsor deleted successfully",
    })
  } catch (error) {
    console.error("Error in deleteSponsor:", error)
    next(error)
  }
}



// @desc    Toggle sponsor status
// @route   PATCH /api/sponsors/:id/toggle-status
// @access  Private/Admin
exports.toggleSponsorStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sponsor ID format",
      })
    }

    const sponsor = await Sponsor.findById(req.params.id)

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      })
    }

    sponsor.isActive = !sponsor.isActive
    await sponsor.save()

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `${sponsor.isActive ? "activated" : "deactivated"}_sponsor:${sponsor.sponsor_name}`,
        req.ip,
        req.get("User-Agent"),
      )
    }

    res.status(200).json({
      success: true,
      data: sponsor,
    })
  } catch (error) {
    console.error("Error in toggleSponsor:", error)
    next(error)
  }
}

// @desc    Get sponsor statistics
// @route   GET /api/sponsors/stats
// @access  Private
exports.getSponsorStats = async (req, res, next) => {
  try {
    // Check if getStatistics method exists on Sponsor model
    let stats = {}
    if (typeof Sponsor.getStatistics === 'function') {
      stats = await Sponsor.getStatistics()
    } else {
      // Fallback manual statistics
      const totalSponsors = await Sponsor.countDocuments()
      const activeSponsors = await Sponsor.countDocuments({ isActive: true })
      const inactiveSponsors = totalSponsors - activeSponsors
      
      stats = {
        totalSponsors,
        activeSponsors,
        inactiveSponsors
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentSponsors = await Sponsor.countDocuments({
      date_created: { $gte: thirtyDaysAgo },
    })

    const sponsorDistribution = await Sponsor.aggregate([
      {
        $project: {
          sponsor_name: 1,
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
        recentSponsors,
        sponsorDistribution,
      },
    })
  } catch (error) {
    console.error("Error in getSponsorStats:", error)
    next(error)
  }
}

// @desc    Add study to sponsor
// @route   POST /api/sponsors/:id/studies/:studyId
// @access  Private/Admin
exports.addStudyToSponsor = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const sponsor = await Sponsor.findById(id)
    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
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
    if (!sponsor.studies) {
      sponsor.studies = []
    }

    // Check if study is already in this sponsor
    const studyExists = sponsor.studies.some(
      study => study.toString() === studyId
    )

    if (studyExists) {
      return res.status(400).json({
        success: false,
        message: "Study is already assigned to this sponsor",
      })
    }

    sponsor.studies.push(studyId)
    await sponsor.save()

    // Populate the updated sponsor
    await sponsor.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_study_to_sponsor:${sponsor.sponsor_name}:${study.study_name || study.protocol_number}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: sponsor,
      message: "Study added to sponsor successfully"
    })
  } catch (error) {
    console.error("Error in addStudyToSponsor:", error)
    next(error)
  }
}

// @desc    Bulk add studies to sponsor
// @route   POST /api/sponsors/:id/studies/bulk
// @access  Private/Admin
exports.bulkAddStudiesToSponsor = async (req, res, next) => {
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
        message: "Invalid sponsor ID format",
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

    const sponsor = await Sponsor.findById(id)
    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
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
    if (!sponsor.studies) {
      sponsor.studies = []
    }

    // Filter out studies that are already assigned to this sponsor
    const existingStudyIds = sponsor.studies.map(study => study.toString())
    const newStudyIds = studyIds.filter(studyId => !existingStudyIds.includes(studyId))

    if (newStudyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All studies are already assigned to this sponsor",
      })
    }

    // Add new studies
    sponsor.studies.push(...newStudyIds)
    await sponsor.save()

    // Populate the updated sponsor
    await sponsor.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_studies_to_sponsor:${sponsor.sponsor_name}:${newStudyIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: sponsor,
      message: `${newStudyIds.length} studies added to sponsor successfully`,
      addedCount: newStudyIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddStudiesToSponsor:", error)
    next(error)
  }
}

// @desc    Remove study from sponsor
// @route   DELETE /api/sponsors/:id/studies/:studyId
// @access  Private/Admin
exports.removeStudyFromSponsor = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const sponsor = await Sponsor.findById(id)
    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!sponsor.studies) {
      sponsor.studies = []
    }

    const originalLength = sponsor.studies.length
    sponsor.studies = sponsor.studies.filter(
      study => study.toString() !== studyId
    )

    // Check if study was actually removed
    if (sponsor.studies.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Study not found in this sponsor",
      })
    }

    await sponsor.save()

    // Populate the updated sponsor
    await sponsor.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_study_from_sponsor:${sponsor.sponsor_name}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: sponsor,
      message: "Study removed from sponsor successfully"
    })
  } catch (error) {
    console.error("Error in removeStudyFromSponsor:", error)
    next(error)
  }
}

// @desc    Get available studies (not assigned to any sponsor)
// @route   GET /api/sponsors/available-studies
// @access  Private
exports.getAvailableStudies = async (req, res, next) => {
  try {
    // Get all sponsors and extract assigned study IDs
    const allSponsors = await Sponsor.find({}, 'studies').lean()
    const assignedStudyIds = allSponsors
      .flatMap(sponsor => sponsor.studies || [])
      .map(id => id.toString())

    // Get studies not assigned to any sponsor
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

// @desc    Get studies assigned to a specific sponsor
// @route   GET /api/sponsors/:id/studies
// @access  Private
exports.getStudiesInSponsor = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sponsor ID format",
      })
    }

    const sponsor = await Sponsor.findById(id)
      .populate({
        path: 'studies',
        select: 'study_name protocol_number study_title date_created status',
        options: { sort: { date_created: -1 } }
      })

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      })
    }

    res.status(200).json({
      success: true,
      sponsor: {
        _id: sponsor._id,
        sponsor_name: sponsor.sponsor_name,
        description: sponsor.description,
        isActive: sponsor.isActive
      },
      count: sponsor.studies ? sponsor.studies.length : 0,
      data: sponsor.studies || [],
    })
  } catch (error) {
    console.error("Error in getStudiesInSponsor:", error)
    next(error)
  }
}

// @desc    Sync and fix sponsor relationships
// @route   POST /api/sponsors/sync-relationships
// @access  Private/Admin
exports.syncSponsorRelationships = async (req, res, next) => {
  try {
    const issues = []
    const fixes = []

    // Get all sponsors
    const sponsors = await Sponsor.find({})

    for (const sponsor of sponsors) {
      if (!sponsor.studies || !Array.isArray(sponsor.studies)) {
        // Fix: Initialize empty studies array
        sponsor.studies = []
        await sponsor.save()
        fixes.push(`Initialized studies array for sponsor: ${sponsor.sponsor_name}`)
        continue
      }

      // Check if all referenced studies exist
      const studyIds = sponsor.studies.map(id => id.toString())
      const existingStudies = await Study.find({ _id: { $in: studyIds } })
      const existingStudyIds = existingStudies.map(study => study._id.toString())
      
      const missingStudyIds = studyIds.filter(id => !existingStudyIds.includes(id))
      
      if (missingStudyIds.length > 0) {
        issues.push({
          sponsor: sponsor.sponsor_name,
          issue: 'References non-existent studies',
          missingStudyIds
        })

        // Fix: Remove non-existent study references
        sponsor.studies = sponsor.studies.filter(id => existingStudyIds.includes(id.toString()))
        await sponsor.save()
        fixes.push(`Removed ${missingStudyIds.length} invalid study references from sponsor: ${sponsor.sponsor_name}`)
      }
    }

    // Check for duplicate study assignments
    const allStudyAssignments = {}
    const duplicateIssues = []

    for (const sponsor of sponsors) {
      if (sponsor.studies && sponsor.studies.length > 0) {
        for (const studyId of sponsor.studies) {
          const studyIdStr = studyId.toString()
          if (allStudyAssignments[studyIdStr]) {
            duplicateIssues.push({
              studyId: studyIdStr,
              sponsors: [allStudyAssignments[studyIdStr], sponsor.sponsor_name]
            })
          } else {
            allStudyAssignments[studyIdStr] = sponsor.sponsor_name
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
      message: 'Sponsor relationship sync completed',
      issues: issues,
      fixes: fixes,
      summary: {
        totalSponsors: sponsors.length,
        issuesFound: issues.length,
        fixesApplied: fixes.length
      }
    })
  } catch (error) {
    console.error("Error in syncSponsorRelationships:", error)
    next(error)
  }
}