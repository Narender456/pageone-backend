const { v4: uuidv4 } = require("uuid")
const slugify = require("slugify")
const Permission = require("../models/Permission")
const DrugShipment = require("../models/DrugShipment")
const ShipmentAcknowledgment = require("../models/ShipmentAcknowledgment")
const Study = require("../models/Study")
const Site = require("../models/Site")
const Page = require("../models/Page")

/**
 * Generate a slug using a base text and a UUID.
 * @param {string} baseText - The base text to include in the slug.
 * @param {string} uniqueId - Optional unique identifier.
 * @returns {Object} An object with uniqueId and slug.
 */
const generateSlugWithUuid = (baseText, uniqueId = null) => {
  if (!uniqueId) {
    uniqueId = uuidv4().split("-")[4]
  }

  const slug = slugify(`${baseText} ${uniqueId}`, {
    lower: true,
    strict: true,
  })

  return { uniqueId, slug }
}

/**
 * Get the current localized time.
 * @returns {Date} Current time.
 */
const getCurrentTime = () => {
  return new Date()
}

/**
 * Determine user permissions for a specific URL.
 * @param {Object} user - The user object.
 * @param {string} url - The URL or feature to check permissions for.
 * @returns {Object} Object with canEdit and canDelete properties.
 */
const determinePermissions = async (user, url) => {
  if (user.isSuperuser) {
    return { canEdit: true, canDelete: true }
  }

  const userRole = user.role
  if (userRole) {
    try {
      const permissions = await Permission.find({ role: userRole }).populate("menuOption")

      const canEdit = permissions.some(
        (perm) => perm.menuOption && perm.menuOption.url === url && perm.canEdit === true,
      )

      const canDelete = permissions.some(
        (perm) => perm.menuOption && perm.menuOption.url === url && perm.canDelete === true,
      )

      return { canEdit, canDelete }
    } catch (error) {
      console.error("Error determining permissions:", error)
      return { canEdit: false, canDelete: false }
    }
  }

  return { canEdit: false, canDelete: false }
}

/**
 * Filter pages based on study and site.
 * @param {Object} filter - Base filter object.
 * @param {string} selectedStudy - Selected study ID or 'all'.
 * @param {string} selectedSite - Selected site ID or 'all'.
 * @returns {Object} Updated filter object.
 */
const buildPageFilter = (filter, selectedStudy, selectedSite) => {
  if (selectedStudy !== "all") {
    filter.studies = selectedStudy
  }
  if (selectedSite !== "all") {
    filter.sites = selectedSite
  }
  return filter
}

/**
 * Freeze pages that are outside their active window period.
 * @param {Array} pages - Array of page objects.
 */
const freezePagesOutsideWindow = async (pages) => {
  const updatePromises = pages.map(async (page) => {
    if (!page.isWithinWindow() && page.isActive) {
      page.isActive = false
      await page.save()
    }
  })
  await Promise.all(updatePromises)
}

/**
 * Convert boolean values to JavaScript-compatible strings.
 * @param {*} data - Data to convert.
 * @returns {*} Converted data.
 */
const convertBooleansToJs = (data) => {
  if (typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      return data.map(convertBooleansToJs)
    } else {
      const result = {}
      for (const [key, value] of Object.entries(data)) {
        result[key] = convertBooleansToJs(value)
      }
      return result
    }
  } else if (typeof data === "boolean") {
    return data ? "true" : "false"
  }
  return data
}

/**
 * Process components data for JavaScript compatibility.
 * @param {Array} componentsData - Components data array.
 * @returns {Array} Processed components data.
 */
const processComponentsData = (componentsData) => {
  if (!componentsData || !Array.isArray(componentsData)) {
    return []
  }
  return convertBooleansToJs(componentsData)
}

/**
 * Determine select type and assigned shipment for randomization.
 * @param {string} studyId - Study ID.
 * @param {string} siteId - Site ID.
 * @param {Object} assignedShipment - Assigned shipment object.
 * @returns {Object} Object with selectType, assignedId, assignedShipment, and drugs.
 */
const determineSelectType = async (studyId, siteId, assignedShipment) => {
  console.log(`[DEBUG] Determining select type for Study ID: ${studyId}, Site ID: ${siteId}`)

  try {
    // Filter shipments for the given study and site
    const shipments = await DrugShipment.find({
      study: studyId,
      siteNumber: siteId,
    })

    console.log(`[DEBUG] Found ${shipments.length} shipments for Study ID ${studyId}, Site ID ${siteId}`)

    // Use the explicitly assigned shipment if provided
    let shipment
    if (assignedShipment) {
      shipment = shipments.find((s) => s._id.toString() === assignedShipment._id.toString())
      console.log(`[DEBUG] Using explicitly assigned shipment: ${shipment?.shipmentNumber || "None"}`)
    } else {
      shipment = shipments[0]
      console.log(`[DEBUG] Using first available shipment: ${shipment?.shipmentNumber || "None"}`)
    }

    if (!shipment) {
      console.log("[DEBUG] No shipments found. Defaulting to Drug.")
      return { selectType: "Drug", assignedId: null, assignedShipment: null, drugs: [] }
    }

    console.log(`[DEBUG] Selected shipment: ${shipment.shipmentNumber}, Type: ${shipment.selectType}`)

    // Handle DrugGroup shipments
    if (shipment.selectType === "DrugGroup") {
      const drugGroupAck = await ShipmentAcknowledgment.findOne({
        shipment: shipment._id,
        drugGroup: { $ne: null },
        status: { $in: ["received", "partial"] },
        receivedQuantity: { $gt: 0 },
      }).populate("drugGroup")

      if (drugGroupAck) {
        console.log(`[DEBUG] Found acknowledged DrugGroup: ${drugGroupAck.drugGroup.groupName}`)

        const drugsInGroup = await DrugShipment.aggregate([
          { $match: { _id: shipment._id } },
          { $lookup: { from: "drugs", localField: "groupName", foreignField: "drugGroups", as: "drugs" } },
          { $unwind: "$drugs" },
          {
            $lookup: {
              from: "shipmentacknowledgments",
              localField: "_id",
              foreignField: "shipment",
              as: "acknowledgments",
            },
          },
          {
            $match: {
              "acknowledgments.drug": "$drugs._id",
              "acknowledgments.status": { $in: ["received", "partial"] },
              "acknowledgments.receivedQuantity": { $gt: 0 },
            },
          },
        ])

        return {
          selectType: "DrugGroup",
          assignedId: drugGroupAck.drugGroup._id,
          assignedShipment: shipment,
          drugs: drugsInGroup,
        }
      }

      return { selectType: "DrugGroup", assignedId: null, assignedShipment: shipment, drugs: [] }
    }

    // Handle Drug shipments
    if (shipment.selectType === "Drug") {
      const drugAck = await ShipmentAcknowledgment.findOne({
        shipment: shipment._id,
        drug: { $ne: null },
        status: { $in: ["received", "partial"] },
        receivedQuantity: { $gt: 0 },
      }).populate("drug")

      if (drugAck) {
        console.log(`[DEBUG] Found acknowledged drug: ${drugAck.drug.drugName}`)
        return {
          selectType: "Drug",
          assignedId: drugAck.drug._id,
          assignedShipment: shipment,
          drugs: [],
        }
      }
    }

    // Handle Randomization shipments
    if (shipment.selectType === "Randomization") {
      const excelRows = shipment.excelRows || []
      console.log(`[DEBUG] Shipment is Randomization with ${excelRows.length} Excel rows`)
      return {
        selectType: "Randomization",
        assignedId: null,
        assignedShipment: shipment,
        drugs: excelRows,
      }
    }

    console.log("[DEBUG] Defaulting to Drug.")
    return { selectType: "Drug", assignedId: null, assignedShipment: shipment, drugs: [] }
  } catch (error) {
    console.error("Error determining select type:", error)
    return { selectType: "Drug", assignedId: null, assignedShipment: null, drugs: [] }
  }
}

/**
 * Update components data in HTML content.
 * @param {Array} componentsData - Components data array.
 * @param {string} htmlContent - HTML content string.
 * @returns {string} Updated HTML content.
 */
const updateComponentsData = (componentsData, htmlContent) => {
  // This would require HTML parsing library like cheerio
  // For now, return the original content
  return htmlContent
}

/**
 * Validate page data.
 * @param {Object} data - Page data to validate.
 * @returns {Object} Validation result.
 */
const validatePageData = (data) => {
  const { slug, form_title, form_category } = data

  if (!slug) {
    return { status: "error", message: "Slug is required" }
  }

  if (!form_title || form_title.trim().toLowerCase() === "untitled form") {
    return { status: "error", message: 'Form title is required and cannot be "Untitled Form".' }
  }

  if (!form_category || !form_category.trim()) {
    return { status: "error", message: "Form category is required." }
  }

  return { status: "valid" }
}

/**
 * Process components for storage.
 * @param {Array} components - Components array.
 * @returns {Array} Processed components.
 */
const processComponents = (components) => {
  return components.map((component) => ({
    type: component.type,
    attributes: component.attributes || {},
    traits: component.traits || [],
  }))
}

/**
 * Fetch available shipments for a study and site.
 * @param {string} studyId - Study ID.
 * @param {string} siteId - Site ID.
 * @returns {Array} Array of available shipments.
 */
const fetchShipments = async (studyId, siteId) => {
  try {
    // Validate study and site existence
    const [study, site] = await Promise.all([Study.findById(studyId), Site.findById(siteId)])

    if (!study) {
      throw new Error(`Study ID ${studyId} does not exist.`)
    }

    if (!site) {
      throw new Error(`Site ID ${siteId} does not exist.`)
    }

    // Filter shipments for the given study and site
    const shipments = await DrugShipment.find({
      study: studyId,
      siteNumber: siteId,
    })
      .populate("study", "studyName")
      .populate("siteNumber", "siteName")

    // Filter acknowledged shipments or Excel/Randomization types
    const availableShipments = []

    for (const shipment of shipments) {
      const hasAcknowledgments = await ShipmentAcknowledgment.exists({
        shipment: shipment._id,
        status: { $in: ["received", "partial"] },
        receivedQuantity: { $gt: 0 },
      })

      if (hasAcknowledgments || ["Excel", "Randomization"].includes(shipment.selectType)) {
        // Check if shipment is already assigned to another page
        const isAssigned = await Page.exists({ shipment: shipment._id })

        if (!isAssigned) {
          const shipmentInfo = {
            id: shipment._id,
            shipmentNumber: shipment.shipmentNumber,
            study: shipment.study?.studyName || "N/A",
            site: shipment.siteNumber?.siteName || "N/A",
            type: shipment.selectType,
          }

          // Add extra details for Excel and Randomization types
          if (["Excel", "Randomization"].includes(shipment.selectType)) {
            const acknowledgmentCount = await ShipmentAcknowledgment.countDocuments({
              shipment: shipment._id,
              status: { $in: ["received", "partial"] },
            })
            shipmentInfo.acknowledgmentCount = acknowledgmentCount
            shipmentInfo.details = `${acknowledgmentCount} acknowledged rows`
          }

          availableShipments.push(shipmentInfo)
        }
      }
    }

    return availableShipments
  } catch (error) {
    console.error("Error fetching shipments:", error)
    throw error
  }
}

module.exports = {
  generateSlugWithUuid,
  getCurrentTime,
  determinePermissions,
  buildPageFilter,
  freezePagesOutsideWindow,
  convertBooleansToJs,
  processComponentsData,
  determineSelectType,
  updateComponentsData,
  validatePageData,
  processComponents,
  fetchShipments,
}
