const { v4: uuidv4 } = require("uuid")
const slugify = require("slugify")
const Permission = require("../models/Permission")

/**
 * Generate a slug using a name and a UUID.
 * @param {string} name - The base text to include in the slug.
 * @param {string} uniqueId - Optional unique identifier. If not provided, a new UUID will be generated.
 * @returns {Object} An object with uniqueId and slug.
 */
const generateSlugWithUuid = (name, uniqueId = null) => {
  if (!uniqueId) {
    uniqueId = uuidv4().split("-")[4]
  }

  const slug = slugify(`${name} ${uniqueId}`, {
    lower: true,
    strict: true,
  })

  return { uniqueId, slug }
}

/**
 * Get the current localized time.
 * @returns {Date} Current time.
 */
const getCurrentTime = () => {
  return new Date()
}

/**
 * Determine user permissions for a specific URL.
 * @param {Object} user - The user object (can be null if no authentication).
 * @param {string} url - The URL or feature to check permissions for.
 * @returns {Object} Object with canEdit and canDelete properties.
 */
const determinePermissions = async (user, url) => {
  // Handle case where user is null (no authentication)
  if (!user) {
    // Return default permissions for unauthenticated users
    // You can modify these based on your requirements
    return { canEdit: true, canDelete: true }
  }

  // Check if user is superuser
  if (user.isSuperuser) {
    return { canEdit: true, canDelete: true }
  }

  const userRole = user.role
  if (userRole) {
    try {
      const permissions = await Permission.find({ role: userRole }).populate("menuOption")

      const canEdit = permissions.some(
        (perm) => perm.menuOption && perm.menuOption.url === url && perm.canEdit === true,
      )

      const canDelete = permissions.some(
        (perm) => perm.menuOption && perm.menuOption.url === url && perm.canDelete === true,
      )

      return { canEdit, canDelete }
    } catch (error) {
      console.error("Error determining permissions:", error)
      return { canEdit: false, canDelete: false }
    }
  }

  return { canEdit: false, canDelete: false }
}

/**
 * Calculate the next order number for a new stage.
 * @param {Object} stageModel - The Stage model class.
 * @returns {Promise<number>} Next order number as an integer.
 */
const getNextOrderNumber = async (stageModel) => {
  try {
    const result = await stageModel.findOne().sort({ orderNumber: -1 }).select("orderNumber")
    const maxOrder = result ? result.orderNumber : 0
    return maxOrder + 1
  } catch (error) {
    console.error("Error getting next order number:", error)
    return 1
  }
}

/**
 * Validate that the order number is unique.
 * @param {Object} stageModel - The Stage model class.
 * @param {number} orderNumber - The order number to validate.
 * @param {string} stageSlug - Optional slug of the current stage for exclusion.
 * @returns {Promise<boolean>} Boolean indicating validity.
 */
const validateOrderNumber = async (stageModel, orderNumber, stageSlug = null) => {
  try {
    const query = { orderNumber }

    if (stageSlug) {
      query.slug = { $ne: stageSlug }
    }

    const existingStage = await stageModel.findOne(query)
    return !existingStage
  } catch (error) {
    console.error("Error validating order number:", error)
    return false
  }
}

module.exports = {
  generateSlugWithUuid,
  getCurrentTime,
  determinePermissions,
  getNextOrderNumber,
  validateOrderNumber,
}