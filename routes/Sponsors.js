const express = require("express")
const { body, query } = require("express-validator")
const {
  getSponsors,
  getSponsor,
  createSponsor,
  updateSponsor,
  deleteSponsor,
  getSponsorStats,
  toggleSponsorStatus,
  addStudyToSponsor,
  removeStudyFromSponsor,
  bulkAddStudiesToSponsor,
  getAvailableStudies,
  getStudiesInSponsor,
  syncSponsorRelationships,
} = require("../controllers/Sponsors")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createSponsorValidation = [
  body("sponsor_name")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Sponsor name must be between 1 and 255 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const updateSponsorValidation = [
  body("sponsor_name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Sponsor name must be between 1 and 255 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const getSponsorsValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  query("sortBy")
    .optional()
    .isIn(["sponsor", "date_created", "last_updated", "studyCount"])
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
router.get("/stats", getSponsorStats)
router.get("/available-studies", getAvailableStudies)
router.post("/sync-relationships", authorize("admin"), syncSponsorRelationships)

// CRUD routes
router.get("/", getSponsorsValidation, validateRequest, getSponsors)
router.get("/:id", getSponsor)
router.post("/", authorize("admin"), createSponsorValidation, validateRequest, createSponsor)
router.put("/:id", authorize("admin"), updateSponsorValidation, validateRequest, updateSponsor)
router.patch("/:id/toggle-status", authorize("admin"), toggleSponsorStatus)
router.delete("/:id", authorize("admin"), deleteSponsor)

// Study management routes for specific sponsor
router.get("/:id/studies", getStudiesInSponsor)
router.post("/:id/studies/bulk", authorize("admin"), bulkAddStudiesValidation, validateRequest, bulkAddStudiesToSponsor)
router.post("/:id/studies/:studyId", authorize("admin"), addStudyToSponsor)
router.delete("/:id/studies/:studyId", authorize("admin"), removeStudyFromSponsor)

module.exports = router