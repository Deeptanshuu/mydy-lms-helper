const fs = require('fs');
const path = require('path');

// Read package.json version
const packagePath = path.join(__dirname, '..', 'package.json');
const manifestPath = path.join(__dirname, '..', 'manifest.json');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Update manifest version to match package.json
manifest.version = packageJson.version;

// Write updated manifest
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`Updated manifest.json version to ${packageJson.version}`);