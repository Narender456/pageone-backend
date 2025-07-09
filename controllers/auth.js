const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const Session = require("../models/Session")
const { sendEmail } = require("../utils/sendEmail")

// Generate JWT Token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  })
}

// Generate Refresh Token
const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString("hex")
}

// Send token response
const sendTokenResponse = async (user, statusCode, res, req) => {
  // Create token
  const token = signToken(user._id)
  const refreshToken = generateRefreshToken()

  // Create refresh token expiry
  const refreshTokenExpiry = new Date()
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 30) // 30 days

  // Save refresh token to database
  await Session.create({
    userId: user._id,
    refreshToken,
    ipAddress: req.ip,
    userAgent: req.get("User-Agent"),
    expiresAt: refreshTokenExpiry,
  })

  // Update last login
  await user.updateLastLogin(req.ip, req.get("User-Agent"))

  const options = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  }

  res.status(statusCode).cookie("refreshToken", refreshToken, options).json({
    success: true,
    token,
    refreshToken,
    user: user.fullProfile,
  })
}

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      })
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: role || "user",
      hasAccess: role === "admin" ? true : false, // Auto-grant access to admins
    })

    // Generate email verification token
    const emailToken = crypto.randomBytes(20).toString("hex")
    user.emailVerificationToken = crypto.createHash("sha256").update(emailToken).digest("hex")
    await user.save()

    // Send verification email
    try {
      const verifyUrl = `${req.protocol}://${req.get("host")}/api/auth/verify-email/${emailToken}`
      await sendEmail({
        email: user.email,
        subject: "Email Verification",
        message: `Please verify your email by clicking: ${verifyUrl}`,
      })
    } catch (error) {
      console.error("Email sending failed:", error)
    }

    sendTokenResponse(user, 201, res, req)
  } catch (error) {
    next(error)
  }
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body

const user = await User.findOne({ email }).select("+password")

if (!user) {
  console.log("User not found")
  return res.status(401).json({ success: false, message: "Invalid credentials" })
}

const isMatch = await user.comparePassword(password)

if (!isMatch) {
  console.log("Password mismatch")
  return res.status(401).json({ success: false, message: "Invalid credentials" })
}

if (!user.hasAccess) {
  console.log("User has no access")
  return res.status(403).json({ success: false, message: "Access denied" })
}


    sendTokenResponse(user, 200, res, req)
  } catch (error) {
    next(error)
  }
}

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (refreshToken) {
      // Remove refresh token from database
      await Session.findOneAndDelete({ refreshToken })
    }

    // Log activity
    await req.user.logActivity("logout", req.ip, req.get("User-Agent"))

    res
      .status(200)
      .cookie("refreshToken", "none", {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true,
      })
      .json({
        success: true,
        message: "User logged out successfully",
      })
  } catch (error) {
    next(error)
  }
}

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)

    res.status(200).json({
      success: true,
      data: user.fullProfile,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      "profile.phone": req.body.phone,
      "profile.address": req.body.address,
      "profile.dateOfBirth": req.body.dateOfBirth,
      "profile.bio": req.body.bio,
      "preferences.theme": req.body.theme,
      "preferences.notifications": req.body.notifications,
    }

    // Remove undefined fields
    Object.keys(fieldsToUpdate).forEach((key) => {
      if (fieldsToUpdate[key] === undefined) {
        delete fieldsToUpdate[key]
      }
    })

    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, { new: true, runValidators: true })

    // Log activity
    await user.logActivity("profile_update", req.ip, req.get("User-Agent"))

    res.status(200).json({
      success: true,
      data: user.fullProfile,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body

    // Get user with password
    const user = await User.findById(req.user.id).select("+password")

    // Check current password
    const isMatch = await user.comparePassword(currentPassword)

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      })
    }

    // Update password
    user.password = newPassword
    await user.save()

    // Log activity
    await user.logActivity("password_change", req.ip, req.get("User-Agent"))

    // Invalidate all refresh tokens
    await Session.deleteMany({ userId: user._id })

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No user found with that email",
      })
    }

    // Get reset token
    const resetToken = crypto.randomBytes(20).toString("hex")

    // Hash token and set to resetPasswordToken field
    user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex")

    // Set expire
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000 // 10 minutes

    await user.save({ validateBeforeSave: false })

    // Create reset url
    const resetUrl = `${req.protocol}://${req.get("host")}/api/auth/reset-password/${resetToken}`

    try {
      await sendEmail({
        email: user.email,
        subject: "Password Reset Token",
        message: `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`,
      })

      res.status(200).json({
        success: true,
        message: "Email sent",
      })
    } catch (error) {
      console.error(error)
      user.passwordResetToken = undefined
      user.passwordResetExpires = undefined

      await user.save({ validateBeforeSave: false })

      return res.status(500).json({
        success: false,
        message: "Email could not be sent",
      })
    }
  } catch (error) {
    next(error)
  }
}

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto.createHash("sha256").update(req.body.token).digest("hex")

    const user = await User.findOne({
      passwordResetToken: resetPasswordToken,
      passwordResetExpires: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      })
    }

    // Set new password
    user.password = req.body.password
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save()

    // Log activity
    await user.logActivity("password_reset", req.ip, req.get("User-Agent"))

    sendTokenResponse(user, 200, res, req)
  } catch (error) {
    next(error)
  }
}

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token not provided",
      })
    }

    // Find session with refresh token
    const session = await Session.findOne({
      refreshToken,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).populate("userId")

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      })
    }

    const user = session.userId

    // Check if user still has access
    if (!user.hasAccess) {
      await Session.findByIdAndDelete(session._id)
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    // Generate new tokens
    const newToken = signToken(user._id)
    const newRefreshToken = generateRefreshToken()

    // Update session
    session.refreshToken = newRefreshToken
    session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    await session.save()

    res.status(200).json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
      user: user.fullProfile,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    // Get hashed token
    const emailVerificationToken = crypto.createHash("sha256").update(req.params.token).digest("hex")

    const user = await User.findOne({
      emailVerificationToken,
    })

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification token",
      })
    }

    // Update user
    user.isEmailVerified = true
    user.emailVerificationToken = undefined
    await user.save()

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    })
  } catch (error) {
    next(error)
  }
}
