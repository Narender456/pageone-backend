const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot be more than 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Don't include password in queries by default
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    hasAccess: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
          expires: 2592000, // 30 days
        },
      },
    ],
    profile: {
      phone: String,
      address: String,
      dateOfBirth: Date,
      bio: String,
    },
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
      },
    },
    activityLog: [
      {
        action: String,
        timestamp: { type: Date, default: Date.now },
        ipAddress: String,
        userAgent: String,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Virtual for user's full profile
userSchema.virtual("fullProfile").get(function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    hasAccess: this.hasAccess,
    avatar: this.avatar,
    lastLogin: this.lastLogin,
    loginCount: this.loginCount,
    isEmailVerified: this.isEmailVerified,
    profile: this.profile,
    preferences: this.preferences,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  }
})

// Index for better query performance
userSchema.index({ email: 1 })
userSchema.index({ role: 1 })
userSchema.index({ hasAccess: 1 })
userSchema.index({ createdAt: -1 })

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return next()

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// Instance method to update last login
userSchema.methods.updateLastLogin = async function (ipAddress, userAgent) {
  this.lastLogin = new Date()
  this.loginCount += 1

  // Add to activity log
  this.activityLog.push({
    action: "login",
    ipAddress,
    userAgent,
  })

  // Keep only last 50 activity logs
  if (this.activityLog.length > 50) {
    this.activityLog = this.activityLog.slice(-50)
  }

  return await this.save()
}

// Instance method to log activity
userSchema.methods.logActivity = async function (action, ipAddress, userAgent) {
  this.activityLog.push({
    action,
    ipAddress,
    userAgent,
  })

  // Keep only last 50 activity logs
  if (this.activityLog.length > 50) {
    this.activityLog = this.activityLog.slice(-50)
  }

  return await this.save()
}

// Static method to get user statistics
userSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: { $cond: [{ $eq: ["$hasAccess", true] }, 1, 0] },
        },
        adminUsers: {
          $sum: { $cond: [{ $eq: ["$role", "admin"] }, 1, 0] },
        },
        verifiedUsers: {
          $sum: { $cond: [{ $eq: ["$isEmailVerified", true] }, 1, 0] },
        },
      },
    },
  ])

  // Get recent logins (last 2 days)
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  const recentLogins = await this.countDocuments({
    lastLogin: { $gte: twoDaysAgo },
  })

  return {
    ...stats[0],
    recentLogins,
  }
}

module.exports = mongoose.model("User", userSchema)
