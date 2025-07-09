const DrugShipment = require('../models/DrugShipment');
const Study = require('../models/Study');
const Site = require('../models/Site');
const DrugGroup = require('../models/DrugGroup');
const Drug = require('../models/Drugs');
const ExcelDataRow = require('../models/ExcelModels');
const { getShipmentStats } = require('../utils/shipmentUtils');
const { validationResult } = require('express-validator');

class DrugShipmentController {
    /**
     * Get all drug shipments with pagination and filtering
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAllShipments(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            
            // Build filter object
            const filter = {};
            if (req.query.study) filter.study = req.query.study;
            if (req.query.siteNumber) filter.siteNumber = req.query.siteNumber;
            if (req.query.selectType) filter.selectType = req.query.selectType;
            if (req.query.shipmentNumber) {
                filter.shipmentNumber = { $regex: req.query.shipmentNumber, $options: 'i' };
            }
            
            // Date range filter
            if (req.query.startDate || req.query.endDate) {
                filter.shipmentDate = {};
                if (req.query.startDate) {
                    filter.shipmentDate.$gte = new Date(req.query.startDate);
                }
                if (req.query.endDate) {
                    filter.shipmentDate.$lte = new Date(req.query.endDate);
                }
            }
            
            const shipments = await DrugShipment.find(filter)
                .populate('study', 'name studyCode')
                .populate('siteNumber', 'siteNumber siteName')
                .populate('groupName', 'name')
                .populate('drug', 'name code')
                .sort({ dateCreated: -1 })
                .skip(skip)
                .limit(limit);
            
            const total = await DrugShipment.countDocuments(filter);
            
            res.json({
                success: true,
                data: shipments,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('Error fetching shipments:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching shipments',
                error: error.message
            });
        }
    }
    
    /**
     * Get a single drug shipment by ID or slug
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getShipmentById(req, res) {
        try {
            const { id } = req.params;
            
            // Try to find by slug first, then by ID
            let shipment = await DrugShipment.findOne({ slug: id })
                .populate('study', 'name studyCode')
                .populate('siteNumber', 'siteNumber siteName')
                .populate('groupName', 'name description')
                .populate('drug', 'name code description')
                .populate('excelRows');
            
            if (!shipment) {
                shipment = await DrugShipment.findById(id)
                    .populate('study', 'name studyCode')
                    .populate('siteNumber', 'siteNumber siteName')
                    .populate('groupName', 'name description')
                    .populate('drug', 'name code description')
                    .populate('excelRows');
            }
            
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }
            
            // Get shipment statistics
            const stats = await getShipmentStats(shipment._id);
            
            res.json({
                success: true,
                data: shipment,
                stats
            });
        } catch (error) {
            console.error('Error fetching shipment:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching shipment',
                error: error.message
            });
        }
    }
    
    /**
     * Create a new drug shipment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async createShipment(req, res) {
        try {
            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }
            
            const shipmentData = {
                study: req.body.study,
                siteNumber: req.body.siteNumber,
                shipmentDate: req.body.shipmentDate || new Date(),
                selectType: req.body.selectType || 'DrugGroup'
            };
            
            // Add type-specific data
            if (req.body.selectType === 'DrugGroup' && req.body.groupName) {
                shipmentData.groupName = req.body.groupName;
            } else if (req.body.selectType === 'Drug' && req.body.drug) {
                shipmentData.drug = req.body.drug;
            } else if (req.body.selectType === 'Randomization' && req.body.excelRows) {
                shipmentData.excelRows = req.body.excelRows;
            }
            
            const shipment = new DrugShipment(shipmentData);
            await shipment.save();
            
            // Populate the created shipment
            const populatedShipment = await DrugShipment.findById(shipment._id)
                .populate('study', 'name studyCode')
                .populate('siteNumber', 'siteNumber siteName')
                .populate('groupName', 'name')
                .populate('drug', 'name code')
                .populate('excelRows');
            
            res.status(201).json({
                success: true,
                message: 'Shipment created successfully',
                data: populatedShipment
            });
        } catch (error) {
            console.error('Error creating shipment:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating shipment',
                error: error.message
            });
        }
    }
    
    /**
     * Update an existing drug shipment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async updateShipment(req, res) {
        try {
            const { id } = req.params;
            
            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
            }
            
            const updateData = { ...req.body };
            delete updateData.shipmentNumber; // Prevent updating shipment number
            delete updateData.uniqueId; // Prevent updating unique ID
            delete updateData.slug; // Prevent updating slug
            
            const shipment = await DrugShipment.findByIdAndUpdate(
                id,
                updateData,
                { new: true, runValidators: true }
            )
                .populate('study', 'name studyCode')
                .populate('siteNumber', 'siteNumber siteName')
                .populate('groupName', 'name')
                .populate('drug', 'name code')
                .populate('excelRows');
            
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Shipment updated successfully',
                data: shipment
            });
        } catch (error) {
            console.error('Error updating shipment:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating shipment',
                error: error.message
            });
        }
    }
    
    /**
     * Delete a drug shipment
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async deleteShipment(req, res) {
        try {
            const { id } = req.params;
            
            const shipment = await DrugShipment.findByIdAndDelete(id);
            
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Shipment deleted successfully',
                data: shipment
            });
        } catch (error) {
            console.error('Error deleting shipment:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting shipment',
                error: error.message
            });
        }
    }
    
    /**
     * Get shipment statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getShipmentStats(req, res) {
        try {
            const { id } = req.params;
            
            const shipment = await DrugShipment.findById(id);
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }
            
            const stats = await getShipmentStats(id);
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error fetching shipment stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching shipment stats',
                error: error.message
            });
        }
    }
    
    /**
     * Check acknowledgment status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async checkAcknowledgmentStatus(req, res) {
        try {
            const { id } = req.params;
            
            const shipment = await DrugShipment.findById(id)
                .populate('excelRows');
            
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }
            
            const isAcknowledged = await shipment.isAcknowledged();
            
            res.json({
                success: true,
                data: {
                    shipmentId: shipment._id,
                    shipmentNumber: shipment.shipmentNumber,
                    isAcknowledged,
                    acknowledgedAt: isAcknowledged ? new Date() : null
                }
            });
        } catch (error) {
            console.error('Error checking acknowledgment status:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking acknowledgment status',
                error: error.message
            });
        }
    }
    
    /**
     * Get shipments by study
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getShipmentsByStudy(req, res) {
        try {
            const { studyId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            
            const shipments = await DrugShipment.find({ study: studyId })
                .populate('siteNumber', 'siteNumber siteName')
                .populate('groupName', 'name')
                .populate('drug', 'name code')
                .sort({ dateCreated: -1 })
                .skip(skip)
                .limit(limit);
            
            const total = await DrugShipment.countDocuments({ study: studyId });
            
            res.json({
                success: true,
                data: shipments,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('Error fetching shipments by study:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching shipments by study',
                error: error.message
            });
        }
    }
    
    /**
     * Get shipments by site
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getShipmentsBySite(req, res) {
        try {
            const { siteId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            
            const shipments = await DrugShipment.find({ siteNumber: siteId })
                .populate('study', 'name studyCode')
                .populate('groupName', 'name')
                .populate('drug', 'name code')
                .sort({ dateCreated: -1 })
                .skip(skip)
                .limit(limit);
            
            const total = await DrugShipment.countDocuments({ siteNumber: siteId });
            
            res.json({
                success: true,
                data: shipments,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('Error fetching shipments by site:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching shipments by site',
                error: error.message
            });
        }
    }
    
    /**
     * Bulk update shipment status
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async bulkUpdateShipments(req, res) {
        try {
            const { shipmentIds, updateData } = req.body;
            
            if (!shipmentIds || !Array.isArray(shipmentIds) || shipmentIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Shipment IDs array is required'
                });
            }
            
            const result = await DrugShipment.updateMany(
                { _id: { $in: shipmentIds } },
                updateData,
                { runValidators: true }
            );
            
            res.json({
                success: true,
                message: `${result.modifiedCount} shipments updated successfully`,
                data: {
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount
                }
            });
        } catch (error) {
            console.error('Error bulk updating shipments:', error);
            res.status(500).json({
                success: false,
                message: 'Error bulk updating shipments',
                error: error.message
            });
        }
    }
    
    /**
     * Get dashboard statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getDashboardStats(req, res) {
        try {
            const totalShipments = await DrugShipment.countDocuments();
            const pendingShipments = await DrugShipment.countDocuments({
                // Add your pending criteria here
            });
            
            const shipmentsByType = await DrugShipment.aggregate([
                {
                    $group: {
                        _id: '$selectType',
                        count: { $sum: 1 }
                    }
                }
            ]);
            
            const recentShipments = await DrugShipment.find()
                .populate('study', 'name')
                .populate('siteNumber', 'siteNumber siteName')
                .sort({ dateCreated: -1 })
                .limit(5);
            
            res.json({
                success: true,
                data: {
                    totalShipments,
                    pendingShipments,
                    shipmentsByType,
                    recentShipments
                }
            });
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching dashboard stats',
                error: error.message
            });
        }
    }
}

module.exports = new DrugShipmentController();