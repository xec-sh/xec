# TUI Tester Documentation

**@xec-sh/tui-tester** - A comprehensive end-to-end testing framework for terminal user interfaces.

## 📚 Documentation Structure

- [Getting Started](./getting-started.md) - Quick start guide and installation
- [API Reference](./api-reference.md) - Complete API documentation
- [Testing Guide](./testing-guide.md) - Best practices and testing patterns
- [Examples](./examples.md) - Code examples and use cases
- [Adapters](./adapters.md) - Runtime adapter documentation
- [Snapshot Testing](./snapshot-testing.md) - Visual regression testing
- [Integrations](./integrations.md) - Test framework integrations
- [Advanced Topics](./advanced.md) - Advanced features and techniques
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## 🎯 Overview

TUI Tester is a powerful testing framework designed specifically for terminal user interface applications. It provides:

- **Cross-runtime support**: Works with Node.js, Deno, and Bun
- **tmux-based isolation**: Tests run in isolated tmux sessions
- **Input simulation**: Keyboard, mouse, and text input
- **Visual assertions**: Screen capture and comparison
- **Snapshot testing**: Visual regression testing
- **Recording & playback**: Record and replay test sessions
- **Framework integration**: Works with Vitest, Jest, and other test runners

## 🚀 Quick Example

```typescript
import { createTester } from '@xec-sh/tui-tester';

// Create a tester instance
const tester = createTester('npm run app', {
  cols: 80,
  rows: 24,
  env: { NODE_ENV: 'test' }
});

// Start the application
await tester.start();

// Interact with the application
await tester.sendText('Hello World');
await tester.sendKey('Enter');

// Assert screen content
await tester.assertScreen(screen => 
  screen.includes('Welcome')
);

// Take a snapshot
await tester.snapshot('welcome-screen');

// Clean up
await tester.stop();
```

## 🏗 Architecture

TUI Tester uses tmux (terminal multiplexer) as its core technology to provide reliable, isolated testing environments:

```
┌─────────────────────────────────────────┐
│           Test Runner (Vitest/Jest)     │
├─────────────────────────────────────────┤
│              TUI Tester API             │
├─────────────────────────────────────────┤
│          Runtime Adapter Layer          │
│   (Node.js / Deno / Bun specific code)  │
├─────────────────────────────────────────┤
│             tmux Session                │
│         (Isolated test environment)     │
├─────────────────────────────────────────┤
│        Your Terminal Application        │
└─────────────────────────────────────────┘
```

## 🎯 Core Concepts

### 1. **Tester Instance**
The main testing interface that manages the tmux session and provides methods for interaction and assertion.

### 2. **Runtime Adapters**
Platform-specific implementations that handle process execution and file operations for Node.js, Deno, and Bun.

### 3. **Screen Capture**
Captures the current terminal screen content, including text, colors, and cursor position.

### 4. **Input Simulation**
Simulates user input including keyboard keys, mouse events, and text input.

### 5. **Assertions**
Built-in assertion methods for validating screen content, cursor position, and application state.

### 6. **Snapshots**
Visual regression testing by comparing current screen content with saved snapshots.

### 7. **Recording**
Record test sessions for debugging and creating reproducible test cases.

## 📋 Requirements

- **tmux**: Terminal multiplexer (required)
- **Runtime**: Node.js 18+, Deno 1.38+, or Bun 1.0+
- **OS**: Linux, macOS, or WSL on Windows

## 🔗 Related Documentation

- [tmux Documentation](https://github.com/tmux/tmux/wiki)
- [ANSI Escape Sequences](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Terminal Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)

## 📜 License

MIT © 2024