const express = require("express")
const { body, validationResult } = require("express-validator")
const Stage = require("../models/Stage")
const { auth } = require("../middleware/auth")
const { determinePermissions, validateOrderNumber, getNextOrderNumber } = require("../utils/stageUtils")

const router = express.Router()

// Get all stages with pagination and filtering
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, study = "all", site = "all", stage = "all" } = req.query

    const skip = (page - 1) * limit

    // Build filter query (currently just basic filtering, can be extended)
    const filter = {}

    // Apply additional filters if needed
    // if (study !== 'all') filter.study = study;
    // if (site !== 'all') filter.site = site;
    // if (stage !== 'all') filter._id = stage;

    // Determine permissions - handle case where req.user might be undefined
    const permissions = await determinePermissions(req.user || null, "stage_list")

    const stages = await Stage.find(filter).sort({ orderNumber: 1 }).skip(skip).limit(Number.parseInt(limit))

    const total = await Stage.countDocuments(filter)

    res.json({
      stages,
      pagination: {
        current: Number.parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
      permissions,
    })
  } catch (error) {
    console.error("Error fetching stages:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Create new stage
router.post(
  "/",
  [
    body("name").notEmpty().withMessage("Name is required").isLength({ max: 100 }).withMessage("Name too long"),
    body("description").optional().trim(),
    body("orderNumber").optional().isInt({ min: 1 }).withMessage("Order number must be a positive integer"),
  ],
  async (req, res) => {
    try {
      console.log("POST /stages - Request body:", req.body)
      
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        console.log("Validation errors:", errors.array())
        return res.status(400).json({ errors: errors.array() })
      }

      // Check permissions - handle case where req.user might be undefined
      const permissions = await determinePermissions(req.user || null, "stage_list")
      console.log("Permissions:", permissions)
      
      if (!permissions.canEdit) {
        return res.status(403).json({ message: "Permission denied" })
      }

      const { name, description, orderNumber } = req.body

      let finalOrderNumber = orderNumber

      // If no order number provided, get the next available one
      if (!finalOrderNumber) {
        finalOrderNumber = await getNextOrderNumber(Stage)
        console.log("Generated order number:", finalOrderNumber)
      } else {
        // Validate order number if provided
        const isValidOrder = await validateOrderNumber(Stage, orderNumber)
        if (!isValidOrder) {
          return res.status(400).json({
            message: "This order number is already in use. Please choose a unique order number.",
          })
        }
      }

      const stage = new Stage({
        name,
        description: description || undefined, // Don't save empty strings
        orderNumber: finalOrderNumber,
      })

      console.log("Creating stage:", stage)
      await stage.save()

      res.status(201).json({
        message: "Stage created successfully",
        stage,
      })
    } catch (error) {
      console.error("Error creating stage:", error)
      
      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0]
        return res.status(400).json({
          message: `${field} already exists`,
        })
      }
      
      res.status(500).json({ 
        message: "Server error", 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    }
  },
)

// Get stage by slug
router.get("/:slug", async (req, res) => {
  try {
    const stage = await Stage.findOne({ slug: req.params.slug })

    if (!stage) {
      return res.status(404).json({ message: "Stage not found" })
    }

    res.json(stage)
  } catch (error) {
    console.error("Error fetching stage:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Update stage
router.put(
  "/:slug",
  [
    body("name").notEmpty().withMessage("Name is required").isLength({ max: 100 }).withMessage("Name too long"),
    body("description").optional().trim(),
    body("orderNumber").optional().isInt({ min: 1 }).withMessage("Order number must be a positive integer"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      // Check permissions
      const permissions = await determinePermissions(req.user || null, "stage_list")
      if (!permissions.canEdit) {
        return res.status(403).json({ message: "Permission denied" })
      }

      const stage = await Stage.findOne({ slug: req.params.slug })

      if (!stage) {
        return res.status(404).json({ message: "Stage not found" })
      }

      const { name, description, orderNumber } = req.body

      // Validate order number if provided and different from current
      if (orderNumber && orderNumber !== stage.orderNumber) {
        const isValidOrder = await validateOrderNumber(Stage, orderNumber, stage.slug)
        if (!isValidOrder) {
          return res.status(400).json({
            message: "This order number is already in use. Please choose a unique order number.",
          })
        }
      }

      // Update fields
      stage.name = name
      stage.description = description
      if (orderNumber) stage.orderNumber = orderNumber

      await stage.save()

      res.json({
        message: "Stage updated successfully",
        stage,
      })
    } catch (error) {
      console.error("Error updating stage:", error)
      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0]
        return res.status(400).json({
          message: `${field} already exists`,
        })
      }
      res.status(500).json({ message: "Server error", error: error.message })
    }
  },
)

// Delete stage
router.delete("/:slug", async (req, res) => {
  try {
    // Check permissions
    const permissions = await determinePermissions(req.user || null, "stage_list")
    if (!permissions.canDelete) {
      return res.status(403).json({ message: "Permission denied" })
    }

    const stage = await Stage.findOne({ slug: req.params.slug })

    if (!stage) {
      return res.status(404).json({ message: "Stage not found" })
    }

    await stage.deleteOne()

    res.json({ message: "Stage deleted successfully" })
  } catch (error) {
    console.error("Error deleting stage:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
})

// Get stage details by ID (equivalent to get_stage_details view)
router.get("/details/:id", async (req, res) => {
  try {
    const stage = await Stage.findById(req.params.id)

    if (!stage) {
      return res.status(404).json({ error: "Stage not found" })
    }

    const stageData = {
      name: stage.name,
      description: stage.description,
      orderNumber: stage.orderNumber,
    }

    res.json(stageData)
  } catch (error) {
    console.error("Error fetching stage details:", error)
    res.status(500).json({ error: "Server error" })
  }
})

module.exports = router