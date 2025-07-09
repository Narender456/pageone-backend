const jwt = require("jsonwebtoken")
const User = require("../models/User")

// Protect routes - require authentication
exports.protect = async (req, res, next) => {
  try {
    let token

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    }

    // Make sure token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      })
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Get user from token
      const user = await User.findById(decoded.id)

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "No user found with this token",
        })
      }

      // Check if user has access
      if (!user.hasAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Contact administrator.",
        })
      }

      req.user = user
      next()
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      })
    }
  } catch (error) {
    next(error)
  }
}

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`,
      })
    }
    next()
  }
}

// Optional authentication - doesn't require token
exports.optionalAuth = async (req, res, next) => {
  try {
    let token

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        const user = await User.findById(decoded.id)
        if (user && user.hasAccess) {
          req.user = user
        }
      } catch (error) {
        // Token invalid, but continue without user
      }
    }

    next()
  } catch (error) {
    next(error)
  }
}
