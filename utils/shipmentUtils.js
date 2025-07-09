const moment = require("moment")
const DrugShipment = require("../models/DrugShipment")
const ShipmentAcknowledgment = require("../models/ShipmentAcknowledgment")
const Drug = require("../models/Drugs")
const DrugGroup = require("../models/DrugGroup")
const ExcelDataRow = require("../models/ExcelModels")
const nodemailer = require("nodemailer")

// Generate unique shipment number
const generateShipmentNumber = async () => {
  const today = moment()
  const dateStr = today.format("DDMMYY")

  const lastShipment = await DrugShipment.findOne({
    shipmentNumber: { $regex: `^SP\\d{2}${dateStr}$` },
  }).sort({ shipmentNumber: -1 })

  let lastNumber = 1
  if (lastShipment) {
    const match = lastShipment.shipmentNumber.match(/^SP(\d{2})/)
    if (match) {
      lastNumber = Number.parseInt(match[1]) + 1
    }
  }

  return `SP${lastNumber.toString().padStart(2, "0")}${dateStr}`
}

// Check if shipment is fully acknowledged
const isFullyAcknowledged = async (shipment) => {
  const acknowledgments = await ShipmentAcknowledgment.find({ shipment: shipment._id })

  if (shipment.selectType === "Drug") {
    const drugCount = shipment.drug.length
    const acknowledgedCount = acknowledgments.filter((ack) => ack.status !== "Not Acknowledged").length
    return drugCount === acknowledgedCount
  } else if (shipment.selectType === "DrugGroup") {
    const drugs = await Drug.find({ drugGroups: { $in: shipment.groupName } })
    const acknowledgedCount = acknowledgments.filter((ack) => ack.status !== "Not Acknowledged").length
    return drugs.length === acknowledgedCount
  } else if (shipment.selectType === "Randomization") {
    const excelRowCount = shipment.excelRows.length
    const acknowledgedCount = acknowledgments.filter((ack) => ack.status !== "Not Acknowledged").length
    return excelRowCount === acknowledgedCount
  }

  return false
}

// Send email notification
const sendEmailNotification = async (subject, message, userEmail) => {
  try {
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: userEmail,
      subject: subject,
      text: message,
    })
  } catch (error) {
    console.error("Email sending failed:", error)
  }
}

// Validate acknowledgment quantities
const validateAcknowledgmentQuantities = (received, missing, damaged, sent) => {
  if (received < 0 || missing < 0 || damaged < 0) {
    throw new Error("Quantities must be non-negative")
  }

  const total = received + missing + damaged
  if (total !== sent) {
    throw new Error("Total acknowledged quantity must match the sent quantity")
  }

  if (received === sent) return "received"
  if (received > 0) return "partial"
  return "Not Acknowledged"
}

// Process drug acknowledgment
const processDrugAcknowledment = async (req, shipment) => {
  const acknowledgmentUpdates = []
  const drugs = await Drug.find({ _id: { $in: shipment.drug } })

  for (const drug of drugs) {
    const acknowledgment = await ShipmentAcknowledgment.findOne({
      shipment: shipment._id,
      drug: drug._id,
    })

    const sentQuantity = acknowledgment ? acknowledgment.acknowledgedQuantity : 0

    const receivedQuantity = Number.parseInt(req.body[`received_quantity_${drug._id}`] || "0")
    const missingQuantity = Number.parseInt(req.body[`missing_quantity_${drug._id}`] || "0")
    const damagedQuantity = Number.parseInt(req.body[`damaged_quantity_${drug._id}`] || "0")

    const status = validateAcknowledgmentQuantities(receivedQuantity, missingQuantity, damagedQuantity, sentQuantity)

    await ShipmentAcknowledgment.findOneAndUpdate(
      { shipment: shipment._id, drug: drug._id },
      {
        acknowledgedQuantity: sentQuantity,
        receivedQuantity,
        missingQuantity,
        damagedQuantity,
        status,
      },
      { upsert: true, new: true },
    )

    acknowledgmentUpdates.push(
      `${drug.drugName}: Received: ${receivedQuantity}, Missing: ${missingQuantity}, Damaged: ${damagedQuantity}`,
    )
  }

  return acknowledgmentUpdates
}

// Process drug group acknowledgment
const processDrugGroupAcknowledment = async (req, shipment) => {
  const acknowledgmentUpdates = []
  const drugGroups = await DrugGroup.find({ _id: { $in: shipment.groupName } }).populate("drugs")

  for (const group of drugGroups) {
    for (const drug of group.drugs) {
      const acknowledgment = await ShipmentAcknowledgment.findOne({
        shipment: shipment._id,
        drug: drug._id,
      })

      const sentQuantity = acknowledgment ? acknowledgment.acknowledgedQuantity : 0

      const receivedQuantity = Number.parseInt(req.body[`received_quantity_${drug._id}`] || "0")
      const missingQuantity = Number.parseInt(req.body[`missing_quantity_${drug._id}`] || "0")
      const damagedQuantity = Number.parseInt(req.body[`damaged_quantity_${drug._id}`] || "0")

      const status = validateAcknowledgmentQuantities(receivedQuantity, missingQuantity, damagedQuantity, sentQuantity)

      await ShipmentAcknowledgment.findOneAndUpdate(
        { shipment: shipment._id, drug: drug._id },
        {
          drugGroup: group._id,
          acknowledgedQuantity: sentQuantity,
          receivedQuantity,
          missingQuantity,
          damagedQuantity,
          status,
        },
        { upsert: true, new: true },
      )

      acknowledgmentUpdates.push(
        `${drug.drugName}: Received: ${receivedQuantity}, Missing: ${missingQuantity}, Damaged: ${damagedQuantity}`,
      )
    }
  }

  return acknowledgmentUpdates
}

// Process Excel acknowledgment
const processExcelAcknowledment = async (req, shipment) => {
  const acknowledgmentUpdates = []
  const excelRows = await ExcelDataRow.find({ _id: { $in: shipment.excelRows } })

  for (const row of excelRows) {
    const kitNumber = row.rowData?.Kit_Number || `Row ${row._id}`
    const status = req.body[`status_${kitNumber}`]

    if (!status || !["received", "missing", "damaged"].includes(status)) {
      throw new Error(`Valid status is required for Kit Number ${kitNumber}`)
    }

    await ShipmentAcknowledgment.findOneAndUpdate(
      { shipment: shipment._id, excelRow: row._id },
      { status },
      { upsert: true, new: true },
    )

    acknowledgmentUpdates.push(`Kit Number ${kitNumber}: ${status}`)
  }

  return acknowledgmentUpdates
}

module.exports = {
  generateShipmentNumber,
  isFullyAcknowledged,
  sendEmailNotification,
  validateAcknowledgmentQuantities,
  processDrugAcknowledment,
  processDrugGroupAcknowledment,
  processExcelAcknowledment,
}
