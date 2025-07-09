const express = require("express")
const { body, query } = require("express-validator")
const {
  getDrugs,
  getDrug,
  createDrug,
  updateDrug,
  deleteDrug,
  getDrugStats,
  toggleDrugStatus,
  addStudyToDrug,
  removeStudyFromDrug,
  bulkAddStudiesToDrug,
  getAvailableStudies,
  getStudiesInDrug,
  syncDrugRelationships,
} = require("../controllers/Drugs")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected
router.use(protect)

// Validation rules
const createDrugValidation = [
  body("drug_name")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Drug name must be between 1 and 255 characters"),
  body("quantity")
    .isInt({ min: 0 })
    .withMessage("Quantity must be a non-negative integer"),
  body("remaining_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Remaining quantity must be a non-negative integer"),
  body("expiry_date")
    .optional()
    .isISO8601()
    .withMessage("Expiry date must be a valid date"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
  body("studies")
    .optional()
    .isArray()
    .withMessage("Studies must be an array"),
]

const validateRemainingQuantity = (req, res, next) => {
  const { quantity, remaining_quantity } = req.body
  
  if (remaining_quantity !== undefined && remaining_quantity > quantity) {
    return res.status(400).json({
      success: false,
      message: "Remaining quantity cannot exceed total quantity",
    })
  }
  
  next()
}


const updateDrugValidation = [
  body("drug_name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Drug name must be between 1 and 255 characters"),
  body("quantity").optional().isInt({ min: 0 }).withMessage("Quantity must be a non-negative integer"),
  body("remaining_quantity").optional().isInt({ min: 0 }).withMessage("Remaining quantity must be a non-negative integer"),
  body("expiry_date").optional().isISO8601().withMessage("Expiry date must be a valid date"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
]

const getDrugsValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  query("sortBy")
    .optional()
    .isIn(["drug_name", "date_created", "last_updated", "studyCount", "quantity", "remaining_quantity", "expiry_date"])
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
router.get("/stats", getDrugStats)
router.get("/available-studies", getAvailableStudies)
router.post("/sync-relationships", authorize("admin"), syncDrugRelationships)

// CRUD routes
router.get("/", getDrugsValidation, validateRequest, getDrugs)
router.get("/:id", getDrug)
router.post("/", authorize("admin"), createDrugValidation, validateRequest, validateRemainingQuantity, createDrug)
router.put("/:id", authorize("admin"), updateDrugValidation, validateRequest, updateDrug)
router.patch("/:id/toggle-status", authorize("admin"), toggleDrugStatus)
router.delete("/:id", authorize("admin"), deleteDrug)

// Study management routes for specific drug
router.get("/:id/studies", getStudiesInDrug)
router.post("/:id/studies/bulk", authorize("admin"), bulkAddStudiesValidation, validateRequest, bulkAddStudiesToDrug)
router.post("/:id/studies/:studyId", authorize("admin"), addStudyToDrug)
router.delete("/:id/studies/:studyId", authorize("admin"), removeStudyFromDrug)

module.exports = router