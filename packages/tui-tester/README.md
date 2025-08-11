# Terminal E2E Testing Framework

A comprehensive system for end-to-end testing of terminal applications with support for mouse, keyboard, snapshots, and session recording.

## 🚀 Features

- ✅ **Cross-platform**: Works with Node.js, Deno, and Bun
- ✅ **Real testing**: Uses tmux to create an actual terminal
- ✅ **Fully asynchronous**: All operations are non-blocking
- ✅ **Mouse control**: Clicks, drag and drop, scrolling
- ✅ **Keyboard control**: All keys and modifiers
- ✅ **Snapshot system**: Save and compare screen states
- ✅ **Recording and playback**: Record user actions
- ✅ **Test framework integration**: Vitest, Jest
- ✅ **High-level utilities**: Ready-made functions for common actions

## 📦 Installation

### Requirements

1. **tmux** must be installed on the system:
   ```bash
   # macOS
   brew install tmux
   
   # Ubuntu/Debian
   apt-get install tmux
   
   # Fedora
   dnf install tmux
   ```

2. Install dependencies:
   ```bash
   npm install --save-dev vitest
   ```

## 🎯 Quick Start

### Basic Example

```typescript
import { createTester } from '@xec-sh/tui-tester';

async function testMyApp() {
  const tester = createTester('node app.js', {
    cols: 80,
    rows: 24,
    debug: true
  });

  await tester.start();
  
  // Wait for app to load
  await tester.waitForText('Welcome');
  
  // Type text
  await tester.typeText('Hello, World!');
  await tester.sendKey('enter');
  
  // Check result
  await tester.assertScreenContains('Hello, World!');
  
  // Take snapshot
  await tester.takeSnapshot('hello-world');
  
  await tester.stop();
}
```

### Using Vitest

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TmuxTester, setupVitestMatchers } from '@xec-sh/tui-tester';

// Setup custom matchers
setupVitestMatchers();

describe('My TUI App', () => {
  let tester: TmuxTester;

  beforeAll(async () => {
    tester = new TmuxTester({
      command: ['npm', 'start'],
      size: { cols: 120, rows: 40 }
    });
    await tester.start();
  });

  afterAll(async () => {
    await tester.stop();
  });

  it('should match snapshot', async () => {
    await tester.waitForText('Ready');
    
    const screen = await tester.captureScreen();
    await expect(screen).toMatchTerminalSnapshot('main-screen');
  });
});
```

## 🎮 Keyboard Control

```typescript
// Regular keys
await tester.sendText('Hello');
await tester.sendKey('enter');
await tester.sendKey('tab');
await tester.sendKey('escape');

// Special keys
await tester.sendKey('up');
await tester.sendKey('down');
await tester.sendKey('left');
await tester.sendKey('right');
await tester.sendKey('home');
await tester.sendKey('end');
await tester.sendKey('pageup');
await tester.sendKey('pagedown');

// With modifiers
await tester.sendKey('c', { ctrl: true });        // Ctrl+C
await tester.sendKey('v', { ctrl: true });        // Ctrl+V
await tester.sendKey('a', { ctrl: true });        // Ctrl+A
await tester.sendKey('tab', { shift: true });     // Shift+Tab
await tester.sendKey('f', { alt: true });         // Alt+F
await tester.sendKey('s', { ctrl: true, shift: true }); // Ctrl+Shift+S

// Function keys
await tester.sendKey('f1');
await tester.sendKey('f12');

// Type text with delay
await tester.typeText('Typing slowly...', 100); // 100ms between characters
```

## 🖱️ Mouse Control

```typescript
// Clicks
await tester.sendMouse({
  type: 'click',
  position: { x: 10, y: 5 },
  button: 'left'
});

// Right click
await tester.sendMouse({
  type: 'click',
  position: { x: 20, y: 10 },
  button: 'right'
});

// Drag and drop
await tester.sendMouse({
  type: 'down',
  position: { x: 10, y: 10 },
  button: 'left'
});

await tester.sendMouse({
  type: 'drag',
  position: { x: 30, y: 20 },
  button: 'left'
});

await tester.sendMouse({
  type: 'up',
  position: { x: 30, y: 20 },
  button: 'left'
});

// Scrolling
await tester.sendMouse({
  type: 'scroll',
  position: { x: 50, y: 25 },
  button: 'up'  // or 'down'
});
```

## 📸 Snapshots

```typescript
import { SnapshotManager } from '@xec-sh/tui-tester';

const snapshotManager = new SnapshotManager({
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === 'true',
  snapshotDir: './__snapshots__',
  format: 'json' // or 'text', 'ansi'
});

// Create snapshot
const capture = await tester.captureScreen();
const result = await snapshotManager.matchSnapshot(
  capture,
  'my-snapshot-name'
);

if (!result.pass) {
  console.log('Snapshot mismatch:', result.diff);
}

// Update snapshots
// Run tests with UPDATE_SNAPSHOTS=true to update
```

## 🎬 Recording and Playback

```typescript
// Start recording
tester.startRecording();

// Perform actions
await tester.sendText('echo "Recording test"');
await tester.sendKey('enter');

// Stop recording
const recording = tester.stopRecording();

// Save recording
await tester.adapter.writeFile(
  'recording.json',
  JSON.stringify(recording)
);

// Load and replay
const savedRecording = JSON.parse(
  await tester.adapter.readFile('recording.json')
);

await tester.playRecording(savedRecording, 2); // 2x speed
```

## 🛠️ High-level Utilities

```typescript
import {
  navigateMenu,
  selectMenuItem,
  fillField,
  submitForm,
  clickOnText,
  selectText,
  copySelection,
  pasteFromClipboard,
  waitForLoading,
  login,
  executeCommand,
  search
} from '@xec-sh/tui-tester';

// Menu navigation
await navigateMenu(tester, 'down', 3);
await selectMenuItem(tester, 'Settings');

// Fill form
await fillField(tester, 'Username', 'john.doe');
await fillField(tester, 'Email', 'john@example.com');
await submitForm(tester);

// Text operations
await clickOnText(tester, 'Click me!');
await selectText(tester, 'start', 'end');
await copySelection(tester);
await pasteFromClipboard(tester);

// Wait for loading
await waitForLoading(tester);

// Login
await login(tester, 'username', 'password');

// Execute command
await executeCommand(tester, 'ls -la');

// Search
await search(tester, 'search term');
```

## 🧪 Test Scenarios

```typescript
import { TestRunner, scenario, step } from '@xec-sh/tui-tester';

const runner = new TestRunner({
  timeout: 30000,
  retries: 2,
  debug: true
});

const testScenario = scenario(
  'User Registration Flow',
  [
    step(
      'Navigate to registration',
      async (t) => {
        await selectMenuItem(t, 'Register');
        await t.waitForText('Registration Form');
      },
      async (t) => {
        await t.assertScreenContains('Create Account');
      }
    ),
    
    step(
      'Fill registration form',
      async (t) => {
        await fillField(t, 'Username', 'newuser');
        await fillField(t, 'Email', 'user@example.com');
        await fillField(t, 'Password', 'secure123');
      }
    ),
    
    step(
      'Submit and verify',
      async (t) => {
        await submitForm(t);
        await t.waitForText('Registration successful');
      },
      async (t) => {
        await t.assertScreenContains('Welcome, newuser');
      }
    )
  ],
  {
    setup: async () => {
      console.log('Setting up test environment');
    },
    teardown: async () => {
      console.log('Cleaning up');
    }
  }
);

const result = await runner.runScenario(testScenario, {
  command: ['node', 'app.js'],
  size: { cols: 80, rows: 24 }
});

runner.printResults();
```

## 🔧 Configuration

```typescript
interface TesterConfig {
  command: string[];           // Command to run the application
  size?: TerminalSize;        // Terminal size (default 80x24)
  env?: Record<string, string>; // Environment variables
  cwd?: string;               // Working directory
  shell?: string;             // Shell (default 'sh')
  sessionName?: string;       // tmux session name
  debug?: boolean;            // Debug mode
  recordingEnabled?: boolean; // Automatic recording
  snapshotDir?: string;       // Snapshot directory
}
```

## 🐛 Debugging

```typescript
// Enable debug mode
const tester = new TmuxTester({
  command: ['node', 'app.js'],
  debug: true  // Outputs all commands and results
});

// Capture screen on error
try {
  await tester.waitForText('Expected');
} catch (error) {
  const screen = await tester.captureScreen();
  console.log('Screen at error:', screen.text);
  throw error;
}

// Check status
console.log('Is running:', tester.isRunning());
console.log('Size:', tester.getSize());
```

## 🔄 CI/CD Integration

```yaml
# GitHub Actions
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install tmux
        run: sudo apt-get install -y tmux
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true
```

## 📚 API Reference

### TmuxTester

Main class for testing terminal applications.

#### Lifecycle Methods
- `start()` - Start application
- `stop()` - Stop application
- `restart()` - Restart
- `isRunning()` - Check status

#### Input
- `sendText(text)` - Send text
- `sendKey(key, modifiers?)` - Send key
- `sendMouse(event)` - Send mouse event
- `typeText(text, delay?)` - Type with delay
- `paste(text)` - Paste text

#### Output
- `captureScreen()` - Capture screen
- `getScreenText()` - Get text without ANSI
- `getScreenLines()` - Get lines
- `waitForText(text, options?)` - Wait for text
- `waitForPattern(regex, options?)` - Wait for pattern

#### Assertions
- `assertScreen(expected, options?)` - Assert screen
- `assertScreenContains(text)` - Assert text presence
- `assertScreenMatches(pattern)` - Assert by pattern
- `assertCursorAt(position)` - Assert cursor position

#### Snapshots
- `takeSnapshot(name?)` - Create snapshot
- `compareSnapshot(snapshot)` - Compare with snapshot
- `saveSnapshot(snapshot, path?)` - Save snapshot
- `loadSnapshot(path)` - Load snapshot

## 🤝 Contributing

We welcome contributions to the project! Please create an issue or pull request.

## 📄 License

MIT