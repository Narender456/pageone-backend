const express = require("express")
const router = express.Router()
const pagesController = require("../controllers/pages")


// Apply authentication middleware to all routes


// Page CRUD routes
router.get("/", pagesController.getPages)
router.post("/", pagesController.createPage)
router.get("/:slug", pagesController.getPage)
router.put("/:slug", pagesController.updatePage)
router.delete("/:slug", pagesController.deletePage)

// Page loading and viewing
router.get("/load/:slug", pagesController.loadPage)
router.get("/view/:slug", pagesController.viewPage)

// Page saving - FIXED: Changed from savePage to savePageContent
router.post("/save", pagesController.savePageContent)

// Phase transitions
router.post("/move-to-testing/:slug", pagesController.moveToTesting)
router.post("/move-to-migrate/:slug", pagesController.moveToMigrate)
router.post("/move-to-live/:slug", pagesController.moveToLive)
router.post("/move-to-development/:slug", pagesController.moveToDevelopment)
router.post("/mark-testing-passed/:slug", pagesController.markTestingPassed)

// Page management
router.post("/toggle-freeze/:slug", pagesController.toggleFreezePage)

// Utility routes - FIXED: Changed from fetchShipments to getShipments
router.get("/fetch-shipments", pagesController.getShipments)

module.exports = router