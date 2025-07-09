const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

// Custom validator for MongoDB ObjectId
const isValidObjectId = (value) => {
    return mongoose.Types.ObjectId.isValid(value);
};

// Validation rules for creating a shipment
const validateCreateShipment = [
    body('study')
        .optional()
        .custom(isValidObjectId)
        .withMessage('Study must be a valid ObjectId'),
    
    body('siteNumber')
        .optional()
        .custom(isValidObjectId)
        .withMessage('Site number must be a valid ObjectId'),
    
    body('shipmentDate')
        .optional()
        .isISO8601()
        .withMessage('Shipment date must be a valid ISO 8601 date'),
    
    body('selectType')
        .isIn(['DrugGroup', 'Drug', 'Randomization'])
        .withMessage('Select type must be DrugGroup, Drug, or Randomization'),
    
    body('groupName')
        .if(body('selectType').equals('DrugGroup'))
        .isArray({ min: 1 })
        .withMessage('Group name must be an array with at least one item when select type is DrugGroup')
        .custom((value) => {
            return value.every(id => isValidObjectId(id));
        })
        .withMessage('All group name IDs must be valid ObjectIds'),
    
    body('drug')
        .if(body('selectType').equals('Drug'))
        .isArray({ min: 1 })
        .withMessage('Drug must be an array with at least one item when select type is Drug')
        .custom((value) => {
            return value.every(id => isValidObjectId(id));
        })
        .withMessage('All drug IDs must be valid ObjectIds'),
    
    body('excelRows')
        .if(body('selectType').equals('Randomization'))
        .isArray({ min: 1 })
        .withMessage('Excel rows must be an array with at least one item when select type is Randomization')
        .custom((value) => {
            return value.every(id => isValidObjectId(id));
        })
        .withMessage('All excel row IDs must be valid ObjectIds')
];

// Validation rules for updating a shipment
const validateUpdateShipment = [
    param('id')
        .custom(isValidObjectId)
        .withMessage('Shipment ID must be a valid ObjectId'),
    
    body('study')
        .optional()
        .custom(isValidObjectId)
        .withMessage('Study must be a valid ObjectId'),
    
    body('siteNumber')
        .optional()
        .custom(isValidObjectId)
        .withMessage('Site number must be a valid ObjectId'),
    
    body('shipmentDate')
        .optional()
        .isISO8601()
        .withMessage('Shipment date must be a valid ISO 8601 date'),
    
    body('selectType')
        .optional()
        .isIn(['DrugGroup', 'Drug', 'Randomization'])
        .withMessage('Select type must be DrugGroup, Drug, or Randomization'),
    
    body('groupName')
        .optional()
        .if(body('selectType').equals('DrugGroup'))
        .isArray({ min: 1 })
        .withMessage('Group name must be an array with at least one item when select type is DrugGroup')
        .custom((value) => {
            return value.every(id => isValidObjectId(id));
        })
        .withMessage('All group name IDs must be valid ObjectIds'),
    
    body('drug')
        .optional()
        .if(body('selectType').equals('Drug'))
        .isArray({ min: 1 })
        .withMessage('Drug must be an array with at least one item when select type is Drug')
        .custom((value) => {
            return value.every(id => isValidObjectId(id));
        })
        .withMessage('All drug IDs must be valid ObjectIds'),
    
    body('excelRows')
        .optional()
        .if(body('selectType').equals('Randomization'))
        .isArray({ min: 1 })
        .withMessage('Excel rows must be an array with at least one item when select type is Randomization')
        .custom((value) => {
            return value.every(id => isValidObjectId(id));
        })
        .withMessage('All excel row IDs must be valid ObjectIds')
];

// Validation rules for getting shipment by ID
const validateGetShipmentById = [
    param('id')
        .notEmpty()
        .withMessage('Shipment ID is required')
        .custom((value) => {
            // Allow both ObjectId and slug
            return isValidObjectId(value) || typeof value === 'string';
        })
        .withMessage('Shipment ID must be a valid ObjectId or slug')
];

// Validation rules for query parameters
const validateQueryParams = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    
    query('study')
        .optional()
        .custom(isValidObjectId)
        .withMessage('Study filter must be a valid ObjectId'),
    
    query('siteNumber')
        .optional()
        .custom(isValidObjectId)
        .withMessage('Site number filter must be a valid ObjectId'),
    
    query('selectType')
        .optional()
        .isIn(['DrugGroup', 'Drug', 'Randomization'])
        .withMessage('Select type filter must be DrugGroup, Drug, or Randomization'),
    
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    
    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
];

// Validation rules for bulk update
const validateBulkUpdate = [
    body('shipmentIds')
        .isArray({ min: 1 })
        .withMessage('Shipment IDs must be an array with at least one item')
        .custom((value) => {
            return value.every(id => isValidObjectId(id));
        })
        .withMessage('All shipment IDs must be valid ObjectIds'),
    
    body('updateData')
        .isObject()
        .withMessage('Update data must be an object')
        .custom((value) => {
            // Prevent updating protected fields
            const protectedFields = ['shipmentNumber', 'uniqueId', 'slug', '_id'];
            return !protectedFields.some(field => field in value);
        })
        .withMessage('Cannot update protected fields (shipmentNumber, uniqueId, slug, _id)')
];

// Validation rules for study/site specific queries
const validateStudyParam = [
    param('studyId')
        .custom(isValidObjectId)
        .withMessage('Study ID must be a valid ObjectId')
];

const validateSiteParam = [
    param('siteId')
        .custom(isValidObjectId)
        .withMessage('Site ID must be a valid ObjectId')
];

module.exports = {
    validateCreateShipment,
    validateUpdateShipment,
    validateGetShipmentById,
    validateQueryParams,
    validateBulkUpdate,
    validateStudyParam,
    validateSiteParam
};