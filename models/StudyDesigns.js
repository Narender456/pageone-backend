const mongoose = require("mongoose")
const { Schema } = mongoose

// Utility function for generating slug with UUID
const generateSlugWithUUID = (text, existingUniqueId = null) => {
  const crypto = require("crypto")

  // Generate slug from text
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens

  // Generate or use existing unique ID
  const uniqueId = existingUniqueId || crypto.randomBytes(8).toString("hex")

  return {
    uniqueId,
    slug: `${slug}-${uniqueId}`,
  }
}

const studyDesignsSchema = new Schema(
  {
    study_design: {
      type: String,
      required: [true, "Study design name is required"],
      maxlength: [255, "Study design name cannot exceed 255 characters"],
      trim: true,
    },
    studies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Study' }],

    uniqueId: {
      type: String,
      maxlength: 100,
      default: null,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      maxlength: 500,
      default: null,
    },
    description: {
      type: String,
      maxlength: 1000,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    date_created: {
      type: Date,
      default: () => new Date(),
    },
    last_updated: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Indexes for better performance
studyDesignsSchema.index({ slug: 1 })
studyDesignsSchema.index({ uniqueId: 1 })
studyDesignsSchema.index({ study_design: 1 })
studyDesignsSchema.index({ isActive: 1 })

// Pre-save hook
studyDesignsSchema.pre("save", async function (next) {
  if (!this.uniqueId) {
    const { uniqueId, slug } = generateSlugWithUUID(this.study_design)
    this.uniqueId = uniqueId
    this.slug = slug
  } else if (this.isModified("study_design")) {
    this.slug = generateSlugWithUUID(this.study_design, this.uniqueId).slug
  }
  this.last_updated = new Date()
  next()
})

// Virtual for absolute URL
studyDesignsSchema.virtual("absoluteUrl").get(function () {
  return `/study-design/${this.slug}`
})

// Virtual for study count
studyDesignsSchema.virtual("studyCount").get(function () {
  return this.studies ? this.studies.length : 0
})

studyDesignsSchema.methods.toggleStatus = function () {
  this.isActive = !this.isActive
  return this.save()
}

studyDesignsSchema.statics.findWithStudies = function (filter = {}) {
  return this.find(filter).populate("studies")
}

// Static method to get statistics
studyDesignsSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalDesigns: { $sum: 1 },
        activeDesigns: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
        },
        totalStudies: {
          $sum: { $size: "$studies" },
        },
      },
    },
  ])

  return (
    stats[0] || {
      totalDesigns: 0,
      activeDesigns: 0,
      totalStudies: 0,
    }
  )
}

module.exports = mongoose.model("StudyDesigns", studyDesignsSchema)