const express = require("express")
const { body, validationResult } = require("express-validator")
const DrugShipment = require("../models/DrugShipment")
const ShipmentAcknowledgment = require("../models/ShipmentAcknowledgment")
const Drug = require("../models/Drugs")
const DrugGroup = require("../models/DrugGroup")
const { ExcelDataRow } = require("../models/ExcelModels")
const Site = require("../models/Site")
const Study = require("../models/Study")
const { protect } = require("../middleware/auth") // Updated import
const {
  generateShipmentNumber,
  isFullyAcknowledged,
  sendEmailNotification,
  processDrugAcknowledment,
  processDrugGroupAcknowledment,
  processExcelAcknowledment,
} = require("../utils/shipmentUtils")

const router = express.Router()

// Get all shipments with filtering and pagination
router.get("/", protect, async (req, res) => { // Added protect middleware
  try {
    const { page = 1, limit = 10, study, site, selectType } = req.query
    const skip = (page - 1) * limit

    // Build filter query
    const filter = {}

    if (study && study !== "all") filter.study = study
    if (site && site !== "all") filter.siteNumber = site
    if (selectType) filter.selectType = selectType

    const shipments = await DrugShipment.find(filter)
      .populate("study", "studyName")
      .populate("siteNumber", "siteName siteId")
      .populate("drug", "drugName remainingQuantity")
      .populate("groupName", "groupName")
      .populate("excelRows")
      .sort({ shipmentDate: -1 })
      .skip(skip)
      .limit(Number.parseInt(limit))

    // Add acknowledgment status to each shipment
    const shipmentsWithStatus = await Promise.all(
      shipments.map(async (shipment) => {
        const acknowledged = await isFullyAcknowledged(shipment)
        const acknowledgments = await ShipmentAcknowledgment.find({ shipment: shipment._id })

        // Calculate counts
        let receivedCount = 0,
          missingCount = 0,
          damagedCount = 0

        acknowledgments.forEach((ack) => {
          if (shipment.selectType === "Randomization") {
            if (ack.status === "received") receivedCount++
            else if (ack.status === "missing") missingCount++
            else if (ack.status === "damaged") damagedCount++
          } else {
            receivedCount += ack.receivedQuantity || 0
            missingCount += ack.missingQuantity || 0
            damagedCount += ack.damagedQuantity || 0
          }
        })

        return {
          ...shipment.toObject(),
          isAcknowledged: acknowledged,
          receivedCount,
          missingCount,
          damagedCount,
        }
      }),
    )

    const total = await DrugShipment.countDocuments(filter)

    res.json({
      shipments: shipmentsWithStatus,
      pagination: {
        current: Number.parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Error fetching shipments:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Create new shipment
router.post(
  "/",
  protect, // Added protect middleware
  [
    body("study").notEmpty().withMessage("Study is required"),
    body("siteNumber").notEmpty().withMessage("Site is required"),
    body("selectType").isIn(["Drug", "DrugGroup", "Randomization"]).withMessage("Invalid select type"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { study, siteNumber, selectType, drug, groupName, excelRows, quantities } = req.body

      // Generate shipment number
      const shipmentNumber = await generateShipmentNumber()

      // Create shipment
      const shipment = new DrugShipment({
        study,
        siteNumber,
        shipmentNumber,
        selectType,
        drug: selectType === "Drug" ? drug : [],
        groupName: selectType === "DrugGroup" ? groupName : [],
        excelRows: selectType === "Randomization" ? excelRows : [],
      })

      await shipment.save()

      // Process based on selectType
      if (selectType === "Drug") {
        await processDrugShipment(shipment, drug, quantities)
      } else if (selectType === "DrugGroup") {
        await processDrugGroupShipment(shipment, groupName, quantities)
      } else if (selectType === "Randomization") {
        await processRandomizationShipment(shipment, excelRows)
      }

      // Send email notification
      await sendEmailNotification(
        "New Drug Shipment Created",
        `Shipment ${shipmentNumber} has been created successfully.`,
        req.user.email,
      )

      res.status(201).json({
        message: "Shipment created successfully",
        shipment: await shipment.populate(["study", "siteNumber", "drug", "groupName", "excelRows"]),
      })
    } catch (error) {
      console.error("Error creating shipment:", error)
      res.status(500).json({ message: "Server error", error: error.message })
    }
  },
)

// Helper function to process drug shipment
const processDrugShipment = async (shipment, drugIds, quantities) => {
  for (const drugId of drugIds) {
    const drug = await Drug.findById(drugId)
    const quantity = quantities[drugId] || 0

    if (quantity > drug.remainingQuantity) {
      throw new Error(`Insufficient quantity for ${drug.drugName}`)
    }

    // Update drug quantity
    drug.remainingQuantity -= quantity
    await drug.save()

    // Create acknowledgment record
    await ShipmentAcknowledgment.create({
      shipment: shipment._id,
      study: shipment.study,
      drug: drugId,
      acknowledgedQuantity: quantity,
      status: "Not Acknowledged",
    })
  }
}

// Helper function to process drug group shipment
const processDrugGroupShipment = async (shipment, groupIds, quantities) => {
  for (const groupId of groupIds) {
    const group = await DrugGroup.findById(groupId).populate("drugs")

    for (const drug of group.drugs) {
      const quantity = quantities[drug._id] || 0

      if (quantity > drug.remainingQuantity) {
        throw new Error(`Insufficient quantity for ${drug.drugName}`)
      }

      // Update drug quantity
      drug.remainingQuantity -= quantity
      await drug.save()

      // Create acknowledgment record
      await ShipmentAcknowledgment.create({
        shipment: shipment._id,
        study: shipment.study,
        drugGroup: groupId,
        drug: drug._id,
        acknowledgedQuantity: quantity,
        status: "Not Acknowledged",
      })
    }
  }
}

// Helper function to process randomization shipment
const processRandomizationShipment = async (shipment, excelRowIds) => {
  for (const rowId of excelRowIds) {
    // Mark Excel row as sent
    await ExcelDataRow.findByIdAndUpdate(rowId, { sent: true })

    // Create acknowledgment record
    await ShipmentAcknowledgment.create({
      shipment: shipment._id,
      study: shipment.study,
      excelRow: rowId,
      status: "Not Acknowledged",
    })
  }
}

// Get shipment by ID
router.get("/:id", protect, async (req, res) => { // Added protect middleware
  try {
    const shipment = await DrugShipment.findById(req.params.id)
      .populate("study", "studyName")
      .populate("siteNumber", "siteName siteId")
      .populate("drug", "drugName remainingQuantity")
      .populate("groupName", "groupName")
      .populate("excelRows")

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" })
    }

    const acknowledgments = await ShipmentAcknowledgment.find({ shipment: shipment._id })
      .populate("drug", "drugName")
      .populate("drugGroup", "groupName")
      .populate("excelRow")

    res.json({ shipment, acknowledgments })
  } catch (error) {
    console.error("Error fetching shipment:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Update shipment
router.put("/:id", protect, async (req, res) => { // Added protect middleware
  try {
    const shipment = await DrugShipment.findById(req.params.id)

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" })
    }

    Object.assign(shipment, req.body)
    await shipment.save()

    res.json({ message: "Shipment updated successfully", shipment })
  } catch (error) {
    console.error("Error updating shipment:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Delete shipment
router.delete("/:id", protect, async (req, res) => { // Added protect middleware
  try {
    const shipment = await DrugShipment.findById(req.params.id)

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" })
    }

    await ShipmentAcknowledgment.deleteMany({ shipment: shipment._id })
    await shipment.deleteOne()

    // Send email notification
    await sendEmailNotification(
      "Drug Shipment Deleted",
      `Shipment ${shipment.shipmentNumber} has been deleted.`,
      req.user.email,
    )

    res.json({ message: "Shipment deleted successfully" })
  } catch (error) {
    console.error("Error deleting shipment:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Acknowledge shipment
router.post("/:id/acknowledge", protect, async (req, res) => { // Added protect middleware
  try {
    const shipment = await DrugShipment.findById(req.params.id)

    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" })
    }

    let acknowledgmentUpdates = []

    // Process acknowledgment based on shipment type
    if (shipment.selectType === "Drug") {
      acknowledgmentUpdates = await processDrugAcknowledment(req, shipment)
    } else if (shipment.selectType === "DrugGroup") {
      acknowledgmentUpdates = await processDrugGroupAcknowledment(req, shipment)
    } else if (shipment.selectType === "Randomization") {
      acknowledgmentUpdates = await processExcelAcknowledment(req, shipment)
    }

    // Update shipment acknowledgment status
    const fullyAcknowledged = await isFullyAcknowledged(shipment)
    shipment.isAcknowledged = fullyAcknowledged
    await shipment.save()

    // Send email notification
    if (acknowledgmentUpdates.length > 0) {
      const message = `Updates for shipment ${shipment.shipmentNumber}:\n\n${acknowledgmentUpdates.join("\n")}`
      await sendEmailNotification("Shipment Acknowledgment Updated", message, req.user.email)
    }

    res.json({
      message: "Acknowledgment updated successfully",
      updates: acknowledgmentUpdates,
    })
  } catch (error) {
    console.error("Error acknowledging shipment:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Get related fields based on study
router.get("/related-fields/:studyId", protect, async (req, res) => { // Added protect middleware
  try {
    const { studyId } = req.params

    // Get related sites
    const sites = await Site.find({ studies: studyId }).select("_id siteName siteId")

    // Get drug groups with drugs
    const drugGroups = await DrugGroup.find({ studies: studyId })
      .populate("drugs", "_id drugName remainingQuantity")
      .select("_id groupName drugs")

    // Get individual drugs
    const drugs = await Drug.find({ studies: studyId }).select("_id drugName remainingQuantity")

    // Get Excel rows not sent
    const excelRows = await ExcelDataRow.find({ studies: studyId, sent: false }).select("_id rowData")

    // Collect headers from Excel rows
    const headers = new Set()
    const excelRowData = excelRows.map((row) => {
      const data = { ...row.rowData, id: row._id }
      Object.keys(data).forEach((key) => headers.add(key))
      return data
    })

    res.json({
      sites,
      drugGroups,
      drugs,
      excelRows: excelRowData,
      headers: Array.from(headers),
    })
  } catch (error) {
    console.error("Error fetching related fields:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

module.exports = router