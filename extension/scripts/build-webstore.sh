#!/bin/bash

# Build script for Chrome Web Store submission
# This creates a clean package with only the necessary files

VERSION=$(node -p "require('./package.json').version")
BUILD_DIR="dist"
PACKAGE_NAME="mydy-extension-v${VERSION}-webstore"

echo "Building MyDy Downloader v${VERSION} for Chrome Web Store..."

# Clean previous builds
rm -rf $BUILD_DIR
rm -f *.zip

# Create build directory
mkdir -p $BUILD_DIR

# Copy essential files only
cp manifest.json $BUILD_DIR/
cp popup.html $BUILD_DIR/
cp -r css/ $BUILD_DIR/
cp -r js/ $BUILD_DIR/
cp -r icons/ $BUILD_DIR/

echo "Files copied to $BUILD_DIR"

# Create ZIP for Chrome Web Store
cd $BUILD_DIR
zip -r "../${PACKAGE_NAME}.zip" .
cd ..

echo "Chrome Web Store package created: ${PACKAGE_NAME}.zip"
echo "Ready for upload to Chrome Web Store Developer Dashboard"

# List contents for verification
echo -e "\nPackage contents:"
unzip -l "${PACKAGE_NAME}.zip"