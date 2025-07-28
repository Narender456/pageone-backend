const express = require("express")
const router = express.Router()
const { body } = require("express-validator")
const {
  getRolePermissions,
  updateRolePermissions,
  getUserPermissions,
  checkUserPermission,
} = require("../controllers/permissions")
const { protect, authorize } = require("../middleware/auth")

// Validation rules
const permissionValidation = [
  body("permissions").isArray().withMessage("Permissions must be an array"),
  body("permissions.*.menuOptionId").isMongoId().withMessage("Invalid menu option ID"),
  body("permissions.*.canView").optional().isBoolean().withMessage("canView must be a boolean"),
  body("permissions.*.canEdit").optional().isBoolean().withMessage("canEdit must be a boolean"),
  body("permissions.*.canDelete").optional().isBoolean().withMessage("canDelete must be a boolean"),
  body("permissions.*.canCreate").optional().isBoolean().withMessage("canCreate must be a boolean"),
]

// Apply authentication to all routes
router.use(protect)

// Routes
router.get("/roles/:roleId", getRolePermissions)
router.put("/roles/:roleId", authorize("admin"), permissionValidation, updateRolePermissions)
router.get("/users/:userId", getUserPermissions)
router.get("/users/:userId/check/:menuOptionId", checkUserPermission)

module.exports = router
