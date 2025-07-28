const Form = require("../models/Form")
const FormSubmission = require("../models/FormSubmission")
const ClinicalData = require("../models/ClinicalData")
const DrugShipment = require("../models/DrugShipment")
const ExcelDataRow = require("../models/ExcelModels")
const Drug = require("../models/Drugs")
const DrugGroup = require("../models/DrugGroup")
const Stage = require("../models/Stage")
const {
  fetchSiteDetailsBySlug,
  validateAndGetSite,
  validateAndGetStudy,
  validateAndLogPostData,
  handleRandomizationLogic,
  prepareEmailContent,
  generateNextScreeningNumber,
  getDrugDetails,
  getDrugGroupDetails,
} = require("../utils/FR_utils")
const { sendEmail } = require("../utils/sendEmail")

// @desc    Get site details by slug
// @route   GET /api/forms/site-details/:slug
// @access  Private
exports.getSiteDetails = async (req, res) => {
  try {
    const { slug } = req.params
    const result = await fetchSiteDetailsBySlug(slug)

    if (result.success) {
      console.log(`[forms.js] Site details fetched successfully for slug: ${slug}`)
      res.json(result.data)
    } else {
      console.log(`[forms.js] Failed to fetch site details for slug: ${slug}`)
      res.status(404).json({ error: result.error })
    }
  } catch (error) {
    console.error("Error fetching site details:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

// @desc    Submit form data
// @route   POST /api/forms/submit/:slug
// @access  Private
exports.submitForm = async (req, res) => {
  const session = require("mongoose").startSession()

  try {
    await session.startTransaction()

    // 1. Validate form slug
    const { slug } = req.params
    if (!slug) {
      console.log("Slug is missing in the request.")
      return res.status(400).json({ error: "Slug is required." })
    }

    const form = await Form.findOne({ slug }).session(session)
    if (!form) {
      return res.status(404).json({ error: "Form not found." })
    }

    console.log(`Found Form: ${form.title} (Slug: ${slug})`)

    // 2. Validate and log POST data
    const requiredFields = ["study", "site", "selectType"]
    const postData = validateAndLogPostData(req.body, requiredFields)

    // 3. Validate and retrieve site
    const siteId = postData.site
    const site = await validateAndGetSite(siteId)
    console.log(`Retrieved Site: ${site.siteName} (ID=${siteId})`)

    // 4. Validate and retrieve study
    const studyId = postData.study
    const study = await validateAndGetStudy(studyId)
    console.log(`Retrieved Study: ${study.studyName} (ID=${studyId})`)

    // 5. Retrieve associated stage
    const stage = await Stage.findById(form.stages).session(session)
    if (!stage) {
      console.log("Stage associated with the form is missing.")
      return res.status(400).json({ error: "Stage associated with the form is missing." })
    }

    console.log(`Retrieved Stage: ${stage.name}`)

    // Stage-specific logic
    let screeningNumber = null
    let randomizationNumber = null
    let responseData = {}
    let usedDrug = null
    let usedDrugGroup = null
    let selectType = null

    if (stage.name.trim().toLowerCase() === "randomization") {
      console.log("Stage is Randomization. Proceeding with randomization logic.")

      // Conditionally generate screening number
      if (stage.generateScreeningInRandomization) {
        screeningNumber = postData.screeningNum
        if (!screeningNumber) {
          screeningNumber = await generateNextScreeningNumber(siteId)
          if (!screeningNumber) {
            console.log("Failed to generate screening number.")
            return res.status(500).json({ error: "Failed to generate screening number." })
          }
          console.log(`Generated Screening Number for Randomization: ${screeningNumber}`)
        }
      }

      // Retrieve shipment and selectType
      const shipmentId = postData.shipment_id
      const shipment = await DrugShipment.findById(shipmentId).session(session)
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found." })
      }

      selectType = postData.selectType

      if (!["Drug", "DrugGroup", "Excel", "Randomization"].includes(selectType)) {
        console.log(`Invalid or unsupported selectType: ${selectType}`)
        return res.status(400).json({ error: `Invalid or unsupported selectType: ${selectType}` })
      }

      // Handle randomization logic
      responseData = await handleRandomizationLogic(shipment, selectType, postData)
      randomizationNumber = responseData.randomization_number

      // Retrieve Drug or DrugGroup instances
      if (responseData.drug_id_used) {
        usedDrug = await Drug.findById(responseData.drug_id_used).session(session)
      }
      if (responseData.drug_group_id_used) {
        usedDrugGroup = await DrugGroup.findById(responseData.drug_group_id_used).session(session)
      }

      // Store clinical data for Randomization
      const clinicalInstance = await ClinicalData.create(
        [
          {
            stage: stage._id,
            site: site._id,
            screening: screeningNumber,
            randomizationNum: randomizationNumber,
            data: new Map(Object.entries(postData).filter(([key]) => key !== "csrfmiddlewaretoken")),
            submittedBy: req.user._id,
            usedDrug: usedDrug?._id,
            usedQuantity: responseData.quantity_used,
            usedDrugGroup: usedDrugGroup?._id,
          },
        ],
        { session },
      )

      // Link Excel row if applicable
      if ((selectType === "Excel" || selectType === "Randomization") && responseData.excel_row_id) {
        const availableRow = await ExcelDataRow.findById(responseData.excel_row_id).session(session)
        if (availableRow) {
          availableRow.clinicalData = clinicalInstance[0]._id
          availableRow.isUsed = true
          availableRow.usedAt = new Date()
          await availableRow.save({ session })
          console.log(`Linked ExcelDataRow ID ${availableRow._id} to ClinicalData ID ${clinicalInstance[0]._id}`)
        }
      }
    } else if (stage.name.trim().toLowerCase() === "screening") {
      console.log("Stage is Screening. Proceeding with screening logic.")

      // Generate screening number
      screeningNumber = await generateNextScreeningNumber(siteId)
      if (!screeningNumber) {
        console.log("Failed to generate screening number.")
        return res.status(500).json({ error: "Failed to generate screening number." })
      }

      // Store clinical data for Screening
      await ClinicalData.create(
        [
          {
            stage: stage._id,
            site: site._id,
            screening: screeningNumber,
            data: new Map(Object.entries(postData).filter(([key]) => key !== "csrfmiddlewaretoken")),
            submittedBy: req.user._id,
          },
        ],
        { session },
      )
    }

    // Commit transaction
    await session.commitTransaction()

    // Send email notification
    try {
      const actionUser = req.user.username || req.user.email
      const emailSubject = `${stage.name} Submission Successful`
      const plainMessage = "Please view this email in HTML format."

      const emailMessage = prepareEmailContent({
        selectType,
        submittedData: postData,
        site,
        randomizationNumber: stage.name.trim().toLowerCase() === "randomization" ? randomizationNumber : null,
        actionUser,
      })

      await sendEmail({
        email: req.user.email,
        subject: emailSubject,
        message: plainMessage,
        html: emailMessage,
      })

      console.log(`${stage.name} email sent successfully.`)
    } catch (emailError) {
      console.error("Email notification failed:", emailError)
    }

    // 8. Return success response
    responseData = {
      ...responseData,
      success: true,
      message: `${stage.name} data submitted successfully.`,
      screening: stage.name.trim().toLowerCase() === "screening" ? screeningNumber : null,
      randomization: stage.name.trim().toLowerCase() === "randomization" ? randomizationNumber : null,
    }

    res.json(responseData)
  } catch (error) {
    await session.abortTransaction()
    console.error(`An unexpected error occurred: ${error.message}`)
    res.status(400).json({ error: error.message || "An unexpected error occurred." })
  } finally {
    session.endSession()
  }
}

// @desc    Get next screening number for a site
// @route   GET /api/forms/next-screening-number/:siteId
// @access  Private
exports.getNextScreeningNumber = async (req, res) => {
  try {
    const { siteId } = req.params
    console.log(`[forms.js] getNextScreeningNumber: Start for site_id=${siteId}`)

    if (!siteId || isNaN(siteId)) {
      console.log("[forms.js] getNextScreeningNumber: site_id must be a valid number.")
      return res.status(400).json({ error: "Invalid site_id provided." })
    }

    console.log("[forms.js] getNextScreeningNumber: Generating screening number.")
    const nextScreeningNumber = await generateNextScreeningNumber(siteId)
    console.log(`[forms.js] getNextScreeningNumber: Next screening number: ${nextScreeningNumber}`)

    res.json({ next_screening_number: nextScreeningNumber })
  } catch (error) {
    console.error(`[forms.js] getNextScreeningNumber: An exception occurred: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
}

// @desc    Check option status based on stage order and site ID
// @route   GET /api/forms/check-option-status
// @access  Private
exports.checkOptionStatus = async (req, res) => {
  try {
    const { stage_order, site_id } = req.query
    console.log(`[forms.js] checkOptionStatus: Received stage_order=${stage_order}, site_id=${site_id}`)

    const stageOrder = Number.parseInt(stage_order)
    const siteId = Number.parseInt(site_id)

    if (isNaN(stageOrder) || isNaN(siteId)) {
      console.log("[forms.js] checkOptionStatus: stage_order and site_id must be integers.")
      return res.status(400).json({ error: "Invalid stage_order or site_id provided." })
    }

    console.log("[forms.js] Filtering stage screening numbers by eligibility_value='Yes'")
    const eligibleScreenings = await ClinicalData.find({
      site: siteId,
      eligibilityValue: "Yes",
    })
      .distinct("data.screeningNum")
      .lean()

    const validScreenings = eligibleScreenings.filter((num) => num)
    console.log(`[forms.js] checkOptionStatus: Eligible screening numbers for site ${siteId}: ${validScreenings}`)

    res.json({ eligible_screening_numbers: validScreenings })
  } catch (error) {
    console.error(`[forms.js] checkOptionStatus: Error: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
}

// @desc    Fetch shipment details
// @route   GET /api/forms/fetch-shipment-details
// @access  Private
exports.fetchShipmentDetails = async (req, res) => {
  try {
    const { shipment_id, selectType, drug_group_id } = req.query

    console.log(
      `Parameters received: shipment_id=${shipment_id}, selectType=${selectType}, drug_group_id=${drug_group_id}`,
    )

    if (!shipment_id || !selectType) {
      return res.status(400).json({ status: "error", message: "Missing shipment_id or selectType." })
    }

    const shipment = await DrugShipment.findById(shipment_id)
    if (!shipment) {
      console.log("Shipment not found.")
      return res.status(404).json({ status: "error", message: "Shipment not found." })
    }

    console.log(`Shipment found: ${shipment}`)

    if (selectType === "Drug") {
      const result = await getDrugDetails(shipment)
      return res.json(result)
    } else if (selectType === "DrugGroup") {
      console.log(`Processing DrugGroup with ID: ${drug_group_id}`)
      const result = await getDrugGroupDetails(shipment, drug_group_id)
      return res.json(result)
    } else {
      return res.status(400).json({ status: "error", message: "Invalid selectType." })
    }
  } catch (error) {
    console.error(`Unexpected error: ${error.message}`)
    res.status(500).json({ status: "error", message: error.message })
  }
}
