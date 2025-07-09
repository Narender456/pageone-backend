const express = require('express');
const router = express.Router();
const { ExcelFileController, ExcelDataRowController, upload } = require('../controllers/excelControllers');

// Excel File Routes
router.post('/', ExcelFileController.createExcel);
router.post('/files/upload', upload.single('file'), ExcelFileController.uploadFile);
router.get('/files', ExcelFileController.getAllFiles);
router.get('/files/:id', ExcelFileController.getFileById);
router.put('/files/:id', ExcelFileController.updateFile);
router.delete('/files/:id', ExcelFileController.deleteFile);
router.get('/files/:id/parse', ExcelFileController.parseFile);
router.patch('/:id/toggle-status', ExcelFileController.toggleStatus);
// Add this to your routes
router.get('/stats', ExcelFileController.getStats);


// Excel Data Row Routes
router.post('/rows/create-from-file', ExcelDataRowController.createRowsFromFile); 
router.get('/rows', ExcelDataRowController.getAllRows);
router.get('/rows/:id', ExcelDataRowController.getRowById);
router.put('/rows/:id', ExcelDataRowController.updateRow);
router.delete('/rows/:id', ExcelDataRowController.deleteRow);
router.patch('/rows/:id/mark-sent', ExcelDataRowController.markRowAsSent);
router.patch('/rows/mark-multiple-sent', ExcelDataRowController.markMultipleRowsAsSent);
router.get('/studies/:studyId/rows', ExcelDataRowController.getRowsByStudy);

module.exports = router;

// Usage in main app.js:
/*
const excelRoutes = require('./routes/excelRoutes');
app.use('/api/excel', excelRoutes);
*/