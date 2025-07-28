const { v4: uuidv4 } = require("uuid")
const slugify = require("slugify")
const ClinicalData = require("../models/ClinicalData")
const Site = require("../models/Site")
const Study = require("../models/Study")
const Drug = require("../models/Drugs")
const DrugGroup = require("../models/DrugGroup")
const DrugShipment = require("../models/DrugShipment")
const ShipmentAcknowledgment = require("../models/ShipmentAcknowledgment")
const ExcelDataRow = require("../models/ExcelModels")
const { sendEmail } = require("./sendEmail")

/**
 * Generate a slug using a base text and a UUID.
 * @param {string} baseText - The base text for the slug
 * @param {string} uniqueId - A specific UUID part to use, or null to generate a new UUID
 * @returns {Object} Object containing uniqueId and slug
 */
function generateSlugWithUuid(baseText, uniqueId = null) {
  if (!uniqueId) {
    uniqueId = uuidv4().split("-")[4]
  }
  const slug = slugify(`${baseText} ${uniqueId}`, { lower: true, strict: true })
  console.log(`[FR_utils] Generated slug: ${slug} with unique_id: ${uniqueId}`)
  return { uniqueId, slug }
}

/**
 * Get the current timestamp
 * @returns {Date} Current timestamp
 */
function getCurrentTimestamp() {
  const currentTime = new Date()
  console.log(`[FR_utils] Current timestamp: ${currentTime}`)
  return currentTime
}

/**
 * Fetch site details by its slug
 * @param {string} slug - The slug of the site
 * @returns {Object} Site details or error message
 */
async function fetchSiteDetailsBySlug(slug) {
  try {
    const site = await Site.findOne({ slug }).lean()
    if (!site) {
      console.log(`[FR_utils] Site not found for slug: ${slug}`)
      return {
        success: false,
        error: "Site not found",
      }
    }

    console.log(`[FR_utils] Fetched site details for slug: ${slug}`)
    return {
      success: true,
      data: {
        siteName: site.siteName,
        siteId: site.siteId,
        protocolNumber: site.protocolNumber,
        piName: site.piName,
      },
    }
  } catch (error) {
    console.error(`[FR_utils] Error fetching site by slug ${slug}:`, error)
    return {
      success: false,
      error: "Error fetching site details",
    }
  }
}

/**
 * Generate the next available randomization number in the format R001, R002, etc.
 * @returns {string} Next randomization number
 */
async function generateRandomizationNumber() {
  try {
    const lastClinicalData = await ClinicalData.findOne({
      randomizationNum: { $ne: null },
    })
      .sort({ randomizationNum: -1 })
      .lean()

    if (lastClinicalData && lastClinicalData.randomizationNum.startsWith("R")) {
      try {
        const lastNumber = Number.parseInt(lastClinicalData.randomizationNum.substring(1))
        const randomNumber = `R${String(lastNumber + 1).padStart(3, "0")}`
        console.log(`[FR_utils] Generated randomization number: ${randomNumber}`)
        return randomNumber
      } catch (error) {
        console.log(`[FR_utils] Invalid randomization number format: ${lastClinicalData.randomizationNum}`)
      }
    }
    console.log("[FR_utils] Starting randomization numbers from R001.")
    return "R001"
  } catch (error) {
    console.error(`[FR_utils] Error generating randomization number:`, error)
    return "R001"
  }
}

/**
 * Validate required fields in POST data and log all POST data for debugging
 * @param {Object} postData - The POST data object
 * @param {Array} requiredFields - List of required field keys
 * @returns {Object} Validated POST data or throws error
 */
function validateAndLogPostData(postData, requiredFields) {
  console.log("[FR_utils] Received POST data:")
  for (const [key, value] of Object.entries(postData)) {
    console.log(`  ${key}: ${value}`)
  }

  const missingFields = requiredFields.filter((field) => !(field in postData))
  if (missingFields.length > 0) {
    const errorMessage = `Missing required fields: ${missingFields.join(", ")}`
    console.log(`[FR_utils] ${errorMessage}`)
    throw new Error(errorMessage)
  }

  return postData
}

/**
 * Format a date string into 'dd-mmm-yyyy' format if valid
 * @param {string} dateStr - The date string to format
 * @returns {string} Formatted date or original string if invalid
 */
function formatDateIfPossible(dateStr) {
  try {
    const dateObj = new Date(dateStr)
    if (isNaN(dateObj.getTime())) {
      throw new Error("Invalid date")
    }
    const formatted = dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    console.log(`[FR_utils] Formatted date: ${formatted}`)
    return formatted
  } catch (error) {
    console.log(`[FR_utils] Invalid date format: ${dateStr}`)
    return dateStr
  }
}

/**
 * Prepare an HTML table with site details
 * @param {Object} site - The site object
 * @returns {string} HTML table rows for site details
 */
function prepareSiteTable(site) {
  const siteFields = ["siteName", "siteId", "protocolNumber", "piName"]
  let siteTableRows = ""

  for (const field of siteFields) {
    const value = site[field] || "N/A"
    const fieldLabel = field.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())
    siteTableRows += `<tr><td>${fieldLabel}</td><td>${value}</td></tr>`
  }

  console.log("[FR_utils] Prepared site table rows for email.")
  return siteTableRows
}

/**
 * Prepare an HTML table with submitted form data, excluding unnecessary fields
 * @param {Object} submittedData - The submitted data dictionary
 * @returns {string} HTML table rows for submitted data
 */
function prepareSubmittedDataTable(submittedData) {
  const excludedFields = new Set(["form_title", "form_category", "selectType", "shipment_id"])
  let tableRows = ""

  for (const [key, value] of Object.entries(submittedData)) {
    // Skip excluded fields and label fields
    if (excludedFields.has(key) || key.endsWith("_label")) {
      continue
    }

    // Format label and value
    const fieldLabel = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    let fieldValue = value || "N/A"

    // Format dates if applicable
    if (key.toLowerCase().includes("date") || key.toLowerCase().includes("dob")) {
      fieldValue = formatDateIfPossible(fieldValue)
    }

    tableRows += `<tr><td>${fieldLabel}</td><td>${fieldValue}</td></tr>`
  }

  console.log("[FR_utils] Prepared submitted data table rows for email.")
  return tableRows
}

/**
 * Prepare the HTML email content for various submissions
 * @param {Object} options - Email content options
 * @returns {string} The HTML email content
 */
function prepareEmailContent({ submittedData, site, actionUser, selectType = null, randomizationNumber = null }) {
  const tableRows = prepareSubmittedDataTable(submittedData)
  const siteTableRows = prepareSiteTable(site)

  let htmlMessage = `
    <html>
    <head>
        <style>
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
        </style>
    </head>
    <body>
        <p>${submittedData.form_category || "Submission"} data has been submitted successfully.</p>
        <h3>Submitted Data:</h3>
        <table>
            <tr><th>Field</th><th>Value</th></tr>
            ${tableRows}
        </table>
        <h3>Site Details:</h3>
        <table>
            <tr><th>Field</th><th>Value</th></tr>
            ${siteTableRows}
        </table>
  `

  // Conditionally include Randomization Details
  if (selectType && randomizationNumber) {
    htmlMessage += `
        <h3>Randomization Details:</h3>
        <table>
            <tr><th>Select Type</th><td>${selectType}</td></tr>
            <tr><th>Randomization Number</th><td>${randomizationNumber}</td></tr>
        </table>
    `
  }

  htmlMessage += `
        <p>Action performed by: ${actionUser}</p>
    </body>
    </html>
  `

  console.log("Prepared email content.")
  return htmlMessage
}

/**
 * Validate and retrieve a site object by its ID
 * @param {string} siteId - The ID of the site
 * @returns {Object} The retrieved site object
 */
async function validateAndGetSite(siteId) {
  try {
    const site = await Site.findById(siteId).lean()
    if (!site) {
      const errorMessage = `Site with ID ${siteId} does not exist.`
      console.log(`[FR_utils] ${errorMessage}`)
      throw new Error(errorMessage)
    }
    console.log(`[FR_utils] Validated and retrieved site: ${site.siteName} (ID: ${siteId})`)
    return site
  } catch (error) {
    console.error(`[FR_utils] Error validating site ${siteId}:`, error)
    throw error
  }
}

/**
 * Validate and retrieve a study object by its ID
 * @param {string} studyId - The ID of the study
 * @returns {Object} The retrieved study object
 */
async function validateAndGetStudy(studyId) {
  try {
    const study = await Study.findById(studyId).lean()
    if (!study) {
      const errorMessage = `Study with ID ${studyId} does not exist.`
      console.log(`[FR_utils] ${errorMessage}`)
      throw new Error(errorMessage)
    }
    console.log(`[FR_utils] Validated and retrieved study: ${study.studyName} (ID: ${studyId})`)
    return study
  } catch (error) {
    console.error(`[FR_utils] Error validating study ${studyId}:`, error)
    throw error
  }
}

/**
 * Handle randomization logic for different select types
 * @param {Object} shipment - The shipment object
 * @param {string} selectType - The type of randomization
 * @param {Object} postData - The POST data
 * @returns {Object} Response data for the randomization logic
 */
async function handleRandomizationLogic(shipment, selectType, postData) {
  if (selectType === "Drug") {
    console.log("[FR_utils] Processing Drug randomization logic...")

    const selectedDrugId = postData.used_drug_id
    console.log(`[FR_utils] Drug ID from POST data: ${selectedDrugId}`)

    if (!selectedDrugId) {
      throw new Error("Drug ID is missing in the submitted data.")
    }

    // Fetch the specific acknowledgment for the selected drug
    const drugAck = await ShipmentAcknowledgment.findOne({
      shipment: shipment._id,
      drug: selectedDrugId,
      status: { $in: ["received", "partial"] },
      receivedQuantity: { $gt: 0 },
    }).populate("drug")

    if (!drugAck) {
      console.log(`[FR_utils] No acknowledgment found for drug_id=${selectedDrugId}`)
      throw new Error("No acknowledged drug with available received quantity found for the selected shipment.")
    }

    console.log(`[FR_utils] Retrieved drug acknowledgment: ${drugAck}`)

    // Validate used quantity
    const usedQuantity = Number.parseInt(postData.used_quantity || 0)
    console.log(`[FR_utils] Used Quantity: ${usedQuantity}, Available: ${drugAck.receivedQuantity}`)

    if (usedQuantity <= 0 || usedQuantity > drugAck.receivedQuantity) {
      throw new Error("Invalid quantity. Ensure it is greater than 0 and within available received limits.")
    }

    // Deduct the used quantity from received quantity
    drugAck.receivedQuantity -= usedQuantity
    await drugAck.save()
    console.log(`[FR_utils] Updated received quantity: ${drugAck.receivedQuantity}`)

    // Generate randomization number
    const randomizationNumber = await generateRandomizationNumber()
    console.log(`[FR_utils] Generated Randomization Number: ${randomizationNumber}`)

    return {
      drug_id_used: selectedDrugId,
      quantity_used: usedQuantity,
      randomization_number: randomizationNumber,
    }
  } else if (selectType === "DrugGroup") {
    console.log("[FR_utils] Processing DrugGroup randomization logic...")

    // Fetch all drug acknowledgments in the selected group
    const drugAcks = await ShipmentAcknowledgment.find({
      shipment: shipment._id,
      status: { $in: ["received", "partial"] },
      drugGroup: postData.drug_group_id,
      drug: { $ne: null },
      receivedQuantity: { $gt: 0 },
    }).populate("drug")

    if (drugAcks.length === 0) {
      throw new Error("No acknowledged drugs with available received quantity found for the selected drug group.")
    }

    // Retrieve selected drug ID from POST data
    const selectedDrugId = postData.used_drug_id
    if (!selectedDrugId) {
      throw new Error("Missing selected drug ID.")
    }

    // Find the acknowledgment for the selected drug
    const selectedDrugAck = drugAcks.find((ack) => ack.drug._id.toString() === selectedDrugId)
    if (!selectedDrugAck) {
      throw new Error("Selected drug is not part of the acknowledged drugs in the group.")
    }

    // Validate used quantity
    const usedQuantity = Number.parseInt(postData.used_quantity || 0)
    if (usedQuantity <= 0 || usedQuantity > selectedDrugAck.receivedQuantity) {
      throw new Error("Invalid quantity. Ensure it is greater than 0 and within available received limits.")
    }

    // Deduct the used quantity from the selected drug's received quantity
    selectedDrugAck.receivedQuantity -= usedQuantity
    await selectedDrugAck.save()

    // Generate randomization number
    const randomizationNumber = await generateRandomizationNumber()
    console.log(`[FR_utils] Randomization successful for drug ${selectedDrugId} in group ${postData.drug_group_id}.`)

    return {
      drug_group_id_used: postData.drug_group_id,
      drug_id_used: selectedDrugId,
      quantity_used: usedQuantity,
      randomization_number: randomizationNumber,
    }
  } else if (selectType === "Excel" || selectType === "Randomization") {
    console.log(`Processing ${selectType} randomization logic...`)

    const site = await Site.findById(shipment.siteNumber).populate("studies")
    const siteStudies = site.studies

    // Fetch available rows with status 'received'
    const availableRow = await ExcelDataRow.findOne({
      studies: { $in: siteStudies.map((s) => s._id) },
      clinicalData: null,
    })
      .populate({
        path: "studies",
        match: { _id: { $in: siteStudies.map((s) => s._id) } },
      })
      .sort({ _id: 1 })

    if (!availableRow) {
      console.log("No available ExcelDataRow found for randomization.")
      throw new Error("No rows sent to the selected site and acknowledged as 'received' are available.")
    }

    // Retrieve the Random_Number from the row_data
    const randomizationNumber = availableRow.rowData.get("Random_Number")
    if (!randomizationNumber) {
      console.log("Random_Number is missing in the assigned ExcelDataRow.")
      throw new Error("Random_Number is missing in the assigned ExcelDataRow.")
    }

    console.log(`Retrieved Random_Number: ${randomizationNumber} from ExcelDataRow ID: ${availableRow._id}`)

    return {
      excel_row_id: availableRow._id,
      randomization_number: randomizationNumber,
      message: `${selectType} logic processed successfully.`,
    }
  } else {
    throw new Error(`Invalid or unsupported selectType: ${selectType}`)
  }
}

/**
 * Generate the next screening number for a given site
 * @param {string} siteId - The ID of the site
 * @returns {string} The next screening number
 */
async function generateNextScreeningNumber(siteId) {
  console.log(`[FR_utils] Generating next screening number for site_id: ${siteId}`)

  // Fetch existing screening numbers
  const existingNumbers = await ClinicalData.find({
    site: siteId,
    "data.screeningNum": { $ne: null },
  })
    .select("data.screeningNum")
    .lean()

  const screeningNumbers = existingNumbers.map((item) => item.data.get("screeningNum")).filter((num) => num)

  console.log(`[FR_utils] Retrieved screening numbers: ${screeningNumbers}`)

  // Extract numeric parts and find the maximum
  let maxNum = 0
  for (const num of screeningNumbers) {
    try {
      if (num.includes("-")) {
        const parts = num.split("-")
        const numericPart = Number.parseInt(parts[parts.length - 1])
        if (numericPart > maxNum) {
          maxNum = numericPart
        }
      }
    } catch (error) {
      continue
    }
  }

  const nextNum = maxNum + 1
  const nextScreeningNumber = `10-${String(nextNum).padStart(3, "0")}`
  console.log(`[FR_utils] Next screening number for site_id ${siteId}: ${nextScreeningNumber}`)
  return nextScreeningNumber
}

/**
 * Get drug details for a given shipment
 * @param {Object} shipment - The shipment object
 * @returns {Object} Drug details response
 */
async function getDrugDetails(shipment) {
  const drugAck = await ShipmentAcknowledgment.findOne({
    shipment: shipment._id,
    status: { $in: ["received", "partial"] },
    drug: { $ne: null },
    receivedQuantity: { $gt: 0 },
  }).populate("drug")

  if (!drugAck) {
    return {
      status: "error",
      message: "No available drugs in this shipment.",
    }
  }

  return {
    status: "success",
    selectType: "Drug",
    data: {
      drug_id: drugAck.drug._id,
      drug_name: drugAck.drug.drugName,
      received_quantity: drugAck.receivedQuantity,
    },
  }
}

/**
 * Get drug group details for a given shipment
 * @param {Object} shipment - The shipment object
 * @param {string} drugGroupId - The drug group ID
 * @returns {Object} Drug group details response
 */
async function getDrugGroupDetails(shipment, drugGroupId) {
  if (!drugGroupId) {
    return {
      status: "error",
      message: "Missing drug_group_id for DrugGroup.",
    }
  }

  try {
    console.log(`Fetching ShipmentAcknowledgment for shipment: ${shipment._id}, drug_group_id: ${drugGroupId}`)

    const acknowledgments = await ShipmentAcknowledgment.find({
      shipment: shipment._id,
      drugGroup: drugGroupId,
      status: { $in: ["received", "partial"] },
      receivedQuantity: { $gt: 0 },
    }).populate("drug")

    const drugsData = acknowledgments.map((ack) => ({
      drug_id: ack.drug._id,
      drug_name: ack.drug.drugName,
      received_quantity: ack.receivedQuantity,
    }))

    console.log(`Drugs in group with received quantities: ${JSON.stringify(drugsData)}`)

    return {
      status: "success",
      selectType: "DrugGroup",
      data: {
        drug_group_id: drugGroupId,
        drugs: drugsData,
      },
    }
  } catch (error) {
    console.error(`Error in getDrugGroupDetails: ${error.message}`)
    return {
      status: "error",
      message: error.message,
    }
  }
}

module.exports = {
  generateSlugWithUuid,
  getCurrentTimestamp,
  fetchSiteDetailsBySlug,
  generateRandomizationNumber,
  validateAndLogPostData,
  formatDateIfPossible,
  prepareSiteTable,
  prepareSubmittedDataTable,
  prepareEmailContent,
  validateAndGetSite,
  validateAndGetStudy,
  handleRandomizationLogic,
  generateNextScreeningNumber,
  getDrugDetails,
  getDrugGroupDetails,
}
