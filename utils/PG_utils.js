const { v4: uuidv4 } = require("uuid")
const slugify = require("slugify")
const Permission = require("../models/Permission")
const DrugShipment = require("../models/DrugShipment")
const ShipmentAcknowledgment = require("../models/ShipmentAcknowledgment")
const Study = require("../models/Study")
const Site = require("../models/Site")
const Page = require("../models/Page")

// Generate slug with UUID
function generateSlugWithUuid(baseText, uniqueId = null) {
  if (!uniqueId) {
    uniqueId = uuidv4().split("-")[4]
  }

  const slugText = slugify(`${baseText} ${uniqueId}`, { lower: true })
  console.log("[PG_utils] generateSlugWithUuid() called:")
  console.log("   baseText:", baseText)
  console.log("   uniqueId:", uniqueId)
  console.log("   final slugText:", slugText)

  return [uniqueId, slugText]
}

// Get current time
function getCurrentTime() {
  return new Date()
}

// Determine user permissions
// Determine user permissions
async function determinePermissions(user, url) {
  // FIXED: Handle undefined user
  if (!user) {
    console.warn('determinePermissions called with undefined user')
    return { canEdit: false, canDelete: false }
  }

  if (user.role === "admin" || user.isSuperuser) {
    return { canEdit: true, canDelete: true }
  }

  if (user.role) {
    try {
      const permissions = await Permission.find({ role: user.role }).populate("menuOption")

      const canEdit = permissions.some((p) => p.menuOption && p.menuOption.url === url && p.canEdit)
      const canDelete = permissions.some((p) => p.menuOption && p.menuOption.url === url && p.canDelete)

      return { canEdit, canDelete }
    } catch (error) {
      console.error("Error determining permissions:", error)
      return { canEdit: false, canDelete: false }
    }
  }

  return { canEdit: false, canDelete: false }
}

// Filter pages based on study and site
function filterPages(query, selectedStudy, selectedSite) {
  if (selectedStudy !== "all") {
    query = query.where("studies").in([selectedStudy])
  }

  if (selectedSite !== "all") {
    // This would need to be adjusted based on your site assignment logic
    query = query.where("sites").in([selectedSite])
  }

  return query
}

// Freeze pages outside window
async function freezePagesOutsideWindow(pages) {
  for (const page of pages) {
    if (!page.isWithinWindow() && page.isActive) {
      page.isActive = false
      await page.save()
    }
  }
}

// Paginate queryset
function paginateQueryset(query, pageNumber, perPage = 10) {
  const page = Number.parseInt(pageNumber) || 1
  const skip = (page - 1) * perPage

  return {
    query: query.skip(skip).limit(perPage),
    page,
    perPage,
    skip,
  }
}

// Convert booleans to JS
function convertBooleansToJs(data) {
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

// Process components data
function processComponentsData(componentsData) {
  if (!componentsData) {
    return []
  }
  return convertBooleansToJs(componentsData)
}

// Determine select type
async function determineSelectType(studyId, siteId, assignedShipment) {
  console.log(`[DEBUG] Determining select type for Study ID: ${studyId}, Site ID: ${siteId}`)

  try {
    // Filter shipments for the given study and site
    const shipments = await DrugShipment.find({
      study: studyId,
      siteNumber: siteId,
    })

    console.log(`[DEBUG] Found ${shipments.length} shipments for Study ID ${studyId}, Site ID ${siteId}.`)

    // Use the explicitly assigned shipment if provided
    let shipment
    if (assignedShipment) {
      shipment = shipments.find((s) => s._id.toString() === assignedShipment._id.toString())
      console.log(
        `[DEBUG] Using explicitly assigned shipment: ID=${shipment?._id}, Number=${shipment?.shipmentNumber}, Type=${shipment?.selectType}`,
      )
    } else {
      shipment = shipments[0]
      console.log(
        `[DEBUG] No assigned shipment. Falling back to first available shipment: ID=${shipment?._id}, Number=${shipment?.shipmentNumber}`,
      )
    }

    if (!shipment) {
      console.log("[DEBUG] No shipments found. Defaulting to Drug.")
      return ["Drug", null, null, []]
    }

    console.log(
      `[DEBUG] Selected shipment: ID=${shipment._id}, Number=${shipment.shipmentNumber}, Type=${shipment.selectType}`,
    )

    // Handle DrugGroup shipments
    if (shipment.selectType === "DrugGroup") {
      const drugGroupAck = await ShipmentAcknowledgment.findOne({
        shipment: shipment._id,
        drugGroup: { $ne: null },
        status: { $in: ["received", "partial"] },
        acknowledgedQuantity: { $gt: 0 },
      }).populate("drugGroup")

      if (drugGroupAck) {
        console.log(
          `[DEBUG] Found acknowledged DrugGroup: ID=${drugGroupAck.drugGroup._id}, Name=${drugGroupAck.drugGroup.groupName}`,
        )

        // Get drugs in the group with acknowledged quantities
        const drugsInGroup = await ShipmentAcknowledgment.find({
          shipment: shipment._id,
          drugGroup: drugGroupAck.drugGroup._id,
          status: { $in: ["received", "partial"] },
          acknowledgedQuantity: { $gt: 0 },
        }).populate("drug")

        return ["DrugGroup", drugGroupAck.drugGroup._id, shipment, drugsInGroup.map((ack) => ack.drug)]
      }

      console.log("[DEBUG] No acknowledged DrugGroup found.")
      return ["DrugGroup", null, shipment, []]
    }

    // Handle Drug shipments
    if (shipment.selectType === "Drug") {
      const drugAck = await ShipmentAcknowledgment.findOne({
        shipment: shipment._id,
        drug: { $ne: null },
        status: { $in: ["received", "partial"] },
        acknowledgedQuantity: { $gt: 0 },
      }).populate("drug")

      if (drugAck) {
        console.log(`[DEBUG] Found acknowledged drug: ID=${drugAck.drug._id}, Name=${drugAck.drug.drugName}`)
        return ["Drug", drugAck.drug._id, shipment, []]
      }
    }

    // Handle Randomization and Excel shipments
    if (shipment.selectType === "Randomization" || shipment.selectType === "Excel") {
      console.log(`[DEBUG] Shipment is ${shipment.selectType}.`)
      return [shipment.selectType, null, shipment, []]
    }

    console.log("[DEBUG] Defaulting to Drug.")
    return ["Drug", null, shipment, []]
  } catch (error) {
    console.error("[DEBUG] Error in determineSelectType:", error)
    return ["Drug", null, null, []]
  }
}

// Update components data in HTML
function updateComponentsData(componentsData, htmlContent) {
  // This would need a proper HTML parser like cheerio
  // For now, returning the original content
  return htmlContent
}

// Validate page data
function validatePageData(data) {
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

// Process components
function processComponents(components) {
  return components.map((component) => ({
    type: component.type,
    attributes: component.attributes || {},
    traits: component.traits || [],
  }))
}

// Fetch shipments
async function fetchShipments(studyId, siteId) {
  try {
    // Validate input
    if (!studyId || !siteId) {
      throw new Error("Invalid study_id or site_id. Both must be provided.")
    }

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
    }).populate("study siteNumber")

    // Filter out shipments already assigned to other pages
    const assignedShipments = await Page.find({ shipment: { $ne: null } }).select("shipment")
    const assignedShipmentIds = assignedShipments.map((p) => p.shipment.toString())

    const availableShipments = shipments.filter((s) => !assignedShipmentIds.includes(s._id.toString()))

    // Serialize shipment data
    const shipmentData = await Promise.all(
      availableShipments.map(async (shipment) => {
        const shipmentInfo = {
          id: shipment._id,
          shipmentNumber: shipment.shipmentNumber,
          study: shipment.study?.studyName || "N/A",
          site: shipment.siteNumber?.siteName || "N/A",
          type: shipment.selectType,
        }

        // Add extra details for Excel and Randomization types
        if (shipment.selectType === "Excel" || shipment.selectType === "Randomization") {
          const acknowledgmentCount = await ShipmentAcknowledgment.countDocuments({
            shipment: shipment._id,
            status: { $in: ["received", "partial"] },
          })

          shipmentInfo.acknowledgment_count = acknowledgmentCount
          shipmentInfo.details = `${acknowledgmentCount} acknowledged rows`
        }

        return shipmentInfo
      }),
    )

    return { shipments: shipmentData }
  } catch (error) {
    console.error("[DEBUG] Error in fetchShipments:", error)
    throw error
  }
}


// Build page filter based on study and site
function buildPageFilter(study, site) {
  const filter = {}

  if (study && study !== "all") {
    filter.studies = { $in: [study] }
  }

  if (site && site !== "all") {
    filter.sites = { $in: [site] }
  }

  return filter
}

module.exports = {
  generateSlugWithUuid,
  getCurrentTime,
  determinePermissions,
  filterPages,
  freezePagesOutsideWindow,
  paginateQueryset,
  convertBooleansToJs,
  processComponentsData,
  determineSelectType,
  updateComponentsData,
  validatePageData,
  processComponents,
  fetchShipments,
  buildPageFilter, // Add this line
}
