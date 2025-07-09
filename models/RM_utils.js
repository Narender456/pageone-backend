// RM_utils.js - Updated to preserve all files
const path = require('path');
const fs = require('fs').promises;

/**
 * Saves an uploaded Excel file to the appropriate location
 * @param {string} tempFilePath - The temporary file path or uploaded file path
 * @returns {string} - The permanent file path where the file was saved
 */
async function saveExcelFile(tempFilePath) {
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, '../uploads/excel_files');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    console.log('Directory already exists or could not be created');
  }

  // If the file is already in the uploads directory, return as-is
  if (tempFilePath.includes('uploads/excel_files/')) {
    return tempFilePath;
  }

  // Generate a unique filename
  const filename = `excel_${Date.now()}${path.extname(tempFilePath)}`;
  const destPath = path.join(uploadsDir, filename);

  try {
    // Copy the file to permanent location
    await fs.copyFile(tempFilePath, destPath);
    
    // NOTE: We preserve the temporary file instead of deleting it
    // This ensures no files are lost during the process
    console.log(`File copied from ${tempFilePath} to ${destPath}`);
    
  } catch (err) {
    console.error('Error saving file:', err);
    // If copying fails, just return the original path
    return tempFilePath;
  }

  // Return the relative path from the project root
  return `uploads/excel_files/${filename}`;
}

/**
 * Check if a file exists in the uploads directory
 * @param {string} filePath - The file path to check
 * @returns {boolean} - True if file exists, false otherwise
 */
async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get file information without deleting it
 * @param {string} filePath - The file path to get info for
 * @returns {object} - File stats object
 */
async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      path: filePath
    };
  } catch (error) {
    console.error('Error getting file info:', error);
    return null;
  }
}

/**
 * List all files in the uploads directory
 * @returns {array} - Array of file names in the uploads directory
 */
async function listUploadedFiles() {
  const uploadsDir = path.join(__dirname, '../uploads/excel_files');
  try {
    const files = await fs.readdir(uploadsDir);
    return files.filter(file => 
      file.endsWith('.xlsx') || 
      file.endsWith('.xls')
    );
  } catch (error) {
    console.error('Error listing uploaded files:', error);
    return [];
  }
}

module.exports = {
  saveExcelFile,
  checkFileExists,
  getFileInfo,
  listUploadedFiles
};