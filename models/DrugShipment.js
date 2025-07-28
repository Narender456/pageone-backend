const mongoose = require("mongoose")
const { v4: uuidv4 } = require("uuid")

const drugShipmentSchema = new mongoose.Schema(
  {
    study: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Study",
    },
    siteNumber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Site",
    },
    shipmentNumber: {
      type: String,
      unique: true,
      required: true,
    },
    shipmentDate: {
      type: Date,
      default: Date.now,
    },
    selectType: {
      type: String,
      enum: ["DrugGroup", "Drug", "Randomization"],
      default: "DrugGroup",
    },
    groupName: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DrugGroup",
      },
    ],
    drug: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Drugs",
      },
    ],
    excelRows: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExcelDataRow",
      },
    ],
    uniqueId: {
      type: String,
      default: () => uuidv4().split("-")[4],
    },
    slug: {
      type: String,
      unique: true,
    },
    isAcknowledged: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "acknowledged", "partial"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
)

// Generate slug before saving
drugShipmentSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = `${this.shipmentNumber}-${this.uniqueId}`.toLowerCase().replace(/[^a-z0-9]/g, "-")
  }
  next()
})

// Virtual for acknowledgment status
drugShipmentSchema.virtual("acknowledgmentStatus").get(function () {
  return this.isAcknowledged ? "acknowledged" : "pending"
})

module.exports = mongoose.model("DrugShipment", drugShipmentSchema)
