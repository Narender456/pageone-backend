const mongoose = require("mongoose")

const permissionSchema = new mongoose.Schema(
  {
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: [true, "Role is required"],
    },
    menuOption: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuOption",
      required: [true, "Menu option is required"],
    },
    canView: {
      type: Boolean,
      default: false,
    },
    canEdit: {
      type: Boolean,
      default: false,
    },
    canDelete: {
      type: Boolean,
      default: false,
    },
    canCreate: {
      type: Boolean,
      default: false,
    },
    customPermissions: {
      type: Map,
      of: Boolean,
      default: new Map(),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Compound index to ensure unique role-menu combinations
permissionSchema.index({ role: 1, menuOption: 1 }, { unique: true })

// Index for better query performance
permissionSchema.index({ role: 1 })
permissionSchema.index({ menuOption: 1 })

// Static method to create default permissions for a role
permissionSchema.statics.createDefaultPermissionsForRole = async function (roleId) {
  const MenuOption = mongoose.model("MenuOption")
  const menuOptions = await MenuOption.find({ isActive: true })

  const permissions = menuOptions.map((menuOption) => ({
    role: roleId,
    menuOption: menuOption._id,
    canView: false,
    canEdit: false,
    canDelete: false,
    canCreate: false,
  }))

  try {
    await this.insertMany(permissions, { ordered: false })
  } catch (error) {
    // Ignore duplicate key errors
    if (error.code !== 11000) {
      throw error
    }
  }
}

// Static method to create permissions for a new menu option
permissionSchema.statics.createPermissionsForMenuOption = async function (menuOptionId) {
  const Role = mongoose.model("Role")
  const roles = await Role.find({ isActive: true })

  const permissions = roles.map((role) => ({
    role: role._id,
    menuOption: menuOptionId,
    canView: false,
    canEdit: false,
    canDelete: false,
    canCreate: false,
  }))

  try {
    await this.insertMany(permissions, { ordered: false })
  } catch (error) {
    // Ignore duplicate key errors
    if (error.code !== 11000) {
      throw error
    }
  }
}

// Static method to get user permissions
permissionSchema.statics.getUserPermissions = async function (userId) {
  const User = mongoose.model("User")
  const user = await User.findById(userId).populate("user_roles")

  if (!user || !user.user_roles.length) {
    return []
  }

  const roleIds = user.user_roles.map((role) => role._id)

  const permissions = await this.find({ role: { $in: roleIds } })
    .populate("menuOption")
    .lean()

  // Merge permissions from multiple roles
  const mergedPermissions = new Map()

  permissions.forEach((permission) => {
    const key = permission.menuOption._id.toString()
    const existing = mergedPermissions.get(key)

    if (!existing) {
      mergedPermissions.set(key, {
        menuOption: permission.menuOption,
        canView: permission.canView,
        canEdit: permission.canEdit,
        canDelete: permission.canDelete,
        canCreate: permission.canCreate,
      })
    } else {
      // Merge permissions (OR operation)
      existing.canView = existing.canView || permission.canView
      existing.canEdit = existing.canEdit || permission.canEdit
      existing.canDelete = existing.canDelete || permission.canDelete
      existing.canCreate = existing.canCreate || permission.canCreate
    }
  })

  return Array.from(mergedPermissions.values())
}

module.exports = mongoose.model("Permission", permissionSchema)
