const Page = require("../models/Page")
const PageMigrationLog = require("../models/PageMigrationLog")
const PageSiteStudyAssignment = require("../models/PageSiteStudyAssignment")
const Form = require("../models/Form")
const Study = require("../models/Study")
const Site = require("../models/Site")
const Stage = require("../models/Stage")
const DrugShipment = require("../models/DrugShipment")
const {
  determinePermissions,
  buildPageFilter,
  freezePagesOutsideWindow,
  processComponentsData,
  determineSelectType,
  validatePageData,
  processComponents,
  fetchShipments,
} = require("../utils/PG_utils")
const { sendEmailNotification } = require("../utils/sendEmail")

// Get all pages with filtering and pagination
exports.getPages = async (req, res) => {
  try {
    const { study = "all", site = "all", page = 1, limit = 10, search = "" } = req.query

    // Determine permissions
    const { canEdit, canDelete } = await determinePermissions(req.user, "page_list")

    // Build filter
    const filter = buildPageFilter(study, site)

    // Add search filter
    if (search) {
      filter.$or = [{ title: { $regex: search, $options: "i" } }, { content: { $regex: search, $options: "i" } }]
    }

    // Get pages with pagination
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)
    const pages = await Page.find(filter)
      .populate("stages studies sites form shipment")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number.parseInt(limit))

    const total = await Page.countDocuments(filter)

    // Freeze pages outside window
    await freezePagesOutsideWindow(pages)

    res.json({
      success: true,
      data: {
        pages,
        pagination: {
          current: Number.parseInt(page),
          total: Math.ceil(total / Number.parseInt(limit)),
          count: total,
        },
        permissions: { canEdit, canDelete },
      },
    })
  } catch (error) {
    console.error("Error fetching pages:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching pages",
      error: error.message,
    })
  }
}

// Get single page
exports.getPage = async (req, res) => {
  try {
    const { slug } = req.params

    const page = await Page.findOne({ slug }).populate("stages studies sites form shipment")

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    // Process components data
    const processedComponents = processComponentsData(page.componentsData)

    res.json({
      success: true,
      data: {
        ...page.toObject(),
        componentsData: processedComponents,
      },
    })
  } catch (error) {
    console.error("Error fetching page:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching page",
      error: error.message,
    })
  }
}

// Create new page
exports.createPage = async (req, res) => {
  try {
    const { canEdit } = await determinePermissions(req.user, "page_list")

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      })
    }

    const pageData = req.body

    // Validate required fields
    if (!pageData.title || !pageData.stages) {
      return res.status(400).json({
        success: false,
        message: "Title and stage are required",
      })
    }

    const page = new Page(pageData)
    await page.save()

    // Handle site-study assignments if provided
    if (pageData.siteStudyAssignments && pageData.siteStudyAssignments.length > 0) {
      const assignments = pageData.siteStudyAssignments.map((assignment) => ({
        page: page._id,
        site: assignment.site,
        study: assignment.study,
        shipment: assignment.shipment || null,
      }))

      await PageSiteStudyAssignment.insertMany(assignments)
    }

    // Send notification
    await sendEmailNotification({
      subject: "New Page Created",
      message: `Page "${page.title}" has been created.`,
      user: req.user,
    })

    const populatedPage = await Page.findById(page._id).populate("stages studies sites form shipment")

    res.status(201).json({
      success: true,
      data: populatedPage,
      message: "Page created successfully",
    })
  } catch (error) {
    console.error("Error creating page:", error)
    res.status(500).json({
      success: false,
      message: "Error creating page",
      error: error.message,
    })
  }
}

// Update page
exports.updatePage = async (req, res) => {
  try {
    const { slug } = req.params
    const { canEdit } = await determinePermissions(req.user, "page_list")

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      })
    }

    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    // Check if page is frozen
    if (!page.isActive) {
      return res.status(403).json({
        success: false,
        message: "Page is frozen and cannot be edited",
      })
    }

    // Prevent editing if in live phase
    if (page.phase === "live") {
      return res.status(403).json({
        success: false,
        message: "Page cannot be edited as it is in live phase",
      })
    }

    // Update page
    Object.assign(page, req.body)

    // Mark as edited if first time
    if (!page.isEdited) {
      page.isEdited = true
    }

    // Move to testing if in development
    if (page.phase === "development") {
      page.phase = "testing"
    }

    await page.save()

    // Update site-study assignments if provided
    if (req.body.siteStudyAssignments) {
      await PageSiteStudyAssignment.deleteMany({ page: page._id })

      if (req.body.siteStudyAssignments.length > 0) {
        const assignments = req.body.siteStudyAssignments.map((assignment) => ({
          page: page._id,
          site: assignment.site,
          study: assignment.study,
          shipment: assignment.shipment || null,
        }))

        await PageSiteStudyAssignment.insertMany(assignments)
      }
    }

    // Send notification
    await sendEmailNotification({
      subject: "Page Updated",
      message: `Page "${page.title}" has been updated.`,
      user: req.user,
    })

    const populatedPage = await Page.findById(page._id).populate("stages studies sites form shipment")

    res.json({
      success: true,
      data: populatedPage,
      message: "Page updated successfully",
    })
  } catch (error) {
    console.error("Error updating page:", error)
    res.status(500).json({
      success: false,
      message: "Error updating page",
      error: error.message,
    })
  }
}

// Save page content (from builder)
exports.savePageContent = async (req, res) => {
  try {
    const { slug, formTitle, formCategory, html, css, components, formContent } = req.body

    // Validate page data
    const validation = validatePageData({ slug, formTitle, formCategory })
    if (validation.status !== "valid") {
      return res.status(400).json({
        success: false,
        message: validation.message,
      })
    }

    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    // Check if page is frozen
    if (!page.isActive) {
      return res.status(403).json({
        success: false,
        message: "Page is frozen and cannot be edited",
      })
    }

    // Update page content
    page.title = formTitle
    page.content = html
    page.css = css
    page.componentsData = processComponents(components)

    await page.save()

    // Handle form
    let form
    if (!page.form) {
      form = new Form({
        title: formTitle,
        category: formCategory,
        stages: page.stages,
        content: formContent || {},
      })
      await form.save()
    } else {
      form = await Form.findById(page.form)
      form.title = formTitle
      form.category = formCategory
      form.stages = page.stages
      form.content = formContent || {}
      await form.save()
    }

    // Link form to page
    page.form = form._id
    await page.save()

    // Send notification
    await sendEmailNotification({
      subject: "Page Saved with Form",
      message: `Page "${page.title}" has been saved with form.`,
      user: req.user,
    })

    res.json({
      success: true,
      data: {
        url: page.absoluteUrl,
        formSlug: form.slug,
      },
      message: "Page saved successfully",
    })
  } catch (error) {
    console.error("Error saving page content:", error)
    res.status(500).json({
      success: false,
      message: "Error saving page content",
      error: error.message,
    })
  }
}

// Delete page
exports.deletePage = async (req, res) => {
  try {
    const { slug } = req.params
    const { canDelete } = await determinePermissions(req.user, "page_list")

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      })
    }

    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    // Check if page is frozen
    if (!page.isActive) {
      return res.status(403).json({
        success: false,
        message: "Page is frozen and cannot be deleted",
      })
    }

    const pageTitle = page.title

    // Delete related assignments
    await PageSiteStudyAssignment.deleteMany({ page: page._id })

    // Delete the page
    await Page.findByIdAndDelete(page._id)

    // Send notification
    await sendEmailNotification({
      subject: "Page Deleted",
      message: `Page "${pageTitle}" has been deleted.`,
      user: req.user,
    })

    res.json({
      success: true,
      message: "Page deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting page:", error)
    res.status(500).json({
      success: false,
      message: "Error deleting page",
      error: error.message,
    })
  }
}

// Move page to testing phase
exports.moveToTesting = async (req, res) => {
  try {
    const { slug } = req.params
    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    if (page.phase === "development") {
      page.phase = "testing"
      await page.save()

      await sendEmailNotification({
        subject: "Page Moved to Testing",
        message: `Page "${page.title}" has moved to testing.`,
        user: req.user,
      })
    }

    res.json({
      success: true,
      message: "Page moved to testing phase",
    })
  } catch (error) {
    console.error("Error moving page to testing:", error)
    res.status(500).json({
      success: false,
      message: "Error moving page to testing",
      error: error.message,
    })
  }
}

// Move page to migrate phase
exports.moveToMigrate = async (req, res) => {
  try {
    const { slug } = req.params
    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    if (page.phase === "testing" && page.testingPassed) {
      page.phase = "migrate"
      await page.save()

      await sendEmailNotification({
        subject: "Page Migrated",
        message: `Page "${page.title}" has been migrated.`,
        user: req.user,
      })
    }

    res.json({
      success: true,
      message: "Page moved to migrate phase",
    })
  } catch (error) {
    console.error("Error moving page to migrate:", error)
    res.status(500).json({
      success: false,
      message: "Error moving page to migrate",
      error: error.message,
    })
  }
}

// Move page to live phase
exports.moveToLive = async (req, res) => {
  try {
    const { slug } = req.params
    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    if (page.phase === "migrate" && page.isWithinWindow()) {
      page.phase = "live"
      await page.save()

      // Log migration event
      const migrationLog = new PageMigrationLog({
        page: page._id,
        migratedBy: req.user._id,
        notes: `Page "${page.title}" was moved to live phase.`,
      })
      await migrationLog.save()

      await sendEmailNotification({
        subject: "Page Migrated to Live",
        message: `Page "${page.title}" has been migrated to live.`,
        user: req.user,
      })

      res.json({
        success: true,
        message: "Page moved to live phase",
      })
    } else {
      let message = "Page cannot be moved to live phase"
      if (page.phase !== "migrate") {
        message = "Page is not in migrate phase"
      } else if (!page.isWithinWindow()) {
        message = "Page is frozen and cannot be moved to live"
      }

      res.status(400).json({
        success: false,
        message,
      })
    }
  } catch (error) {
    console.error("Error moving page to live:", error)
    res.status(500).json({
      success: false,
      message: "Error moving page to live",
      error: error.message,
    })
  }
}

// Mark testing as passed
exports.markTestingPassed = async (req, res) => {
  try {
    const { slug } = req.params
    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    if (page.phase === "testing") {
      page.testingPassed = true
      await page.save()

      await sendEmailNotification({
        subject: "Page Marked as Passed",
        message: `Page "${page.title}" has been marked as passed.`,
        user: req.user,
      })
    }

    res.json({
      success: true,
      message: "Page marked as testing passed",
    })
  } catch (error) {
    console.error("Error marking testing passed:", error)
    res.status(500).json({
      success: false,
      message: "Error marking testing passed",
      error: error.message,
    })
  }
}

// Move page to development phase
exports.moveToDevelopment = async (req, res) => {
  try {
    const { slug } = req.params
    const { canEdit } = await determinePermissions(req.user, "page_list")

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      })
    }

    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    if (page.phase === "live") {
      page.phase = "development"
      page.isActive = true
      await page.save()

      // Log migration event
      const migrationLog = new PageMigrationLog({
        page: page._id,
        migratedBy: req.user._id,
        notes: "Page reverted to development.",
      })
      await migrationLog.save()

      res.json({
        success: true,
        message: "Page reverted to development phase",
      })
    } else {
      res.status(400).json({
        success: false,
        message: "Page is not in live phase",
      })
    }
  } catch (error) {
    console.error("Error moving page to development:", error)
    res.status(500).json({
      success: false,
      message: "Error moving page to development",
      error: error.message,
    })
  }
}

// Toggle freeze page
exports.toggleFreezePage = async (req, res) => {
  try {
    const { slug } = req.params
    const page = await Page.findOne({ slug })

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    page.isActive = !page.isActive
    await page.save()

    const action = page.isActive ? "unfrozen" : "frozen"

    res.json({
      success: true,
      message: `Page ${action} successfully`,
    })
  } catch (error) {
    console.error("Error toggling page freeze:", error)
    res.status(500).json({
      success: false,
      message: "Error toggling page freeze",
      error: error.message,
    })
  }
}

// View page
exports.viewPage = async (req, res) => {
  try {
    const { slug } = req.params
    const page = await Page.findOne({ slug }).populate("stages studies sites form shipment")

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found",
      })
    }

    if (!page.isActive) {
      return res.status(403).json({
        success: false,
        message: "Page is frozen and cannot be viewed",
      })
    }

    // Get assignment details
    const assignment = await PageSiteStudyAssignment.findOne({ page: page._id }).populate("site study")

    let selectType = null
    let assignedId = null
    let assignedShipment = null
    let drugs = []

    // If stage is randomization, determine select type
    if (page.stages && page.stages.name && page.stages.name.toLowerCase().trim() === "randomization") {
      const result = await determineSelectType(assignment?.study?._id, assignment?.site?._id, page.shipment)
      selectType = result.selectType
      assignedId = result.assignedId
      assignedShipment = result.assignedShipment
      drugs = result.drugs
    }

    // Process components data
    const processedComponents = processComponentsData(page.componentsData)

    res.json({
      success: true,
      data: {
        content: page.content,
        css: page.css,
        formSlug: page.form?.slug || null,
        formTitle: page.form?.title || "Untitled Form",
        formCategory: page.form?.category || "Uncategorized",
        currentStage: page.stages,
        selectedStudyId: assignment?.study?._id || null,
        selectedSiteId: assignment?.site?._id || null,
        selectType,
        assignedId,
        assignedShipment,
        drugs,
        componentsData: processedComponents,
      },
    })
  } catch (error) {
    console.error("Error viewing page:", error)
    res.status(500).json({
      success: false,
      message: "Error viewing page",
      error: error.message,
    })
  }
}

// Load page for editing
exports.loadPage = async (req, res) => {
  try {
    const { slug } = req.params
    const page = await Page.findOne({ slug, isActive: true }).populate("form")

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found or inactive",
      })
    }

    const processedComponents = processComponentsData(page.componentsData)

    res.json({
      success: true,
      data: {
        title: page.title,
        html: page.content,
        css: page.css,
        components: processedComponents,
        form: page.form
          ? {
              title: page.form.title,
              category: page.form.category,
              slug: page.form.slug,
              content: page.form.content,
              dynamicFields: page.form.dynamicFields,
            }
          : {},
      },
    })
  } catch (error) {
    console.error("Error loading page:", error)
    res.status(500).json({
      success: false,
      message: "Error loading page",
      error: error.message,
    })
  }
}

// Fetch shipments for study and site
exports.getShipments = async (req, res) => {
  try {
    const { study_id, site_id } = req.query

    if (!study_id || !site_id) {
      return res.status(400).json({
        success: false,
        message: "study_id and site_id are required",
      })
    }

    const result = await fetchShipments(study_id, site_id)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("Error fetching shipments:", error)
    res.status(400).json({
      success: false,
      message: error.message,
    })
  }
}
