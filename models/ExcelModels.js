const mongoose = require('mongoose');
const { Schema } = mongoose;

// ExcelFile Model
const excelFileSchema = new Schema({
  // Add the missing excel_name field
  excel_name: {
    type: String,
    required: true,
    default: "Unnamed Excel"
  },
  file: {
    type: String, // Store file path/URL
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  selectedColumns: {
    type: Schema.Types.Mixed, // Equivalent to JSONField
    default: null
  },
  temporary: {
    type: Boolean,
    default: true
  },
  // Add the missing Studies/selectedStudies field
  Studies: [{
    type: Schema.Types.ObjectId,
    ref: 'Study'
  }],
  selectedStudies: [{
    type: Schema.Types.ObjectId,
    ref: 'Study'
  }],
  // Add isActive field that your frontend expects
  isActive: {
    type: Boolean,
    default: true
  },
  // Add date fields that your frontend expects
  date_created: {
    type: Date,
    default: Date.now
  },
  last_updated: {
    type: Date,
    default: Date.now
  },
  // Add uniqueId field if needed
  uniqueId: {
    type: String,
    unique: true,
    sparse: true
  },
  // Add flag to track if file is actually uploaded
  fileUploaded: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

// Pre-save middleware to update last_updated and sync study fields
excelFileSchema.pre('save', async function(next) {
  // Update last_updated on every save
  this.last_updated = new Date();
  
  // Sync Studies and selectedStudies fields
  if (this.Studies && this.Studies.length > 0 && (!this.selectedStudies || this.selectedStudies.length === 0)) {
    this.selectedStudies = this.Studies;
  } else if (this.selectedStudies && this.selectedStudies.length > 0 && (!this.Studies || this.Studies.length === 0)) {
    this.Studies = this.selectedStudies;
  }
  
  // Handle file saving only if it's an actual uploaded file and not a placeholder
  if (this.file && this.isNew && !this.file.startsWith('uploads/excel_files/pending_')) {
    // Import utility function (lazy loading to avoid circular dependency)
    try {
      const { saveExcelFile } = require('./RM_utils');
      const savedPath = await saveExcelFile(this.file);
      this.file = savedPath;
      this.fileUploaded = true;
    } catch (error) {
      console.warn('saveExcelFile utility not found or failed, using original file path:', error.message);
    }
  }
  
  next();
});

// Instance method to get absolute URL
excelFileSchema.methods.getAbsoluteUrl = function() {
  return `/excel_file_manager/${this._id}`;
};

// Custom toString method
excelFileSchema.methods.toString = function() {
  return this.excel_name || this.file || 'Unnamed Excel';
};

// Add virtual for studyCount
excelFileSchema.virtual('studyCount').get(function() {
  return (this.selectedStudies && this.selectedStudies.length) || 
         (this.Studies && this.Studies.length) || 0;
});

// Ensure virtual fields are serialized
excelFileSchema.set('toJSON', { virtuals: true });
excelFileSchema.set('toObject', { virtuals: true });

const ExcelFile = mongoose.model('ExcelFile', excelFileSchema);

// ExcelDataRow Model
const excelDataRowSchema = new Schema({
  excelFile: {
    type: Schema.Types.ObjectId,
    ref: 'ExcelFile',
    required: true
  },
  rowData: {
    type: Schema.Types.Mixed, // Equivalent to JSONField
    required: true
  },
  studies: [{
    type: Schema.Types.ObjectId,
    ref: 'Study' // Assuming Study model exists
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  sent: {
    type: Boolean,
    default: false
  },
  // OneToOne relationship with ClinicalData
  clinicalData: {
    type: Schema.Types.ObjectId,
    ref: 'ClinicalData',
    default: null
  }
}, {
  timestamps: true
});

// Instance method to mark as sent
excelDataRowSchema.methods.markAsSent = function() {
  this.sent = true;
  return this.save();
};

// Custom toString method
excelDataRowSchema.methods.toString = function() {
  return `Row from ${this.excelFile}`;
};

// Index for better query performance
excelDataRowSchema.index({ excelFile: 1 });
excelDataRowSchema.index({ sent: 1 });
excelDataRowSchema.index({ clinicalData: 1 }, { unique: true, sparse: true }); // Ensures OneToOne relationship

const ExcelDataRow = mongoose.model('ExcelDataRow', excelDataRowSchema);

module.exports = {
  ExcelFile,
  ExcelDataRow
};