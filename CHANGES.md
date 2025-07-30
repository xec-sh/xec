# Pending Changes

## General

### Fixes
- **CLI**: Fixed array command arguments being incorrectly passed to Docker containers in `experiments/hard-guard-wall/.xec/commands/onion.ts`:
  - Arrays passed to template literals were converted to comma-separated strings causing "unrecognised argument: -c" error
  - Fixed by properly joining array elements with spaces before passing to Docker run mode
- **Documentation**: Updated Russian homepage translations to match the current English version:
  - Changed from "Infrastructure Orchestration Platform" to "Universal Shell for TypeScript" theme
  - Updated all feature descriptions to focus on command execution and automation
  - Aligned use cases with the English version (Remote Server Management, Task Automation, Cross-Platform Execution)

### Improvements
- **Project Structure**: Moved documentation from `apps/docs` to root-level `docs` directory for better organization:
  - Updated GitHub workflow paths for documentation deployment
  - Updated all project references and documentation paths
  - Modified workspace configuration to include docs at root level
- **Core API**: Deprecated `isSuccess()` method in favor of new `ok` property on ExecutionResult:
  - Updated all tests to use `result.ok` instead of `result.isSuccess()`
  - Updated all examples (26 occurrences across 13 files) to use the new API
  - Updated all documentation files (50 occurrences across 20 files) to reflect the change
  - The `ok` property provides the same functionality with cleaner syntax
  - The `cause` property provides error reason ("exitCode: N" or "signal: NAME") when command fails