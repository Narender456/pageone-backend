const Permission = require("../models/Permission")
const Role = require("../models/Role")
const MenuOption = require("../models/MenuOption")
const { sendPermissionNotification } = require("../middleware/permissionHooks")
const { validationResult } = require("express-validator")

// Get permissions for a role
const getRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params

    const role = await Role.findById(roleId)
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      })
    }

    // Ensure all menu options have permissions for this role
    const menuOptions = await MenuOption.find({ isActive: true })
    for (const menuOption of menuOptions) {
      await Permission.findOneAndUpdate(
        { role: roleId, menuOption: menuOption._id },
        {
          role: roleId,
          menuOption: menuOption._id,
          canView: false,
          canEdit: false,
          canDelete: false,
          canCreate: false,
        },
        { upsert: true, setDefaultsOnInsert: true },
      )
    }

    const permissions = await Permission.find({ role: roleId })
      .populate({
        path: "menuOption",
        select: "name url icon parent order",
        populate: {
          path: "parent",
          select: "name",
        },
      })
      .sort({ "menuOption.order": 1 })
      .lean()

    // Group permissions by parent menu
    const groupedPermissions = {}
    const rootPermissions = []

    permissions.forEach((permission) => {
      if (permission.menuOption.parent) {
        const parentName = permission.menuOption.parent.name
        if (!groupedPermissions[parentName]) {
          groupedPermissions[parentName] = []
        }
        groupedPermissions[parentName].push(permission)
      } else {
        rootPermissions.push(permission)
      }
    })

    res.json({
      success: true,
      data: {
        role,
        permissions,
        groupedPermissions,
        rootPermissions,
      },
    })
  } catch (error) {
    console.error("Error fetching role permissions:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching role permissions",
      error: error.message,
    })
  }
}

// Update role permissions
const updateRolePermissions = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      })
    }

    const { roleId } = req.params
    const { permissions } = req.body

    const role = await Role.findById(roleId)
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      })
    }

    // Update permissions
    const updatePromises = permissions.map(async (permissionData) => {
      const { menuOptionId, canView, canEdit, canDelete, canCreate } = permissionData

      return Permission.findOneAndUpdate(
        { role: roleId, menuOption: menuOptionId },
        {
          canView: Boolean(canView),
          canEdit: Boolean(canEdit),
          canDelete: Boolean(canDelete),
          canCreate: Boolean(canCreate),
        },
        { upsert: true, new: true },
      )
    })

    await Promise.all(updatePromises)

    // Send notification
    await sendPermissionNotification("Updated", role.name, "Role Permissions", req.user)

    res.json({
      success: true,
      message: "Permissions updated successfully",
    })
  } catch (error) {
    console.error("Error updating role permissions:", error)
    res.status(500).json({
      success: false,
      message: "Error updating role permissions",
      error: error.message,
    })
  }
}

// Get user permissions
const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params

    const permissions = await Permission.getUserPermissions(userId)

    res.json({
      success: true,
      data: permissions,
    })
  } catch (error) {
    console.error("Error fetching user permissions:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching user permissions",
      error: error.message,
    })
  }
}

// Check user permission for specific menu
const checkUserPermission = async (req, res) => {
  try {
    const { userId, menuOptionId } = req.params
    const { action } = req.query // view, edit, delete, create

    const permissions = await Permission.getUserPermissions(userId)
    const menuPermission = permissions.find((p) => p.menuOption._id.toString() === menuOptionId)

    let hasPermission = false
    if (menuPermission) {
      switch (action) {
        case "view":
          hasPermission = menuPermission.canView
          break
        case "edit":
          hasPermission = menuPermission.canEdit
          break
        case "delete":
          hasPermission = menuPermission.canDelete
          break
        case "create":
          hasPermission = menuPermission.canCreate
          break
        default:
          hasPermission = false
      }
    }

    res.json({
      success: true,
      data: {
        hasPermission,
        permission: menuPermission || null,
      },
    })
  } catch (error) {
    console.error("Error checking user permission:", error)
    res.status(500).json({
      success: false,
      message: "Error checking user permission",
      error: error.message,
    })
  }
}

module.exports = {
  getRolePermissions,
  updateRolePermissions,
  getUserPermissions,
  checkUserPermission,
}
