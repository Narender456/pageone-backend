const Role = require("../models/Role")
const User = require("../models/User")
const Permission = require("../models/Permission")
const { afterRoleCreate, sendPermissionNotification } = require("../middleware/permissionHooks")
const { validationResult } = require("express-validator")

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private/Admin
exports.getRoles = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", sortBy = "createdAt", sortOrder = "desc", isActive } = req.query

    // Build filter
    const filter = {}
    if (search) {
      filter.$or = [{ name: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }]
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === "true"
    }

    // Build sort
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const [roles, total] = await Promise.all([
      Role.find(filter).populate("users", "name email").sort(sort).skip(skip).limit(Number.parseInt(limit)).lean(),
      Role.countDocuments(filter),
    ])

    // Add user count to each role
    const rolesWithCount = roles.map((role) => ({
      ...role,
      userCount: role.users ? role.users.length : 0,
    }))

    res.json({
      success: true,
      data: rolesWithCount,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / Number.parseInt(limit)),
        totalItems: total,
        itemsPerPage: Number.parseInt(limit),
      },
    })
  } catch (error) {
    console.error("Error fetching roles:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching roles",
      error: error.message,
    })
  }
}

// @desc    Get single role
// @route   GET /api/roles/:id
// @access  Private/Admin
exports.getRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id).populate("users", "name email avatar").lean()

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      })
    }

    res.json({
      success: true,
      data: role,
    })
  } catch (error) {
    console.error("Error fetching role:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching role",
      error: error.message,
    })
  }
}

// @desc    Create role
// @route   POST /api/roles
// @access  Private/Admin
exports.createRole = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      })
    }

    const { name, description, users = [] } = req.body

    // Check if role already exists
    const existingRole = await Role.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } })
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Role with this name already exists",
      })
    }

    const role = await Role.create({
      name,
      description,
      users,
    })

    // Create default permissions for this role
    await afterRoleCreate(role._id)

    // Update users to include this role
    if (users.length > 0) {
      await User.updateMany({ _id: { $in: users } }, { $addToSet: { user_roles: role._id } })
    }

    // Send notification
    await sendPermissionNotification("Created", name, "Role", req.user)

    const populatedRole = await Role.findById(role._id).populate("users", "name email avatar").lean()

    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: populatedRole,
    })
  } catch (error) {
    console.error("Error creating role:", error)
    res.status(500).json({
      success: false,
      message: "Error creating role",
      error: error.message,
    })
  }
}

// Updated updateRole function with better error handling and validation
exports.updateRole = async (req, res) => {
  try {
    console.log("Update role request received")
    console.log("Role ID:", req.params.id)
    console.log("Request body:", req.body)
    
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array())
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      })
    }

    const { name, description, users = [], isActive } = req.body
    const roleId = req.params.id

    // Validate roleId format
    if (!roleId || !roleId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role ID format",
      })
    }

    const role = await Role.findById(roleId)
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      })
    }

    // Validate users array if provided
    if (users && Array.isArray(users)) {
      const invalidUsers = users.filter(userId => !userId.match(/^[0-9a-fA-F]{24}$/))
      if (invalidUsers.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format in users array",
          invalidUsers,
        })
      }
    }

    // Check if role name already exists (excluding current role)
    if (name && name !== role.name) {
      const existingRole = await Role.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
        _id: { $ne: roleId },
      })
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: "Role with this name already exists",
        })
      }
    }

    // Get current users to manage role assignments
    const currentUsers = role.users.map((id) => id.toString())
    const newUsers = users.map((id) => id.toString())

    // Users to remove from role
    const usersToRemove = currentUsers.filter((id) => !newUsers.includes(id))
    // Users to add to role
    const usersToAdd = newUsers.filter((id) => !currentUsers.includes(id))

    console.log("Current users:", currentUsers)
    console.log("New users:", newUsers)
    console.log("Users to remove:", usersToRemove)
    console.log("Users to add:", usersToAdd)

    // Build update object
    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (isActive !== undefined) updateData.isActive = isActive
    if (users !== undefined) updateData.users = users

    console.log("Update data:", updateData)

    // Update role
    const updatedRole = await Role.findByIdAndUpdate(
      roleId,
      updateData,
      { new: true, runValidators: true }
    ).populate("users", "name email avatar")

    if (!updatedRole) {
      return res.status(404).json({
        success: false,
        message: "Role not found after update",
      })
    }

    // Update user role assignments
    if (usersToRemove.length > 0) {
      console.log("Removing users from role:", usersToRemove)
      await User.updateMany(
        { _id: { $in: usersToRemove } }, 
        { $pull: { user_roles: roleId } }
      )
    }

    if (usersToAdd.length > 0) {
      console.log("Adding users to role:", usersToAdd)
      await User.updateMany(
        { _id: { $in: usersToAdd } }, 
        { $addToSet: { user_roles: roleId } }
      )
    }

    // Send notification
    try {
      await sendPermissionNotification("Updated", updatedRole.name, "Role", req.user)
    } catch (notificationError) {
      console.error("Error sending notification:", notificationError)
      // Don't fail the request for notification errors
    }

    console.log("Role updated successfully:", updatedRole)

    res.json({
      success: true,
      message: "Role updated successfully",
      data: updatedRole,
    })
  } catch (error) {
    console.error("Error updating role:", error)
    res.status(500).json({
      success: false,
      message: "Error updating role",
      error: error.message,
    })
  }
}

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Private/Admin
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id)
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      })
    }

    // Check if it's a system role
    if (role.isSystemRole) {
      return res.status(400).json({
        success: false,
        message: "System roles cannot be deleted",
      })
    }

    // Remove role from all users
    await User.updateMany({ user_roles: role._id }, { $pull: { user_roles: role._id } })

    // Delete all permissions for this role
    await Permission.deleteMany({ role: role._id })

    // Delete the role
    await Role.findByIdAndDelete(req.params.id)

    // Send notification
    await sendPermissionNotification("Deleted", role.name, "Role", req.user)

    res.json({
      success: true,
      message: "Role deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting role:", error)
    res.status(500).json({
      success: false,
      message: "Error deleting role",
      error: error.message,
    })
  }
}

// @desc    Get role statistics
// @route   GET /api/roles/stats
// @access  Private/Admin
exports.getRoleStats = async (req, res) => {
  try {
    const stats = await Role.aggregate([
      {
        $group: {
          _id: null,
          totalRoles: { $sum: 1 },
          activeRoles: {
            $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
          },
          totalUsers: { $sum: { $size: "$users" } },
        },
      },
    ])

    const result = stats[0] || {
      totalRoles: 0,
      activeRoles: 0,
      totalUsers: 0,
    }

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("Error fetching role statistics:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching role statistics",
      error: error.message,
    })
  }
}
