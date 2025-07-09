const { v4: uuidv4 } = require("uuid")

/**
 * Generate a slug with UUID
 * @param {string} text - The text to create slug from
 * @param {string} existingUniqueId - Existing unique ID if updating
 * @returns {object} - Object containing uniqueId and slug
 */
function generateSlugWithUUID(text, existingUniqueId = null) {
  // Create a basic slug from the text
  const baseSlug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens

  // Use existing uniqueId or generate new one
  const uniqueId = existingUniqueId || uuidv4().substring(0, 8)

  // Combine slug with uniqueId
  const slug = `${baseSlug}-${uniqueId}`

  return {
    uniqueId,
    slug,
  }
}

/**
 * Get current time
 * @returns {Date} - Current date and time
 */
function getCurrentTime() {
  return new Date()
}

module.exports = {
  generateSlugWithUUID,
  getCurrentTime,
}
