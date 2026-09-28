const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;
const buildDir = 'dist';
const packageName = `mydy-extension-v${version}-webstore.zip`;

console.log(`Building MyDy Downloader v${version} for Chrome Web Store...`);

// Clean previous builds
if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
}

// Remove old zip files
if (fs.existsSync(packageName)) {
    fs.unlinkSync(packageName);
}

// Create build directory
fs.mkdirSync(buildDir, { recursive: true });

// Files and directories to copy
const filesToCopy = [
    'manifest.json',
    'popup.html',
    'css',
    'js',
    'icons'
];

// Copy files
filesToCopy.forEach(item => {
    const srcPath = path.join(__dirname, '..', item);
    const destPath = path.join(buildDir, item);
    
    if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isDirectory()) {
            // Copy directory recursively
            fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
            // Copy file
            fs.copyFileSync(srcPath, destPath);
        }
        console.log(`Copied: ${item}`);
    }
});

// Create ZIP for Chrome Web Store
const output = fs.createWriteStream(packageName);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.log(`\nChrome Web Store package created: ${packageName}`);
    console.log(`Package size: ${archive.pointer()} bytes`);
    console.log('Ready for upload to Chrome Web Store Developer Dashboard');
});

archive.on('error', (err) => {
    throw err;
});

archive.pipe(output);
archive.directory(buildDir, false);
archive.finalize();