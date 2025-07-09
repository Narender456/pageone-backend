const mongoose = require('mongoose');
const { generateSlugWithUUID, getCurrentTime } = require("../utils/SM_utils")

const siteSchema = new mongoose.Schema({
  siteName: {
    type: String,
    maxlength: 50,
    default: null
  },
  siteId: {
    type: String,
    maxlength: 50,
    default: null
  },
  protocolNumber: {
    type: String,
    maxlength: 100,
    default: null
  },
  piName: {
    type: String,
    maxlength: 100,
    default: null
  },
  
  // References to Study documents (Many-to-Many relationship)
  studies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Study'
  }],
  
  // References to User documents (Many-to-Many through UserSiteStudyAssignment)
  userAssignments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Utility fields
  uniqueId: {
    type: String,
    maxlength: 100,
    default: null
  },
  slug: {
    type: String,
    maxlength: 500,
    unique: true,
    default: null
  },
  dateCreated: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  // Schema options
  timestamps: true, // We're handling timestamps manually
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware (equivalent to Django's save method)
siteSchema.pre('save', async function(next) {
  try {
    if (!this.uniqueId) {
      const result = generateSlugWithUUID(this.siteName);
      this.uniqueId = result.uniqueId;
      this.slug = result.slug;
    } else {
      this.slug = generateSlugWithUUID(this.siteName, this.uniqueId).slug;
    }
    
    this.lastUpdated = getCurrentTime();
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
siteSchema.methods.toString = function() {
  return this.siteName || 'Unnamed Site';
};

siteSchema.methods.getAbsoluteUrl = function() {
  return `/sites/${this.slug}`;
};

// Static methods
siteSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug: slug });
};

// Virtual for populated studies
siteSchema.virtual('populatedStudies', {
  ref: 'Study',
  localField: 'studies',
  foreignField: '_id'
});

// Virtual for populated user assignments
siteSchema.virtual('populatedUserAssignments', {
  ref: 'User',
  localField: 'userAssignments',
  foreignField: '_id'
});

// Indexes
siteSchema.index({ slug: 1 });
siteSchema.index({ siteName: 1 });
siteSchema.index({ uniqueId: 1 });

const Site = mongoose.model('Site', siteSchema);

module.exports = Site;