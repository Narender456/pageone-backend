const express = require("express")
const router = express.Router()
const pagesController = require("../controllers/pages")
const { protect, authorize } = require("../middleware/auth")
const { validateRequest } = require("../middleware/validation")


// Apply authentication middleware to all routes
router.use(protect)


// Page CRUD routes
router.get("/", pagesController.getPages)
router.post("/", authorize("admin"), validateRequest, pagesController.createPage)
router.get("/:slug", pagesController.getPage)
router.put("/:slug", authorize("admin"), validateRequest, pagesController.updatePage)
router.delete("/:slug", pagesController.deletePage)

// Page loading and viewing
router.get("/load/:slug", pagesController.loadPage)
router.get("/view/:slug", pagesController.viewPage)

// Page saving - FIXED: Changed from savePage to savePageContent
router.post("/save", authorize("admin"), validateRequest, pagesController.savePageContent)

// Phase transitions
router.post("/move-to-testing/:slug", authorize("admin"), validateRequest, pagesController.moveToTesting)
router.post("/move-to-migrate/:slug", authorize("admin"), validateRequest, pagesController.moveToMigrate)
router.post("/move-to-live/:slug", authorize("admin"), validateRequest, pagesController.moveToLive)
router.post("/move-to-development/:slug", authorize("admin"), validateRequest, pagesController.moveToDevelopment)
router.post("/mark-testing-passed/:slug", authorize("admin"), validateRequest, pagesController.markTestingPassed)

// Page management
router.post("/toggle-freeze/:slug", authorize("admin"), validateRequest, pagesController.toggleFreezePage)

// Utility routes - FIXED: Changed from fetchShipments to getShipments
router.get("/fetch-shipments", authorize("admin"), validateRequest, pagesController.getShipments)

module.exports = router