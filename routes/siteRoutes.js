const express = require("express")
const { body, query } = require("express-validator")
const SiteController = require('../controllers/SiteController')
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createSiteValidation = [
  body("siteName")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Site name must be between 1 and 50 characters"),
  body("siteId")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Site ID cannot exceed 50 characters"),
  body("protocolNumber")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Protocol number cannot exceed 100 characters"),
  body("piName")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("PI name cannot exceed 100 characters"),
  body("studies")
    .optional()
    .isArray()
    .withMessage("Studies must be an array"),
  body("studies.*")
    .optional()
    .isMongoId()
    .withMessage("Each study ID must be a valid MongoDB ObjectId"),
  body("userAssignments")
    .optional()
    .isArray()
    .withMessage("User assignments must be an array"),
  body("userAssignments.*")
    .optional()
    .isMongoId()
    .withMessage("Each user ID must be a valid MongoDB ObjectId"),
]

const updateSiteValidation = [
  body("siteName")
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Site name must be between 1 and 50 characters"),
  body("siteId")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Site ID cannot exceed 50 characters"),
  body("protocolNumber")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Protocol number cannot exceed 100 characters"),
  body("piName")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("PI name cannot exceed 100 characters"),
  body("studies")
    .optional()
    .isArray()
    .withMessage("Studies must be an array"),
  body("studies.*")
    .optional()
    .isMongoId()
    .withMessage("Each study ID must be a valid MongoDB ObjectId"),
  body("userAssignments")
    .optional()
    .isArray()
    .withMessage("User assignments must be an array"),
  body("userAssignments.*")
    .optional()
    .isMongoId()
    .withMessage("Each user ID must be a valid MongoDB ObjectId"),
]

const getSitesValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("siteName").optional().trim().isLength({ max: 100 }).withMessage("Site name search term too long"),
  query("piName").optional().trim().isLength({ max: 100 }).withMessage("PI name search term too long"),
  query("protocolNumber").optional().trim().isLength({ max: 100 }).withMessage("Protocol number search term too long"),
  query("sortBy")
    .optional()
    .isIn(["siteName", "piName", "protocolNumber", "dateCreated", "createdAt", "lastUpdated"])
    .withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Sort order must be asc or desc"),
]

const searchSitesValidation = [
  query("q")
    .notEmpty()
    .withMessage("Search query is required")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search query must be between 1 and 100 characters"),
]

const bulkAddStudiesValidation = [
  body("studyIds")
    .isArray({ min: 1 })
    .withMessage("studyIds must be a non-empty array"),
  body("studyIds.*")
    .isMongoId()
    .withMessage("Each study ID must be a valid MongoDB ObjectId"),
]

const bulkAddUsersValidation = [
  body("userIds")
    .isArray({ min: 1 })
    .withMessage("userIds must be a non-empty array"),
  body("userIds.*")
    .isMongoId()
    .withMessage("Each user ID must be a valid MongoDB ObjectId"),
]

// Basic CRUD routes (public read access, admin write access)
router.get("/", getSitesValidation, validateRequest, SiteController.getAllSites)
router.get("/search", searchSitesValidation, validateRequest, SiteController.searchSites)
router.get('/stats', SiteController.getSiteStats);
router.patch('/:id/toggle-status', SiteController.toggleSiteStatus);
router.get("/:id", SiteController.getSiteById)
router.get("/slug/:slug", SiteController.getSiteBySlug)
router.post("/", authorize("admin"), createSiteValidation, validateRequest, SiteController.createSite)
router.put("/:id", authorize("admin"), updateSiteValidation, validateRequest, SiteController.updateSite)
router.delete("/:id", authorize("admin"), SiteController.deleteSite)

// Relationship management routes (admin only)
router.post("/:id/studies", authorize("admin"), bulkAddStudiesValidation, validateRequest, SiteController.addStudiesToSite)
router.delete("/:id/studies/:studyId", authorize("admin"), SiteController.removeStudyFromSite)
router.post("/:id/users", authorize("admin"), bulkAddUsersValidation, validateRequest, SiteController.addUsersToSite)
router.delete("/:id/users/:userId", authorize("admin"), SiteController.removeUserFromSite)

module.exports = router