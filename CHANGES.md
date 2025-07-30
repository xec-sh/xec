# Pending Changes

## General

### Features
- **Documentation**: Add local search functionality to documentation site using docusaurus-search-local plugin with support for English and Russian languages
- **MCP Integration**: Added comprehensive Model Context Protocol (MCP) server specification for AI integration
  - Detailed architecture and implementation guide for language model interactions
  - Tool definitions for command execution, script creation, and testing
  - Resource management for scripts, configs, and documentation
  - Interactive prompts for guided workflows
  - Security considerations and best practices
- **CLI**: Improved help output with clear separation between built-in and dynamic commands for better command organization
- **Core API**: Added simplified `ok` and `cause` properties to ExecutionResult for easier success checking:
  - `result.ok` returns true if exitCode === 0
  - `result.cause` provides error reason ("exitCode: N" or "signal: NAME") when command fails
  - Deprecated `result.isSuccess()` method in favor of `result.ok` property
- **Docker Adapter**: Added support for ephemeral containers with new `runMode: 'run'` option:
  - Execute commands in containers that exit immediately after completion
  - Perfect for running containerized CLI tools and one-off tasks
  - Supports all standard Docker options (volumes, environment, workdir, etc.)
  - Automatic container removal with `autoRemove: true` option
- **Docker API**: Introduced simplified Docker API with automatic ephemeral vs persistent container detection:
  - New `$.docker({ image: 'alpine' })` syntax for ephemeral containers
  - New `$.docker({ container: 'my-app' })` syntax for existing containers
  - Automatic `runMode` detection based on presence of `image` option
  - Smart defaults: `autoRemove: true` for ephemeral containers
  - Fluent API support: `$.docker().ephemeral('alpine').volumes([...]).run\`cmd\``
  - Build integration: `$.docker().build('./path').execute()`
  - Backward compatibility with deprecation warnings for old API
  - Unique container name generation for ephemeral containers

### Deprecations and Removals
- **Docker API**: Marked old DockerContext API as deprecated in favor of simplified Docker API:
  - Deprecated `DockerContainer`, `DockerContext`, and `createDockerContext` functions
  - These will be removed in the next major version
  - Use new simplified API: `$.docker({ image: 'alpine' })` for ephemeral containers or `$.docker({ container: 'my-app' })` for existing containers
- **Examples**: Removed outdated Docker examples that used deprecated API:
  - Removed `11-docker-lifecycle.ts` - use Docker CLI commands for lifecycle management
  - Removed `12-docker-streaming.ts` - use `docker logs -f` for log streaming
  - Updated `05-docker-run-mode.ts` to use new simplified API
  - Updated `06-docker-run-helper.ts` to use new simplified API and fluent interface
- **Tests**: Removed tests for deprecated Docker API:
  - Removed `test/unit/utils/docker-api.test.ts` testing old DockerContext API
  - Removed `test/unit/core/docker-api.test.ts` testing old container lifecycle methods
  - Existing `docker-simplified-api.test.ts` provides comprehensive coverage for new API

### Documentation Updates
- **Docker Adapter**: Completely rewrote Docker adapter documentation to use new simplified API:
  - Removed all references to deprecated `.start()`, `.stop()`, `.remove()`, `.exec()` methods
  - Updated examples to use Docker CLI for lifecycle management
  - Added migration guide from old to new API
  - Emphasized ephemeral containers as the recommended approach
  - Clarified that full lifecycle management should use Docker CLI commands

### Fixes
- **Docker Adapter**: Fixed shell command execution in containers with ENTRYPOINT:
  - When using shell mode with containers that have ENTRYPOINT defined, commands failed because Docker prepended the entrypoint to shell commands
  - Fixed by overriding ENTRYPOINT with 'sh' when shell mode is used in Docker run mode
- **Examples README**: Updated Docker examples to show new simplified API syntax

### Improvements
- **CLI**: Enhanced command listing with grouped display - built-in commands shown separately from dynamic commands loaded from .xec/commands directory
- **Core API**: Updated all examples and documentation to use new `result.ok` property instead of deprecated `isSuccess()` method
- **Testing**: Added comprehensive test coverage for new ExecutionResult properties `ok` and `cause`
- **Testing**: Added `docker-mkp224o.test.ts` to verify ephemeral container execution without name conflicts:
  - Tests parallel execution of multiple containers with same name
  - Verifies sequential container runs work correctly
  - Ensures custom container names are properly handled
- **Examples**: Added comprehensive Docker run mode examples demonstrating ephemeral container usage for CLI tools
- **Examples**: Added `07-docker-simplified-api.ts` showcasing new Docker API patterns and fluent interface
- **Documentation**: Updated Docker adapter documentation with detailed run mode section and usage patterns
- **Documentation**: Added new simplified API and fluent API sections to Docker adapter documentation
- **Docker Adapter**: Refactored to automatically detect `runMode` based on presence of `image` option
- **Testing**: Added comprehensive unit and integration tests for new Docker API features

### Fixes
- **Core**: Fixed "Docker adapter not available" error by initializing Docker adapter by default in ExecutionEngine
- **CLI**: Fixed dynamic command module loading by improving temporary file location resolution for TypeScript command files
  - Enhanced path resolution to search upwards for node_modules directory
  - Added monorepo structure support (checks for apps/xec/node_modules)
  - Improved temporary file placement to ensure access to dependencies
- **CLI**: Fix dynamic command loading mechanism to properly resolve node_modules in monorepo structure by searching upwards for node_modules directory
- **CLI**: Fixed help display behavior - running `xec` without arguments now shows help (same as `xec --help`)
- **CLI**: Fixed help output for individual commands - now shows command-specific help instead of general help by using configureHelp instead of disabling help globally
- **CLI**: Fixed command execution to use raw mode, preventing unwanted escaping of quotes and special characters in direct commands
- **Core API**: Replaced deprecated TempDir.create() with withTempDir() function in onion-optimized command for proper temporary directory management
- **Examples**: Refactored `experiments/hard-guard-wall/.xec/commands/onion-optimized.ts` to use proper fluent API:
  - Replaced deprecated `createDockerContext` with `$.docker()` fluent-style API
  - Removed direct `TransferEngine` usage in favor of built-in `container.copyFrom()` method
  - Improved code consistency with the recommended API patterns
- **CLI**: Fixed array command arguments being incorrectly passed to Docker containers in `experiments/hard-guard-wall/.xec/commands/onion.ts`:
  - Arrays passed to template literals were converted to comma-separated strings causing "unrecognised argument: -c" error
  - Fixed by properly joining array elements with spaces before passing to Docker run mode

### Improvements
- **CLI**: Optimized `onion.ts` command in experiments/hard-guard-wall to use xec-core advanced features:
  - Replaced direct shell commands with DockerContainer API for better lifecycle management
  - Implemented proper error handling using xec-core's error system
  - Used TempDir API for safe temporary file operations (updated to withTempDir)
  - Added event-based progress tracking
  - Improved file operations using TransferEngine and fs/promises
  - Enhanced container management with automatic cleanup

## Hard Guard Wall Project

### Features
- **Tor Load Balancer**: Created comprehensive Tor hidden service load balancer system in `experiments/hard-guard-wall`
- **Onionbalance Integration**: Implemented load distribution across multiple Tor instances using onionbalance
- **Vanity Address Generation**: Added mkp224o integration for generating custom onion addresses with prefixes
- **Docker Infrastructure**: Created Docker configurations for all components (Tor, onionbalance, mkp224o)
- **CLI Commands**: Developed complete xec command suite:
  - `onion` - Generate and manage onion addresses with backup/restore
  - `tor` - Manage Tor instances with dynamic scaling support
  - `nginx` - Configure and manage nginx reverse proxy integration
  - `balance` - Control onionbalance load balancer
  - `status` - System health monitoring with JSON output
  - `monitor` - Real-time dashboard rebuilt with React 19.1.1 and Ink 6.1.0 for improved terminal UI
  - `hgw` - Main management command for deployment and operations
- **Deployment Automation**: Implemented deployment scripts supporting both local and SSH remote deployment
- **Configuration Management**: Added YAML-based configuration with environment-specific settings
- **Monitoring**: Created real-time monitoring dashboard with service status, logs, and metrics
- **Documentation**: Comprehensive README with architecture diagrams and troubleshooting guides

### Technical Improvements
- **Scalable Architecture**: Modular design with separate Docker containers for each component
- **Security**: Isolated environments, secure key storage, and backup mechanisms
- **Remote Deployment**: Full SSH support for deploying to remote servers
- **Quick Start**: Added quick-start script for easy first-time setup
- **Modern UI**: Migrated monitor command from blessed to React/Ink for better terminal UI with tabs, real-time updates, and improved keyboard navigation

### Fixes
- **Cross-platform Compatibility**: Fixed onion generation command to work on macOS by adding fallback for missing `timeout` command
  - Supports both `timeout` (Linux) and `gtimeout` (macOS via GNU coreutils)
  - Falls back to running without timeout if neither is available
- **Onion Command Optimization**: Refactored onion generation to use ephemeral containers with `runMode: 'run'` for better performance
  - Replaced container lifecycle management (.start/.exec/.remove) with single run command
  - Removed redundant container exec operations for finding generated addresses
  - Addresses are now read directly from mounted volume after mkp224o completes
  - Simplified error handling for timeout scenarios