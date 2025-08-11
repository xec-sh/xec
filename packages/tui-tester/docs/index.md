# TUI Tester Documentation Index

Complete documentation for the @xec-sh/tui-tester terminal testing framework.

## 📚 Documentation Overview

This documentation provides comprehensive coverage of all TUI Tester features, APIs, and best practices.

### Core Documentation

| Document | Description | Topics Covered |
|----------|-------------|----------------|
| [README](./README.md) | Main overview and introduction | Architecture, core concepts, requirements |
| [Getting Started](./getting-started.md) | Quick start guide | Installation, basic usage, first tests |
| [API Reference](./api-reference.md) | Complete API documentation | All methods, types, and interfaces |

### Guides and Tutorials

| Document | Description | Key Topics |
|----------|-------------|------------|
| [Testing Guide](./testing-guide.md) | Best practices and patterns | Strategies, organization, common patterns |
| [Examples](./examples.md) | Real-world testing examples | CLI tools, REPL, editors, dashboards |
| [Snapshot Testing](./snapshot-testing.md) | Visual regression testing | Snapshots, comparisons, CI/CD integration |

### Advanced Topics

| Document | Description | Key Features |
|----------|-------------|--------------|
| [Adapters](./adapters.md) | Runtime adapter documentation | Node.js, Deno, Bun, custom adapters |
| [Integrations](./integrations.md) | Test framework integrations | Vitest, Jest, Mocha, Playwright |
| [Advanced](./advanced.md) | Advanced features and techniques | Performance, debugging, security |
| [Troubleshooting](./troubleshooting.md) | Common issues and solutions | FAQ, platform issues, debugging tips |

## 🎯 Quick Links by Use Case

### I want to...

#### Get Started Quickly
- [Installation Instructions](./getting-started.md#installation)
- [Quick Start Example](./getting-started.md#quick-start)
- [Basic Test Setup](./getting-started.md#basic-test-setup)

#### Learn the API
- [Core API Methods](./api-reference.md#core-api)
- [Input Methods](./api-reference.md#input-methods)
- [Assertion Methods](./api-reference.md#assertion-methods)
- [Screen Methods](./api-reference.md#screen-methods)

#### Test Specific Applications
- [CLI Tools](./examples.md#testing-a-cli-tool)
- [Interactive REPLs](./examples.md#testing-an-interactive-repl)
- [Text Editors](./examples.md#testing-a-text-editor)
- [Dashboard Apps](./examples.md#testing-a-dashboard-application)

#### Implement Advanced Features
- [Parallel Testing](./advanced.md#parallel-testing)
- [Custom Assertions](./advanced.md#custom-assertions)
- [Recording & Playback](./advanced.md#recording-and-playback)
- [Performance Testing](./testing-guide.md#performance-testing)

#### Solve Problems
- [Installation Issues](./troubleshooting.md#installation-issues)
- [tmux Issues](./troubleshooting.md#tmux-issues)
- [Test Failures](./troubleshooting.md#test-failures)
- [Platform-Specific Issues](./troubleshooting.md#platform-specific-issues)

## 📊 Feature Coverage

### ✅ Fully Documented Features

- **Core Functionality**
  - Tester lifecycle (start, stop, restart)
  - Input simulation (text, keys, mouse)
  - Screen capture and assertions
  - Wait conditions and timeouts

- **Advanced Features**
  - Snapshot testing
  - Session recording and playback
  - Parallel test execution
  - Custom assertions

- **Platform Support**
  - Node.js adapter
  - Deno adapter
  - Bun adapter
  - Custom adapter creation

- **Test Framework Integration**
  - Vitest (recommended)
  - Jest
  - Mocha
  - Playwright Test
  - Cypress
  - AVA
  - Tap

## 📈 API Coverage Statistics

| Category | Methods | Documented | Coverage |
|----------|---------|------------|----------|
| Lifecycle | 4 | 4 | 100% |
| Input | 8 | 8 | 100% |
| Screen | 7 | 7 | 100% |
| Assertions | 6 | 6 | 100% |
| Wait | 5 | 5 | 100% |
| Mouse | 8 | 8 | 100% |
| Recording | 4 | 4 | 100% |
| Snapshots | 3 | 3 | 100% |
| Utilities | 6 | 6 | 100% |
| **Total** | **51** | **51** | **100%** |

## 🔍 Search Keywords

### By Feature
- **Input**: `sendText`, `sendKey`, `sendKeys`, `sendCommand`, `sendMouse`
- **Screen**: `getScreen`, `getLines`, `capture`, `getCursor`
- **Assertions**: `assertScreen`, `assertLine`, `waitFor`, `waitForText`
- **Snapshots**: `snapshot`, `compareSnapshot`, `SnapshotManager`
- **Recording**: `startRecording`, `stopRecording`, `replay`

### By Use Case
- **Testing CLIs**: CLI, command-line, arguments, pipes
- **Testing TUIs**: terminal UI, ncurses, blessed, interactive
- **Visual Testing**: snapshot, regression, visual, comparison
- **Automation**: recording, playback, scripting

### By Problem
- **Installation**: tmux, npm, setup, requirements
- **Errors**: timeout, not found, permission, failed
- **Performance**: slow, memory, CPU, optimization
- **Debugging**: debug, trace, log, attach

## 📝 Documentation Standards

All documentation follows these standards:

1. **Structure**: Clear hierarchy with table of contents
2. **Examples**: Working code examples for all features
3. **Completeness**: All public APIs documented
4. **Accuracy**: Tested and verified code samples
5. **Accessibility**: Plain language, progressive complexity
6. **Searchability**: Keywords and cross-references
7. **Maintenance**: Version-specific information marked

## 🔄 Version Compatibility

This documentation covers:
- **TUI Tester**: v0.1.0+
- **Node.js**: 18.0.0+
- **Deno**: 1.38.0+
- **Bun**: 1.0.0+
- **tmux**: 2.0+

## 📮 Feedback

For documentation improvements or corrections:
1. Check existing [documentation](./README.md)
2. Review [troubleshooting](./troubleshooting.md)
3. Submit issues or PRs to the repository

## 📜 License

Documentation is licensed under MIT, same as the TUI Tester package.