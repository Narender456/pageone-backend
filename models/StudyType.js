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

const studyTypeSchema = new Schema(
  {
    study_type: {
      type: String,
      required: [true, "Study type name is required"],
      maxlength: [255, "Study type name cannot exceed 255 characters"],
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
studyTypeSchema.index({ slug: 1 })
studyTypeSchema.index({ uniqueId: 1 })
studyTypeSchema.index({ study_type: 1 })
studyTypeSchema.index({ isActive: 1 })

// Pre-save hook
studyTypeSchema.pre("save", async function (next) {
  if (!this.uniqueId) {
    const { uniqueId, slug } = generateSlugWithUUID(this.study_type)
    this.uniqueId = uniqueId
    this.slug = slug
  } else if (this.isModified("study_type")) {
    this.slug = generateSlugWithUUID(this.study_type, this.uniqueId).slug
  }
  this.last_updated = new Date()
  next()
})

// Virtual for absolute URL
studyTypeSchema.virtual("absoluteUrl").get(function () {
  return `/study-type/${this.slug}`
})

// Virtual for study count
studyTypeSchema.virtual("studyCount").get(function () {
  return this.studies ? this.studies.length : 0
})

// Instance methods
studyTypeSchema.methods.toggleStatus = function () {
  this.isActive = !this.isActive
  return this.save()
}

studyTypeSchema.methods.addStudy = function (studyId) {
  if (!this.studies.includes(studyId)) {
    this.studies.push(studyId)
    return this.save()
  }
  return Promise.resolve(this)
}

studyTypeSchema.methods.removeStudy = function (studyId) {
  this.studies = this.studies.filter(id => !id.equals(studyId))
  return this.save()
}

studyTypeSchema.methods.getActiveStudies = function () {
  return this.populate({
    path: 'studies',
    match: { isActive: true }
  })
}

// Static methods
studyTypeSchema.statics.findBySlug = function (slug) {
  return this.findOne({ slug, isActive: true })
}

studyTypeSchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({ study_type: 1 })
}

studyTypeSchema.statics.findWithStudyCount = function () {
  return this.aggregate([
    {
      $lookup: {
        from: 'studies',
        localField: 'studies',
        foreignField: '_id',
        as: 'studyDetails'
      }
    },
    {
      $addFields: {
        studyCount: { $size: '$studyDetails' },
        activeStudyCount: {
          $size: {
            $filter: {
              input: '$studyDetails',
              cond: { $eq: ['$$this.isActive', true] }
            }
          }
        }
      }
    },
    {
      $project: {
        studyDetails: 0 // Remove the populated study details
      }
    }
  ])
}

studyTypeSchema.statics.search = function (query) {
  const searchRegex = new RegExp(query, 'i')
  return this.find({
    $or: [
      { study_type: searchRegex },
      { description: searchRegex }
    ],
    isActive: true
  }).sort({ study_type: 1 })
}

// Export the model
const StudyType = mongoose.model("StudyType", studyTypeSchema)

module.exports = StudyType