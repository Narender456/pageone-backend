const mongoose = require("mongoose")

const clinicalDataSchema = new mongoose.Schema(
  {
    stage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stage",
      required: true,
    },
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
      required: true,
    },
    screening: {
      type: String,
      maxlength: [50, "Screening number cannot exceed 50 characters"],
    },
    randomizationNum: {
      type: String,
      maxlength: [50, "Randomization number cannot exceed 50 characters"],
    },
    data: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    usedDrug: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Drug",
    },
    usedQuantity: {
      type: Number,
      min: [0, "Used quantity cannot be negative"],
    },
    usedDrugGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DrugGroup",
    },
    eligibilityValue: {
      type: String,
      enum: ["Yes", "No", "Pending"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Indexes for better performance
clinicalDataSchema.index({ stage: 1, site: 1 })
clinicalDataSchema.index({ screening: 1 })
clinicalDataSchema.index({ randomizationNum: 1 })
clinicalDataSchema.index({ submittedBy: 1 })
clinicalDataSchema.index({ createdAt: -1 })

module.exports = mongoose.model("ClinicalData", clinicalDataSchema)
