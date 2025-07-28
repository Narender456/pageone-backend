const mongoose = require("mongoose")

const pageSiteStudyAssignmentSchema = new mongoose.Schema({
  page: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Page",
    required: true,
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Site",
    required: true,
  },
  study: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Study",
    required: true,
  },
  shipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DrugShipment",
    default: null,
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

// Ensure unique combination
pageSiteStudyAssignmentSchema.index({ page: 1, site: 1, study: 1 }, { unique: true })

module.exports = mongoose.model("PageSiteStudyAssignment", pageSiteStudyAssignmentSchema)
