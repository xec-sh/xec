# API Reference

Complete API documentation for @xec-sh/tui-tester.

## Table of Contents

- [Core API](#core-api)
  - [createTester](#createtester)
  - [TmuxTester](#tmux-tester)
- [Lifecycle Methods](#lifecycle-methods)
- [Input Methods](#input-methods)
- [Screen Methods](#screen-methods)
- [Assertion Methods](#assertion-methods)
- [Wait Methods](#wait-methods)
- [Mouse Methods](#mouse-methods)
- [Recording Methods](#recording-methods)
- [Snapshot Methods](#snapshot-methods)
- [Utility Methods](#utility-methods)
- [Types](#types)

## Core API

### createTester

Factory function to create a new tester instance.

```typescript
function createTester(
  command: string | string[],
  options?: TesterOptions
): TmuxTester
```

#### Parameters

- `command` - Command to run (string or array of arguments)
- `options` - Optional configuration

#### Options

```typescript
interface TesterOptions {
  cols?: number;              // Terminal width (default: 80)
  rows?: number;              // Terminal height (default: 24)
  env?: Record<string, string>; // Environment variables
  cwd?: string;               // Working directory
  debug?: boolean;            // Enable debug output
  shell?: string;             // Shell to use (default: 'sh')
  sessionName?: string;       // tmux session name
  recordingEnabled?: boolean; // Enable session recording
  snapshotDir?: string;       // Snapshot directory
}
```

#### Example

```typescript
const tester = createTester('npm start', {
  cols: 120,
  rows: 30,
  env: { NODE_ENV: 'test' },
  debug: true
});
```

### TmuxTester

Main testing class that manages the tmux session.

```typescript
class TmuxTester implements TerminalTester {
  constructor(config: TesterConfig);
  // ... methods
}
```

## Lifecycle Methods

### start()

Start the tmux session and launch the application.

```typescript
async start(): Promise<void>
```

#### Example
```typescript
await tester.start();
```

### stop()

Stop the tmux session and clean up resources.

```typescript
async stop(): Promise<void>
```

#### Example
```typescript
await tester.stop();
```

### restart()

Restart the session (stop and start).

```typescript
async restart(): Promise<void>
```

#### Example
```typescript
await tester.restart();
```

### isRunning()

Check if the session is currently running.

```typescript
isRunning(): boolean
```

#### Example
```typescript
if (tester.isRunning()) {
  await tester.stop();
}
```

## Input Methods

### sendText()

Send text to the terminal.

```typescript
async sendText(text: string): Promise<void>
```

#### Parameters
- `text` - Text to send

#### Example
```typescript
await tester.sendText('Hello World');
await tester.sendText('user@example.com');
```

### sendKey()

Send a key with optional modifiers.

```typescript
async sendKey(
  key: string,
  modifiers?: KeyModifiers
): Promise<void>
```

#### Parameters
- `key` - Key name (e.g., 'Enter', 'Tab', 'a', 'F1')
- `modifiers` - Optional key modifiers

#### Key Names
- Basic: `'a'`, `'b'`, `'1'`, `'2'`, etc.
- Special: `'Enter'`, `'Tab'`, `'Escape'`, `'Space'`, `'Backspace'`, `'Delete'`
- Navigation: `'Up'`, `'Down'`, `'Left'`, `'Right'`, `'Home'`, `'End'`, `'PageUp'`, `'PageDown'`
- Function: `'F1'` through `'F12'`

#### Modifiers
```typescript
interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}
```

#### Examples
```typescript
// Simple keys
await tester.sendKey('Enter');
await tester.sendKey('Tab');

// With modifiers
await tester.sendKey('c', { ctrl: true });  // Ctrl+C
await tester.sendKey('a', { ctrl: true });  // Ctrl+A
await tester.sendKey('s', { alt: true });   // Alt+S
```

### sendKeys()

Send multiple keys sequentially.

```typescript
async sendKeys(keys: string[]): Promise<void>
```

#### Parameters
- `keys` - Array of key names

#### Example
```typescript
await tester.sendKeys(['H', 'e', 'l', 'l', 'o']);
await tester.sendKeys(['Up', 'Up', 'Enter']);
```

### sendCommand()

Send a command followed by Enter key.

```typescript
async sendCommand(command: string): Promise<void>
```

#### Parameters
- `command` - Command to execute

#### Example
```typescript
await tester.sendCommand('ls -la');
await tester.sendCommand('echo "Hello"');
```

### paste()

Paste text (using bracketed paste mode).

```typescript
async paste(text: string): Promise<void>
```

#### Parameters
- `text` - Text to paste

#### Example
```typescript
await tester.paste('Hello, World!');
```

### typeText()

Type text with optional delay between characters.

```typescript
async typeText(text: string, delayMs?: number): Promise<void>
```

#### Parameters
- `text` - Text to type
- `delayMs` - Delay between characters (default: 50ms)

#### Example
```typescript
await tester.typeText('Hello, World!');
await tester.typeText('Typing slowly...', 100); // 100ms between characters
```

## Screen Methods

### captureScreen()

Capture complete screen state including metadata.

```typescript
async captureScreen(): Promise<ScreenCapture>
```

#### Returns
```typescript
interface ScreenCapture {
  raw: string;           // Raw output with ANSI codes
  text: string;          // Text without ANSI codes
  lines: string[];       // Array of lines without ANSI
  timestamp: number;
  size: TerminalSize;
}
```

#### Example
```typescript
const capture = await tester.captureScreen();
console.log('Screen size:', capture.size);
```

### getScreenText()

Get screen content as plain text (without ANSI codes).

```typescript
async getScreenText(): Promise<string>
```

#### Example
```typescript
const screen = await tester.getScreenText();
console.log('Plain text:', screen);
```

### getScreenLines()

Get screen content as array of lines (without ANSI codes).

```typescript
async getScreenLines(): Promise<string[]>
```

#### Example
```typescript
const lines = await tester.getScreenLines();
console.log('First line:', lines[0]);
```

### getScreenText()

Get screen content as plain text (without ANSI codes).

```typescript
async getScreenText(): Promise<string>
```

#### Example
```typescript
const screen = await tester.getScreenText();
console.log('Plain text:', screen);
```

### getScreenLines()

Get screen content as array of lines (without ANSI codes).

```typescript
async getScreenLines(): Promise<string[]>
```

#### Example
```typescript
const lines = await tester.getScreenLines();
console.log('First line:', lines[0]);
```

### getCursor()

Get current cursor position.

```typescript
async getCursor(): Promise<Point>
```

#### Returns
```typescript
interface Point {
  x: number;  // Column (0-based)
  y: number;  // Row (0-based)
}
```

#### Example
```typescript
const cursor = await tester.getCursor();
console.log(`Cursor at: (${cursor.x}, ${cursor.y})`);
```

## Wait Methods

### waitForText()

Wait for specific text to appear.

```typescript
async waitForText(
  text: string,
  options?: WaitOptions
): Promise<void>
```

#### Example
```typescript
await tester.waitForText('Welcome');
await tester.waitForText('Login:', { timeout: 5000 });
```

### waitForPattern()

Wait for a regular expression pattern to match screen content.

```typescript
async waitForPattern(
  pattern: RegExp,
  options?: WaitOptions
): Promise<void>
```

#### Example
```typescript
await tester.waitForPattern(/Welcome.*User/);
await tester.waitForPattern(/Error: .+/, { timeout: 10000 });
```

### waitForLine()

Wait for a specific line to contain text.

```typescript
async waitForLine(
  lineNumber: number,
  text: string,
  options?: WaitOptions
): Promise<void>
```

#### Example
```typescript
await tester.waitForLine(0, '>');
```

### waitFor()

Wait for a custom condition to be true.

```typescript
async waitFor(
  predicate: (screen: string) => boolean | Promise<boolean>,
  options?: WaitOptions
): Promise<void>
```

#### Parameters
- `predicate` - Function that returns true when condition is met
- `options` - Wait options (timeout, interval, message)

#### Example
```typescript
// Wait for multiple conditions
await tester.waitFor(screen => 
  screen.includes('Ready') && screen.includes('Connected')
);

// Wait with async predicate
await tester.waitFor(async screen => {
  const lines = screen.split('\n');
  return lines.length > 10;
});
```

## Assertion Methods

### assertScreen()

Assert that screen content matches expected content or passes a predicate function.

```typescript
async assertScreen(
  expected: string[] | string | ((screen: string) => boolean),
  options?: AssertionOptions
): Promise<void>
```

#### Parameters
- `expected` - Expected screen content (string, array of lines, or predicate function)
- `options` - Assertion options

#### Example
```typescript
// Assert exact content
await tester.assertScreen('Success');
await tester.assertScreen(['Line 1', 'Line 2']);

// Assert with predicate
await tester.assertScreen(screen => 
  screen.includes('Ready') && !screen.includes('Error')
);
```

### assertScreenContains()

Assert that screen content contains specific text.

```typescript
async assertScreenContains(
  text: string,
  options?: AssertionOptions
): Promise<void>
```

#### Example
```typescript
await tester.assertScreenContains('Success');
```

### assertScreenMatches()

Assert that screen content matches a regular expression.

```typescript
async assertScreenMatches(
  pattern: RegExp,
  options?: AssertionOptions
): Promise<void>
```

#### Example
```typescript
await tester.assertScreenMatches(/Welcome.*User/);
```

### assertCursorAt()

Assert that cursor is at specific position.

```typescript
async assertCursorAt(position: Point): Promise<void>
```

#### Example
```typescript
await tester.assertCursorAt({ x: 10, y: 5 });
```

### assertLine()

Assert that a specific line contains text or matches a predicate.

```typescript
async assertLine(
  lineNumber: number,
  predicate: string | ((line: string) => boolean)
): Promise<void>
```

#### Parameters
- `lineNumber` - Zero-based line number
- `predicate` - Text to search for or function to test the line

#### Example
```typescript
// Assert line contains text
await tester.assertLine(0, 'Welcome');

// Assert with predicate
await tester.assertLine(1, line => line.startsWith('>'));
```

## Mouse Methods

### enableMouse()

Enable mouse support in the terminal.

```typescript
async enableMouse(): Promise<void>
```

#### Example
```typescript
await tester.enableMouse();
```

### disableMouse()

Disable mouse support in the terminal.

```typescript
async disableMouse(): Promise<void>
```

#### Example
```typescript
await tester.disableMouse();
```

### click()

Click at specific position.

```typescript
async click(x: number, y: number): Promise<void>
```

#### Parameters
- `x` - Column position (0-based)
- `y` - Row position (0-based)

#### Example
```typescript
await tester.click(10, 5);
```

### clickText()

Click on text in the terminal.

```typescript
async clickText(text: string): Promise<void>
```

#### Parameters
- `text` - Text to find and click on

#### Example
```typescript
await tester.clickText('Button');
```

### doubleClick()

Double click at specific position.

```typescript
async doubleClick(x: number, y: number): Promise<void>
```

#### Example
```typescript
await tester.doubleClick(10, 5);
```

### rightClick()

Right click at specific position.

```typescript
async rightClick(x: number, y: number): Promise<void>
```

#### Example
```typescript
await tester.rightClick(10, 5);
```

### drag()

Drag from one position to another.

```typescript
async drag(from: Point, to: Point): Promise<void>
```

#### Parameters
- `from` - Starting position
- `to` - Ending position

#### Example
```typescript
await tester.drag(
  { x: 10, y: 5 },
  { x: 20, y: 10 }
);
```

### scroll()

Scroll up or down.

```typescript
async scroll(direction: 'up' | 'down', lines?: number): Promise<void>
```

#### Parameters
- `direction` - Scroll direction
- `lines` - Number of lines to scroll (default: 1)

#### Example
```typescript
await tester.scroll('up', 3);
await tester.scroll('down', 5);
```

### sendMouse()

Send a low-level mouse event.

```typescript
async sendMouse(event: MouseEvent): Promise<void>
```

#### MouseEvent
```typescript
interface MouseEvent {
  type: 'click' | 'drag' | 'move' | 'scroll' | 'down' | 'up';
  position: Point;
  button?: 'left' | 'middle' | 'right' | 'up' | 'down';
  modifiers?: KeyModifiers;
}
```

#### Example
```typescript
await tester.sendMouse({
  type: 'click',
  position: { x: 10, y: 5 },
  button: 'left'
});
```

## Recording Methods

### startRecording()

Start recording the session.

```typescript
startRecording(): void
```

### stopRecording()

Stop recording and return the recording.

```typescript
stopRecording(): Recording
```

#### Returns
```typescript
interface Recording {
  startTime: number;
  events: RecordedEvent[];
  captures: ScreenCapture[];
}

interface RecordedEvent {
  timestamp: number;
  type: 'input' | 'output' | 'resize' | 'mouse' | 'key';
  data: any;
}
```

### playRecording()

Replay a recorded session.

```typescript
async playRecording(recording: Recording, speed?: number): Promise<void>
```

#### Example
```typescript
// Record a session
tester.startRecording();
await tester.sendText('test');
await tester.sendKey('Enter');
const recording = tester.stopRecording();

// Replay it
await tester.restart();
await tester.playRecording(recording);
```

## Snapshot Methods

### snapshot()

Take and compare a snapshot with various options.

```typescript
async snapshot(
  name: string,
  options?: {
    stripAnsi?: boolean;
    trim?: boolean;
    compare?: (expected: string, actual: string) => boolean;
    updateSnapshot?: boolean;
    customContent?: string;
  }
): Promise<void>
```

#### Parameters
- `name` - Snapshot name
- `options` - Snapshot options
  - `stripAnsi` - Remove ANSI codes before saving
  - `trim` - Trim whitespace
  - `compare` - Custom comparison function
  - `updateSnapshot` - Update existing snapshot
  - `customContent` - Use custom content instead of screen capture

#### Example
```typescript
// Basic snapshot
await tester.snapshot('home-screen');

// Strip ANSI codes
await tester.snapshot('plain-text', { stripAnsi: true });

// Custom comparison
await tester.snapshot('version-screen', {
  compare: (expected, actual) => {
    // Ignore version numbers
    return expected.replace(/v\d+\.\d+\.\d+/, '') ===
           actual.replace(/v\d+\.\d+\.\d+/, '');
  }
});

// Update snapshot
await tester.snapshot('updated-screen', { updateSnapshot: true });
```

### takeSnapshot()

Take a snapshot of the current screen (low-level).

```typescript
async takeSnapshot(name?: string): Promise<Snapshot>
```

#### Example
```typescript
const snapshot = await tester.takeSnapshot('login-screen');
```

### compareSnapshot()

Compare current screen with a saved snapshot.

```typescript
async compareSnapshot(snapshot: Snapshot | string): Promise<boolean>
```

#### Returns
- `true` if snapshots match
- `false` if they differ

#### Example
```typescript
const matches = await tester.compareSnapshot('home-screen');
if (!matches) {
  console.log('Visual regression detected!');
}
```

### saveSnapshot()

Save snapshot to file.

```typescript
async saveSnapshot(snapshot: Snapshot, path?: string): Promise<void>
```

#### Example
```typescript
const snapshot = await tester.takeSnapshot('test');
await tester.saveSnapshot(snapshot, './snapshots/test.json');
```

### loadSnapshot()

Load snapshot from file.

```typescript
async loadSnapshot(path: string): Promise<Snapshot>
```

#### Example
```typescript
const snapshot = await tester.loadSnapshot('./snapshots/test.json');
```

## Utility Methods

### debug()

Output debug information.

```typescript
debug(message: string): void
```

### getSize()

Get terminal size.

```typescript
getSize(): TerminalSize
```

#### Returns
```typescript
interface TerminalSize {
  cols: number;
  rows: number;
}
```

### getSessionName()

Get the name of the tmux session.

```typescript
getSessionName(): string
```

#### Returns
- Session name string

#### Example
```typescript
const sessionName = tester.getSessionName();
console.log('Session:', sessionName);
```

### resize()

Resize the terminal.

```typescript
async resize(size: TerminalSize): Promise<void>
```

#### Example
```typescript
await tester.resize({ cols: 120, rows: 40 });
```

### clear()

Clear the terminal screen.

```typescript
async clear(): Promise<void>
```

#### Example
```typescript
await tester.clear();
```

### reset()

Reset the terminal.

```typescript
async reset(): Promise<void>
```

#### Example
```typescript
await tester.reset();
```

### sleep()

Wait for a specified duration.

```typescript
async sleep(ms: number): Promise<void>
```

#### Example
```typescript
await tester.sleep(1000);  // Wait 1 second
```

## Types

### TesterConfig

```typescript
interface TesterConfig {
  command: string[];
  size?: TerminalSize;
  env?: Record<string, string>;
  cwd?: string;
  shell?: string;
  sessionName?: string;
  debug?: boolean;
  recordingEnabled?: boolean;
  snapshotDir?: string;
}
```

### TerminalSize

```typescript
interface TerminalSize {
  cols: number;
  rows: number;
}
```

### Point

```typescript
interface Point {
  x: number;
  y: number;
}
```

### KeyModifiers

```typescript
interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}
```

### ScreenCapture

```typescript
interface ScreenCapture {
  raw: string;
  text: string;
  lines: string[];
  timestamp: number;
  size: TerminalSize;
}
```

### MouseEvent

```typescript
interface MouseEvent {
  type: 'click' | 'drag' | 'move' | 'scroll' | 'down' | 'up';
  position: Point;
  button?: 'left' | 'middle' | 'right' | 'up' | 'down';
  modifiers?: KeyModifiers;
}
```

### WaitOptions

```typescript
interface WaitOptions {
  timeout?: number;    // default: 5000
  interval?: number;   // default: 100
  message?: string;
}
```

### AssertionOptions

```typescript
interface AssertionOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  ignoreAnsi?: boolean;
  trimLines?: boolean;
  normalizeLineEndings?: boolean;
}
```

### Recording

```typescript
interface Recording {
  startTime: number;
  events: RecordedEvent[];
  captures: ScreenCapture[];
}
```

### RecordedEvent

```typescript
interface RecordedEvent {
  timestamp: number;
  type: 'input' | 'output' | 'resize' | 'mouse' | 'key';
  data: any;
}
```

### Snapshot

```typescript
interface Snapshot {
  id: string;
  name: string;
  capture: ScreenCapture;
  metadata?: Record<string, any>;
}
```

## Snapshot Manager API

### getSnapshotManager()

Get or create the global snapshot manager instance.

```typescript
function getSnapshotManager(options?: SnapshotOptions): SnapshotManager
```

#### Example
```typescript
import { getSnapshotManager } from '@xec-sh/tui-tester';

const manager = getSnapshotManager();
```

### SnapshotManager.configure()

Configure the snapshot manager.

```typescript
configure(options: Partial<SnapshotOptions> & {
  stripAnsi?: boolean;
  trim?: boolean;
}): void
```

#### Parameters
- `options` - Configuration options
  - `updateSnapshots` - Update existing snapshots
  - `snapshotDir` - Directory for snapshots
  - `format` - Snapshot format ('text', 'json', 'ansi')
  - `stripAnsi` - Remove ANSI codes (mapped to diffOptions.ignoreAnsi)
  - `trim` - Trim whitespace (mapped to diffOptions.ignoreWhitespace)

#### Example
```typescript
const manager = getSnapshotManager();

manager.configure({
  snapshotDir: './test/snapshots',
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === 'true',
  stripAnsi: true,
  trim: true
});
```

### SnapshotManager.save()

Save a snapshot.

```typescript
async save(name: string, content: string): Promise<void>
```

#### Example
```typescript
await manager.save('test-snapshot', screenContent);
```

### SnapshotManager.load()

Load a snapshot.

```typescript
async load(name: string): Promise<string | null>
```

#### Example
```typescript
const content = await manager.load('test-snapshot');
if (content) {
  console.log('Snapshot content:', content);
}
```

### SnapshotManager.compare()

Compare two snapshots.

```typescript
async compare(name1: string, name2: string): Promise<{
  identical: boolean;
  differences: Array<{ line: number; expected?: string; actual?: string }>;
  error?: string;
}>
```

#### Example
```typescript
const result = await manager.compare('snapshot1', 'snapshot2');
if (!result.identical) {
  console.log('Differences:', result.differences);
}
```