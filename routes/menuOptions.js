const express = require("express")
const router = express.Router()
const mongoose = require("mongoose") // ADD THIS IMPORT
const { body } = require("express-validator")
const {
  getMenuOptions,
  getMenuHierarchy,
  getParentMenuOptions,
  getMenuOptionById,
  createMenuOption,
  updateMenuOption,
  deleteMenuOption,
} = require("../controllers/menuOptions")
const { protect, authorize } = require("../middleware/auth")

// Validation rules
const menuOptionValidation = [
  body("name").trim().isLength({ min: 1, max: 100 }).withMessage("Menu name must be between 1 and 100 characters"),
  body("url").trim().isLength({ min: 1, max: 200 }).withMessage("URL must be between 1 and 200 characters"),
  body("icon").optional().trim().isLength({ max: 100 }).withMessage("Icon cannot be more than 100 characters"),
  // FIXED PARENT VALIDATION
  body('parent')
    .optional()
    .custom((value) => {
      // Allow null, undefined, or empty string
      if (!value || value === null || value === "") return true;
      // Check if it's a valid ObjectId
      return mongoose.Types.ObjectId.isValid(value);
    })
    .withMessage('Parent must be a valid ObjectId'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body("order").optional().isInt({ min: 0 }).withMessage("Order must be a positive number"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description cannot be more than 500 characters"),
]

// Apply authentication to all routes
router.use(protect)

// Routes
router.get("/", getMenuOptions)
router.get("/hierarchy", getMenuHierarchy)
router.get("/parents", getParentMenuOptions)
router.get("/:id", getMenuOptionById)
router.post("/", authorize("admin"), menuOptionValidation, createMenuOption)
router.put("/:id", authorize("admin"), menuOptionValidation, updateMenuOption)
router.delete("/:id", authorize("admin"), deleteMenuOption)

module.exports = router