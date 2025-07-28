const mongoose = require("mongoose")

const shipmentAcknowledgmentSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DrugShipment",
      required: true,
    },
    study: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Study",
    },
    drugGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DrugGroup",
    },
    drug: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Drugs",
    },
    excelRow: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExcelDataRow",
    },
    acknowledgedQuantity: {
      type: Number,
      min: 0,
    },
    receivedQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    missingQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    damagedQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: ["received", "missing", "damaged", "partial", "Not Acknowledged"],
      default: "Not Acknowledged",
    },
    dateAcknowledged: {
      type: Date,
      default: Date.now,
    },
    notes: String,
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("ShipmentAcknowledgment", shipmentAcknowledgmentSchema)
