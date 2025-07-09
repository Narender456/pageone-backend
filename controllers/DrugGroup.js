const DrugGroup = require("../models/DrugGroup")
const Study = require("../models/Study") // Required for validating study existence
const Drug = require("../models/Drugs") // Required for validating drug existence
const mongoose = require("mongoose");
const crypto = require("crypto"); // or use uuid if preferred



// @desc    Get all drug groups
// @route   GET /api/drug-groups
// @access  Private
exports.getDrugGroups = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { group_name: { $regex: req.query.search, $options: "i" } },
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

    const drugGroups = await DrugGroup.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .populate({
        path: "drugs",
        select: "drug_name quantity remaining_quantity date_created",
        options: { sort: { date_created: -1 } }
      })
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created",
        options: { sort: { date_created: -1 } }
      })
      .lean()

    const total = await DrugGroup.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: drugGroups.length,
      total,
      pagination,
      data: drugGroups,
    })
  } catch (error) {
    console.error("Error in getDrugGroups:", error)
    next(error)
  }
}

// @desc    Get single drug group
// @route   GET /api/drug-groups/:id
// @access  Private
exports.getDrugGroup = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug group ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(req.params.id)
      .populate({
        path: "drugs",
        select: "drug_name quantity remaining_quantity date_created status",
        options: { sort: { date_created: -1 } }
      })
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created status",
        options: { sort: { date_created: -1 } }
      })

    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
    })
  } catch (error) {
    console.error("Error in getDrugGroup:", error)
    next(error)
  }
}

// @desc    Create drug group
// @route   POST /api/drug-groups
// @access  Private/Admin
exports.createDrugGroup = async (req, res, next) => {
  try {
    const { group_name, description, isActive, drugs = [], studies = [] } = req.body

    // Validation
    if (!group_name || group_name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Drug group name is required",
      })
    }

    const existingGroup = await DrugGroup.findOne({
      group_name: { $regex: new RegExp(`^${group_name.trim()}$`, "i") },
    })

    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: "Drug group with this name already exists",
      })
    }

    // Convert drug IDs to ObjectId if needed
    const drugObjectIds = drugs.map((id) => new mongoose.Types.ObjectId(id))
    
    // Convert study IDs to ObjectId if needed
    const studyObjectIds = studies.map((id) => new mongoose.Types.ObjectId(id))

    const drugGroupRecord = await DrugGroup.create({
      group_name: group_name.trim(),
      description: description ? description.trim() : "",
      isActive: isActive !== undefined ? isActive : true,
      drugs: drugObjectIds,
      studies: studyObjectIds,
    })

    // Optional activity log
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(
        `created_drug_group:${drugGroupRecord.group_name}`,
        req.ip,
        req.get("User-Agent")
      )
    }

    res.status(201).json({
      success: true,
      data: drugGroupRecord,
    })
  } catch (error) {
    console.error("Error in createDrugGroup:", error)
    next(error)
  }
}

// @desc    Update drug group
// @route   PUT /api/drug-groups/:id
// @access  Private/Admin
exports.updateDrugGroup = async (req, res, next) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug group ID format",
      })
    }

    const { group_name, description, isActive, drugs, studies } = req.body

    if (group_name && group_name.trim()) {
      const existingGroup = await DrugGroup.findOne({
        _id: { $ne: req.params.id },
        group_name: { $regex: new RegExp(`^${group_name.trim()}$`, "i") },
      })

      if (existingGroup) {
        return res.status(400).json({
          success: false,
          message: "Drug group with this name already exists",
        })
      }
    }

    const updateData = {}
    if (group_name !== undefined && group_name.trim()) updateData.group_name = group_name.trim()
    if (description !== undefined) updateData.description = description ? description.trim() : ""
    if (isActive !== undefined) updateData.isActive = isActive

    // Add drug association update
    if (drugs && Array.isArray(drugs)) {
      updateData.drugs = drugs.map((id) => new mongoose.Types.ObjectId(id))
    }

    // Add study association update
    if (studies && Array.isArray(studies)) {
      updateData.studies = studies.map((id) => new mongoose.Types.ObjectId(id))
    }

    const drugGroup = await DrugGroup.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: "drugs",
        select: "drug_name quantity remaining_quantity date_created status",
        options: { sort: { date_created: -1 } }
      })
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created status",
        options: { sort: { date_created: -1 } }
      })

    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(`updated_drug_group:${drugGroup.group_name}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
    })
  } catch (error) {
    console.error("Error in updateDrugGroup:", error)
    next(error)
  }
}

// @desc    Delete drug group
// @route   DELETE /api/drug-groups/:id
// @access  Private/Admin
exports.deleteDrugGroup = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug group ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(id).populate("drugs").populate("studies")

    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    // OPTIONAL: Remove this group from associated studies before deletion
    if (drugGroup.studies && drugGroup.studies.length > 0) {
      await Study.updateMany(
        { _id: { $in: drugGroup.studies.map((s) => s._id) } },
        { $pull: { druggroups: drugGroup._id } }
      )
    }

    // OPTIONAL: Remove this group from associated drugs before deletion
    if (drugGroup.drugs && drugGroup.drugs.length > 0) {
      await Drug.updateMany(
        { _id: { $in: drugGroup.drugs.map((d) => d._id) } },
        { $pull: { drug_groups: drugGroup._id } }
      )
    }

    await DrugGroup.findByIdAndDelete(id)

    // Log activity
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(`deleted_drug_group:${drugGroup.group_name}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      message: "Drug group deleted successfully",
    })
  } catch (error) {
    console.error("Error in deleteDrugGroup:", error)
    next(error)
  }
}

// @desc    Toggle drug group status
// @route   PATCH /api/drug-groups/:id/toggle-status
// @access  Private/Admin
exports.toggleDrugGroupStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug group ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(req.params.id)

    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    drugGroup.isActive = !drugGroup.isActive
    await drugGroup.save()

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `${drugGroup.isActive ? "activated" : "deactivated"}_drug_group:${drugGroup.group_name}`,
        req.ip,
        req.get("User-Agent"),
      )
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
    })
  } catch (error) {
    console.error("Error in toggleDrugGroup:", error)
    next(error)
  }
}

// @desc    Get drug group statistics
// @route   GET /api/drug-groups/stats
// @access  Private
exports.getDrugGroupStats = async (req, res, next) => {
  try {
    // Check if getStatistics method exists on DrugGroup model
    let stats = {}
    if (typeof DrugGroup.getStatistics === 'function') {
      stats = await DrugGroup.getStatistics()
    } else {
      // Fallback manual statistics
      const totalGroups = await DrugGroup.countDocuments()
      const activeGroups = await DrugGroup.countDocuments({ isActive: true })
      const inactiveGroups = totalGroups - activeGroups
      
      stats = {
        totalGroups,
        activeGroups,
        inactiveGroups
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentGroups = await DrugGroup.countDocuments({
      date_created: { $gte: thirtyDaysAgo },
    })

    const groupDistribution = await DrugGroup.aggregate([
      {
        $project: {
          group_name: 1,
          drugCount: { 
            $cond: {
              if: { $isArray: "$drugs" },
              then: { $size: "$drugs" },
              else: 0
            }
          },
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
                { case: { $eq: ["$drugCount", 0] }, then: "No Drugs" },
                { case: { $lte: ["$drugCount", 5] }, then: "1-5 Drugs" },
                { case: { $lte: ["$drugCount", 10] }, then: "6-10 Drugs" },
                { case: { $gt: ["$drugCount", 10] }, then: "10+ Drugs" },
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
        recentGroups,
        groupDistribution,
      },
    })
  } catch (error) {
    console.error("Error in getDrugGroupStats:", error)
    next(error)
  }
}

// @desc    Add drug to group
// @route   POST /api/drug-groups/:id/drugs/:drugId
// @access  Private/Admin
exports.addDrugToGroup = async (req, res, next) => {
  try {
    const { id, drugId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !drugId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(id)
    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    const drug = await Drug.findById(drugId)
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    // Initialize drugs array if it doesn't exist
    if (!drugGroup.drugs) {
      drugGroup.drugs = []
    }

    // Check if drug is already in this group
    const drugExists = drugGroup.drugs.some(
      drug => drug.toString() === drugId
    )

    if (drugExists) {
      return res.status(400).json({
        success: false,
        message: "Drug is already in this group",
      })
    }

    drugGroup.drugs.push(drugId)
    await drugGroup.save()

    // Populate the updated drug group
    await drugGroup.populate({
      path: "drugs",
      select: "drug_name quantity remaining_quantity date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_drug_to_group:${drugGroup.group_name}:${drug.drug_name || drug.quantity}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
      message: "Drug added to group successfully"
    })
  } catch (error) {
    console.error("Error in addDrugToGroup:", error)
    next(error)
  }
}

// @desc    Add study to group
// @route   POST /api/drug-groups/:id/studies/:studyId
// @access  Private/Admin
exports.addStudyToGroup = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(id)
    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
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
    if (!drugGroup.studies) {
      drugGroup.studies = []
    }

    // Check if study is already in this group
    const studyExists = drugGroup.studies.some(
      study => study.toString() === studyId
    )

    if (studyExists) {
      return res.status(400).json({
        success: false,
        message: "Study is already in this group",
      })
    }

    drugGroup.studies.push(studyId)
    await drugGroup.save()

    // Populate the updated drug group
    await drugGroup.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_study_to_drug_group:${drugGroup.group_name}:${study.study_name || study.protocol_number}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
      message: "Study added to group successfully"
    })
  } catch (error) {
    console.error("Error in addStudyToGroup:", error)
    next(error)
  }
}

// @desc    Bulk add drugs to group
// @route   POST /api/drug-groups/:id/drugs/bulk
// @access  Private/Admin
exports.bulkAddDrugsToGroup = async (req, res, next) => {
  try {
    const { id } = req.params
    const { drugIds } = req.body

    if (!Array.isArray(drugIds) || drugIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "drugIds must be a non-empty array",
      })
    }

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug group ID format",
      })
    }

    const invalidIds = drugIds.filter(drugId => !drugId.match(/^[0-9a-fA-F]{24}$/))
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug ID format",
        invalidIds
      })
    }

    const drugGroup = await DrugGroup.findById(id)
    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    // Verify all drugs exist
    const drugs = await Drug.find({ _id: { $in: drugIds } })
    const foundDrugIds = drugs.map(drug => drug._id.toString())
    const missingDrugIds = drugIds.filter(id => !foundDrugIds.includes(id))

    if (missingDrugIds.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Some drugs not found",
        missingDrugIds
      })
    }

    // Initialize drugs array if it doesn't exist
    if (!drugGroup.drugs) {
      drugGroup.drugs = []
    }

    // Filter out drugs that are already in the group
    const existingDrugIds = drugGroup.drugs.map(drug => drug.toString())
    const newDrugIds = drugIds.filter(drugId => !existingDrugIds.includes(drugId))

    if (newDrugIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All drugs are already in this group",
      })
    }

    // Add new drugs
    drugGroup.drugs.push(...newDrugIds)
    await drugGroup.save()

    // Populate the updated drug group
    await drugGroup.populate({
      path: "drugs",
      select: "drug_name quantity remaining_quantity date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_drugs_to_group:${drugGroup.group_name}:${newDrugIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
      message: `${newDrugIds.length} drugs added to group successfully`,
      addedCount: newDrugIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddDrugsToGroup:", error)
    next(error)
  }
}

// @desc    Bulk add studies to group
// @route   POST /api/drug-groups/:id/studies/bulk
// @access  Private/Admin
exports.bulkAddStudiesToGroup = async (req, res, next) => {
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
        message: "Invalid drug group ID format",
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

    const drugGroup = await DrugGroup.findById(id)
    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
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
    if (!drugGroup.studies) {
      drugGroup.studies = []
    }

    // Filter out studies that are already in the group
    const existingStudyIds = drugGroup.studies.map(study => study.toString())
    const newStudyIds = studyIds.filter(studyId => !existingStudyIds.includes(studyId))

    if (newStudyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All studies are already in this group",
      })
    }

    // Add new studies
    drugGroup.studies.push(...newStudyIds)
    await drugGroup.save()

    // Populate the updated drug group
    await drugGroup.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_studies_to_drug_group:${drugGroup.group_name}:${newStudyIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
      message: `${newStudyIds.length} studies added to group successfully`,
      addedCount: newStudyIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddStudiesToGroup:", error)
    next(error)
  }
}

// @desc    Remove drug from group
// @route   DELETE /api/drug-groups/:id/drugs/:drugId
// @access  Private/Admin
exports.removeDrugFromGroup = async (req, res, next) => {
  try {
    const { id, drugId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !drugId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(id)
    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    // Initialize drugs array if it doesn't exist
    if (!drugGroup.drugs) {
      drugGroup.drugs = []
    }

    const originalLength = drugGroup.drugs.length
    drugGroup.drugs = drugGroup.drugs.filter(
      drug => drug.toString() !== drugId
    )

    // Check if drug was actually removed
    if (drugGroup.drugs.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Drug not found in this group",
      })
    }

    await drugGroup.save()

    // Populate the updated drug group
    await drugGroup.populate({
      path: "drugs",
      select: "drug_name quantity remaining_quantity date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_drug_from_group:${drugGroup.group_name}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drugGroup,
      message: "Drug removed from group successfully"
    })
  } catch (error) {
    console.error("Error in removeDrugFromGroup:", error)
    next(error)
  }
}

// @desc    Remove study from group
// @route   DELETE /api/drug-groups/:id/studies/:studyId
// @access  Private/Admin
exports.removeStudyFromGroup = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(id)
    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!drugGroup.studies) {
      drugGroup.studies = []
    }

    const originalLength = drugGroup.studies.length
    drugGroup.studies = drugGroup.studies.filter(
      study => study.toString() !== studyId
    )

    // Check if study was actually removed
    if (drugGroup.studies.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Study not found in this group",
      })
    }

    await drugGroup.save()

    // Populate the updated drug group
    await drugGroup.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_study_from_drug_group:${drugGroup.group_name}`,
        req.ip,
        req.get('User-Agent')
      )
    }

    res.status(200).json({
      success: true,
      message: "Study removed from group successfully",
      data: {
        drugGroup: {
          _id: drugGroup._id,
          group_name: drugGroup.group_name,
          description: drugGroup.description,
          studies: drugGroup.studies,
          studyCount: drugGroup.studies.length
        }
      }
    })

  } catch (error) {
    console.error('Error removing study from group:', error)
    
    // Handle specific MongoDB errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format"
      })
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        details: error.message
      })
    }

    // Pass to error handling middleware
    next(error)
  }
}

// @desc    Get drugs in a specific drug group
// @route   GET /api/drug-groups/:id/drugs
// @access  Private
exports.getDrugsInGroup = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug group ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(id)
      .populate({
        path: 'drugs',
        select: 'drug_name code description date_created',
        options: { sort: { date_created: -1 } }
      })

    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    res.status(200).json({
      success: true,
      group: {
        _id: drugGroup._id,
        group_name: drugGroup.group_name,
        description: drugGroup.description,
        isActive: drugGroup.isActive
      },
      count: drugGroup.drugs ? drugGroup.drugs.length : 0,
      data: drugGroup.drugs || [],
    })
  } catch (error) {
    console.error("Error in getDrugsInGroup:", error)
    next(error)
  }
}



exports.getStudiesInGroup = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Drug Group ID format",
      })
    }

    const drugGroup = await DrugGroup.findById(id)
      .populate({
        path: 'studies',
        select: 'study_name protocol_number study_title date_created status',
        options: { sort: { date_created: -1 } }
      })

    if (!drugGroup) {
      return res.status(404).json({
        success: false,
        message: "Drug group not found",
      })
    }

    res.status(200).json({
      success: true,
      group: {
        _id: drugGroup._id,
        group_name: drugGroup.group_name,
        description: drugGroup.description,
        isActive: drugGroup.isActive
      },
      count: drugGroup.studies ? drugGroup.studies.length : 0,
      data: drugGroup.studies || [],
    })
  } catch (error) {
    console.error("Error in getStudiesInGroup:", error)
    next(error)
  }
}

// Add these functions to your DrugGroup controller file (paste.txt)

// @desc    Get available studies (not in any drug group or available for assignment)
// @route   GET /api/drug-groups/available-studies
// @access  Private
exports.getAvailableStudies = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { study_name: { $regex: req.query.search, $options: "i" } },
        { protocol_number: { $regex: req.query.search, $options: "i" } },
        { study_title: { $regex: req.query.search, $options: "i" } },
      ]
    }

    if (req.query.status) {
      query.status = req.query.status
    }

    const sortBy = req.query.sortBy || "date_created"
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1
    const sort = { [sortBy]: sortOrder }

    const studies = await Study.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .select("study_name protocol_number study_title date_created status")
      .lean()

    const total = await Study.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: studies.length,
      total,
      pagination,
      data: studies,
    })
  } catch (error) {
    console.error("Error in getAvailableStudies:", error)
    next(error)
  }
}

// @desc    Get available drugs (not in any drug group or available for assignment)
// @route   GET /api/drug-groups/available-drugs
// @access  Private
exports.getAvailableDrugs = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { drug_name: { $regex: req.query.search, $options: "i" } },
        { quantity: { $regex: req.query.search, $options: "i" } },
        { remaining_quantity: { $regex: req.query.search, $options: "i" } },
      ]
    }

    if (req.query.status) {
      query.status = req.query.status
    }

    const sortBy = req.query.sortBy || "date_created"
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1
    const sort = { [sortBy]: sortOrder }

    const drugs = await Drug.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .select("drug_name quantity remaining_quantity date_created status")
      .lean()

    const total = await Drug.countDocuments(query)

    const pagination = {}
    if (startIndex + limit < total) {
      pagination.next = { page: page + 1, limit }
    }
    if (startIndex > 0) {
      pagination.prev = { page: page - 1, limit }
    }

    res.status(200).json({
      success: true,
      count: drugs.length,
      total,
      pagination,
      data: drugs,
    })
  } catch (error) {
    console.error("Error in getAvailableDrugs:", error)
    next(error)
  }
}


exports.syncDrugGroupRelationships = async (req, res, next) => {
  try {
    const issues = []
    const fixes = []

    const drugGroups = await DrugGroup.find({})

    for (const group of drugGroups) {
      // Initialize empty arrays if missing
      if (!Array.isArray(group.studies)) {
        group.studies = []
        fixes.push(`Initialized studies array for group: ${group.group_name}`)
      }

      if (!Array.isArray(group.drugs)) {
        group.drugs = []
        fixes.push(`Initialized drugs array for group: ${group.group_name}`)
      }

      // Validate study references
      const studyIds = group.studies.map(id => id.toString())
      const existingStudies = await Study.find({ _id: { $in: studyIds } })
      const existingStudyIds = existingStudies.map(study => study._id.toString())

      const invalidStudyIds = studyIds.filter(id => !existingStudyIds.includes(id))
      if (invalidStudyIds.length > 0) {
        issues.push({
          group: group.group_name,
          issue: "Invalid study references",
          invalidStudyIds
        })
        group.studies = group.studies.filter(id => existingStudyIds.includes(id.toString()))
        fixes.push(`Removed ${invalidStudyIds.length} invalid study references from group: ${group.group_name}`)
      }

      // Validate drug references
      const drugIds = group.drugs.map(id => id.toString())
      const existingDrugs = await Drug.find({ _id: { $in: drugIds } })
      const existingDrugIds = existingDrugs.map(drug => drug._id.toString())

      const invalidDrugIds = drugIds.filter(id => !existingDrugIds.includes(id))
      if (invalidDrugIds.length > 0) {
        issues.push({
          group: group.group_name,
          issue: "Invalid drug references",
          invalidDrugIds
        })
        group.drugs = group.drugs.filter(id => existingDrugIds.includes(id.toString()))
        fixes.push(`Removed ${invalidDrugIds.length} invalid drug references from group: ${group.group_name}`)
      }

      await group.save()
    }

    res.status(200).json({
      success: true,
      message: "Drug group relationship sync completed",
      issues,
      fixes,
      summary: {
        totalGroups: drugGroups.length,
        issuesFound: issues.length,
        fixesApplied: fixes.length
      }
    })
  } catch (error) {
    console.error("Error in syncDrugGroupRelationships:", error)
    next(error)
  }
}

