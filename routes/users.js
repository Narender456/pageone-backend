const express = require("express")
const { body, query } = require("express-validator")
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserAccess,
  getUserStats,
  exportUsers,
  bulkUpdateUsers,
  getUserActivity,
} = require("../controllers/users")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// All routes are protected and require admin role
router.use(protect)
router.use(authorize("admin"))

// Validation rules
const createUserValidation = [
  body("name").trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").optional().isIn(["user", "admin"]).withMessage("Role must be either user or admin"),
  body("hasAccess").optional().isBoolean().withMessage("hasAccess must be a boolean"),
]

const updateUserValidation = [
  body("name").optional().trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters"),
  body("email").optional().isEmail().normalizeEmail().withMessage("Please enter a valid email"),
  body("role").optional().isIn(["user", "admin"]).withMessage("Role must be either user or admin"),
  body("hasAccess").optional().isBoolean().withMessage("hasAccess must be a boolean"),
]

const getUsersValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("search").optional().trim().isLength({ max: 100 }).withMessage("Search term too long"),
  query("role").optional().isIn(["user", "admin"]).withMessage("Role must be either user or admin"),
  query("hasAccess").optional().isBoolean().withMessage("hasAccess must be a boolean"),
  query("sortBy").optional().isIn(["name", "email", "createdAt", "lastLogin"]).withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Sort order must be asc or desc"),
]

// Routes
router.get("/", getUsersValidation, validateRequest, getUsers)
router.get("/stats", getUserStats)
router.get("/export", exportUsers)
router.get("/:id", getUser)
router.get("/:id/activity", getUserActivity)

router.post("/", createUserValidation, validateRequest, createUser)
router.put("/:id", updateUserValidation, validateRequest, updateUser)
router.patch("/:id/toggle-access", toggleUserAccess)
router.delete("/:id", deleteUser)

router.post("/bulk-update", bulkUpdateUsers)

module.exports = router
