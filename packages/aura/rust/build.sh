#!/bin/bash

# Build script for cross-compiling Aura Rust library
# Supports building for multiple platforms

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
BUILD_MODE="release"
TARGET_PLATFORMS=()
BUILD_ALL=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            BUILD_MODE="debug"
            shift
            ;;
        --target)
            BUILD_ALL=false
            TARGET_PLATFORMS+=("$2")
            shift 2
            ;;
        --help)
            echo "Usage: ./build.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --debug              Build in debug mode (default: release)"
            echo "  --target <platform>  Build for specific platform (can be specified multiple times)"
            echo "  --help              Show this help message"
            echo ""
            echo "Supported targets:"
            echo "  x86_64-apple-darwin"
            echo "  aarch64-apple-darwin"
            echo "  x86_64-unknown-linux-gnu"
            echo "  aarch64-unknown-linux-gnu"
            echo "  x86_64-pc-windows-msvc"
            echo "  aarch64-pc-windows-msvc"
            echo ""
            echo "Examples:"
            echo "  ./build.sh                                    # Build for all platforms"
            echo "  ./build.sh --debug                           # Build debug for all platforms"
            echo "  ./build.sh --target x86_64-apple-darwin      # Build for macOS x64 only"
            echo "  ./build.sh --target x86_64-apple-darwin --target aarch64-apple-darwin  # Build for both macOS architectures"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Define all supported targets if building for all
if [ "$BUILD_ALL" = true ]; then
    TARGET_PLATFORMS=(
        "x86_64-apple-darwin"
        "aarch64-apple-darwin"
        "x86_64-unknown-linux-gnu"
        "aarch64-unknown-linux-gnu"
        "x86_64-pc-windows-msvc"
        "aarch64-pc-windows-msvc"
    )
fi

# Build flags
if [ "$BUILD_MODE" = "release" ]; then
    BUILD_FLAGS="--release"
    BUILD_DIR="release"
    echo -e "${GREEN}Building in RELEASE mode${NC}"
else
    BUILD_FLAGS=""
    BUILD_DIR="debug"
    echo -e "${YELLOW}Building in DEBUG mode${NC}"
fi

# Function to detect current platform
detect_current_platform() {
    local os=$(uname -s)
    local arch=$(uname -m)
    
    case "$os" in
        Darwin)
            case "$arch" in
                x86_64) echo "x86_64-apple-darwin" ;;
                arm64|aarch64) echo "aarch64-apple-darwin" ;;
                *) echo "unknown" ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64) echo "x86_64-unknown-linux-gnu" ;;
                aarch64) echo "aarch64-unknown-linux-gnu" ;;
                *) echo "unknown" ;;
            esac
            ;;
        MINGW*|MSYS*|Windows*)
            case "$arch" in
                x86_64) echo "x86_64-pc-windows-msvc" ;;
                aarch64) echo "aarch64-pc-windows-msvc" ;;
                *) echo "unknown" ;;
            esac
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Function to install Rust target if needed
install_target_if_needed() {
    local target=$1
    
    if ! rustup target list --installed | grep -q "$target"; then
        echo -e "${YELLOW}Installing Rust target: $target${NC}"
        rustup target add "$target"
    fi
}

# Function to get library name and extension for platform
get_lib_info() {
    local platform=$1
    
    case "$platform" in
        *apple-darwin*)
            echo "libaura:dylib"
            ;;
        *linux*)
            echo "libaura:so"
            ;;
        *windows*)
            echo "aura:dll"
            ;;
        *)
            echo "unknown:unknown"
            ;;
    esac
}

# Current platform
CURRENT_PLATFORM=$(detect_current_platform)
echo -e "${BLUE}Current platform: $CURRENT_PLATFORM${NC}"

# Create target directories
mkdir -p ../lib

# Build for each target
for target in "${TARGET_PLATFORMS[@]}"; do
    echo ""
    echo -e "${BLUE}Building for: $target${NC}"
    
    # Skip if trying to cross-compile from incompatible host
    if [ "$target" != "$CURRENT_PLATFORM" ]; then
        # Check if we can cross-compile to this target
        case "$CURRENT_PLATFORM:$target" in
            *apple-darwin*:*apple-darwin*)
                # Can cross-compile between macOS architectures
                ;;
            *linux*:*linux*)
                # Can potentially cross-compile between Linux architectures
                # if proper toolchain is installed
                ;;
            *)
                # Check if cross-compilation toolchain exists
                if [ "$target" = "x86_64-pc-windows-msvc" ] || [ "$target" = "aarch64-pc-windows-msvc" ]; then
                    if ! command -v xwin &> /dev/null && ! command -v wine &> /dev/null; then
                        echo -e "${YELLOW}Skipping $target: Cross-compilation to Windows requires xwin or wine${NC}"
                        continue
                    fi
                fi
                ;;
        esac
        
        # Install target if not present
        install_target_if_needed "$target"
    fi
    
    # Build
    echo -e "${GREEN}Compiling...${NC}"
    if [ "$target" = "$CURRENT_PLATFORM" ]; then
        # Native compilation
        cargo build $BUILD_FLAGS
        TARGET_DIR="target/$BUILD_DIR"
    else
        # Cross compilation
        cargo build $BUILD_FLAGS --target "$target"
        TARGET_DIR="target/$target/$BUILD_DIR"
    fi
    
    # Get library info
    IFS=':' read -r lib_name lib_ext <<< "$(get_lib_info "$target")"
    
    # Create platform-specific directory
    PLATFORM_DIR="../lib/$target"
    mkdir -p "$PLATFORM_DIR"
    
    # Copy the built library
    SOURCE_LIB="$TARGET_DIR/${lib_name}.${lib_ext}"
    if [ -f "$SOURCE_LIB" ]; then
        cp "$SOURCE_LIB" "$PLATFORM_DIR/"
        echo -e "${GREEN}✓ Copied ${lib_name}.${lib_ext} to $PLATFORM_DIR${NC}"
    else
        echo -e "${RED}✗ Library not found: $SOURCE_LIB${NC}"
        echo -e "${YELLOW}  Available files in $TARGET_DIR:${NC}"
        ls -la "$TARGET_DIR" | grep -E "\.(so|dylib|dll)$" || echo "  No libraries found"
    fi
done

echo ""
echo -e "${GREEN}Build complete!${NC}"
echo ""
echo "Built libraries:"
find ../lib -type f -name "*.so" -o -name "*.dylib" -o -name "*.dll" | while read lib; do
    echo "  - $lib"
done