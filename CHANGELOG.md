# Changelog

All notable changes to this project will be documented in this file.


## [0.9.0] - 2026-03-15

### ✨ Features

- feat(website): upgrade to React 19, fix build errors
- feat(ops): make all configuration fully customizable
- feat: create @xec-sh/ops — DevOps operations library
- feat(loader): add watch mode, plugin system, and streaming execution
- feat(core): add zx-compatible utilities and missing features
- feat(kit): comprehensive audit - port upstream features, bug fixes, and improvements

### 🐛 Bug Fixes

- fix(website): remove locale dropdown and ru from search — English only
- fix(ci): update lockfile to include website workspace dependencies
- fix(ci): update pnpm-workspace docs→website, simplify install step
- fix(ci): remove pnpm version from workflow — use packageManager from package.json
- fix(website): resolve build errors and broken links
- fix(cli): resolve runtime errors — restore required direct dependencies
- fix(cli,ops): resolve all compiler errors from library extraction
- fix(cli): replace tempy with native mkdtempSync in new command tests
- fix(cli): fix spinner API and remaining test issues
- fix(cli): resolve remaining test failures
- fix(cli): resolve test failures from vitest 4 migration
- fix(core): add global test container cleanup to prevent Docker pollution
- fix(core): implement P2/P3 audit improvements
- fix(core): resolve critical audit findings - resource leaks, race conditions, type safety
- fix(core): resolve test failures across unit, integration, and performance suites
- fix(core): increase test timeout to 60s for Docker integration tests
- fix(core): fix broken import paths in integration tests
- fix(testing): update dependencies, fix security vulnerabilities, and improve type safety
- fix(kit): resolve build error in SelectKeyPrompt initialValue type
- fix(kit): resolve all ESLint errors and improve type safety
- fix(kit): regenerate snapshots with FORCE_COLOR=1 to match pnpm test
- fix(tests): fix kubernetes adapter test suite configuration
- fix(core): fix nothrow() handling with timeout and expand test coverage
- fix(core): remove automatic buffer cleanup to preserve stream content
- fix(core): preserve StreamHandler buffers after flush for content access
- fix(core): fix critical execution engine bugs and test infrastructure
- fix(core): fix critical execution engine bugs and test infrastructure

### ♻️ Refactors

- refactor(website): rewrite homepage, rename workflow, fix build
- refactor(cli,ops): make CLI a thin shell over @xec-sh/ops
- refactor(ops): extract library code from CLI into @xec-sh/ops
- refactor(cli): major modernization - migrate to vitest, remove 11 dependencies
- refactor(core): move docker-adapter.test.ts from unit to integration
- refactor(core): migrate from jest to vitest and update dependencies
- refactor(testing): migrate from jest/commonjs to vitest/esm
- refactor(loader): improve type safety and consolidate utilities
- refactor(core): remove remote-docker adapter implementation

### 📝 Other Changes

- chore: add version, @xec-sh/kit and glob to root package.json
- chore(website): remove blog and changelog sections
- docs: rewrite all package READMEs in unified format
- docs: update CLAUDE.md and README.md for current architecture
- docs: fix all stale references across documentation
- docs: comprehensive documentation update for new architecture
- docs: rewrite ecosystem page with complete package architecture
- chore: update root scripts for docs → website rename
- chore: rename docs/ to website/
- chore: remove test step from release script
- chore: adapt release script for @xec-sh npm publishing
- chore: remove stray build artifacts
- chore(cli): remove obsolete jest config files
- chore(cli): add .xec/.tmp/ to gitignore
- chore(cli): remove accidentally committed temp files
- chore(loader): update dependencies and remove report files
- chore(core): remove dead remote-docker references
- chore: remove accidentally committed test.txt
- chore: remove @changesets/cli dependency
- chore(kit): update dependencies and remove unused tui-tester
- docs(kit): restructure examples with numbered progression and full API coverage
- test(core,testing): fix test infrastructure and add smart binary detection
- test(loader): activate all skipped tests and add comprehensive edge cases
- build: migrate from yarn to pnpm
- test(docker): expand docker-fluent-api-ssh test coverage with comprehensive scenarios
- test(core): expand raw-function test coverage with comprehensive edge cases

