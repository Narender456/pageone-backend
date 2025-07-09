const Drugs = require("../models/Drugs")
const Study = require("../models/Study") // Required for validating study existence
const mongoose = require("mongoose");
const crypto = require("crypto"); // or use uuid if preferred

// @desc    Get all drugs
// @route   GET /api/drugs
// @access  Private
exports.getDrugs = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { drug_name: { $regex: req.query.search, $options: "i" } },
        { slug: { $regex: req.query.search, $options: "i" } },
      ]
    }

    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true"
    }

    if (req.query.lowStock === "true") {
      const threshold = Number.parseInt(req.query.threshold, 10) || 10
      query.remaining_quantity = { $lte: threshold }
    }

    if (req.query.outOfStock === "true") {
      query.remaining_quantity = 0
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

    const drugs = await Drugs.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title date_created",
        options: { sort: { date_created: -1 } }
      })
      .lean()

    const total = await Drugs.countDocuments(query)

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
    console.error("Error in getDrugs:", error)
    next(error)
  }
}

// @desc    Get single drug
// @route   GET /api/drugs/:id
// @access  Private
exports.getDrug = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug ID format",
      })
    }

    const drug = await Drugs.findById(req.params.id).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    res.status(200).json({
      success: true,
      data: drug,
    })
  } catch (error) {
    console.error("Error in getDrug:", error)
    next(error)
  }
}

// @desc    Create drug
// @route   POST /api/drugs
// @access  Private/Admin
exports.createDrug = async (req, res, next) => {
  try {
    const { drug_name, quantity, remaining_quantity, isActive, studies = [] } = req.body

    // Validation
    if (!drug_name || drug_name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Drug name is required",
      })
    }

    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid quantity is required",
      })
    }

    // Auto-set remaining_quantity to quantity if not provided
    let finalRemainingQuantity = remaining_quantity
    if (remaining_quantity === undefined || remaining_quantity === null) {
      finalRemainingQuantity = quantity
    }

    // Validate remaining quantity
    if (finalRemainingQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Remaining quantity cannot be negative",
      })
    }

    if (finalRemainingQuantity > quantity) {
      return res.status(400).json({
        success: false,
        message: "Remaining quantity cannot exceed total quantity",
      })
    }

    const existingDrug = await Drugs.findOne({
      drug_name: { $regex: new RegExp(`^${drug_name.trim()}$`, "i") },
    })

    if (existingDrug) {
      return res.status(400).json({
        success: false,
        message: "Drug with this name already exists",
      })
    }

    // Convert study IDs to ObjectId if needed
    const studyObjectIds = studies.map((id) => new mongoose.Types.ObjectId(id))

    const drugRecord = await Drugs.create({
      drug_name: drug_name.trim(),
      quantity,
      remaining_quantity: finalRemainingQuantity, // Use the calculated remaining quantity
      isActive: isActive !== undefined ? isActive : true,
      studies: studyObjectIds,
    })

    // Optional activity log
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(
        `created_drug:${drugRecord.drug_name}`,
        req.ip,
        req.get("User-Agent")
      )
    }

    res.status(201).json({
      success: true,
      data: drugRecord,
      message: `Drug '${drugRecord.drug_name}' created successfully with ${drugRecord.quantity} units available`,
    })
  } catch (error) {
    console.error("Error in createDrug:", error)
    next(error)
  }
}

// @desc    Update drug
// @route   PUT /api/drugs/:id
// @access  Private/Admin
exports.updateDrug = async (req, res, next) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug ID format",
      })
    }

    const { drug_name, quantity, remaining_quantity, isActive, studies } = req.body

    if (drug_name && drug_name.trim()) {
      const existingDrug = await Drugs.findOne({
        _id: { $ne: req.params.id },
        drug_name: { $regex: new RegExp(`^${drug_name.trim()}$`, "i") },
      })

      if (existingDrug) {
        return res.status(400).json({
          success: false,
          message: "Drug with this name already exists",
        })
      }
    }

    // Validate quantity constraints
    if (quantity !== undefined && remaining_quantity !== undefined) {
      if (remaining_quantity > quantity) {
        return res.status(400).json({
          success: false,
          message: "Remaining quantity cannot exceed total quantity",
        })
      }
    }

    const updateData = {}
    if (drug_name !== undefined && drug_name.trim()) updateData.drug_name = drug_name.trim()
    if (quantity !== undefined) updateData.quantity = quantity
    if (remaining_quantity !== undefined) updateData.remaining_quantity = remaining_quantity
    if (isActive !== undefined) updateData.isActive = isActive

    // Add study association update
    if (studies && Array.isArray(studies)) {
      updateData.studies = studies.map((id) => new mongoose.Types.ObjectId(id))
    }

    const drug = await Drugs.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status",
      options: { sort: { date_created: -1 } }
    })

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(`updated_drug:${drug.drug_name}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      data: drug,
    })
  } catch (error) {
    console.error("Error in updateDrug:", error)
    next(error)
  }
}

// @desc    Delete drug
// @route   DELETE /api/drugs/:id
// @access  Private/Admin
exports.deleteDrug = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug ID format",
      })
    }

    const drug = await Drugs.findById(id).populate("studies")

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    // OPTIONAL: Remove this drug from associated studies before deletion
    if (drug.studies && drug.studies.length > 0) {
      await Study.updateMany(
        { _id: { $in: drug.studies.map((s) => s._id) } },
        { $pull: { drugs: drug._id } }
      )
    }

    await Drugs.findByIdAndDelete(id)

    // Log activity
    if (req.user && typeof req.user.logActivity === "function") {
      await req.user.logActivity(`deleted_drug:${drug.drug_name}`, req.ip, req.get("User-Agent"))
    }

    res.status(200).json({
      success: true,
      message: "Drug deleted successfully",
    })
  } catch (error) {
    console.error("Error in deleteDrug:", error)
    next(error)
  }
}

// @desc    Toggle drug status
// @route   PATCH /api/drugs/:id/toggle-status
// @access  Private/Admin
exports.toggleDrugStatus = async (req, res, next) => {
  try {
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug ID format",
      })
    }

    const drug = await Drugs.findById(req.params.id)

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    drug.isActive = !drug.isActive
    await drug.save()

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `${drug.isActive ? "activated" : "deactivated"}_drug:${drug.drug_name}`,
        req.ip,
        req.get("User-Agent"),
      )
    }

    res.status(200).json({
      success: true,
      data: drug,
    })
  } catch (error) {
    console.error("Error in toggleDrug:", error)
    next(error)
  }
}

// @desc    Get drug statistics
// @route   GET /api/drugs/stats
// @access  Private
exports.getDrugStats = async (req, res, next) => {
  try {
    // Check if getStatistics method exists on Drugs model
    let stats = {}
    if (typeof Drugs.getStatistics === 'function') {
      stats = await Drugs.getStatistics()
    } else {
      // Fallback manual statistics
      const totalDrugs = await Drugs.countDocuments()
      const activeDrugs = await Drugs.countDocuments({ isActive: true })
      const inactiveDrugs = totalDrugs - activeDrugs
      const lowStockDrugs = await Drugs.countDocuments({ remaining_quantity: { $lte: 10 }, isActive: true })
      const outOfStockDrugs = await Drugs.countDocuments({ remaining_quantity: 0, isActive: true })
      
      stats = {
        totalDrugs,
        activeDrugs,
        inactiveDrugs,
        lowStockDrugs,
        outOfStockDrugs
      }
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentDrugs = await Drugs.countDocuments({
      date_created: { $gte: thirtyDaysAgo },
    })

    const stockDistribution = await Drugs.aggregate([
      {
        $project: {
          drug_name: 1,
          quantity: 1,
          remaining_quantity: 1,
          studyCount: { 
            $cond: {
              if: { $isArray: "$studies" },
              then: { $size: "$studies" },
              else: 0
            }
          },
          isActive: 1,
          stockLevel: {
            $switch: {
              branches: [
                { case: { $eq: ["$remaining_quantity", 0] }, then: "Out of Stock" },
                { case: { $lte: ["$remaining_quantity", 10] }, then: "Low Stock" },
                { case: { $lte: ["$remaining_quantity", 50] }, then: "Medium Stock" },
                { case: { $gt: ["$remaining_quantity", 50] }, then: "High Stock" },
              ],
              default: "Unknown",
            },
          },
        },
      },
      {
        $group: {
          _id: "$stockLevel",
          count: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalRemaining: { $sum: "$remaining_quantity" },
        },
      },
    ])

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        recentDrugs,
        stockDistribution,
      },
    })
  } catch (error) {
    console.error("Error in getDrugStats:", error)
    next(error)
  }
}

// @desc    Add study to drug
// @route   POST /api/drugs/:id/studies/:studyId
// @access  Private/Admin
exports.addStudyToDrug = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const drug = await Drugs.findById(id)
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
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
    if (!drug.studies) {
      drug.studies = []
    }

    // Check if study is already in this drug
    const studyExists = drug.studies.some(
      study => study.toString() === studyId
    )

    if (studyExists) {
      return res.status(400).json({
        success: false,
        message: "Study is already associated with this drug",
      })
    }

    drug.studies.push(studyId)
    await drug.save()

    // Populate the updated drug
    await drug.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `added_study_to_drug:${drug.drug_name}:${study.study_name || study.protocol_number}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drug,
      message: "Study added to drug successfully"
    })
  } catch (error) {
    console.error("Error in addStudyToDrug:", error)
    next(error)
  }
}

// @desc    Bulk add studies to drug
// @route   POST /api/drugs/:id/studies/bulk
// @access  Private/Admin
exports.bulkAddStudiesToDrug = async (req, res, next) => {
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
        message: "Invalid drug ID format",
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

    const drug = await Drugs.findById(id)
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
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
    if (!drug.studies) {
      drug.studies = []
    }

    // Filter out studies that are already associated with the drug
    const existingStudyIds = drug.studies.map(study => study.toString())
    const newStudyIds = studyIds.filter(studyId => !existingStudyIds.includes(studyId))

    if (newStudyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All studies are already associated with this drug",
      })
    }

    // Add new studies
    drug.studies.push(...newStudyIds)
    await drug.save()

    // Populate the updated drug
    await drug.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `bulk_added_studies_to_drug:${drug.drug_name}:${newStudyIds.length}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drug,
      message: `${newStudyIds.length} studies added to drug successfully`,
      addedCount: newStudyIds.length
    })
  } catch (error) {
    console.error("Error in bulkAddStudiesToDrug:", error)
    next(error)
  }
}

// @desc    Remove study from drug
// @route   DELETE /api/drugs/:id/studies/:studyId
// @access  Private/Admin
exports.removeStudyFromDrug = async (req, res, next) => {
  try {
    const { id, studyId } = req.params

    // Validate ObjectId formats
    if (!id.match(/^[0-9a-fA-F]{24}$/) || !studyId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      })
    }

    const drug = await Drugs.findById(id)
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    // Initialize studies array if it doesn't exist
    if (!drug.studies) {
      drug.studies = []
    }

    const originalLength = drug.studies.length
    drug.studies = drug.studies.filter(
      study => study.toString() !== studyId
    )

    // Check if study was actually removed
    if (drug.studies.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Study not found in this drug",
      })
    }

    await drug.save()

    // Populate the updated drug
    await drug.populate({
      path: "studies",
      select: "study_name protocol_number study_title date_created status"
    })

    // Check if user exists and has logActivity method
    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `removed_study_from_drug:${drug.drug_name}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drug,
      message: "Study removed from drug successfully"
    })
  } catch (error) {
    console.error("Error in removeStudyFromDrug:", error)
    next(error)
  }
}

// @desc    Get available studies (not assigned to any drug)
// @route   GET /api/drugs/available-studies
// @access  Private
exports.getAvailableStudies = async (req, res, next) => {
  try {
    // Get all drugs and extract assigned study IDs
    const allDrugs = await Drugs.find({}, 'studies').lean()
    const assignedStudyIds = allDrugs
      .flatMap(drug => drug.studies || [])
      .map(id => id.toString())

    // Get studies not assigned to any drug
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

// @desc    Get studies in a specific drug
// @route   GET /api/drugs/:id/studies
// @access  Private
exports.getStudiesInDrug = async (req, res, next) => {
  try {
    const { id } = req.params

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug ID format",
      })
    }

    const drug = await Drugs.findById(id)
      .populate({
        path: 'studies',
        select: 'study_name protocol_number study_title date_created status',
        options: { sort: { date_created: -1 } }
      })

    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    res.status(200).json({
      success: true,
      drug: {
        _id: drug._id,
        drug_name: drug.drug_name,
        quantity: drug.quantity,
        remaining_quantity: drug.remaining_quantity,
        isActive: drug.isActive
      },
      count: drug.studies ? drug.studies.length : 0,
      data: drug.studies || [],
    })
  } catch (error) {
    console.error("Error in getStudiesInDrug:", error)
    next(error)
  }
}

// @desc    Update drug quantity
// @route   PATCH /api/drugs/:id/quantity
// @access  Private/Admin
exports.updateDrugQuantity = async (req, res, next) => {
  try {
    const { id } = req.params
    const { quantity, remaining_quantity, operation } = req.body

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid drug ID format",
      })
    }

    const drug = await Drugs.findById(id)
    if (!drug) {
      return res.status(404).json({
        success: false,
        message: "Drug not found",
      })
    }

    if (operation === 'use' && remaining_quantity !== undefined) {
      // Use drug - reduce remaining quantity
      if (remaining_quantity < 0 || remaining_quantity > drug.quantity) {
        return res.status(400).json({
          success: false,
          message: "Invalid remaining quantity",
        })
      }
      await drug.updateRemainingQuantity(remaining_quantity)
    } else if (operation === 'restock' && quantity !== undefined) {
      // Restock - update total quantity
      if (quantity < 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity cannot be negative",
        })
      }
      await drug.updateQuantity(quantity)
    } else {
      // Manual update
      if (quantity !== undefined) {
        await drug.updateQuantity(quantity)
      }
      if (remaining_quantity !== undefined) {
        await drug.updateRemainingQuantity(remaining_quantity)
      }
    }

    if (req.user && typeof req.user.logActivity === 'function') {
      await req.user.logActivity(
        `updated_drug_quantity:${drug.drug_name}:${operation || 'manual'}`, 
        req.ip, 
        req.get("User-Agent")
      )
    }

    res.status(200).json({
      success: true,
      data: drug,
      message: "Drug quantity updated successfully"
    })
  } catch (error) {
    console.error("Error in updateDrugQuantity:", error)
    next(error)
  }
}

// @desc    Get low stock drugs
// @route   GET /api/drugs/low-stock
// @access  Private
exports.getLowStockDrugs = async (req, res, next) => {
  try {
    const threshold = Number.parseInt(req.query.threshold, 10) || 10
    
    const lowStockDrugs = await Drugs.findLowStock(threshold)
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title",
      })
      .sort({ remaining_quantity: 1 })

    res.status(200).json({
      success: true,
      count: lowStockDrugs.length,
      threshold,
      data: lowStockDrugs,
    })
  } catch (error) {
    console.error("Error in getLowStockDrugs:", error)
    next(error)
  }
}

// @desc    Get out of stock drugs
// @route   GET /api/drugs/out-of-stock
// @access  Private
exports.getOutOfStockDrugs = async (req, res, next) => {
  try {
    const outOfStockDrugs = await Drugs.findOutOfStock()
      .populate({
        path: "studies",
        select: "study_name protocol_number study_title",
      })
      .sort({ last_updated: -1 })

    res.status(200).json({
      success: true,
      count: outOfStockDrugs.length,
      data: outOfStockDrugs,
    })
  } catch (error) {
    console.error("Error in getOutOfStockDrugs:", error)
    next(error)
  }
}

// @desc    Sync and fix drug relationships
// @route   POST /api/drugs/sync-relationships
// @access  Private/Admin
exports.syncDrugRelationships = async (req, res, next) => {
  try {
    const issues = []
    const fixes = []

    // Get all drugs
    const drugs = await Drugs.find({})

    for (const drug of drugs) {
      if (!drug.studies || !Array.isArray(drug.studies)) {
        // Fix: Initialize empty studies array
        drug.studies = []
        await drug.save()
        fixes.push(`Initialized studies array for drug: ${drug.drug_name}`)
        continue
      }

      // Check if all referenced studies exist
      const studyIds = drug.studies.map(id => id.toString())
      const existingStudies = await Study.find({ _id: { $in: studyIds } })
      const existingStudyIds = existingStudies.map(study => study._id.toString())
      
      const missingStudyIds = studyIds.filter(id => !existingStudyIds.includes(id))
      
      if (missingStudyIds.length > 0) {
        issues.push({
          drug: drug.drug_name,
          issue: 'References non-existent studies',
          missingStudyIds
        })

        // Fix: Remove non-existent study references
        drug.studies = drug.studies.filter(id => existingStudyIds.includes(id.toString()))
        await drug.save()
        fixes.push(`Removed ${missingStudyIds.length} invalid study references from drug: ${drug.drug_name}`)
      }

      // Check quantity constraints
      if (drug.remaining_quantity > drug.quantity) {
        issues.push({
          drug: drug.drug_name,
          issue: 'Remaining quantity exceeds total quantity',
          data: { 
           quantity: drug.quantity, 
           remaining_quantity: drug.remaining_quantity 
         }
       })
       
       // Fix: Set remaining quantity to total quantity
       drug.remaining_quantity = drug.quantity
       await drug.save()
       fixes.push(`Fixed remaining quantity for drug: ${drug.drug_name}`)
     }
     
     // Check for negative quantities
     if (drug.quantity < 0) {
       issues.push({
         drug: drug.drug_name,
         issue: 'Negative total quantity',
         data: { quantity: drug.quantity }
       })
       
       // Fix: Set quantity to 0
       drug.quantity = 0
       drug.remaining_quantity = 0
       await drug.save()
       fixes.push(`Fixed negative quantity for drug: ${drug.drug_name}`)
     }
     
     if (drug.remaining_quantity < 0) {
       issues.push({
         drug: drug.drug_name,
         issue: 'Negative remaining quantity',
         data: { remaining_quantity: drug.remaining_quantity }
       })
       
       // Fix: Set remaining quantity to 0
       drug.remaining_quantity = 0
       await drug.save()
       fixes.push(`Fixed negative remaining quantity for drug: ${drug.drug_name}`)
     }
     
     // Check expiry date validity
     if (drug.expiry_date && new Date(drug.expiry_date) < new Date()) {
       issues.push({
         drug: drug.drug_name,
         issue: 'Drug has expired',
         data: { expiry_date: drug.expiry_date }
       })
     }
     
     // Check for duplicate drug names
     const duplicateDrugs = await Drugs.find({ 
       drug_name: drug.drug_name, 
       _id: { $ne: drug._id } 
     })
     
     if (duplicateDrugs.length > 0) {
       issues.push({
         drug: drug.drug_name,
         issue: 'Duplicate drug name found',
         data: { duplicateCount: duplicateDrugs.length }
       })
     }
   }
   
   // Check for orphaned studies (studies not referenced by any drug)
   const allStudies = await Study.find({})
   const allReferencedStudyIds = []
   
   drugs.forEach(drug => {
     if (drug.studies && Array.isArray(drug.studies)) {
       allReferencedStudyIds.push(...drug.studies.map(id => id.toString()))
     }
   })
   
   const orphanedStudies = allStudies.filter(study => 
     !allReferencedStudyIds.includes(study._id.toString())
   )
   
   if (orphanedStudies.length > 0) {
     issues.push({
       issue: 'Orphaned studies found',
       data: { 
         orphanedStudyIds: orphanedStudies.map(study => study._id),
         count: orphanedStudies.length
       }
     })
   }
   
   res.status(200).json({
     success: true,
     message: 'Drug relationship sync completed',
     summary: {
       totalDrugs: drugs.length,
       issuesFound: issues.length,
       fixesApplied: fixes.length
     },
     issues,
     fixes
   })
   
 } catch (error) {
   console.error('Error syncing drug relationships:', error)
   res.status(500).json({
     success: false,
     message: 'Failed to sync drug relationships',
     error: error.message
   })
 }
}