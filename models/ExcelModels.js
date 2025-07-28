const mongoose = require('mongoose');
const { Schema } = mongoose;

// ExcelFile Model
const excelFileSchema = new Schema({
  excel_name: {
    type: String,
    required: false, // Allow empty during initial upload
    default: "Unnamed Excel"
  },
  filePath: {
    type: String, // Store actual file system path
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  selectedColumns: {
    type: Schema.Types.Mixed,
    default: null
  },
  temporary: {
    type: Boolean,
    default: true
  },
  Studies: [{
    type: Schema.Types.ObjectId,
    ref: 'Study'
  }],
  selectedStudies: [{
    type: Schema.Types.ObjectId,
    ref: 'Study'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  date_created: {
    type: Date,
    default: Date.now
  },
  last_updated: {
    type: Date,
    default: Date.now
  },
  uniqueId: {
    type: String,
    unique: true,
    sparse: true
  },
  fileUploaded: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Pre-save middleware
excelFileSchema.pre('save', async function(next) {
  this.last_updated = new Date();

  // Sync Studies and selectedStudies if only one is provided
  if (this.Studies && this.Studies.length > 0 && (!this.selectedStudies || this.selectedStudies.length === 0)) {
    this.selectedStudies = this.Studies;
  } else if (this.selectedStudies && this.selectedStudies.length > 0 && (!this.Studies || this.Studies.length === 0)) {
    this.Studies = this.selectedStudies;
  }

  // Save file to permanent location if it's new
  if (this.filePath && this.isNew && !this.filePath.startsWith('uploads/excel_files/')) {
    try {
      const { saveExcelFile } = require('./RM_utils');
      const savedPath = await saveExcelFile(this.filePath);
      this.filePath = savedPath;
      this.fileUploaded = true;
    } catch (error) {
      console.warn('saveExcelFile failed:', error.message);
    }
  }

  next();
});

// Instance Methods
excelFileSchema.methods.getAbsoluteUrl = function() {
  return `/excel_file_manager/${this._id}`;
};

excelFileSchema.methods.toString = function() {
  return this.excel_name || this.filePath || 'Unnamed Excel';
};

excelFileSchema.virtual('studyCount').get(function() {
  return (this.selectedStudies?.length || this.Studies?.length || 0);
});

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
    type: Schema.Types.Mixed,
    required: true
  },
  studies: [{
    type: Schema.Types.ObjectId,
    ref: 'Study'
  }],
  sent: {
    type: Boolean,
    default: false
  },
  // clinicalData: {
  //   type: Schema.Types.ObjectId,
  //   ref: 'ClinicalData',
  //   default: null
  // }
}, {
  timestamps: true
});

// Instance Methods
excelDataRowSchema.methods.markAsSent = function() {
  this.sent = true;
  return this.save();
};

excelDataRowSchema.methods.toString = function() {
  return `Row from ${this.excelFile}`;
};

// Indexes
excelDataRowSchema.index({ excelFile: 1 });
excelDataRowSchema.index({ sent: 1 });
// excelDataRowSchema.index({ clinicalData: 1 }, { unique: true, sparse: true });

const ExcelDataRow = mongoose.model('ExcelDataRow', excelDataRowSchema);

module.exports = {
  ExcelFile,
  ExcelDataRow
};
