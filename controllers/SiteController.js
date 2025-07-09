const Site = require('../models/Site');
const Study = require('../models/Study');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const { generateSlugWithUUID, getCurrentTime } = require("../utils/SM_utils")

class SiteController {
  
  // GET /api/sites - Get all sites with pagination and filtering
static async getAllSites(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filters
    const filter = {};
    if (req.query.siteName) {
      filter.siteName = { $regex: req.query.siteName, $options: 'i' };
    }
    if (req.query.piName) {
      filter.piName = { $regex: req.query.piName, $options: 'i' };
    }
    if (req.query.protocolNumber) {
      filter.protocolNumber = { $regex: req.query.protocolNumber, $options: 'i' };
    }

    // Sorting
    const sortBy = req.query.sortBy || 'dateCreated';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const sites = await Site.find(filter)
      .populate('studies', 'study_name protocol_number study_title')
      .populate('userAssignments', 'firstName lastName email')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Site.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: sites,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching sites',
      error: error.message
    });
  }
}

  
  // GET /api/sites/:id - Get single site by ID
  static async getSiteById(req, res) {
    try {
      const site = await Site.findById(req.params.id)
        .populate('studies', 'studyName studyId description')
        .populate('userAssignments', 'firstName lastName email role');
      
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: site
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching site',
        error: error.message
      });
    }
  }
  
  // GET /api/sites/slug/:slug - Get single site by slug
  static async getSiteBySlug(req, res) {
    try {
      const site = await Site.findOne({ slug: req.params.slug })
        .populate('studies', 'studyName studyId description')
        .populate('userAssignments', 'firstName lastName email role');
      
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: site
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching site',
        error: error.message
      });
    }
  }
  
  // POST /api/sites - Create new site
  static async createSite(req, res) {
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
      
      const {
        siteName,
        siteId,
        protocolNumber,
        piName,
        studies,
        userAssignments
      } = req.body;
      
      // Check if site with same name already exists
      const existingSite = await Site.findOne({ siteName });
      if (existingSite) {
        return res.status(409).json({
          success: false,
          message: 'Site with this name already exists'
        });
      }
      
      // Validate studies exist
      if (studies && studies.length > 0) {
        const studyExists = await Study.find({ _id: { $in: studies } });
        if (studyExists.length !== studies.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more studies do not exist'
          });
        }
      }
      
      // Validate users exist
      if (userAssignments && userAssignments.length > 0) {
        const userExists = await User.find({ _id: { $in: userAssignments } });
        if (userExists.length !== userAssignments.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more users do not exist'
          });
        }
      }
      
      const site = new Site({
        siteName,
        siteId,
        protocolNumber,
        piName,
        studies: studies || [],
        userAssignments: userAssignments || []
      });
      
      await site.save();
      
      // Populate the response
      await site.populate([
        { path: 'studies', select: 'studyName studyId' },
        { path: 'userAssignments', select: 'firstName lastName email' }
      ]);
      
      res.status(201).json({
        success: true,
        message: 'Site created successfully',
        data: site
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating site',
        error: error.message
      });
    }
  }
  
  // PUT /api/sites/:id - Update site
  static async updateSite(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }
      
      const siteId = req.params.id;
      const updateData = req.body;
      
      // Check if site exists
      const existingSite = await Site.findById(siteId);
      if (!existingSite) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      // Check for duplicate site name (excluding current site)
      if (updateData.siteName) {
        const duplicateSite = await Site.findOne({
          siteName: updateData.siteName,
          _id: { $ne: siteId }
        });
        if (duplicateSite) {
          return res.status(409).json({
            success: false,
            message: 'Site with this name already exists'
          });
        }
      }
      
      // Validate studies if provided
      if (updateData.studies) {
        const studyExists = await Study.find({ _id: { $in: updateData.studies } });
        if (studyExists.length !== updateData.studies.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more studies do not exist'
          });
        }
      }
      
      // Validate users if provided
      if (updateData.userAssignments) {
        const userExists = await User.find({ _id: { $in: updateData.userAssignments } });
        if (userExists.length !== updateData.userAssignments.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more users do not exist'
          });
        }
      }
      
      const updatedSite = await Site.findByIdAndUpdate(
        siteId,
        { ...updateData, lastUpdated: new Date() },
        { new: true, runValidators: true }
      ).populate([
        { path: 'studies', select: 'studyName studyId' },
        { path: 'userAssignments', select: 'firstName lastName email' }
      ]);
      
      res.status(200).json({
        success: true,
        message: 'Site updated successfully',
        data: updatedSite
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating site',
        error: error.message
      });
    }
  }
  
  // DELETE /api/sites/:id - Delete site
  static async deleteSite(req, res) {
    try {
      const site = await Site.findById(req.params.id);
      
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      await Site.findByIdAndDelete(req.params.id);
      
      res.status(200).json({
        success: true,
        message: 'Site deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting site',
        error: error.message
      });
    }
  }
  
  // POST /api/sites/:id/studies - Add studies to site
  static async addStudiesToSite(req, res) {
    try {
      const { studyIds } = req.body;
      const siteId = req.params.id;
      
      if (!studyIds || !Array.isArray(studyIds)) {
        return res.status(400).json({
          success: false,
          message: 'studyIds must be an array'
        });
      }
      
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      // Validate studies exist
      const studies = await Study.find({ _id: { $in: studyIds } });
      if (studies.length !== studyIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more studies do not exist'
        });
      }
      
      // Add studies (avoid duplicates)
      const newStudyIds = studyIds.filter(id => !site.studies.includes(id));
      site.studies.push(...newStudyIds);
      await site.save();
      
      await site.populate('studies', 'study_name protocol_number study_title');
      
      res.status(200).json({
        success: true,
        message: 'Studies added to site successfully',
        data: site
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error adding studies to site',
        error: error.message
      });
    }
  }
  
  // DELETE /api/sites/:id/studies/:studyId - Remove study from site
  static async removeStudyFromSite(req, res) {
    try {
      const { id: siteId, studyId } = req.params;
      
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      site.studies = site.studies.filter(study => study.toString() !== studyId);
      await site.save();
      
      res.status(200).json({
        success: true,
        message: 'Study removed from site successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error removing study from site',
        error: error.message
      });
    }
  }
  
  // POST /api/sites/:id/users - Add users to site
  static async addUsersToSite(req, res) {
    try {
      const { userIds } = req.body;
      const siteId = req.params.id;
      
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({
          success: false,
          message: 'userIds must be an array'
        });
      }
      
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      // Validate users exist
      const users = await User.find({ _id: { $in: userIds } });
      if (users.length !== userIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more users do not exist'
        });
      }
      
      // Add users (avoid duplicates)
      const newUserIds = userIds.filter(id => !site.userAssignments.includes(id));
      site.userAssignments.push(...newUserIds);
      await site.save();
      
      await site.populate('userAssignments', 'firstName lastName email');
      
      res.status(200).json({
        success: true,
        message: 'Users added to site successfully',
        data: site
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error adding users to site',
        error: error.message
      });
    }
  }
  
  // DELETE /api/sites/:id/users/:userId - Remove user from site
  static async removeUserFromSite(req, res) {
    try {
      const { id: siteId, userId } = req.params;
      
      const site = await Site.findById(siteId);
      if (!site) {
        return res.status(404).json({
          success: false,
          message: 'Site not found'
        });
      }
      
      site.userAssignments = site.userAssignments.filter(user => user.toString() !== userId);
      await site.save();
      
      res.status(200).json({
        success: true,
        message: 'User removed from site successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error removing user from site',
        error: error.message
      });
    }
  }

// PATCH /api/sites/:id/toggle-status - Toggle site status
// PATCH /api/sites/:id/toggle-status
static async toggleSiteStatus(req, res) {
  try {
    const site = await Site.findById(req.params.id);

    if (!site) {
      return res.status(404).json({
        success: false,
        message: 'Site not found',
      });
    }

    // Toggle logic (based on string or boolean)
    if (typeof site.status === 'string') {
      site.status = site.status === 'active' ? 'inactive' : 'active';
    } else if (typeof site.status === 'boolean') {
      site.status = !site.status;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid status format',
      });
    }

    await site.save();

    res.status(200).json({
      success: true,
      message: `Site status updated to ${site.status}`,
      data: site,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle site status',
      error: error.message,
    });
  }
}


  // GET /api/sites/stats
static async getSiteStats(req, res) {
  try {
    const totalSites = await Site.countDocuments();
    const totalStudies = await Study.countDocuments();
    const totalUsers = await User.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        totalSites,
        totalStudies,
        totalUsers
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching site statistics',
      error: error.message
    });
  }
}

  
  // GET /api/sites/search - Search sites
  static async searchSites(req, res) {
    try {
      const { q } = req.query;
      
      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }
      
      const sites = await Site.find({
        $or: [
          { siteName: { $regex: q, $options: 'i' } },
          { siteId: { $regex: q, $options: 'i' } },
          { protocolNumber: { $regex: q, $options: 'i' } },
          { piName: { $regex: q, $options: 'i' } }
        ]
      }).populate('studies', 'study_name protocol_number study_title')
        .limit(20);
      
      res.status(200).json({
        success: true,
        data: sites
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error searching sites',
        error: error.message
      });
    }
  }
}



module.exports = SiteController;