// const express = require('express');
// const router = express.Router();
// const drugShipmentController = require('../controllers/drugShipmentController');
// const {
//     validateCreateShipment,
//     validateUpdateShipment,
//     validateGetShipmentById,
//     validateQueryParams,
//     validateBulkUpdate,
//     validateStudyParam,
//     validateSiteParam
// } = require('../middleware/shipmentValidation');
// const { protect, authorize } = require("../middleware/auth")



// // All routes are protected
// router.use(protect)

// // Dashboard and statistics routes
// router.get('/dashboard/stats', 
//     authorize('admin'), 
//     drugShipmentController.getDashboardStats
// );

// // Bulk operations
// router.patch('/bulk-update', 
//     authorize('admin'), 
//     validateBulkUpdate, 
//     drugShipmentController.bulkUpdateShipments
// );

// // Main CRUD routes
// router.get('/', 
//     validateQueryParams, 
//     drugShipmentController.getAllShipments
// );

// router.get('/:id', 
//     validateGetShipmentById, 
//     drugShipmentController.getShipmentById
// );

// router.post('/', 
//     authorize('admin'), 
//     validateCreateShipment, 
//     drugShipmentController.createShipment
// );

// router.put('/:id', 
//     authorize('admin'), 
//     validateUpdateShipment, 
//     drugShipmentController.updateShipment
// );

// router.delete('/:id', 
//     authorize('admin'), 
//     validateGetShipmentById, 
//     drugShipmentController.deleteShipment
// );

// // Specific functionality routes
// router.get('/:id/stats', 
//     validateGetShipmentById, 
//     drugShipmentController.getShipmentStats
// );

// router.get('/:id/acknowledgment-status', 
//     validateGetShipmentById, 
//     drugShipmentController.checkAcknowledgmentStatus
// );

// // Study and site specific routes
// router.get('/study/:studyId', 
//     validateStudyParam, 
//     validateQueryParams, 
//     drugShipmentController.getShipmentsByStudy
// );

// router.get('/site/:siteId', 
//     validateSiteParam, 
//     validateQueryParams, 
//     drugShipmentController.getShipmentsBySite
// );

// // Error handling middleware
// router.use((error, req, res, next) => {
//     console.error('Drug Shipment Route Error:', error);
//     res.status(500).json({
//         success: false,
//         message: 'Internal server error',
//         error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
//     });
// });

// module.exports = router;