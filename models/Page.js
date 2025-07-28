const mongoose = require("mongoose")
const { v4: uuidv4 } = require("uuid")
const slugify = require("slugify")

const pageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 100,
  },
  content: {
    type: String,
    default: "",
  },
  stages: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Stage",
    required: true,
  },
  form: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Form",
    default: null,
  },
  css: {
    type: String,
    default: "",
  },
  isEdited: {
    type: Boolean,
    default: false,
  },
  studies: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Study",
    },
  ],
  sites: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
    },
  ],
  shipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DrugShipment",
    default: null,
  },
  generateScreeningInRandomization: {
    type: Boolean,
    default: false,
  },
  componentsData: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  windowStart: {
    type: Date,
    default: null,
  },
  windowEnd: {
    type: Date,
    default: null,
  },
  timezone: {
    type: String,
    default: "UTC",
  },
  phase: {
    type: String,
    enum: ["development", "testing", "migrate", "live"],
    default: "development",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  testingPassed: {
    type: Boolean,
    default: false,
  },
  uniqueId: {
    type: String,
    unique: true,
  },
  slug: {
    type: String,
    unique: true,
  },
  dateCreated: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
})

// Pre-save middleware
pageSchema.pre("save", function (next) {
  if (!this.uniqueId) {
    this.uniqueId = uuidv4().split("-")[4]
  }

  if (!this.slug) {
    this.slug = slugify(`${this.title} ${this.uniqueId}`, { lower: true })
  }

  this.lastUpdated = new Date()
  next()
})

// Method to check if page is within window
pageSchema.methods.isWithinWindow = function () {
  if (this.windowStart && this.windowEnd) {
    const now = new Date()
    return now >= this.windowStart && now <= this.windowEnd
  }
  return true
}

module.exports = mongoose.model("Page", pageSchema)
