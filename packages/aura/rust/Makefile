.PHONY: build build-debug build-release clean test doc fmt check all

# Default target
all: build

# Build in release mode (default)
build: build-release

# Build in debug mode
build-debug:
	cargo build

# Build in release mode with optimizations
build-release:
	cargo build --release

# Build for all supported targets
build-all:
	./build.sh

# Build for specific target
build-target:
	@if [ -z "$(TARGET)" ]; then \
		echo "Error: TARGET not specified. Usage: make build-target TARGET=x86_64-apple-darwin"; \
		exit 1; \
	fi
	./build.sh --target $(TARGET)

# Clean build artifacts
clean:
	cargo clean
	rm -rf ../lib/*/libaura.*
	rm -rf ../lib/*/aura.*

# Run tests
test:
	cargo test

# Run tests with coverage
test-coverage:
	cargo tarpaulin --out Html

# Generate documentation
doc:
	cargo doc --no-deps --open

# Format code
fmt:
	cargo fmt

# Check formatting
fmt-check:
	cargo fmt -- --check

# Run clippy linter
clippy:
	cargo clippy -- -D warnings

# Check everything (format, lint, test)
check: fmt-check clippy test

# Install required targets for cross-compilation
install-targets:
	rustup target add x86_64-unknown-linux-gnu
	rustup target add x86_64-apple-darwin
	rustup target add aarch64-apple-darwin
	rustup target add x86_64-pc-windows-gnu
	rustup target add aarch64-unknown-linux-gnu

# Build and copy to Node.js expected location
node-build: build-release
	@echo "Copying library for Node.js..."
	@mkdir -p ../native
	@if [ -f target/release/libaura.dylib ]; then \
		cp target/release/libaura.dylib ../native/; \
	elif [ -f target/release/libaura.so ]; then \
		cp target/release/libaura.so ../native/; \
	elif [ -f target/release/aura.dll ]; then \
		cp target/release/aura.dll ../native/; \
	fi
	@echo "Library copied to ../native/"

# Help target
help:
	@echo "AURA Rust Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  make build           - Build in release mode (default)"
	@echo "  make build-debug     - Build in debug mode"
	@echo "  make build-release   - Build in release mode with optimizations"
	@echo "  make build-all       - Build for all supported platforms"
	@echo "  make build-target    - Build for specific target (requires TARGET=...)"
	@echo "  make clean          - Remove build artifacts"
	@echo "  make test           - Run tests"
	@echo "  make test-coverage  - Run tests with coverage report"
	@echo "  make doc            - Generate and open documentation"
	@echo "  make fmt            - Format code"
	@echo "  make fmt-check      - Check code formatting"
	@echo "  make clippy         - Run Clippy linter"
	@echo "  make check          - Run all checks (format, lint, test)"
	@echo "  make install-targets - Install cross-compilation targets"
	@echo "  make node-build     - Build and copy library for Node.js"
	@echo "  make help           - Show this help message"
	@echo ""
	@echo "Examples:"
	@echo "  make                        # Build in release mode"
	@echo "  make build-debug            # Build in debug mode"
	@echo "  make build-target TARGET=x86_64-apple-darwin"
	@echo "  make test                   # Run tests"
	@echo "  make check                  # Run all checks"