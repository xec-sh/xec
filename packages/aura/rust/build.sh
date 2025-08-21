#!/usr/bin/env bash

# Build script for OpenTUI Rust implementation
# Builds for multiple targets similar to the Zig version

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building OpenTUI Rust Library${NC}"

# Ensure we're in the right directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Cargo is not installed${NC}"
    echo "Please install Rust from https://rustup.rs/"
    exit 1
fi

# Parse command line arguments
BUILD_TYPE="release"
SPECIFIC_TARGET=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --debug)
            BUILD_TYPE="debug"
            shift
            ;;
        --target)
            SPECIFIC_TARGET="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --debug           Build in debug mode (default: release)"
            echo "  --target TARGET   Build for specific target"
            echo "  --help           Show this help message"
            echo ""
            echo "Supported targets:"
            echo "  x86_64-unknown-linux-gnu"
            echo "  x86_64-apple-darwin"
            echo "  aarch64-apple-darwin"
            echo "  x86_64-pc-windows-gnu"
            echo "  aarch64-unknown-linux-gnu"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Build flags
BUILD_FLAGS=""
if [ "$BUILD_TYPE" = "release" ]; then
    BUILD_FLAGS="--release"
fi

# Function to build for a specific target
build_target() {
    local target=$1
    local target_name=$2
    
    echo -e "${YELLOW}Building for $target_name ($target)...${NC}"
    
    if cargo build $BUILD_FLAGS --target "$target" 2>/dev/null; then
        echo -e "${GREEN}✓ Successfully built for $target_name${NC}"
        
        # Create output directory matching Zig structure
        local arch=""
        local os=""
        
        case "$target" in
            x86_64-unknown-linux-gnu)
                arch="x86_64"
                os="linux"
                ;;
            x86_64-apple-darwin)
                arch="x86_64"
                os="macos"
                ;;
            aarch64-apple-darwin)
                arch="aarch64"
                os="macos"
                ;;
            x86_64-pc-windows-gnu)
                arch="x86_64"
                os="windows"
                ;;
            aarch64-unknown-linux-gnu)
                arch="aarch64"
                os="linux"
                ;;
        esac
        
        if [ -n "$arch" ] && [ -n "$os" ]; then
            local output_dir="../lib/${arch}-${os}"
            mkdir -p "$output_dir"
            
            # Copy the built library
            local build_dir="target/$target/$BUILD_TYPE"
            
            if [ "$os" = "windows" ]; then
                cp "$build_dir/opentui.dll" "$output_dir/" 2>/dev/null || true
            elif [ "$os" = "macos" ]; then
                cp "$build_dir/libopentui.dylib" "$output_dir/" 2>/dev/null || true
            else
                cp "$build_dir/libopentui.so" "$output_dir/" 2>/dev/null || true
            fi
        fi
    else
        echo -e "${YELLOW}⚠ Skipping $target_name (target not installed)${NC}"
        echo "  To install: rustup target add $target"
    fi
}

# List of targets to build
declare -A TARGETS=(
    ["x86_64-unknown-linux-gnu"]="Linux x86_64"
    ["x86_64-apple-darwin"]="macOS x86_64 (Intel)"
    ["aarch64-apple-darwin"]="macOS aarch64 (Apple Silicon)"
    ["x86_64-pc-windows-gnu"]="Windows x86_64"
    ["aarch64-unknown-linux-gnu"]="Linux aarch64"
)

echo ""
echo "Build configuration:"
echo "  Mode: $BUILD_TYPE"
if [ -n "$SPECIFIC_TARGET" ]; then
    echo "  Target: $SPECIFIC_TARGET"
else
    echo "  Targets: all supported"
fi
echo ""

# Build process
if [ -n "$SPECIFIC_TARGET" ]; then
    # Build specific target
    if [ -n "${TARGETS[$SPECIFIC_TARGET]}" ]; then
        build_target "$SPECIFIC_TARGET" "${TARGETS[$SPECIFIC_TARGET]}"
    else
        echo -e "${RED}Error: Unknown target $SPECIFIC_TARGET${NC}"
        exit 1
    fi
else
    # Build all targets
    for target in "${!TARGETS[@]}"; do
        build_target "$target" "${TARGETS[$target]}"
        echo ""
    done
fi

echo ""
echo -e "${GREEN}Build complete!${NC}"

# Show output location
echo ""
echo "Libraries have been placed in:"
ls -la ../lib/*/libopentui.* ../lib/*/opentui.* 2>/dev/null || echo "  (No libraries found - build may have failed)"