const express = require("express")
const { body } = require("express-validator")
const {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  refreshToken,
  verifyEmail,
} = require("../controllers/auth")
const { protect } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")

const router = express.Router()

// Validation rules
const registerValidation = [
  body("name").trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").optional().isIn(["user", "admin"]).withMessage("Role must be either user or admin"),
]

const loginValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email"),
  body("password").notEmpty().withMessage("Password is required"),
]

const changePasswordValidation = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
]

const forgotPasswordValidation = [body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email")]

const resetPasswordValidation = [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
]

// Public routes
router.post("/register", registerValidation, validateRequest, register)
router.post("/login", loginValidation, validateRequest, login)
router.post("/forgot-password", forgotPasswordValidation, validateRequest, forgotPassword)
router.post("/reset-password", resetPasswordValidation, validateRequest, resetPassword)
router.post("/refresh-token", refreshToken)
router.get("/verify-email/:token", verifyEmail)

// Protected routes
router.use(protect) // All routes after this middleware are protected

router.get("/me", getMe)
router.put("/profile", updateProfile)
router.put("/change-password", changePasswordValidation, validateRequest, changePassword)
router.post("/logout", logout)

module.exports = router
