const mongoose = require("mongoose")
const { Schema } = mongoose
const { generateSlugWithUUID, getCurrentTime } = require("../utils/SM_utils")

const studySchema = new Schema({
  study_name: {
    type: String,
    required: true,
    maxlength: 255,
  },
  protocol_number: {
    type: String,
    required: true,
    maxlength: 100,
  },
  study_initiation_date: {
    type: Date,
    default: () => new Date(),
  },
  study_title: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  study_start_date: {
    type: Date,
    required: true,
  },
  study_end_date: {
    type: Date,
    default: null,
  },
  uniqueId: {
    type: String,
    default: null,
    maxlength: 100,
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    maxlength: 500,
  },
  date_created: {
    type: Date,
    default: () => new Date(),
  },
  last_updated: {
    type: Date,
    default: () => new Date(),
  },
})

// Before save hook to handle uniqueId, slug, and last_updated
studySchema.pre("save", async function (next) {
  if (!this.uniqueId) {
    const { uniqueId, slug } = await generateSlugWithUUID(this.study_name)
    this.uniqueId = uniqueId
    this.slug = slug
  } else {
    this.slug = (await generateSlugWithUUID(this.study_name, this.uniqueId)).slug
  }
  this.last_updated = getCurrentTime()
  next()
})

// Virtual for absolute URL
studySchema.virtual("absoluteUrl").get(function () {
  return `/study/${this.slug}`
})

module.exports = mongoose.model("Study", studySchema)