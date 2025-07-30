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