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

const sponsorSchema = new Schema(
  {
    sponsor_name: {
      type: String,
      required: [true, "Sponsor name is required"],
      maxlength: [255, "Sponsor name cannot exceed 255 characters"],
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
sponsorSchema.index({ slug: 1 })
sponsorSchema.index({ uniqueId: 1 })
sponsorSchema.index({ sponsor_name: 1 })
sponsorSchema.index({ isActive: 1 })

// Pre-save hook
sponsorSchema.pre("save", async function (next) {
  if (!this.uniqueId) {
    const { uniqueId, slug } = generateSlugWithUUID(this.sponsor_name)
    this.uniqueId = uniqueId
    this.slug = slug
  } else if (this.isModified("sponsor_name")) {
    this.slug = generateSlugWithUUID(this.sponsor_name, this.uniqueId).slug
  }
  this.last_updated = new Date()
  next()
})

// Virtual for absolute URL
sponsorSchema.virtual("absoluteUrl").get(function () {
  return `/sponsors/${this.slug}`
})

// Virtual for study count
sponsorSchema.virtual("studyCount").get(function () {
  return this.studies ? this.studies.length : 0
})

sponsorSchema.methods.toggleStatus = function () {
  this.isActive = !this.isActive
  return this.save()
}

sponsorSchema.statics.findWithStudies = function (filter = {}) {
  return this.find(filter).populate("studies")
}

// Static method to get statistics
sponsorSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalSponsors: { $sum: 1 },
        activeSponsors: {
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
      totalSponsors: 0,
      activeSponsors: 0,
      totalStudies: 0,
    }
  )
}

module.exports = mongoose.model("Sponsor", sponsorSchema)