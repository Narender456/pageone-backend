const { ExcelFile, ExcelDataRow } = require('../models/ExcelModels');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');

// Configure multer for file uploads (preserves all uploaded files)
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const uploadDir = 'uploads/excel_files/';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      console.log('Directory creation info:', error.message);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept only Excel files
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed!'), false);
    }
  }
});

class ExcelFileController {

  // Create Excel file entry
  static async createExcel(req, res) {
      try {
    const { excel_name, fileId, selectedStudies = [], isActive = true } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: "Missing fileId. Upload the file first." });
    }

    const file = await ExcelFile.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: "Uploaded Excel file not found" });
    }

    // Update metadata
    file.excel_name = excel_name || file.fileName || "Unnamed Excel";
    file.selectedStudies = selectedStudies;
    file.Studies = selectedStudies;
    file.isActive = isActive;
    file.last_updated = new Date();

    await file.save();

    const populated = await ExcelFile.findById(file._id)
    .populate("Studies", "study_name protocol_number study_title")
    .populate("selectedStudies", "study_name protocol_number study_title");


    res.status(200).json({
      message: "Excel metadata saved successfully",
      excel: populated,
    });
  } catch (error) {
    console.error("Create Excel Error:", error);
    res.status(500).json({ error: "Failed to save Excel metadata", details: error.message });
  }
  }
  
  // Upload Excel file
  static async uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const originalName = req.file.originalname;
    const filePath = req.file.path;

    const newFile = new ExcelFile({
      fileName: originalName,
      filePath: filePath, // ✅ this should point to uploaded location
      temporary: req.body.temporary === "true", // Parse string to boolean
    });

    const savedFile = await newFile.save();

    res.status(201).json({
      message: "File uploaded successfully",
      file: savedFile,
      fileId: savedFile._id,
      fileUrl: savedFile.getAbsoluteUrl?.() || null,
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Failed to upload Excel file", details: error.message });
  }
  }

  // Get all Excel files
  static async getAllFiles(req, res) {
    try {
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Create sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
      
      // Get files with pagination
      const files = await ExcelFile.find()
        .populate("Studies", "study_name protocol_number study_title")
        .populate("selectedStudies", "study_name protocol_number study_title")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
      
      // Get total count for pagination
      const total = await ExcelFile.countDocuments();
      
      res.json({
        files,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get Excel file by ID
  static async getFileById(req, res) {
    try {
      const file = await ExcelFile.findById(req.params.id)
        .populate('Studies', 'study_name name')
        .populate('selectedStudies', 'study_name name');
      
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.json(file);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Update Excel file
  static async updateFile(req, res) {
    try {
      const { excel_name, selectedColumns, selectedStudies, Studies, temporary, isActive } = req.body;
      
      // Prepare update object
      const updateData = {};
      
      if (excel_name !== undefined) updateData.excel_name = excel_name;
      if (selectedColumns !== undefined) updateData.selectedColumns = selectedColumns;
      if (temporary !== undefined) updateData.temporary = temporary;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      // Handle studies update
      const studiesArray = selectedStudies || Studies;
      if (studiesArray !== undefined) {
        updateData.Studies = studiesArray;
        updateData.selectedStudies = studiesArray;
      }
      
      // Update last_updated timestamp
      updateData.last_updated = new Date();
      
      const file = await ExcelFile.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).populate('Studies', 'study_name name')
       .populate('selectedStudies', 'study_name name');

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.json({
        message: 'File updated successfully',
        file
      });
    } catch (error) {
      console.error('Update File Error:', error);
      res.status(500).json({ 
        error: error.message,
        details: 'Failed to update Excel file'
      });
    }
  }

  // Delete Excel file (database record only, keeps physical file)
  static async deleteFile(req, res) {
    try {
      const file = await ExcelFile.findById(req.params.id);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Delete associated data rows
      await ExcelDataRow.deleteMany({ excelFile: file._id });

      // NOTE: Physical file is preserved in uploads directory
      // Only delete the database record
      await ExcelFile.findByIdAndDelete(req.params.id);

      res.json({ 
        message: 'File record deleted successfully (physical file preserved)',
        preservedFile: file.file
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Toggle status
  static async toggleStatus(req, res) {
    try {
      const excel = await ExcelFile.findById(req.params.id);
      
      if (!excel) {
        return res.status(404).json({ error: 'Excel file not found' });
      }
      
      // Toggle the isActive status
      excel.isActive = !excel.isActive;
      excel.last_updated = new Date();
      
      await excel.save();
      
      // Return the updated excel with populated studies
      const updatedExcel = await ExcelFile.findById(excel._id)
        .populate('Studies', 'study_name name')
        .populate('selectedStudies', 'study_name name');
      
      res.json({
        message: `Excel ${excel.isActive ? 'activated' : 'deactivated'} successfully`,
        excel: updatedExcel
      });
    } catch (error) {
      console.error('Toggle Status Error:', error);
      res.status(500).json({ 
        error: error.message,
        details: 'Failed to toggle Excel status'
      });
    }
  }

  // Get stats
  static async getStats(req, res) {
    try {
      const totalExcels = await ExcelFile.countDocuments();
      const activeExcels = await ExcelFile.countDocuments({ isActive: true });
      
      // Count total studies (unique studies across all excel files)
      const excelFiles = await ExcelFile.find();
      const allStudies = new Set();
      excelFiles.forEach(file => {
        if (Array.isArray(file.selectedStudies)) {
          file.selectedStudies.forEach(study => allStudies.add(study.toString()));
        }
      });
      
      // Count recent excels (created within the last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentExcels = await ExcelFile.countDocuments({ 
        createdAt: { $gte: weekAgo }
      });
      
      res.json({
        totalExcels,
        activeExcels,
        totalStudies: allStudies.size,
        recentExcels
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Parse Excel file and extract data
  static async parseFile(req, res) {
    try {
      const file = await ExcelFile.findById(req.params.id);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Check if file exists
      const filePath = path.resolve(file.file);
      try {
        await fs.access(filePath);
      } catch (error) {
        return res.status(404).json({ error: 'Physical file not found' });
      }

      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0]; // Get first sheet
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      res.json({
        sheetNames: workbook.SheetNames,
        data: jsonData,
        columns: jsonData.length > 0 ? Object.keys(jsonData[0]) : []
      });
    } catch (error) {
      console.error('Parse File Error:', error);
      res.status(500).json({ 
        error: error.message,
        details: 'Failed to parse Excel file'
      });
    }
  }
}

class ExcelDataRowController {

 // Create data rows from Excel file - FIXED VERSION
static async createRowsFromFile(req, res) {
  try {
    const { fileId, studyIds } = req.body;

    // Validate input
    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const file = await ExcelFile.findById(fileId);
    if (!file || !file.filePath) {
      return res.status(404).json({ error: 'Excel file not found or missing filePath' });
    }

    // Get the absolute file path
    const filePath = path.resolve(file.filePath);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      console.error('File access error:', error);
      return res.status(404).json({ 
        error: 'Physical file not found',
        details: `File path: ${filePath}`
      });
    }

    // Read and parse Excel file
    let workbook, jsonData;
    try {
      workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        return res.status(400).json({ error: 'No sheets found in Excel file' });
      }

      const worksheet = workbook.Sheets[sheetName];
      jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonData || jsonData.length === 0) {
        return res.status(400).json({ error: 'No data found in Excel file' });
      }
    } catch (error) {
      console.error('Excel parsing error:', error);
      return res.status(400).json({ 
        error: 'Failed to parse Excel file',
        details: error.message
      });
    }

    // Create data rows
    const dataRows = [];
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      try {
        const rowData = jsonData[i];

        if (!rowData || Object.keys(rowData).length === 0) continue;

        const excelDataRow = new ExcelDataRow({
          excelFile: fileId,
          rowData,
          studies: studyIds || []
        });

        const savedRow = await excelDataRow.save();
        dataRows.push(savedRow);
      } catch (error) {
        console.error(`Error creating row ${i}:`, error);
        errors.push({
          row: i,
          error: error.message
        });
      }
    }

    // Update Excel file status
    await ExcelFile.findByIdAndUpdate(fileId, {
      temporary: false,
      last_updated: new Date()
    });

    const response = {
      message: `Successfully created ${dataRows.length} data rows from Excel file`,
      totalRows: jsonData.length,
      createdRows: dataRows.length,
      skippedRows: jsonData.length - dataRows.length,
      rows: dataRows
    };

    if (errors.length > 0) {
      response.errors = errors;
      response.message += ` (${errors.length} errors occurred)`;
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('Create Rows From File Error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to create data rows from Excel file'
    });
  }
}


  // Get all data rows
  static async getAllRows(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter = {};
      if (req.query.fileId) filter.excelFile = req.query.fileId;
      if (req.query.sent !== undefined) filter.sent = req.query.sent === 'true';

      const rows = await ExcelDataRow.find(filter)
        .populate('excelFile', 'excel_name file uploadedAt')
        .populate('studies', 'name study_name')
        .populate('clinicalData')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ExcelDataRow.countDocuments(filter);

      res.json({
        rows,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get data row by ID
  static async getRowById(req, res) {
    try {
      const row = await ExcelDataRow.findById(req.params.id)
        .populate('excelFile')
        .populate('studies')
        .populate('clinicalData');

      if (!row) {
        return res.status(404).json({ error: 'Data row not found' });
      }

      res.json(row);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Update data row
  static async updateRow(req, res) {
    try {
      const { rowData, studyIds, clinicalDataId } = req.body;

      const updateData = {};
      if (rowData) updateData.rowData = rowData;
      if (studyIds) updateData.studies = studyIds;
      if (clinicalDataId !== undefined) updateData.clinicalData = clinicalDataId;

      const row = await ExcelDataRow.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).populate('excelFile studies clinicalData');

      if (!row) {
        return res.status(404).json({ error: 'Data row not found' });
      }

      res.json({
        message: 'Data row updated successfully',
        row
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Mark row as sent
  static async markRowAsSent(req, res) {
    try {
      const row = await ExcelDataRow.findById(req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Data row not found' });
      }

      await row.markAsSent();

      res.json({
        message: 'Row marked as sent',
        row
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Mark multiple rows as sent
  static async markMultipleRowsAsSent(req, res) {
    try {
      const { rowIds } = req.body;

      if (!Array.isArray(rowIds) || rowIds.length === 0) {
        return res.status(400).json({ error: 'Please provide an array of row IDs' });
      }

      const result = await ExcelDataRow.updateMany(
        { _id: { $in: rowIds } },
        { sent: true }
      );

      res.json({
        message: `Marked ${result.modifiedCount} rows as sent`,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Delete data row
  static async deleteRow(req, res) {
    try {
      const row = await ExcelDataRow.findByIdAndDelete(req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Data row not found' });
      }

      res.json({ message: 'Data row deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get rows by study
  static async getRowsByStudy(req, res) {
    try {
      const { studyId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const rows = await ExcelDataRow.find({ studies: studyId })
        .populate('excelFile', 'excel_name file uploadedAt')
        .populate('clinicalData')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await ExcelDataRow.countDocuments({ studies: studyId });

      res.json({
        rows,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

// Export upload middleware and controllers
module.exports = {
  ExcelFileController,
  ExcelDataRowController,
  upload
};