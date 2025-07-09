const Study = require("../models/Study")
const { validationResult } = require("express-validator")

// @desc    Get all studies
// @route   GET /api/studies
// @access  Private
// @desc    Get all studies
exports.getStudies = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 1000
    const skip = (page - 1) * limit

    const query = {}

    if (req.query.search) {
      query.$or = [
        { study_name: { $regex: req.query.search, $options: "i" } },
        { protocol_number: { $regex: req.query.search, $options: "i" } },
      ]
    }

    const studies = await Study.find(query)
      .sort({ date_created: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const total = await Study.countDocuments(query)

    res.status(200).json({
      success: true,
      data: studies, // ✅ this is what frontend expects
      total,
      count: studies.length,
    })
  } catch (error) {
    next(error)
  }
}


// @desc    Get single study
// @route   GET /api/studies/:id
// @access  Private
exports.getStudy = async (req, res) => {
  try {
    const study = await Study.findById(req.params.id)

    if (!study) {
      return res.status(404).json({
        success: false,
        message: "Study not found",
      })
    }

    res.status(200).json({
      success: true,
      data: study,
    })
  } catch (error) {
    console.error("Get study error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Create new study
// @route   POST /api/studies
// @access  Private (Admin only)
exports.createStudy = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errors.array(),
      })
    }

    const study = await Study.create(req.body)

    res.status(201).json({
      success: true,
      data: study,
      message: "Study created successfully",
    })
  } catch (error) {
    console.error("Create study error:", error)

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Study with this protocol number already exists",
      })
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Update study
// @route   PUT /api/studies/:id
// @access  Private (Admin only)
exports.updateStudy = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errors.array(),
      })
    }

    const study = await Study.findByIdAndUpdate(req.params.id, req.body, { 
      new: true, 
      runValidators: true 
    })

    if (!study) {
      return res.status(404).json({
        success: false,
        message: "Study not found",
      })
    }

    res.status(200).json({
      success: true,
      data: study,
      message: "Study updated successfully",
    })
  } catch (error) {
    console.error("Update study error:", error)

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Study with this protocol number already exists",
      })
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Delete study
// @route   DELETE /api/studies/:id
// @access  Private (Admin only)
exports.deleteStudy = async (req, res) => {
  try {
    const study = await Study.findById(req.params.id)

    if (!study) {
      return res.status(404).json({
        success: false,
        message: "Study not found",
      })
    }

    await Study.findByIdAndDelete(req.params.id)

    res.status(200).json({
      success: true,
      message: "Study deleted successfully",
    })
  } catch (error) {
    console.error("Delete study error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get study statistics
// @route   GET /api/studies/stats
// @access  Private
exports.getStudyStats = async (req, res) => {
  try {
    const totalStudies = await Study.countDocuments()
    const activeStudies = await Study.countDocuments({
      study_end_date: { $gte: new Date() },
    })
    const completedStudies = await Study.countDocuments({
      study_end_date: { $lt: new Date() },
    })

    // Note: Removed blinding status aggregation since it's no longer in the model

    // Recent studies
    const recentStudies = await Study.find()
      .sort({ date_created: -1 })
      .limit(5)
      .select("study_name protocol_number study_start_date date_created")

    res.status(200).json({
      success: true,
      data: {
        totalStudies,
        activeStudies,
        completedStudies,
        recentStudies,
      },
    })
  } catch (error) {
    console.error("Get study stats error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get blinding statuses
// @route   GET /api/studies/blinding-statuses
// @access  Private
// exports.getBlindingStatuses = async (req, res) => {
//   try {
//     const blindingStatuses = await BlindingStatus.find({ is_active: true }).sort({ status_name: 1 })

//     res.status(200).json({
//       success: true,
//       data: blindingStatuses,
//     })
//   } catch (error) {
//     console.error("Get blinding statuses error:", error)
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//     })
//   }
// }