const express = require("express")
const { body, query } = require("express-validator")
const {
  getStudyDesigns,
  getStudyDesign,
  createStudyDesign,
  updateStudyDesign,
  deleteStudyDesign,
  getStudyDesignStats,
  toggleStudyDesignStatus,
  addStudyToDesign,
  removeStudyFromDesign,
  bulkAddStudiesToDesign,
  getAvailableStudies,
  getStudiesInDesign,
  syncStudyDesignRelationships,
} = require("../controllers/StudyDesigns")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createStudyDesignValidation = [
  body("study_design")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Study design name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const updateStudyDesignValidation = [
  body("study_design")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Study design name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const getStudyDesignsValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  query("sortBy")
    .optional()
    .isIn(["study_design", "date_created", "last_updated", "studyCount"])
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
router.get("/stats", getStudyDesignStats)
router.get("/available-studies", getAvailableStudies)
router.post("/sync-relationships", authorize("admin"), syncStudyDesignRelationships)

// CRUD routes
router.get("/", getStudyDesignsValidation, validateRequest, getStudyDesigns)
router.get("/:id", getStudyDesign)
router.post("/", authorize("admin"), createStudyDesignValidation, validateRequest, createStudyDesign)
router.put("/:id", authorize("admin"), updateStudyDesignValidation, validateRequest, updateStudyDesign)
router.patch("/:id/toggle-status", authorize("admin"), toggleStudyDesignStatus)
router.delete("/:id", authorize("admin"), deleteStudyDesign)

// Study management routes for specific design
router.get("/:id/studies", getStudiesInDesign)
router.post("/:id/studies/bulk", authorize("admin"), bulkAddStudiesValidation, validateRequest, bulkAddStudiesToDesign)
router.post("/:id/studies/:studyId", authorize("admin"), addStudyToDesign)
router.delete("/:id/studies/:studyId", authorize("admin"), removeStudyFromDesign)

module.exports = router