const mongoose = require("mongoose")

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      unique: true,
      trim: true,
      maxlength: [100, "Role name cannot be more than 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot be more than 500 characters"],
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystemRole: {
      type: Boolean,
      default: false, // System roles cannot be deleted
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Virtual for user count
roleSchema.virtual("userCount").get(function () {
  return this.users ? this.users.length : 0
})

// Index for better query performance
roleSchema.index({ name: 1 })
roleSchema.index({ isActive: 1 })

// Static method to get role statistics
roleSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalRoles: { $sum: 1 },
        activeRoles: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
        },
        systemRoles: {
          $sum: { $cond: [{ $eq: ["$isSystemRole", true] }, 1, 0] },
        },
      },
    },
  ])

  return stats[0] || { totalRoles: 0, activeRoles: 0, systemRoles: 0 }
}

module.exports = mongoose.model("Role", roleSchema)
