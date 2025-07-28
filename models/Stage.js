const mongoose = require("mongoose")
const { generateSlugWithUuid, getCurrentTime, getNextOrderNumber } = require("../utils/stageUtils")

const stageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    orderNumber: {
      type: Number,
      unique: true,
      min: 1,
    },
    uniqueId: {
      type: String,
      maxlength: 100,
    },
    slug: {
      type: String,
      unique: true,
      maxlength: 500,
    },
    dateCreated: {
      type: Date,
      default: Date.now,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We're handling timestamps manually
  },
)

// Pre-save middleware to handle slug generation and order number
stageSchema.pre("save", async function (next) {
  try {
    // Generate slug and uniqueId if not present
    if (!this.uniqueId) {
      const { uniqueId, slug } = generateSlugWithUuid(this.name)
      this.uniqueId = uniqueId
      this.slug = slug
    } else {
      const { slug } = generateSlugWithUuid(this.name, this.uniqueId)
      this.slug = slug
    }

    // Set dateCreated for new documents
    if (this.isNew && !this.dateCreated) {
      this.dateCreated = getCurrentTime()
    }

    // Auto-generate order_number if missing for new documents
    if (this.isNew && !this.orderNumber) {
      this.orderNumber = await getNextOrderNumber(this.constructor)
    }

    // Always update lastUpdated
    this.lastUpdated = getCurrentTime()

    next()
  } catch (error) {
    next(error)
  }
})

// Instance method to get absolute URL (equivalent to Django's get_absolute_url)
stageSchema.methods.getAbsoluteUrl = function () {
  return `/stage/detail/${this.slug}`
}

// Virtual for string representation
stageSchema.virtual("displayName").get(function () {
  return this.name
})

// Ensure virtual fields are serialized
stageSchema.set("toJSON", {
  virtuals: true,
})

module.exports = mongoose.model("Stage", stageSchema)
