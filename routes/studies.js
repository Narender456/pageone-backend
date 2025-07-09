const express = require("express")
const router = express.Router()
const { protect, authorize } = require("../middleware/auth")
const {
  getStudies,
  getStudy,
  createStudy,
  updateStudy,
  deleteStudy,
  getStudyStats,
  getBlindingStatuses,
} = require("../controllers/studies")
const { validateRequest } = require("../middleware/validation")

// All routes are protected
router.use(protect)

// Get all studies with filtering and pagination
router.get("/", getStudies)

// Get study statistics
router.get("/stats", getStudyStats)

// Get blinding statuses
// router.get("/blinding-statuses", getBlindingStatuses)

// Get single study
router.get("/:id", getStudy)

// Create new study (admin only)
router.post("/", authorize("admin"), validateRequest, createStudy)

// Update study (admin only)
router.put("/:id", authorize("admin"), validateRequest, updateStudy)

// Delete study (admin only)
router.delete("/:id", authorize("admin"), deleteStudy)

module.exports = router
