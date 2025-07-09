const express = require("express")
const { getDashboardStats, getRecentActivity } = require("../controllers/dashboard")
const { protect, authorize } = require("../middleware/auth")

const router = express.Router()

// All routes are protected
router.use(protect)

// Routes
router.get("/stats", getDashboardStats)
router.get("/activity", getRecentActivity)

module.exports = router
