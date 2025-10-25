#!/bin/bash

# Turdus M3rula GUI - macOS Build Script
# Usage: bash build_macos.sh

set -e  # Exit on error

echo "=================================="
echo "Turdus M3rula GUI - macOS Builder"
echo "=================================="
echo ""

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TARGET_ARCH="arm64"
    echo "🍎 Detected Apple Silicon (ARM64)"
else
    TARGET_ARCH="x86_64"
    echo "💻 Detected Intel (x86_64)"
fi
echo ""

# Check if pyinstaller is installed
if ! command -v pyinstaller &> /dev/null; then
    echo "❌ PyInstaller not found. Installing..."
    pip install pyinstaller
fi

# Check if Pillow is installed (required for PNG to ICNS conversion)
if ! python -c "import PIL" 2>/dev/null; then
    echo "📦 Installing Pillow (for icon conversion)..."
    pip install Pillow
fi

# Check if required binaries exist
if [ ! -f "turdus_merula" ] || [ ! -f "turdusra1n" ]; then
    echo "❌ Error: turdus_merula or turdusra1n not found in current directory"
    exit 1
fi

# Check if logo.png exists and set icon flag
if [ ! -f "logo.png" ]; then
    echo "⚠️  Warning: logo.png not found, building without icon"
    ICON_FLAG=""
else
    echo "✅ Found logo.png, will use as application icon"
    ICON_FLAG="--icon=logo.png"
fi

echo ""
echo "🧹 Cleaning previous build artifacts..."
rm -rf build dist *.spec

echo ""
echo "🔨 Building application with PyInstaller..."
echo "   Architecture: $TARGET_ARCH"
echo "   Mode: onedir (directory bundle)"
echo "   Optimization: Level 2"
echo ""

# Run PyInstaller with optimized settings
pyinstaller turdus_m3rula_gui.py \
    --target-architecture $TARGET_ARCH \
    --onedir \
    --windowed \
    --name "Turdus_M3rula" \
    $ICON_FLAG \
    --optimize 2 \
    --noconfirm \
    \
    --hidden-import PyQt6.QtCore \
    --hidden-import PyQt6.QtWidgets \
    --hidden-import PyQt6.QtGui \
    --hidden-import PyQt6.sip \
    \
    --add-binary "turdus_merula:." \
    --add-binary "turdusra1n:." \
    \
    --exclude-module tkinter \
    --exclude-module matplotlib \
    --exclude-module numpy \
    --exclude-module pandas \
    --exclude-module scipy \
    --exclude-module PIL \
    --exclude-module torch \
    --exclude-module tensorflow

echo ""
echo "🔧 Setting executable permissions for bundled binaries..."

# Find and set executable permissions for all instances of the binaries
find "dist/Turdus_M3rula.app" -name "turdus_merula" -exec chmod +x {} \;
find "dist/Turdus_M3rula.app" -name "turdusra1n" -exec chmod +x {} \;

echo "✅ Permissions set for:"
find "dist/Turdus_M3rula.app" -name "turdus_merula" -o -name "turdusra1n"

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📂 Output location: dist/Turdus_M3rula.app"
echo ""
