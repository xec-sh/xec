# Advanced Topics

Advanced features and techniques for TUI Tester power users.

## Table of Contents

- [Performance Optimization](#performance-optimization)
- [Parallel Testing](#parallel-testing)
- [Custom Assertions](#custom-assertions)
- [Recording and Playback](#recording-and-playback)
- [Debugging Techniques](#debugging-techniques)
- [Terminal Emulation](#terminal-emulation)
- [Cross-Platform Testing](#cross-platform-testing)
- [Security Considerations](#security-considerations)
- [Test Runner Integration](#test-runner-integration)
- [High-Level Interaction Helpers](#high-level-interaction-helpers)
- [Snapshot Management](#snapshot-management)

## Performance Optimization

### Test Execution Speed

#### Minimize Startup Time

```typescript
// Reuse sessions when possible
class TestSession {
  private static instance: TmuxTester;
  
  static async get(): Promise<TmuxTester> {
    if (!this.instance) {
      this.instance = createTester('app', {
        sessionName: 'shared-session'
      });
      await this.instance.start();
    }
    return this.instance;
  }
  
  static async cleanup(): Promise<void> {
    await this.instance?.stop();
    this.instance = null;
  }
}

// Use in tests
it('test 1', async () => {
  const tester = await TestSession.get();
  // Run test...
});
```

#### Batch Operations

```typescript
// Instead of multiple awaits
await tester.sendKey('a');
await tester.sendKey('b');
await tester.sendKey('c');

// Batch commands
await tester.exec(`tmux send-keys -t ${session} a b c`);

// Or use sendKeys
await tester.sendKeys(['a', 'b', 'c']);
```

#### Smart Waiting

```typescript
// Avoid fixed delays
await tester.sleep(5000); // Bad

// Use condition-based waiting
await tester.waitForText('Ready', { timeout: 5000, interval: 50 }); // Good

// Custom wait with early exit
async function waitForStable(tester: TmuxTester): Promise<void> {
  let lastScreen = '';
  let stableCount = 0;
  
  while (stableCount < 3) {
    const screen = await tester.getScreenText();
    if (screen === lastScreen) {
      stableCount++;
    } else {
      stableCount = 0;
      lastScreen = screen;
    }
    await tester.sleep(100);
  }
}
```

### Memory Management

```typescript
// Clean up large captures
class MemoryEfficientTester extends TmuxTester {
  private maxBufferSize = 1024 * 1024; // 1MB
  
  async getScreenText(): Promise<string> {
    const screen = await super.getScreenText();
    
    // Truncate if too large
    if (screen.length > this.maxBufferSize) {
      return screen.substring(0, this.maxBufferSize);
    }
    
    return screen;
  }
  
  clearBuffers(): void {
    this._outputBuffer = '';
    this.snapshots.clear();
  }
}
```

## Parallel Testing

### Session Isolation

```typescript
// Unique session per test
function createIsolatedTester(name: string): TmuxTester {
  return createTester('app', {
    sessionName: `${name}-${process.pid}-${Date.now()}`,
    env: {
      TEST_ID: name,
      PORT: String(3000 + Math.floor(Math.random() * 1000))
    }
  });
}

// Run tests in parallel
describe.concurrent('Parallel Tests', () => {
  it.concurrent('test 1', async () => {
    const tester = createIsolatedTester('test1');
    // ...
  });
  
  it.concurrent('test 2', async () => {
    const tester = createIsolatedTester('test2');
    // ...
  });
});
```

### Resource Pooling

```typescript
class TesterPool {
  private pool: TmuxTester[] = [];
  private available: TmuxTester[] = [];
  private maxSize: number;
  
  constructor(maxSize = 5) {
    this.maxSize = maxSize;
  }
  
  async acquire(): Promise<TmuxTester> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }
    
    if (this.pool.length < this.maxSize) {
      const tester = createTester('app', {
        sessionName: `pool-${this.pool.length}`
      });
      await tester.start();
      this.pool.push(tester);
      return tester;
    }
    
    // Wait for available tester
    return new Promise(resolve => {
      const check = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(check);
          resolve(this.available.pop()!);
        }
      }, 100);
    });
  }
  
  release(tester: TmuxTester): void {
    // Reset tester state
    tester.clear();
    this.available.push(tester);
  }
  
  async destroy(): Promise<void> {
    await Promise.all(
      this.pool.map(t => t.stop())
    );
  }
}
```

## Custom Assertions

### Complex Assertions

```typescript
class AssertionBuilder {
  private tester: TmuxTester;
  private screen: string;
  
  constructor(tester: TmuxTester) {
    this.tester = tester;
  }
  
  async check(): Promise<this> {
    this.screen = await this.tester.getScreenText();
    return this;
  }
  
  contains(text: string): this {
    if (!this.screen.includes(text)) {
      throw new Error(`Screen does not contain: ${text}`);
    }
    return this;
  }
  
  notContains(text: string): this {
    if (this.screen.includes(text)) {
      throw new Error(`Screen should not contain: ${text}`);
    }
    return this;
  }
  
  matches(regex: RegExp): this {
    if (!regex.test(this.screen)) {
      throw new Error(`Screen does not match: ${regex}`);
    }
    return this;
  }
  
  hasLines(count: number): this {
    const lines = this.screen.split('\n');
    if (lines.length !== count) {
      throw new Error(`Expected ${count} lines, got ${lines.length}`);
    }
    return this;
  }
  
  lineEquals(lineNum: number, expected: string): this {
    const lines = this.screen.split('\n');
    if (lines[lineNum] !== expected) {
      throw new Error(
        `Line ${lineNum} mismatch:\n` +
        `Expected: ${expected}\n` +
        `Actual: ${lines[lineNum]}`
      );
    }
    return this;
  }
}

// Usage
const assert = new AssertionBuilder(tester);
await assert.check()
  .contains('Welcome')
  .notContains('Error')
  .matches(/Version: \d+\.\d+\.\d+/)
  .hasLines(24)
  .lineEquals(0, 'Header');
```

### Visual Assertions

```typescript
class VisualAssertion {
  static async assertBox(
    tester: TmuxTester,
    x: number,
    y: number,
    width: number,
    height: number,
    title?: string
  ): Promise<void> {
    const screen = await tester.getScreenText();
    const lines = screen.split('\n');
    
    // Check corners
    const topLeft = lines[y][x];
    const topRight = lines[y][x + width - 1];
    const bottomLeft = lines[y + height - 1][x];
    const bottomRight = lines[y + height - 1][x + width - 1];
    
    // Verify box characters
    const boxChars = ['┌', '┐', '└', '┘', '╔', '╗', '╚', '╝'];
    
    if (!boxChars.includes(topLeft)) {
      throw new Error('Invalid box: missing top-left corner');
    }
    
    // Check title if provided
    if (title) {
      const topLine = lines[y].substring(x, x + width);
      if (!topLine.includes(title)) {
        throw new Error(`Box title not found: ${title}`);
      }
    }
  }
  
  static async assertTable(
    tester: TmuxTester,
    headers: string[],
    minRows = 1
  ): Promise<void> {
    const screen = await tester.getScreenText();
    
    // Check headers
    for (const header of headers) {
      if (!screen.includes(header)) {
        throw new Error(`Table header not found: ${header}`);
      }
    }
    
    // Check for separator line
    if (!screen.match(/[─━═]+/)) {
      throw new Error('Table separator not found');
    }
    
    // Check minimum rows
    const lines = screen.split('\n');
    const dataLines = lines.filter(l => 
      l.includes('│') || l.includes('|')
    );
    
    if (dataLines.length < minRows + 1) { // +1 for header
      throw new Error(`Expected at least ${minRows} data rows`);
    }
  }
}
```

## Recording and Playback

### Session Recording

```typescript
// Recording is built into TmuxTester
const tester = createTester('app', {
  recordingEnabled: true
});

await tester.start();
// Perform actions...
await tester.sendText('hello');
await tester.sendKey('enter');

// Stop recording
const recording = tester.stopRecording();

// Save recording
await fs.writeFile('recording.json', JSON.stringify(recording, null, 2));
```

### Playback System

```typescript
// Load and play recording
const content = await fs.readFile('recording.json', 'utf-8');
const recording = JSON.parse(content);

const tester = createTester('app');
await tester.start();

// Play recording
await tester.playRecording(recording);

// Verify playback
const currentScreen = await tester.getScreenText();
// Compare with expected state
```

## Debugging Techniques

### Interactive Debugging

```typescript
class DebugTester extends TmuxTester {
  private breakpoints: Set<string> = new Set();
  private stepMode = false;
  
  setBreakpoint(text: string): void {
    this.breakpoints.add(text);
  }
  
  enableStepMode(): void {
    this.stepMode = true;
  }
  
  async sendKey(key: string, modifiers?: KeyModifiers): Promise<void> {
    if (this.stepMode) {
      console.log(`[STEP] Sending key: ${key}`);
      await this.waitForUser();
    }
    
    await super.sendKey(key, modifiers);
    await this.checkBreakpoints();
  }
  
  private async checkBreakpoints(): Promise<void> {
    const screen = await this.getScreenText();
    
    for (const breakpoint of this.breakpoints) {
      if (screen.includes(breakpoint)) {
        console.log(`[BREAKPOINT] Hit: ${breakpoint}`);
        console.log('[SCREEN]');
        console.log(screen);
        await this.waitForUser();
      }
    }
  }
  
  private async waitForUser(): Promise<void> {
    console.log('Press Enter to continue...');
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
  }
  
  async attachDebugger(): Promise<void> {
    console.log(`\nDebug session: ${this.sessionName}`);
    console.log(`Attach with: tmux attach -t ${this.sessionName}`);
    console.log('Press Ctrl+B, D to detach\n');
  }
}
```

### Trace Logging

```typescript
class TracedTester extends TmuxTester {
  private trace: string[] = [];
  
  async sendText(text: string): Promise<void> {
    this.trace.push(`sendText("${text}")`);
    await super.sendText(text);
  }
  
  async sendKey(key: string, modifiers?: KeyModifiers): Promise<void> {
    this.trace.push(`sendKey("${key}", ${JSON.stringify(modifiers)})`);
    await super.sendKey(key, modifiers);
  }
  
  getTrace(): string[] {
    return [...this.trace];
  }
  
  printTrace(): void {
    console.log('Execution Trace:');
    this.trace.forEach((line, i) => {
      console.log(`  ${i + 1}. ${line}`);
    });
  }
}
```

## Terminal Emulation

### ANSI Sequence Handling

```typescript
// TUI Tester automatically handles ANSI sequences
// You can access both raw and processed text:

const capture = await tester.captureScreen();
console.log('Raw with ANSI:', capture.raw);
console.log('Text without ANSI:', capture.text);
console.log('Lines without ANSI:', capture.lines);
```

### Virtual Terminal

The TUI Tester uses tmux as the virtual terminal backend, which provides full terminal emulation including:

- ANSI color codes
- Cursor positioning
- Terminal resizing
- Mouse events
- Special keys

## Cross-Platform Testing

### Platform-Specific Tests

```typescript
describe('Cross-Platform', () => {
  const platforms = [
    { name: 'linux', shell: 'bash' },
    { name: 'macos', shell: 'zsh' },
    { name: 'windows', shell: 'powershell' }
  ];
  
  platforms.forEach(platform => {
    describe(platform.name, () => {
      let tester;
      
      beforeEach(async () => {
        tester = createTester('app', {
          shell: platform.shell,
          env: {
            PLATFORM: platform.name
          }
        });
        await tester.start();
      });
      
      it('should work on ' + platform.name, async () => {
        await tester.waitForText('Ready');
        // Platform-specific assertions
      });
    });
  });
});
```

### Docker-Based Testing

```typescript
async function testInDocker(image: string, command: string) {
  const dockerCmd = `docker run --rm -it ${image} sh -c "${command}"`;
  
  const tester = createTester(dockerCmd);
  await tester.start();
  
  return tester;
}

// Test in different environments
it('should work in Alpine', async () => {
  const tester = await testInDocker('alpine:latest', 'app');
  // ...
});

it('should work in Ubuntu', async () => {
  const tester = await testInDocker('ubuntu:latest', 'app');
  // ...
});
```

## Security Considerations

### Input Sanitization

```typescript
class SecureTester extends TmuxTester {
  async sendText(text: string): Promise<void> {
    // Sanitize input
    const sanitized = text
      .replace(/[;&|`$]/g, '') // Remove shell metacharacters
      .replace(/\x1b/g, '');    // Remove escape characters
    
    await super.sendText(sanitized);
  }
  
  async sendCommand(command: string): Promise<void> {
    // Validate command
    const allowedCommands = ['ls', 'cd', 'pwd', 'echo'];
    const cmd = command.split(' ')[0];
    
    if (!allowedCommands.includes(cmd)) {
      throw new Error(`Command not allowed: ${cmd}`);
    }
    
    await super.sendCommand(command);
  }
}
```

### Isolation

```typescript
class IsolatedTester extends TmuxTester {
  async start(): Promise<void> {
    // Create isolated environment
    const sandboxDir = await fs.mkdtemp('/tmp/sandbox-');
    
    this.config.cwd = sandboxDir;
    this.config.env = {
      ...this.config.env,
      HOME: sandboxDir,
      TMPDIR: sandboxDir,
      PATH: '/usr/bin:/bin' // Restricted PATH
    };
    
    await super.start();
  }
  
  async stop(): Promise<void> {
    await super.stop();
    
    // Cleanup sandbox
    if (this.config.cwd?.startsWith('/tmp/sandbox-')) {
      await fs.rm(this.config.cwd, { recursive: true });
    }
  }
}
```

## Test Runner Integration

### Running Test Scenarios

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

## High-Level Interaction Helpers

### Common UI Interactions

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

// Fill form - traditional way
await fillField(tester, 'Username', 'john.doe');
await fillField(tester, 'Email', 'john@example.com');
await submitForm(tester);

// Fill form - new convenient way
await submitForm(tester, {
  Username: 'john.doe',
  Email: 'john@example.com'
});

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

// Search - now returns boolean indicating if text was found
const found = await search(tester, 'search term');
if (found) {
  console.log('Text found on screen');
}
```

## Snapshot Management

### Advanced Snapshot Features

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

// Compare snapshots with options
const comparison = await snapshotManager.compareWithOptions(
  'snapshot1', 
  'snapshot2',
  { ignoreWhitespace: true, ignoreAnsi: true }
);
```