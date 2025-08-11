/**
 * E2E Testing Types and Interfaces
 * Core types for terminal UI testing framework
 */

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MouseButton {
  left: boolean;
  middle: boolean;
  right: boolean;
}

export interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface MouseEvent {
  type: 'click' | 'drag' | 'move' | 'scroll' | 'down' | 'up';
  position: Point;
  button?: 'left' | 'middle' | 'right' | 'up' | 'down';
  modifiers?: KeyModifiers;
}

export interface KeyEvent {
  key: string;
  modifiers?: KeyModifiers;
}

export interface ScreenCapture {
  raw: string;           // Raw output with ANSI codes
  text: string;          // Text without ANSI codes
  lines: string[];       // Array of lines without ANSI
  timestamp: number;
  size: TerminalSize;
}

export interface Snapshot {
  id: string;
  name: string;
  capture: ScreenCapture;
  metadata?: Record<string, any>;
}

export interface AssertionOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  ignoreAnsi?: boolean;
  trimLines?: boolean;
  normalizeLineEndings?: boolean;
}

export interface WaitOptions {
  timeout?: number;
  interval?: number;
  message?: string;
}

export interface TesterConfig {
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

export interface Recording {
  startTime: number;
  events: RecordedEvent[];
  captures: ScreenCapture[];
}

export interface RecordedEvent {
  timestamp: number;
  type: 'input' | 'output' | 'resize' | 'mouse' | 'key';
  data: any;
}

export type Runtime = 'node' | 'deno' | 'bun';

export interface RuntimeAdapter {
  exec(command: string): Promise<{ stdout: string; stderr: string; code: number }>;
  spawn(command: string, args: string[]): Promise<ChildProcess>;
  sleep(ms: number): Promise<void>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  commandExists?(command: string): Promise<boolean>;
  tryExec?(command: string): Promise<{ stdout: string; stderr: string; code: number } | null>;
}

export interface ChildProcess {
  pid: number;
  kill(signal?: string): void;
  stdin: WritableStream | NodeJS.WritableStream;
  stdout: ReadableStream | NodeJS.ReadableStream;
  stderr: ReadableStream | NodeJS.ReadableStream;
  wait(): Promise<{ code: number }>;
}

export interface TerminalTester {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  isRunning(): boolean;

  // Input
  sendText(text: string): Promise<void>;
  sendKey(key: string, modifiers?: KeyModifiers): Promise<void>;
  sendKeys(keys: string[]): Promise<void>;
  sendMouse(event: MouseEvent): Promise<void>;
  paste(text: string): Promise<void>;
  typeText(text: string, delayMs?: number): Promise<void>;

  // Output
  captureScreen(): Promise<ScreenCapture>;
  getScreenText(): Promise<string>;
  getScreenLines(): Promise<string[]>;
  waitForText(text: string, options?: WaitOptions): Promise<void>;
  waitForPattern(pattern: RegExp, options?: WaitOptions): Promise<void>;
  waitForLine(lineNumber: number, text: string, options?: WaitOptions): Promise<void>;
  
  // Assertions
  assertScreen(expected: string[] | string, options?: AssertionOptions): Promise<void>;
  assertScreenContains(text: string, options?: AssertionOptions): Promise<void>;
  assertScreenMatches(pattern: RegExp, options?: AssertionOptions): Promise<void>;
  assertCursorAt(position: Point): Promise<void>;
  
  // Snapshots
  takeSnapshot(name?: string): Promise<Snapshot>;
  compareSnapshot(snapshot: Snapshot | string): Promise<boolean>;
  saveSnapshot(snapshot: Snapshot, path?: string): Promise<void>;
  loadSnapshot(path: string): Promise<Snapshot>;
  
  // Terminal control
  resize(size: TerminalSize): Promise<void>;
  clear(): Promise<void>;
  reset(): Promise<void>;
  getSize(): TerminalSize;
  
  // Recording
  startRecording(): void;
  stopRecording(): Recording;
  playRecording(recording: Recording, speed?: number): Promise<void>;
  
  // Utilities
  sleep(ms: number): Promise<void>;
  debug(message: string): void;
}

export interface TestScenario {
  name: string;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  steps: TestStep[];
}

export interface TestStep {
  name: string;
  action: (tester: TerminalTester) => Promise<void>;
  assertion?: (tester: TerminalTester) => Promise<void>;
  skipOn?: Runtime[];
  timeout?: number;
}

export interface TestResult {
  scenario: string;
  passed: boolean;
  duration: number;
  steps: StepResult[];
  error?: Error;
  captures?: ScreenCapture[];
}

export interface StepResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: Error;
  capture?: ScreenCapture;
}