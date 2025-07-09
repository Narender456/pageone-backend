const express = require("express")
const { body, query } = require("express-validator")
const {
  getStudyPhases,
  getStudyPhase,
  createStudyPhase,
  updateStudyPhase,
  deleteStudyPhase,
  getStudyPhaseStats,
  toggleStudyPhaseStatus,
  addStudyToPhase,
  removeStudyFromPhase,
  bulkAddStudiesToPhase,
  getAvailableStudies,
  getStudiesInPhase,
  syncStudyPhaseRelationships,
} = require("../controllers/studyPhases")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createStudyPhaseValidation = [
  body("study_phase")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Study phase name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const updateStudyPhaseValidation = [
  body("study_phase")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Study phase name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const getStudyPhasesValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  query("sortBy")
    .optional()
    .isIn(["study_phase", "date_created", "last_updated", "studyCount"])
    .withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Sort order must be asc or desc"),
]

const bulkAddStudiesValidation = [
  body("studyIds")
    .isArray({ min: 1 })
    .withMessage("studyIds must be a non-empty array"),
  body("studyIds.*")
    .isMongoId()
    .withMessage("Each study ID must be a valid MongoDB ObjectId"),
]

const mongoIdValidation = [
  body("studyId").optional().isMongoId().withMessage("Study ID must be a valid MongoDB ObjectId"),
]

// Base routes (order matters - specific routes before parameterized ones)
router.get("/stats", getStudyPhaseStats)
router.get("/available-studies", getAvailableStudies)
router.post("/sync-relationships", authorize("admin"), syncStudyPhaseRelationships)

// CRUD routes
router.get("/", getStudyPhasesValidation, validateRequest, getStudyPhases)
router.get("/:id", getStudyPhase)
router.post("/", authorize("admin"), createStudyPhaseValidation, validateRequest, createStudyPhase)
router.put("/:id", authorize("admin"), updateStudyPhaseValidation, validateRequest, updateStudyPhase)
router.patch("/:id/toggle-status", authorize("admin"), toggleStudyPhaseStatus)
router.delete("/:id", authorize("admin"), deleteStudyPhase)

// Study management routes for specific phase
router.get("/:id/studies", getStudiesInPhase)
router.post("/:id/studies/bulk", authorize("admin"), bulkAddStudiesValidation, validateRequest, bulkAddStudiesToPhase)
router.post("/:id/studies/:studyId", authorize("admin"), addStudyToPhase)
router.delete("/:id/studies/:studyId", authorize("admin"), removeStudyFromPhase)

module.exports = router