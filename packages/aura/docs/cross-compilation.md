# Cross-Compilation Guide for @xec-sh/aura Native Packages

This guide explains how to build native packages for different platforms using Rust cross-compilation.

## Overview

The @xec-sh/aura library uses Rust for high-performance terminal rendering. To support multiple platforms, we compile the Rust code into platform-specific native libraries that are distributed as separate npm packages.

## Package Naming Convention

Native packages follow this naming pattern:
```
@xec-sh/aura-native-<platform>-<architecture>
```

Where:
- `platform`: `darwin`, `linux`, `win32`
- `architecture`: `x64`, `arm64`

## Prerequisites

### 1. Install Rust

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Install Cross-Compilation Targets

```bash
# macOS targets
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

# Linux targets
rustup target add x86_64-unknown-linux-gnu
rustup target add aarch64-unknown-linux-gnu

# Windows targets
rustup target add x86_64-pc-windows-msvc
rustup target add aarch64-pc-windows-msvc
```

### 3. Install Platform-Specific Tools

#### For Linux Cross-Compilation

**On macOS:**
```bash
# Install cross-compilation toolchain
brew install messense/macos-cross-toolchains/x86_64-unknown-linux-gnu
brew install messense/macos-cross-toolchains/aarch64-unknown-linux-gnu
```

**On Ubuntu/Debian:**
```bash
# For ARM64 targets
sudo apt-get install gcc-aarch64-linux-gnu

# For Windows targets (MinGW)
sudo apt-get install mingw-w64
```

#### For Windows Cross-Compilation

**Using xwin (recommended):**
```bash
cargo install xwin
xwin --accept-license splat --output ~/.xwin
```

## Building Native Packages

### Build All Platforms

```bash
# Build all native packages in release mode
bun run build:native

# Build all in development mode (with debug symbols)
bun run build:native:dev
```

### Build Current Platform Only

```bash
# Build for your current platform
bun run build:native:current
```

### Build Specific Platforms

```bash
# Build for macOS only
bun scripts/build.ts --native --platform=darwin

# Build for Linux only
bun scripts/build.ts --native --platform=linux

# Build for Windows only
bun scripts/build.ts --native --platform=win32

# Build multiple specific platforms
bun scripts/build.ts --native --platform=darwin --platform=linux
```

### Using the Rust Build Script Directly

```bash
cd packages/aura/rust

# Build all platforms
./build.sh

# Build specific target
./build.sh --target x86_64-apple-darwin

# Build in debug mode
./build.sh --debug

# Build multiple targets
./build.sh --target x86_64-apple-darwin --target aarch64-apple-darwin
```

## Platform-Specific Notes

### macOS (Darwin)

- **Supported architectures**: x64 (Intel), arm64 (Apple Silicon)
- **Library extension**: `.dylib`
- **Cross-compilation**: Can build both architectures on Apple Silicon Macs

```bash
# Build both macOS architectures
bun scripts/build.ts --native --platform=darwin
```

### Linux

- **Supported architectures**: x64, arm64
- **Library extension**: `.so`
- **Cross-compilation**: Requires appropriate GCC toolchain

```bash
# Build both Linux architectures
bun scripts/build.ts --native --platform=linux
```

### Windows

- **Supported architectures**: x64, arm64
- **Library extension**: `.dll`
- **Cross-compilation**: Requires MinGW or xwin toolchain

```bash
# Build both Windows architectures
bun scripts/build.ts --native --platform=win32
```

## Testing Native Packages

After building, test the native packages:

```bash
# Test current platform
cd packages/aura
bun test:native

# Test specific platform loading
node -e "const lib = require('@xec-sh/aura-native-darwin-arm64'); console.log(lib)"
```

## Publishing Native Packages

### Automated Publishing (CI/CD)

The GitHub Actions workflow automatically builds and can publish packages:

```yaml
# Trigger manual publish
gh workflow run build-aura-native.yml -f publish=true
```

### Manual Publishing

```bash
# Publish all packages (builds first)
bun run publish

# Dry run (test without publishing)
bun run publish:dry-run

# Publish with specific tag
bun scripts/publish.ts --tag=beta

# Publish only native packages
bun scripts/publish.ts --skip-lib

# Publish only main library
bun scripts/publish.ts --skip-native
```

## Troubleshooting

### Common Issues

#### 1. Missing Rust Target

**Error**: `can't find crate for 'std'`

**Solution**: Install the target:
```bash
rustup target add <target-triple>
```

#### 2. Linker Not Found

**Error**: `linker 'xxx' not found`

**Solution**: Install the appropriate cross-compilation toolchain for your platform.

#### 3. Library Not Found at Runtime

**Error**: `Cannot find module '@xec-sh/aura-native-xxx'`

**Solution**: Ensure the native package is built and installed:
```bash
bun run build:native:current
```

#### 4. Symbol Resolution Errors

**Error**: `undefined symbol: xxx`

**Solution**: Rebuild with matching Rust version:
```bash
rustup update
cargo clean
bun run build:native
```

### Debug Build Issues

Enable verbose output:
```bash
RUST_BACKTRACE=1 CARGO_VERBOSE=1 bun scripts/build.ts --native --dev
```

Check Cargo configuration:
```bash
cat packages/aura/rust/.cargo/config.toml
```

## Architecture Details

### Directory Structure After Build

```
packages/aura/
├── rust/
│   └── target/
│       ├── release/
│       │   └── libaura.dylib (current platform)
│       ├── x86_64-apple-darwin/
│       │   └── release/
│       │       └── libaura.dylib
│       └── aarch64-apple-darwin/
│           └── release/
│               └── libaura.dylib
└── node_modules/
    ├── @xec-sh/aura-native-darwin-x64/
    │   ├── package.json
    │   ├── index.ts
    │   └── libaura.dylib
    └── @xec-sh/aura-native-darwin-arm64/
        ├── package.json
        ├── index.ts
        └── libaura.dylib
```

### Loading Mechanism

The main @xec-sh/aura package automatically detects and loads the appropriate native binary:

```typescript
// Automatic platform detection in aura/src/renderer/native.ts
const platform = process.platform;
const arch = process.arch;
const nativePackage = `@xec-sh/aura-native-${platform}-${arch}`;

try {
  const native = require(nativePackage);
  // Use native library
} catch (e) {
  // Fallback to pure JavaScript implementation
}
```

## Performance Considerations

### Release vs Debug Builds

- **Release**: Optimized for performance, smaller size, no debug symbols
- **Debug**: Includes debug symbols, better error messages, larger size

### Optimization Flags

Configured in `Cargo.toml`:
```toml
[profile.release]
opt-level = 3        # Maximum optimization
lto = "fat"          # Link-time optimization
codegen-units = 1    # Single codegen unit for better optimization
strip = true         # Remove symbols
panic = "abort"      # Smaller binary, no unwinding
```

## Contributing

When adding support for new platforms:

1. Update `variants` array in `scripts/build.ts`
2. Add Rust target configuration in `.cargo/config.toml`
3. Update CI workflow in `.github/workflows/build-aura-native.yml`
4. Test cross-compilation locally
5. Document platform-specific requirements

## References

- [Rust Cross-Compilation](https://rust-lang.github.io/rustup/cross-compilation.html)
- [Cargo Target Configuration](https://doc.rust-lang.org/cargo/reference/config.html)
- [Platform Support](https://doc.rust-lang.org/nightly/rustc/platform-support.html)