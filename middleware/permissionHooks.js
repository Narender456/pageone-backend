const Role = require("../models/Role")
const MenuOption = require("../models/MenuOption")
const Permission = require("../models/Permission")
const { sendEmailNotification } = require("../utils/sendEmail")

// Hook for after role creation
const afterRoleCreate = async (roleId) => {
  try {
    console.log(`Creating default permissions for role: ${roleId}`)
    await Permission.createDefaultPermissionsForRole(roleId)
    console.log(`Default permissions created for role: ${roleId}`)
  } catch (error) {
    console.error(`Error creating default permissions for role ${roleId}:`, error)
  }
}

// Hook for after menu option creation
const afterMenuOptionCreate = async (menuOptionId) => {
  try {
    console.log(`Creating permissions for new menu option: ${menuOptionId}`)
    await Permission.createPermissionsForMenuOption(menuOptionId)
    console.log(`Permissions created for menu option: ${menuOptionId}`)
  } catch (error) {
    console.error(`Error creating permissions for menu option ${menuOptionId}:`, error)
  }
}

// Hook for after study creation (creates menu dynamically)
const afterStudyCreate = async (study) => {
  try {
    // Ensure the "Reports" menu exists
    let reportsMenu = await MenuOption.findOne({ name: "Reports", parent: null })

    if (!reportsMenu) {
      reportsMenu = await MenuOption.create({
        name: "Reports",
        url: "#",
        icon: "nav-icon uil uil-chart",
        order: 30,
        isSystemMenu: true,
      })
    }

    // Create a new submenu under "Reports" for the new study
    const newMenuOption = await MenuOption.create({
      name: study.name,
      url: `/studies/${study.slug}/report`,
      parent: reportsMenu._id,
      order: 0,
    })

    // Create permissions for all roles
    await Permission.createPermissionsForMenuOption(newMenuOption._id)

    console.log(`Menu and permissions created for study: ${study.name}`)
  } catch (error) {
    console.error(`Error creating menu for study ${study.name}:`, error)
  }
}

// Hook for after study update
const afterStudyUpdate = async (study) => {
  try {
    const reportsMenu = await MenuOption.findOne({ name: "Reports", parent: null })
    if (reportsMenu) {
      const menuEntry = await MenuOption.findOne({
        name: study.name,
        parent: reportsMenu._id,
      })

      if (menuEntry) {
        menuEntry.url = `/studies/${study.slug}/report`
        await menuEntry.save()
        console.log(`Menu updated for study: ${study.name}`)
      }
    }
  } catch (error) {
    console.error(`Error updating menu for study ${study.name}:`, error)
  }
}

// Hook for after study deletion
const afterStudyDelete = async (studyName) => {
  try {
    const reportsMenu = await MenuOption.findOne({ name: "Reports", parent: null })
    if (reportsMenu) {
      await MenuOption.findOneAndDelete({
        name: studyName,
        parent: reportsMenu._id,
      })
      console.log(`Menu deleted for study: ${studyName}`)
    }
  } catch (error) {
    console.error(`Error deleting menu for study ${studyName}:`, error)
  }
}

// Email notification helper
const sendPermissionNotification = async (action, entityName, entityType, user) => {
  try {
    const subject = `${entityType} ${action}`
    const message = `The ${entityType.toLowerCase()} "${entityName}" has been ${action.toLowerCase()}.`

    if (user) {
      await sendEmailNotification(subject, message, user.email, user.name)
    }
  } catch (error) {
    console.error(`Error sending ${entityType} ${action} notification:`, error)
  }
}

module.exports = {
  afterRoleCreate,
  afterMenuOptionCreate,
  afterStudyCreate,
  afterStudyUpdate,
  afterStudyDelete,
  sendPermissionNotification,
}
