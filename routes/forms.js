const express = require("express")
const router = express.Router()
const {
  getSiteDetails,
  submitForm,
  getNextScreeningNumber,
  checkOptionStatus,
  fetchShipmentDetails,
} = require("../controllers/forms")
const { protect } = require("../middleware/auth")

// Apply authentication to all routes
router.use(protect)

// Routes
router.get("/site-details/:slug", getSiteDetails)
router.post("/submit/:slug", submitForm)
router.get("/next-screening-number/:siteId", getNextScreeningNumber)
router.get("/check-option-status", checkOptionStatus)
router.get("/fetch-shipment-details", fetchShipmentDetails)

module.exports = router
