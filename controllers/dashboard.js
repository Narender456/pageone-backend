const User = require("../models/User")

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res, next) => {
  try {
    // Get user statistics
    const userStats = await User.getStatistics()

    // Get recent registrations (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const recentRegistrations = await User.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    })

    // Get login statistics for the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const loginStats = await User.aggregate([
      {
        $match: {
          lastLogin: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$lastLogin" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ])

    // Calculate growth percentage
    const lastWeekStart = new Date()
    lastWeekStart.setDate(lastWeekStart.getDate() - 14)
    const lastWeekEnd = new Date()
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7)

    const lastWeekUsers = await User.countDocuments({
      createdAt: { $gte: lastWeekStart, $lt: lastWeekEnd },
    })

    const growthPercentage =
      lastWeekUsers > 0 ? (((recentRegistrations - lastWeekUsers) / lastWeekUsers) * 100).toFixed(1) : 100

    res.status(200).json({
      success: true,
      data: {
        totalUsers: userStats.totalUsers || 0,
        activeUsers: userStats.activeUsers || 0,
        adminUsers: userStats.adminUsers || 0,
        recentLogins: userStats.recentLogins || 0,
        recentRegistrations,
        growthPercentage: Number.parseFloat(growthPercentage),
        loginStats,
      },
    })
  } catch (error) {
    next(error)
  }
}

// @desc    Get recent activity
// @route   GET /api/dashboard/activity
// @access  Private
exports.getRecentActivity = async (req, res, next) => {
  try {
    const limit = Number.parseInt(req.query.limit) || 10

    // Get recent user activities
    const recentUsers = await User.find({})
      .sort({ lastLogin: -1 })
      .limit(limit)
      .select("name email lastLogin createdAt avatar")

    // Transform data for activity feed
    const activities = recentUsers.map((user) => ({
      user: user.name,
      email: user.email,
      action: user.lastLogin ? "Logged in" : "Registered",
      time: user.lastLogin || user.createdAt,
      avatar: user.avatar,
      initials: user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase(),
    }))

    // Sort by time (most recent first)
    activities.sort((a, b) => new Date(b.time) - new Date(a.time))

    res.status(200).json({
      success: true,
      data: activities,
    })
  } catch (error) {
    next(error)
  }
}
