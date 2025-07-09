const express = require("express")
const { body, query } = require("express-validator")
const {
  getDrugGroups,
  getDrugGroup,
  createDrugGroup,
  updateDrugGroup,
  deleteDrugGroup,
  getDrugGroupStats,
  toggleDrugGroupStatus,
  addStudyToGroup,
  removeStudyFromGroup,
  bulkAddStudiesToGroup,
  getAvailableStudies,
  getStudiesInGroup,
  syncDrugGroupRelationships,
  addDrugToGroup,
  removeDrugFromGroup,
  bulkAddDrugsToGroup,
  getAvailableDrugs,
  getDrugsInGroup,
} = require("../controllers/DrugGroup")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createDrugGroupValidation = [
  body("group_name")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Drug group name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const updateDrugGroupValidation = [
  body("group_name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Drug group name must be between 1 and 255 characters"),
  body("description").optional().isLength({ max: 1000 }).withMessage("Description cannot exceed 1000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const getDrugGroupsValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  query("sortBy")
    .optional()
    .isIn(["group_name", "date_created", "last_updated", "studyCount", "drugCount"])
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

const bulkAddDrugsValidation = [
  body("drugIds")
    .isArray({ min: 1 })
    .withMessage("drugIds must be a non-empty array"),
  body("drugIds.*")
    .isMongoId()
    .withMessage("Each drug ID must be a valid MongoDB ObjectId"),
]

const mongoIdValidation = [
  body("studyId").optional().isMongoId().withMessage("Study ID must be a valid MongoDB ObjectId"),
  body("drugId").optional().isMongoId().withMessage("Drug ID must be a valid MongoDB ObjectId"),
]

// Base routes (order matters - specific routes before parameterized ones)
router.get("/stats", getDrugGroupStats)
router.get("/available-studies", getAvailableStudies)
router.get("/available-drugs", getAvailableDrugs)
router.post("/sync-relationships", authorize("admin"), syncDrugGroupRelationships)

// CRUD routes
router.get("/", getDrugGroupsValidation, validateRequest, getDrugGroups)
router.get("/:id", getDrugGroup)
router.post("/", authorize("admin"), createDrugGroupValidation, validateRequest, createDrugGroup)
router.put("/:id", authorize("admin"), updateDrugGroupValidation, validateRequest, updateDrugGroup)
router.patch("/:id/toggle-status", authorize("admin"), toggleDrugGroupStatus)
router.delete("/:id", authorize("admin"), deleteDrugGroup)

// Study management routes for specific drug group
router.get("/:id/studies", getStudiesInGroup);
router.post("/:id/studies/bulk", authorize("admin"), bulkAddStudiesValidation, validateRequest, bulkAddStudiesToGroup)
router.post("/:id/studies/:studyId", authorize("admin"), addStudyToGroup)
router.delete("/:id/studies/:studyId", authorize("admin"), removeStudyFromGroup)

// Drug management routes for specific drug group
router.get("/:id/drugs", getDrugsInGroup)
router.post("/:id/drugs/bulk", authorize("admin"), bulkAddDrugsValidation, validateRequest, bulkAddDrugsToGroup)
router.post("/:id/drugs/:drugId", authorize("admin"), addDrugToGroup)
router.delete("/:id/drugs/:drugId", authorize("admin"), removeDrugFromGroup)

module.exports = router