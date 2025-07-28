const path = require('path');
const fs = require('fs').promises;

/**
 * Save an uploaded Excel file to the /uploads/excel_files directory.
 * Returns a relative path like uploads/excel_files/excel_12345.xlsx
 */
async function saveExcelFile(tempFilePath) {
  const uploadsDir = path.join(__dirname, '../uploads/excel_files');

  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch (err) {
    console.warn('⚠️ Could not create uploads directory:', err.message);
  }

  // If already in uploads dir, just return relative path
  if (tempFilePath.includes('uploads/excel_files/')) {
    const relative = tempFilePath.substring(tempFilePath.indexOf('uploads/'));
    return relative;
  }

  const filename = `excel_${Date.now()}${path.extname(tempFilePath)}`;
  const destPath = path.join(uploadsDir, filename);

  try {
    await fs.copyFile(tempFilePath, destPath);
    console.log(`✅ File saved: ${destPath}`);
  } catch (err) {
    console.error('❌ Error saving file:', err.message);
    return tempFilePath; // fallback
  }

  // Return relative path for database storage
  return `uploads/excel_files/${filename}`;
}


/**
 * Check if a file physically exists
 */
async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Get info about a file
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
  } catch (err) {
    console.error('❌ Error getting file info:', err.message);
    return null;
  }
}

/**
 * List all uploaded Excel files
 */
async function listUploadedFiles() {
  const uploadsDir = path.join(__dirname, '../uploads/excel_files');
  try {
    const files = await fs.readdir(uploadsDir);
    return files.filter(file => file.endsWith('.xlsx') || file.endsWith('.xls'));
  } catch (err) {
    console.error('❌ Error reading uploads directory:', err.message);
    return [];
  }
}

module.exports = {
  saveExcelFile,
  checkFileExists,
  getFileInfo,
  listUploadedFiles
};
