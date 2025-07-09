const express = require("express")
const { body, query } = require("express-validator")
const {
  getBlindingStatuses,
  getBlindingStatus,
  createBlindingStatus,
  updateBlindingStatus,
  deleteBlindingStatus,
  getBlindingStatusStats,
  toggleBlindingStatusStatus,
  addStudyToStatus,
  removeStudyFromStatus,
  bulkAddStudiesToStatus,
  getAvailableStudies,
  getStudiesInStatus,
  syncBlindingStatusRelationships,
} = require("../controllers/BlindingStatus")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createBlindingStatusValidation = [
  body("blinding_status")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Blinding status name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const updateBlindingStatusValidation = [
  body("blinding_status")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Blinding status name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const getBlindingStatusesValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  query("sortBy")
    .optional()
    .isIn(["blinding_status", "date_created", "last_updated", "studyCount"])
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
router.get("/stats", getBlindingStatusStats)
router.get("/available-studies", getAvailableStudies)
router.post("/sync-relationships", authorize("admin"), syncBlindingStatusRelationships)

// CRUD routes
router.get("/", getBlindingStatusesValidation, validateRequest, getBlindingStatuses)
router.get("/:id", getBlindingStatus)
router.post("/", authorize("admin"), createBlindingStatusValidation, validateRequest, createBlindingStatus)
router.put("/:id", authorize("admin"), updateBlindingStatusValidation, validateRequest, updateBlindingStatus)
router.patch("/:id/toggle-status", authorize("admin"), toggleBlindingStatusStatus)
router.delete("/:id", authorize("admin"), deleteBlindingStatus)

// Study management routes for specific blinding status
router.get("/:id/studies", getStudiesInStatus)
router.post("/:id/studies/bulk", authorize("admin"), bulkAddStudiesValidation, validateRequest, bulkAddStudiesToStatus)
router.post("/:id/studies/:studyId", authorize("admin"), addStudyToStatus)
router.delete("/:id/studies/:studyId", authorize("admin"), removeStudyFromStatus)

module.exports = router