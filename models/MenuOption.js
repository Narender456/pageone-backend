const mongoose = require("mongoose")

const menuOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Menu name is required"],
      trim: true,
      maxlength: [100, "Menu name cannot be more than 100 characters"],
    },
    url: {
      type: String,
      required: [true, "Menu URL is required"],
      trim: true,
      maxlength: [200, "URL cannot be more than 200 characters"],
    },
    icon: {
      type: String,
      trim: true,
      maxlength: [100, "Icon cannot be more than 100 characters"],
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuOption",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      min: [0, "Order must be a positive number"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isSystemMenu: {
      type: Boolean,
      default: false, // System menus cannot be deleted
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot be more than 500 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Virtual for submenus
menuOptionSchema.virtual("submenus", {
  ref: "MenuOption",
  localField: "_id",
  foreignField: "parent",
})

// Virtual for absolute URL
menuOptionSchema.virtual("absoluteUrl").get(function () {
  if (this.url && this.url.startsWith("/")) {
    return this.url
  }
  return this.url || "#"
})

// Index for better query performance
menuOptionSchema.index({ name: 1 })
menuOptionSchema.index({ parent: 1 })
menuOptionSchema.index({ order: 1 })
menuOptionSchema.index({ isActive: 1 })

// Static method to get menu hierarchy
menuOptionSchema.statics.getMenuHierarchy = async function () {
  const menus = await this.find({ isActive: true }).populate("submenus").sort({ order: 1 }).lean()

  // Build hierarchy
  const menuMap = new Map()
  const rootMenus = []

  menus.forEach((menu) => {
    menuMap.set(menu._id.toString(), { ...menu, children: [] })
  })

  menus.forEach((menu) => {
    if (menu.parent) {
      const parent = menuMap.get(menu.parent.toString())
      if (parent) {
        parent.children.push(menuMap.get(menu._id.toString()))
      }
    } else {
      rootMenus.push(menuMap.get(menu._id.toString()))
    }
  })

  return rootMenus
}

module.exports = mongoose.model("MenuOption", menuOptionSchema)
