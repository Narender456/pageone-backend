// debug_directories.js - Run this to debug directory issues
const path = require('path');
const fs = require('fs');

console.log('🔍 DEBUGGING DIRECTORY STRUCTURE');
console.log('=================================');

// Current working directory
console.log('📁 Current working directory:', process.cwd());

// Directory where this script is located
console.log('📁 Script location (__dirname):', __dirname);

// Look for package.json
function findProjectRoot() {
  let currentDir = __dirname;
  console.log('\n🔍 Searching for package.json...');
  
  while (currentDir !== path.dirname(currentDir)) {
    const packagePath = path.join(currentDir, 'package.json');
    console.log(`   Checking: ${packagePath}`);
    
    if (fs.existsSync(packagePath)) {
      console.log(`   ✅ Found package.json at: ${currentDir}`);
      return currentDir;
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  console.log('   ❌ package.json not found');
  return null;
}

const projectRoot = findProjectRoot();

if (projectRoot) {
  console.log('\n📁 Project root:', projectRoot);
  
  // Check different possible upload paths
  const possiblePaths = [
    path.join(projectRoot, 'uploads', 'excel_files'),
    path.join(projectRoot, 'public', 'uploads', 'excel_files'),
    path.join(projectRoot, 'src', 'uploads', 'excel_files'),
    path.join(process.cwd(), 'uploads', 'excel_files')
  ];
  
  console.log('\n📂 Checking possible upload directories:');
  possiblePaths.forEach(p => {
    const exists = fs.existsSync(p);
    console.log(`   ${exists ? '✅' : '❌'} ${p}`);
  });
  
  // Create the uploads directory
  const uploadsDir = path.join(projectRoot, 'uploads', 'excel_files');
  console.log('\n🔧 Creating uploads directory...');
  
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`   ✅ Directory created: ${uploadsDir}`);
    
    // Test write permission
    const testFile = path.join(uploadsDir, 'test.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('   ✅ Directory is writable');
    
    // List contents
    const files = fs.readdirSync(uploadsDir);
    console.log(`   📄 Files in directory: ${files.length > 0 ? files.join(', ') : 'Empty'}`);
    
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
} else {
  console.log('\n❌ Cannot determine project root');
}

console.log('\n🔍 Environment Info:');
console.log('   Node version:', process.version);
console.log('   Platform:', process.platform);
console.log('   Architecture:', process.arch);

// Export function to get the correct path
module.exports = {
  getCorrectUploadsPath: () => {
    const root = findProjectRoot() || process.cwd();
    return path.join(root, 'uploads', 'excel_files');
  }
};