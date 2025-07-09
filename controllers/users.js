const User = require("../models/User")
const { Parser } = require("json2csv")

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res, next) => {
  try {
    // Pagination
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Number.parseInt(req.query.limit, 10) || 10
    const startIndex = (page - 1) * limit

    // Build query
    const query = {}

    // Search functionality
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
      ]
    }

    // Filter by role
    if (req.query.role) {
      query.role = req.query.role
    }

    // Filter by access
    if (req.query.hasAccess !== undefined) {
      query.hasAccess = req.query.hasAccess === "true"
    }

    // Filter by date range
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {}
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate)
      }
      if (req.query.endDate) {
        query.createdAt.$lte = new Date(req.query.endDate)
      }
    }

    // Sorting
    const sortBy = req.query.sortBy || "createdAt"
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1
    const sort = { [sortBy]: sortOrder }

    // Execute query
    const users = await User.find(query)
      .sort(sort)
      .limit(limit)
      .skip(startIndex)
      .select("-password -refreshTokens -emailVerificationToken -passwordResetToken")

    // Get total count for pagination
    const total = await User.countDocuments(query)

    // Pagination result
    const pagination = {}

    if (startIndex + limit < total) {
      pagination.next = {
        page: page + 1,
        limit,
      }
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit,
      }
    }

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      pagination,
      data: users,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -refreshTokens -emailVerificationToken -passwordResetToken",
    )

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.status(200).json({
      success: true,
      data: user,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Create user
// @route   POST /api/users
// @access  Private/Admin
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, hasAccess } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      })
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || "user",
      hasAccess: hasAccess !== undefined ? hasAccess : false,
      isEmailVerified: true, // Admin created users are auto-verified
    })

    // Log activity
    await req.user.logActivity(`created_user:${user.email}`, req.ip, req.get("User-Agent"))

    res.status(201).json({
      success: true,
      data: user.fullProfile,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res, next) => {
  try {
    const { name, email, role, hasAccess, profile, preferences } = req.body

    // Build update object
    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (role !== undefined) updateData.role = role
    if (hasAccess !== undefined) updateData.hasAccess = hasAccess
    if (profile !== undefined) updateData.profile = { ...updateData.profile, ...profile }
    if (preferences !== undefined) updateData.preferences = { ...updateData.preferences, ...preferences }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -refreshTokens -emailVerificationToken -passwordResetToken")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Log activity
    await req.user.logActivity(`updated_user:${user.email}`, req.ip, req.get("User-Agent"))

    res.status(200).json({
      success: true,
      data: user,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      })
    }

    await User.findByIdAndDelete(req.params.id)

    // Log activity
    await req.user.logActivity(`deleted_user:${user.email}`, req.ip, req.get("User-Agent"))

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Toggle user access
// @route   PATCH /api/users/:id/toggle-access
// @access  Private/Admin
exports.toggleUserAccess = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Prevent admin from disabling their own access
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot modify your own access",
      })
    }

    user.hasAccess = !user.hasAccess
    await user.save()

    // Log activity
    await req.user.logActivity(
      `${user.hasAccess ? "granted" : "revoked"}_access:${user.email}`,
      req.ip,
      req.get("User-Agent"),
    )

    res.status(200).json({
      success: true,
      data: user.fullProfile,
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private/Admin
exports.getUserStats = async (req, res, next) => {
  try {
    const stats = await User.getStatistics()

    // Get user growth data (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const growthData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ])

    // Get role distribution
    const roleDistribution = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ])

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        growthData,
        roleDistribution,
      },
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Export users to CSV
// @route   GET /api/users/export
// @access  Private/Admin
exports.exportUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select("name email role hasAccess lastLogin createdAt isEmailVerified").lean()

    // Transform data for CSV
    const csvData = users.map((user) => ({
      Name: user.name,
      Email: user.email,
      Role: user.role,
      "Has Access": user.hasAccess ? "Yes" : "No",
      "Email Verified": user.isEmailVerified ? "Yes" : "No",
      "Last Login": user.lastLogin ? user.lastLogin.toISOString() : "Never",
      "Created At": user.createdAt.toISOString(),
    }))

    const fields = ["Name", "Email", "Role", "Has Access", "Email Verified", "Last Login", "Created At"]
    const json2csvParser = new Parser({ fields })
    const csv = json2csvParser.parse(csvData)

    res.header("Content-Type", "text/csv")
    res.attachment(`users-export-${new Date().toISOString().split("T")[0]}.csv`)
    res.send(csv)
  } catch (error) {
    next(error)
  }
}

// @desc    Bulk update users
// @route   POST /api/users/bulk-update
// @access  Private/Admin
exports.bulkUpdateUsers = async (req, res, next) => {
  try {
    const { userIds, updates } = req.body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User IDs array is required",
      })
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Updates object is required",
      })
    }

    // Prevent admin from updating their own access
    if (updates.hasAccess !== undefined && userIds.includes(req.user._id.toString())) {
      return res.status(400).json({
        success: false,
        message: "You cannot modify your own access in bulk operations",
      })
    }

    const result = await User.updateMany({ _id: { $in: userIds } }, updates, { runValidators: true })

    // Log activity
    await req.user.logActivity(`bulk_update:${userIds.length}_users`, req.ip, req.get("User-Agent"))

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} users updated successfully`,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Get user activity log
// @route   GET /api/users/:id/activity
// @access  Private/Admin
exports.getUserActivity = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("activityLog name email")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Sort activity log by timestamp (newest first)
    const activityLog = user.activityLog.sort((a, b) => b.timestamp - a.timestamp)

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
        activityLog,
      },
    })
  } catch (error) {
    next(error)
  }
}
