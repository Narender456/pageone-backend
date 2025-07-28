const express = require("express")
const router = express.Router()
const { body } = require("express-validator")
const { getRoles, getRole, createRole, updateRole, deleteRole, getRoleStats } = require("../controllers/roles")
const { protect, authorize } = require("../middleware/auth")

// Validation rules
// Updated validation rules for the route
const roleValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Role name must be between 1 and 100 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description cannot be more than 500 characters"),
  body("users")
    .optional()
    .isArray()
    .withMessage("Users must be an array"),
  body("users.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid user ID format"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
]
// Apply authentication to all routes
router.use(protect)

// Routes
router.get("/", getRoles)
router.get("/statistics", getRoleStats)
router.get("/:id", getRole)
router.post("/", authorize("admin"), roleValidation, createRole)
router.put("/:id", authorize("admin"), roleValidation, updateRole)
router.delete("/:id", authorize("admin"), deleteRole)

module.exports = router