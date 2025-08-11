# Getting Started with TUI Tester

## 📦 Installation

### Prerequisites

1. **Install tmux** (required):

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Fedora
sudo dnf install tmux

# Arch Linux
sudo pacman -S tmux
```

2. **Install the package**:

```bash
# npm
npm install --save-dev @xec-sh/tui-tester

# yarn
yarn add -D @xec-sh/tui-tester

# pnpm
pnpm add -D @xec-sh/tui-tester

# bun
bun add -d @xec-sh/tui-tester
```

## 🚀 Quick Start

### 1. Basic Test Setup

Create a test file for your terminal application:

```typescript
// app.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTester } from '@xec-sh/tui-tester';

describe('My Terminal App', () => {
  let tester;

  beforeEach(async () => {
    // Create tester instance
    tester = createTester('node app.js', {
      cols: 80,
      rows: 24
    });
    
    // Start the application
    await tester.start();
  });

  afterEach(async () => {
    // Clean up
    await tester.stop();
  });

  it('should display welcome message', async () => {
    // Wait for app to load
    await tester.waitFor(screen => 
      screen.includes('Welcome')
    );

    // Assert screen content
    const screen = await tester.getScreen();
    expect(screen).toContain('Welcome to My App');
  });

  it('should respond to user input', async () => {
    // Send input
    await tester.sendText('John');
    await tester.sendKey('Enter');

    // Assert response
    await tester.assertScreen(screen =>
      screen.includes('Hello, John!')
    );
  });
});
```

### 2. Configuration Options

The `createTester` function accepts various configuration options:

```typescript
const tester = createTester('command', {
  // Terminal size
  cols: 80,              // Terminal width (default: 80)
  rows: 24,              // Terminal height (default: 24)
  
  // Environment
  env: {                 // Environment variables
    NODE_ENV: 'test',
    DEBUG: 'true'
  },
  cwd: '/path/to/app',   // Working directory
  
  // Advanced options
  shell: 'bash',         // Shell to use (default: 'sh')
  sessionName: 'test-1', // tmux session name
  debug: true,           // Enable debug output
  recordingEnabled: true, // Enable session recording
  snapshotDir: './snapshots' // Snapshot directory
});
```

### 3. Input Methods

#### Sending Text
```typescript
// Send plain text
await tester.sendText('Hello World');

// Send text with special characters
await tester.sendText('user@example.com');

// Send multiline text
await tester.sendText('Line 1\nLine 2\nLine 3');
```

#### Sending Keys
```typescript
// Send single key
await tester.sendKey('Enter');
await tester.sendKey('Tab');
await tester.sendKey('Escape');

// Send arrow keys
await tester.sendKey('Up');
await tester.sendKey('Down');
await tester.sendKey('Left');
await tester.sendKey('Right');

// Send function keys
await tester.sendKey('F1');
await tester.sendKey('F12');

// Send with modifiers
await tester.sendKey('c', { ctrl: true });     // Ctrl+C
await tester.sendKey('a', { ctrl: true });     // Ctrl+A (select all)
await tester.sendKey('z', { ctrl: true });     // Ctrl+Z (undo)
await tester.sendKey('s', { alt: true });      // Alt+S
await tester.sendKey('q', { meta: true });     // Meta+Q (Cmd on Mac)

// Send multiple keys
await tester.sendKeys(['H', 'e', 'l', 'l', 'o']);
```

#### Sending Commands
```typescript
// Send a command (text + Enter)
await tester.sendCommand('npm test');

// Equivalent to:
await tester.sendText('npm test');
await tester.sendKey('Enter');
```

### 4. Screen Assertions

#### Get Screen Content
```typescript
// Get full screen as string
const screen = await tester.getScreen();
console.log(screen);

// Get screen without ANSI codes
const plainText = await tester.getScreen({ stripAnsi: true });

// Get specific lines
const lines = await tester.getLines();
const firstLine = lines[0];
const lastLine = lines[lines.length - 1];
```

#### Assert Screen Content
```typescript
// Check if screen contains text
await tester.assertScreen(screen => 
  screen.includes('Expected text')
);

// Check multiple conditions
await tester.assertScreen(screen => {
  return screen.includes('Header') &&
         screen.includes('Footer') &&
         !screen.includes('Error');
});

// Use with regex
await tester.assertScreen(screen =>
  /User: \w+/.test(screen)
);

// Assert specific line
await tester.assertLine(0, line =>
  line.startsWith('>')
);
```

### 5. Waiting for Conditions

```typescript
// Wait for text to appear
await tester.waitFor(screen => 
  screen.includes('Ready')
);

// Wait with timeout
await tester.waitFor(
  screen => screen.includes('Loaded'),
  { timeout: 5000, interval: 100 }
);

// Wait for element to disappear
await tester.waitFor(screen =>
  !screen.includes('Loading...')
);

// Wait for regex match
await tester.waitFor(screen =>
  /Status: (ready|active)/.test(screen)
);
```

### 6. Mouse Interactions

```typescript
// Enable mouse support
await tester.enableMouse();

// Click at position
await tester.click(10, 5);

// Click on text
await tester.clickText('Button');

// Double click
await tester.doubleClick(10, 5);

// Right click
await tester.rightClick(10, 5);

// Drag and drop
await tester.drag(
  { x: 10, y: 5 },  // from
  { x: 20, y: 10 }  // to
);

// Scroll
await tester.scroll('up', 3);
await tester.scroll('down', 5);
```

## 🧪 Complete Example

Here's a complete example testing a simple CLI application:

```typescript
import { describe, it, expect } from 'vitest';
import { createTester } from '@xec-sh/tui-tester';

describe('CLI Calculator', () => {
  it('should perform basic calculations', async () => {
    // Create and start tester
    const tester = createTester('node calculator.js', {
      cols: 40,
      rows: 10
    });
    
    await tester.start();
    
    try {
      // Wait for prompt
      await tester.waitFor(screen => 
        screen.includes('Enter expression:')
      );
      
      // Enter calculation
      await tester.sendText('2 + 2');
      await tester.sendKey('Enter');
      
      // Check result
      await tester.assertScreen(screen =>
        screen.includes('Result: 4')
      );
      
      // Take snapshot for visual regression
      await tester.snapshot('calculator-addition');
      
      // Try another calculation
      await tester.sendText('10 * 5');
      await tester.sendKey('Enter');
      
      await tester.assertScreen(screen =>
        screen.includes('Result: 50')
      );
      
      // Exit application
      await tester.sendKey('q');
      
      // Verify exit
      await tester.waitFor(screen =>
        screen.includes('Goodbye!')
      );
      
    } finally {
      // Always clean up
      await tester.stop();
    }
  });
});
```

## 🎯 Next Steps

- Read the [API Reference](./api-reference.md) for detailed method documentation
- Check out [Examples](./examples.md) for more use cases
- Learn about [Snapshot Testing](./snapshot-testing.md) for visual regression testing
- Explore [Advanced Topics](./advanced.md) for complex scenarios

## 💡 Tips

1. **Always clean up**: Use `try/finally` or `afterEach` to ensure sessions are stopped
2. **Wait for readiness**: Always wait for the app to be ready before sending input
3. **Use debug mode**: Enable `debug: true` to see what's happening
4. **Test incrementally**: Start with simple tests and build complexity
5. **Use snapshots**: Leverage snapshot testing for visual regression