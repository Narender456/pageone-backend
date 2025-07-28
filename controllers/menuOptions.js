const MenuOption = require("../models/MenuOption")
const Permission = require("../models/Permission")
const { afterMenuOptionCreate, sendPermissionNotification } = require("../middleware/permissionHooks")
const { validationResult } = require("express-validator")

// Get all menu options
const getMenuOptions = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = "", sortBy = "order", sortOrder = "asc", isActive, parentId } = req.query

    // Build filter
    const filter = {}
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { url: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ]
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === "true"
    }
    if (parentId !== undefined) {
      filter.parent = parentId === "null" ? null : parentId
    }

    // Build sort
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const [menuOptions, total] = await Promise.all([
      MenuOption.find(filter)
        .populate("parent", "name")
        .populate("submenus", "name url icon order")
        .sort(sort)
        .skip(skip)
        .limit(Number.parseInt(limit))
        .lean(),
      MenuOption.countDocuments(filter),
    ])

    res.json({
      success: true,
      data: menuOptions,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / Number.parseInt(limit)),
        totalItems: total,
        itemsPerPage: Number.parseInt(limit),
      },
    })
  } catch (error) {
    console.error("Error fetching menu options:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching menu options",
      error: error.message,
    })
  }
}

// Get menu hierarchy
const getMenuHierarchy = async (req, res) => {
  try {
    const hierarchy = await MenuOption.getMenuHierarchy()
    res.json({
      success: true,
      data: hierarchy,
    })
  } catch (error) {
    console.error("Error fetching menu hierarchy:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching menu hierarchy",
      error: error.message,
    })
  }
}

// Get parent menu options
const getParentMenuOptions = async (req, res) => {
  try {
    const parentMenus = await MenuOption.find({
      parent: null,
      isActive: true,
    })
      .select("name _id")
      .sort({ order: 1 })
      .lean()

    res.json({
      success: true,
      data: parentMenus,
    })
  } catch (error) {
    console.error("Error fetching parent menu options:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching parent menu options",
      error: error.message,
    })
  }
}

// Get menu option by ID
const getMenuOptionById = async (req, res) => {
  try {
    const menuOption = await MenuOption.findById(req.params.id)
      .populate("parent", "name")
      .populate("submenus", "name url icon order")
      .lean()

    if (!menuOption) {
      return res.status(404).json({
        success: false,
        message: "Menu option not found",
      })
    }

    res.json({
      success: true,
      data: menuOption,
    })
  } catch (error) {
    console.error("Error fetching menu option:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching menu option",
      error: error.message,
    })
  }
}

// Create menu option
const createMenuOption = async (req, res) => {
  try {
    console.log("=== CREATE MENU OPTION DEBUG ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    const errors = validationResult(req);
    console.log("Validation errors:", errors.array());
    
    // ADD THIS DEBUG CODE
    if (req.body.parent && req.body.parent !== null) {
      console.log("Checking if parent exists...");
      const parentExists = await MenuOption.findById(req.body.parent);
      console.log("Parent menu found:", parentExists ? "YES" : "NO");
      if (parentExists) {
        console.log("Parent menu details:", parentExists);
      }
    }
    
    if (!errors.isEmpty()) {
      console.log("VALIDATION FAILED:", errors.array());
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    // Add isActive to destructuring
    const { name, url, icon, parent, order, description, isActive } = req.body;
    
    console.log("Destructured values:", {
      name, url, icon, parent, order, description, isActive
    });

    // Check if menu option already exists
    const existingMenu = await MenuOption.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      parent: parent || null,
    });
    
    if (existingMenu) {
      console.log("DUPLICATE NAME ERROR:", existingMenu);
      return res.status(400).json({
        success: false,
        message: "Menu option with this name already exists in the same parent",
      });
    }

    // Get next order if not provided
    let nextOrder = order;
    if (!nextOrder) {
      const maxOrder = await MenuOption.findOne({ parent: parent || null })
        .sort({ order: -1 })
        .select("order")
        .lean();
      nextOrder = (maxOrder?.order || 0) + 1;
    }

    console.log("Creating menu option with data:", {
      name,
      url,
      icon,
      parent: parent || null,
      order: nextOrder,
      description,
      isActive: isActive !== undefined ? isActive : true,
    });

    const menuOption = await MenuOption.create({
      name,
      url,
      icon,
      parent: parent || null,
      order: nextOrder,
      description,
      isActive: isActive !== undefined ? isActive : true, // Add this field
    });

    console.log("Menu option created successfully:", menuOption);

    // Create permissions for all roles
    await afterMenuOptionCreate(menuOption._id);

    // Send notification
    await sendPermissionNotification("Created", name, "Menu Option", req.user);

    const populatedMenuOption = await MenuOption.findById(menuOption._id)
      .populate("parent", "name")
      .lean();

    console.log("Returning response:", populatedMenuOption);

    res.status(201).json({
      success: true,
      message: "Menu option created successfully",
      data: populatedMenuOption,
    });
  } catch (error) {
    console.error("=== CREATE MENU OPTION ERROR ===");
    console.error("Error details:", error);
    console.error("Error stack:", error.stack);
    
    res.status(500).json({
      success: false,
      message: "Error creating menu option",
      error: error.message,
    });
  }
};


// Update menu option
const updateMenuOption = async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      })
    }

    const { name, url, icon, parent, order, description, isActive } = req.body
    const menuOptionId = req.params.id

    const menuOption = await MenuOption.findById(menuOptionId)
    if (!menuOption) {
      return res.status(404).json({
        success: false,
        message: "Menu option not found",
      })
    }

    // Check if menu option name already exists (excluding current menu)
    if (name && name !== menuOption.name) {
      const existingMenu = await MenuOption.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
        parent: parent !== undefined ? parent || null : menuOption.parent,
        _id: { $ne: menuOptionId },
      })
      if (existingMenu) {
        return res.status(400).json({
          success: false,
          message: "Menu option with this name already exists in the same parent",
        })
      }
    }

    const updatedMenuOption = await MenuOption.findByIdAndUpdate(
      menuOptionId,
      {
        ...(name && { name }),
        ...(url !== undefined && { url }),
        ...(icon !== undefined && { icon }),
        ...(parent !== undefined && { parent: parent || null }),
        ...(order !== undefined && { order }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
      { new: true, runValidators: true },
    ).populate("parent", "name")

    // Send notification
    await sendPermissionNotification("Updated", updatedMenuOption.name, "Menu Option", req.user)

    res.json({
      success: true,
      message: "Menu option updated successfully",
      data: updatedMenuOption,
    })
  } catch (error) {
    console.error("Error updating menu option:", error)
    res.status(500).json({
      success: false,
      message: "Error updating menu option",
      error: error.message,
    })
  }
}

// Delete menu option
const deleteMenuOption = async (req, res) => {
  try {
    const menuOption = await MenuOption.findById(req.params.id)
    if (!menuOption) {
      return res.status(404).json({
        success: false,
        message: "Menu option not found",
      })
    }

    // Check if it's a system menu
    if (menuOption.isSystemMenu) {
      return res.status(400).json({
        success: false,
        message: "System menu options cannot be deleted",
      })
    }

    // Check if it has submenus
    const hasSubmenus = await MenuOption.countDocuments({ parent: menuOption._id })
    if (hasSubmenus > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete menu option with submenus. Delete submenus first.",
      })
    }

    // Delete all permissions for this menu option
    await Permission.deleteMany({ menuOption: menuOption._id })

    // Delete the menu option
    await MenuOption.findByIdAndDelete(req.params.id)

    // Send notification
    await sendPermissionNotification("Deleted", menuOption.name, "Menu Option", req.user)

    res.json({
      success: true,
      message: "Menu option deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting menu option:", error)
    res.status(500).json({
      success: false,
      message: "Error deleting menu option",
      error: error.message,
    })
  }
}

module.exports = {
  getMenuOptions,
  getMenuHierarchy,
  getParentMenuOptions,
  getMenuOptionById,
  createMenuOption,
  updateMenuOption,
  deleteMenuOption,
}
