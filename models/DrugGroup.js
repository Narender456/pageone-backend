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

const drugGroupSchema = new Schema(
  {
    group_name: {
      type: String,
      required: [true, "Drug group name is required"],
      maxlength: [255, "Drug group name cannot exceed 255 characters"],
      trim: true,
    },
    drugs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Drugs' }],
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
drugGroupSchema.index({ slug: 1 })
drugGroupSchema.index({ uniqueId: 1 })
drugGroupSchema.index({ group_name: 1 })
drugGroupSchema.index({ isActive: 1 })

// Pre-save hook
drugGroupSchema.pre("save", async function (next) {
  if (!this.uniqueId) {
    const { uniqueId, slug } = generateSlugWithUUID(this.group_name)
    this.uniqueId = uniqueId
    this.slug = slug
  } else if (this.isModified("group_name")) {
    this.slug = generateSlugWithUUID(this.group_name, this.uniqueId).slug
  }
  this.last_updated = new Date()
  next()
})

// Virtual for absolute URL
drugGroupSchema.virtual("absoluteUrl").get(function () {
  return `/drug-groups/${this.slug}`
})

// Virtual for drug count
drugGroupSchema.virtual("drugCount").get(function () {
  return this.drugs ? this.drugs.length : 0
})

// Virtual for study count
drugGroupSchema.virtual("studyCount").get(function () {
  return this.studies ? this.studies.length : 0
})

// Instance methods
drugGroupSchema.methods.toggleStatus = function () {
  this.isActive = !this.isActive
  return this.save()
}

drugGroupSchema.methods.addDrug = function (drugId) {
  if (!this.drugs.includes(drugId)) {
    this.drugs.push(drugId)
    return this.save()
  }
  return Promise.resolve(this)
}

drugGroupSchema.methods.removeDrug = function (drugId) {
  this.drugs = this.drugs.filter(id => !id.equals(drugId))
  return this.save()
}

// Static methods
drugGroupSchema.statics.findWithDrugs = function (filter = {}) {
  return this.find(filter).populate("drugs")
}

drugGroupSchema.statics.findWithStudies = function (filter = {}) {
  return this.find(filter).populate("studies")
}

drugGroupSchema.statics.findWithAll = function (filter = {}) {
  return this.find(filter).populate("drugs").populate("studies")
}

// Static method to get statistics
drugGroupSchema.statics.getStatistics = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalGroups: { $sum: 1 },
        activeGroups: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
        },
        totalDrugs: {
          $sum: { $size: "$drugs" },
        },
        totalStudies: {
          $sum: { $size: "$studies" },
        },
      },
    },
  ])

  return (
    stats[0] || {
      totalGroups: 0,
      activeGroups: 0,
      totalDrugs: 0,
      totalStudies: 0,
    }
  )
}

module.exports = mongoose.model("DrugGroup", drugGroupSchema)