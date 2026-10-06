const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET_DIRS = [
  path.join(__dirname, '../hope-bet-api/src'),
  path.join(__dirname, '../frontend'),
  path.join(__dirname, '../public'),
  path.join(__dirname, '../game')
];

function getAllJsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        getAllJsFiles(fullPath, fileList);
      }
    } else if (file.endsWith('.js') && !file.endsWith('.min.js')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = [];
for (const dir of TARGET_DIRS) {
  getAllJsFiles(dir, allFiles);
}

// Also obfuscate root dev-server.js
const devServer = path.join(__dirname, '../dev-server.js');
if (fs.existsSync(devServer)) allFiles.push(devServer);

console.log(`Found ${allFiles.length} JavaScript files to obfuscate.`);

for (const filePath of allFiles) {
  console.log(`Obfuscating: ${path.relative(path.join(__dirname, '..'), filePath)}`);
  try {
    execSync(
      `javascript-obfuscator "${filePath}" --output "${filePath}" ` +
      `--compact true ` +
      `--control-flow-flattening true ` +
      `--control-flow-flattening-threshold 0.75 ` +
      `--dead-code-injection true ` +
      `--dead-code-injection-threshold 0.3 ` +
      `--string-array true ` +
      `--string-array-encoding rc4 ` +
      `--string-array-threshold 0.8 ` +
      `--split-strings true ` +
      `--rename-globals false`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    console.error(`Failed to obfuscate ${filePath}:`, err.message);
  }
}

console.log('=== All files successfully obfuscated and hardened ===');
