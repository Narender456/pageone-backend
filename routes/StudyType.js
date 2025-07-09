const express = require("express")
const { body, query } = require("express-validator")
const {
  getStudyTypes,
  getStudyType,
  createStudyType,
  updateStudyType,
  deleteStudyType,
  getStudyTypeStats,
  toggleStudyTypeStatus,
  addStudyToType,
  removeStudyFromType,
  bulkAddStudiesToType,
  getAvailableStudies,
  getStudiesInType,
  syncStudyTypeRelationships,
} = require("../controllers/StudyType")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createStudyTypeValidation = [
  body("study_type")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Study type name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const updateStudyTypeValidation = [
  body("study_type")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Study type name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const getStudyTypesValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  query("sortBy")
    .optional()
    .isIn(["study_type", "date_created", "last_updated", "studyCount"])
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
router.get("/stats", getStudyTypeStats)
router.get("/available-studies", getAvailableStudies)
router.post("/sync-relationships", authorize("admin"), syncStudyTypeRelationships)

// CRUD routes
router.get("/", getStudyTypesValidation, validateRequest, getStudyTypes)
router.get("/:id", getStudyType)
router.post("/", authorize("admin"), createStudyTypeValidation, validateRequest, createStudyType)
router.put("/:id", authorize("admin"), updateStudyTypeValidation, validateRequest, updateStudyType)
router.patch("/:id/toggle-status", authorize("admin"), toggleStudyTypeStatus)
router.delete("/:id", authorize("admin"), deleteStudyType)

// Study management routes for specific type
router.get("/:id/studies", getStudiesInType)
router.post("/:id/studies/bulk", authorize("admin"), bulkAddStudiesValidation, validateRequest, bulkAddStudiesToType)
router.post("/:id/studies/:studyId", authorize("admin"), addStudyToType)
router.delete("/:id/studies/:studyId", authorize("admin"), removeStudyFromType)

module.exports = router
