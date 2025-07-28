const mongoose = require("mongoose")
const { v4: uuidv4 } = require("uuid")
const slugify = require("slugify")

const pageMigrationLogSchema = new mongoose.Schema({
  page: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Page",
    required: true,
  },
  migratedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  migrationDate: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
    default: "",
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

pageMigrationLogSchema.pre("save", function (next) {
  if (!this.uniqueId) {
    this.uniqueId = uuidv4().split("-")[4]
  }

  if (!this.slug) {
    this.slug = slugify(`migration ${this.uniqueId}`, { lower: true })
  }

  this.lastUpdated = new Date()
  next()
})

module.exports = mongoose.model("PageMigrationLog", pageMigrationLogSchema)
