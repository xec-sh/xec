# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fixed `raw` method not being chainable - the `raw` method now correctly returns a chainable CallableExecutionEngine instance like other adapter methods
- Resolved test isolation issues in simplified API tests related to Jest async error handling (tests are now properly documented with known Jest limitations)

### Changed
- Improved test stability by identifying and documenting Jest-specific async error handling limitations in `simplified-api.test.ts`

## [0.6.2] - 2025-01-XX

### Added
- Added `new` CLI command for creating new projects and scripts

### Fixed
- Documentation fixes and improvements

## [0.6.1] - Previous Release

### Added
- Initial release with core functionality
- Universal command execution across local, SSH, Docker, and Kubernetes environments
- Template literal API with chainable methods
- Comprehensive adapter system
- Error handling and retry mechanisms
- Connection pooling and caching
- Secure password handling
- Progress tracking and streaming support

---

## Notes

This changelog tracks changes to the entire xec monorepo, including:
- `@xec-sh/core` - Core execution engine
- `@xec-sh/cli` - Command-line interface
- Documentation and tooling updates

For package-specific changes, see individual package directories.