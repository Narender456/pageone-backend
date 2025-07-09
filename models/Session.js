const mongoose = require("mongoose")

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
      unique: true,
    },
    ipAddress: String,
    userAgent: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  },
)

// Index for better query performance
sessionSchema.index({ userId: 1 })
sessionSchema.index({ refreshToken: 1 })

module.exports = mongoose.model("Session", sessionSchema)
