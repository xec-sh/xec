/**
 * Test utilities and helpers
 * Provides common utilities for testing terminal components
 */

import { EventEmitter } from 'events';

import { stripAnsi } from '../utils/index.js';
import { MockTerminal } from './mock-terminal.js';
import { Key, Style, Color, MouseEvent } from '../core/types.js';

/**
 * Test key sequence type
 */
export type TestKeySequence = Array<{
  key: string;
  delay?: number;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}>;

/**
 * Test mouse event type
 */
export type TestMouseEvent = {
  type: 'click' | 'dblclick' | 'mousemove' | 'mousedown' | 'mouseup' | 'wheel' | 'move';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
};

/**
 * Test component options
 */
export interface TestComponentOptions {
  id?: string;
  initialState?: any;
  renderLines?: string[];
  renderFn?: () => { lines: string[] };
  eventHandlers?: Record<string, (...args: any[]) => void>;
  keyHandler?: (key: Key) => boolean | void;
  mouseHandler?: (event: TestMouseEvent) => boolean | void;
}

/**
 * Test harness interface
 */
export interface TestHarness {
  component: TestComponent;
  terminal: MockTerminal;
  render(): void;
  sendKey(key: string, modifiers?: { ctrl?: boolean; meta?: boolean; shift?: boolean }): void;
  sendMouse(event: TestMouseEvent): void;
}

/**
 * Test component implementation
 */
export class TestComponent extends EventEmitter {
  public type = 'test';
  public id: string;
  public state: any;
  
  private renderLines: string[];
  private renderFn?: () => { lines: string[] };
  private eventHandlers: Record<string, (...args: any[]) => void>;
  
  constructor(options: TestComponentOptions = {}) {
    super();
    this.id = options.id || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.state = options.initialState || {};
    this.renderLines = options.renderLines || ['Test Component'];
    this.renderFn = options.renderFn;
    this.eventHandlers = options.eventHandlers || {};
    
    // Set up event handlers
    Object.entries(this.eventHandlers).forEach(([event, handler]) => {
      this.on(event, handler);
    });
    
    // Set up input handlers
    if (options.keyHandler) {
      this.handleKeypress = options.keyHandler;
    }
    if (options.mouseHandler) {
      this.handleMouseEvent = options.mouseHandler;
    }
  }
  
  render() {
    if (this.renderFn) {
      return this.renderFn();
    }
    return { lines: [...this.renderLines] };
  }
  
  setState(newState: any) {
    this.state = { ...this.state, ...newState };
  }
  
  handleKeypress?(key: Key): boolean | void;
  handleMouseEvent?(event: TestMouseEvent): boolean | void;
  
  invalidate() {
    this.emit('invalidate');
  }
  
  async mount() {
    this.emit('mount');
  }
  
  async unmount() {
    this.emit('unmount');
  }
}

/**
 * Create a test component
 */
export function createTestComponent(options?: TestComponentOptions): TestComponent {
  return new TestComponent(options);
}

/**
 * Create a test harness
 */
export function createTestHarness(component: TestComponent, terminal: MockTerminal): TestHarness {
  return {
    component,
    terminal,
    
    render() {
      const output = component.render();
      if (output.lines) {
        output.lines.forEach(line => terminal.write(line + '\n'));
      }
    },
    
    sendKey(key: string, modifiers?: { ctrl?: boolean; meta?: boolean; shift?: boolean }) {
      const keyEvent: Key = {
        name: key,
        sequence: key,
        ctrl: modifiers?.ctrl || false,
        meta: modifiers?.meta || false,
        shift: modifiers?.shift || false
      };
      
      if (component.handleKeypress) {
        component.handleKeypress(keyEvent);
      }
    },
    
    sendMouse(event: TestMouseEvent) {
      if (component.handleMouseEvent) {
        component.handleMouseEvent(event);
      }
    }
  };
}

/**
 * Wait for component to render
 */
export async function waitForRender(component: TestComponent, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    
    // Try to render and handle async renders
    try {
      const renderResult = component.render();
      
      // If render returns a promise, wait for it
      if (renderResult && typeof (renderResult as any).then === 'function') {
        ((renderResult as unknown) as Promise<any>).then(() => {
          clearTimeout(timeout);
          resolve(true);
        }).catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
      } else {
        // Synchronous render completed
        clearTimeout(timeout);
        resolve(true);
      }
    } catch {
      // If render fails, wait for invalidate event
      const onInvalidate = () => {
        clearTimeout(timeout);
        component.off('invalidate', onInvalidate);
        resolve(true);
      };
      component.on('invalidate', onInvalidate);
    }
  });
}

/**
 * Simulate key input
 */
export async function simulateKeyInput(
  component: TestComponent,
  input: string | TestKeySequence,
  modifiers?: { ctrl?: boolean; meta?: boolean; shift?: boolean }
): Promise<void> {
  if (typeof input === 'string') {
    const keyEvent: Key = {
      name: input,
      sequence: input,
      ctrl: modifiers?.ctrl || false,
      meta: modifiers?.meta || false,
      shift: modifiers?.shift || false
    };
    
    if (component.handleKeypress) {
      component.handleKeypress(keyEvent);
    }
  } else if (Array.isArray(input)) {
    for (const keyDef of input) {
      const keyEvent: Key = {
        name: keyDef.key,
        sequence: keyDef.key,
        ctrl: keyDef.ctrl || false,
        meta: keyDef.meta || false,
        shift: keyDef.shift || false
      };
      
      if (component.handleKeypress) {
        component.handleKeypress(keyEvent);
      }
      
      if (keyDef.delay) {
        await new Promise(resolve => setTimeout(resolve, keyDef.delay));
      }
    }
  } else {
    // Handle invalid input gracefully
    if (component.handleKeypress) {
      try {
        component.handleKeypress(input as any);
      } catch {
        // Ignore errors for invalid input
      }
    }
  }
}

/**
 * Simulate mouse input
 */
export function simulateMouseInput(component: TestComponent, event: TestMouseEvent): void {
  if (component.handleMouseEvent) {
    component.handleMouseEvent(event);
  }
}

/**
 * Assert component renders correctly
 */
export function assertRendersCorrectly(
  component: TestComponent,
  expected: string[] | { contains?: string[]; matches?: RegExp[] }
): void {
  const output = component.render();
  const lines = output.lines || [];
  
  if (Array.isArray(expected)) {
    if (lines.length !== expected.length) {
      throw new Error(`Expected ${expected.length} lines, got ${lines.length}`);
    }
    
    for (let i = 0; i < expected.length; i++) {
      if (stripAnsi(lines[i] || '') !== expected[i]) {
        throw new Error(`Line ${i}: expected "${expected[i]}", got "${stripAnsi(lines[i] || '')}"`); 
      }
    }
  } else {
    const fullOutput = stripAnsi(lines.join('\n'));
    
    if (expected.contains) {
      for (const text of expected.contains) {
        if (!fullOutput.includes(text)) {
          throw new Error(`Expected output to contain "${text}"`);
        }
      }
    }
    
    if (expected.matches) {
      for (const pattern of expected.matches) {
        if (!pattern.test(fullOutput)) {
          throw new Error(`Expected output to match pattern ${pattern}`);
        }
      }
    }
  }
}

/**
 * Assert component handles input correctly
 */
export function assertHandlesInputCorrectly(
  component: TestComponent,
  test: {
    key?: string;
    mouse?: TestMouseEvent;
    expectHandled: boolean;
  }
): void {
  let handled = false;
  
  if (test.key) {
    const keyEvent: Key = {
      name: test.key,
      sequence: test.key,
      ctrl: false,
      meta: false,
      shift: false
    };
    
    if (component.handleKeypress) {
      const result = component.handleKeypress(keyEvent);
      handled = result === true;
    }
  }
  
  if (test.mouse) {
    if (component.handleMouseEvent) {
      const result = component.handleMouseEvent(test.mouse);
      handled = result === true;
    }
  }
  
  if (handled !== test.expectHandled) {
    throw new Error(`Expected input to be ${test.expectHandled ? 'handled' : 'not handled'}, but it was ${handled ? 'handled' : 'not handled'}`);
  }
}

/**
 * Performance measurement result
 */
export interface PerformanceResult {
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  renderCount: number;
  rendersPerSecond: number;
}

/**
 * Measure render performance
 */
export async function measureRenderPerformance(
  component: TestComponent,
  renderCount = 1
): Promise<PerformanceResult> {
  const times: number[] = [];
  
  for (let i = 0; i < renderCount; i++) {
    const start = performance.now();
    component.render();
    const end = performance.now();
    times.push(end - start);
  }
  
  const totalTime = times.reduce((sum, time) => sum + time, 0);
  const averageTime = totalTime / renderCount;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const rendersPerSecond = totalTime > 0 ? (1000 * renderCount) / totalTime : 0;
  
  return {
    totalTime,
    averageTime,
    minTime,
    maxTime,
    renderCount,
    rendersPerSecond
  };
}

/**
 * Key builders for common key combinations
 */
export const Keys = {
  // Special keys
  enter: (): Key => ({
    name: 'return',
    sequence: '\r',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  escape: (): Key => ({
    name: 'escape',
    sequence: '\x1b',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  tab: (): Key => ({
    name: 'tab',
    sequence: '\t',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  backspace: (): Key => ({
    name: 'backspace',
    sequence: '\x7f',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  delete: (): Key => ({
    name: 'delete',
    sequence: '\x1b[3~',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  // Arrow keys
  up: (): Key => ({
    name: 'up',
    sequence: '\x1b[A',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  down: (): Key => ({
    name: 'down',
    sequence: '\x1b[B',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  right: (): Key => ({
    name: 'right',
    sequence: '\x1b[C',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  left: (): Key => ({
    name: 'left',
    sequence: '\x1b[D',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  // Home/End
  home: (): Key => ({
    name: 'home',
    sequence: '\x1b[H',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  end: (): Key => ({
    name: 'end',
    sequence: '\x1b[F',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  // Page Up/Down
  pageUp: (): Key => ({
    name: 'pageup',
    sequence: '\x1b[5~',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  pageDown: (): Key => ({
    name: 'pagedown',
    sequence: '\x1b[6~',
    ctrl: false,
    meta: false,
    shift: false
  }),
  
  // Character with modifiers
  char: (char: string, modifiers?: { ctrl?: boolean; meta?: boolean; shift?: boolean }): Key => ({
    name: char,
    sequence: modifiers?.ctrl ? String.fromCharCode(char.charCodeAt(0) - 96) : char,
    ctrl: modifiers?.ctrl ?? false,
    meta: modifiers?.meta ?? false,
    shift: modifiers?.shift ?? false
  }),
  
  // Ctrl combinations
  ctrl: (char: string): Key => Keys.char(char, { ctrl: true }),
  
  // Meta combinations
  meta: (char: string): Key => Keys.char(char, { meta: true }),
  
  // Shift combinations
  shift: (char: string): Key => Keys.char(char, { shift: true })
} as const;

/**
 * Mouse event builders
 */
export const Mouse = {
  click: (x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): MouseEvent => ({
    type: 'click',
    x,
    y,
    button,
    modifiers: {
      ctrl: false,
      meta: false,
      shift: false,
      alt: false
    }
  }),
  
  dblclick: (x: number, y: number): MouseEvent => ({
    type: 'dblclick',
    x,
    y,
    button: 'left',
    modifiers: {
      ctrl: false,
      meta: false,
      shift: false,
      alt: false
    }
  }),
  
  move: (x: number, y: number): MouseEvent => ({
    type: 'mousemove',
    x,
    y,
    modifiers: {
      ctrl: false,
      meta: false,
      shift: false,
      alt: false
    }
  }),
  
  wheel: (x: number, y: number): MouseEvent => ({
    type: 'wheel',
    x,
    y,
    modifiers: {
      ctrl: false,
      meta: false,
      shift: false,
      alt: false
    }
  }),
  
  withModifiers: (
    event: MouseEvent,
    modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }
  ): MouseEvent => ({
    ...event,
    modifiers: {
      ctrl: modifiers.ctrl ?? false,
      meta: modifiers.meta ?? false,
      shift: modifiers.shift ?? false,
      alt: modifiers.alt ?? false
    }
  })
} as const;


/**
 * Extract visible text from terminal output
 */
export function extractText(lines: ReadonlyArray<string>): string[] {
  return lines.map(stripAnsi);
}

/**
 * Style matchers for testing
 */
export const StyleMatchers = {
  hasStyle: (text: string, style: Partial<Style>): boolean => {
    // Check for ANSI codes in text
    if (style.bold && !text.includes('\x1b[1m')) return false;
    if (style.italic && !text.includes('\x1b[3m')) return false;
    if (style.underline && !text.includes('\x1b[4m')) return false;
    return true;
  },
  
  hasColor: (text: string, color: Color): boolean => 
    // Simplified check - would need full implementation
     text.includes('\x1b[')
  
};

/**
 * Output assertions
 */
export const OutputAssertions = {
  contains: (output: ReadonlyArray<string>, text: string): boolean => {
    const fullOutput = output.join('\n');
    return stripAnsi(fullOutput).includes(text);
  },
  
  containsLine: (output: ReadonlyArray<string>, line: string): boolean => output.some(l => stripAnsi(l).includes(line)),
  
  matches: (output: ReadonlyArray<string>, pattern: RegExp): boolean => {
    const fullOutput = stripAnsi(output.join('\n'));
    return pattern.test(fullOutput);
  },
  
  lineCount: (output: ReadonlyArray<string>): number => output.length,
  
  isEmpty: (output: ReadonlyArray<string>): boolean => output.length === 0 || output.every(line => stripAnsi(line).trim() === '')
};

/**
 * Test data generators
 */
export const TestData = {
  /**
   * Generate random string
   */
  randomString: (length: number, charset = 'abcdefghijklmnopqrstuvwxyz'): string => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[Math.floor(Math.random() * charset.length)];
    }
    return result;
  },
  
  /**
   * Generate lorem ipsum text
   */
  lorem: (words = 10): string => {
    const loremWords = [
      'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur',
      'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor',
      'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua'
    ];
    const result: string[] = [];
    for (let i = 0; i < words; i++) {
      result.push(loremWords[Math.floor(Math.random() * loremWords.length)] || 'lorem');
    }
    return result.join(' ');
  },
  
  /**
   * Generate test items
   */
  items: <T>(count: number, generator: (index: number) => T): T[] => Array.from({ length: count }, (_, i) => generator(i))
};

/**
 * Timing utilities
 */
export const Timing = {
  /**
   * Wait for a specified time
   */
  wait: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Measure execution time
   */
  measure: async <T>(fn: () => T | Promise<T>): Promise<{ result: T; time: number }> => {
    const start = performance.now();
    const result = await fn();
    const time = performance.now() - start;
    return { result, time };
  },
  
  /**
   * Retry with timeout
   */
  retry: async <T>(
    fn: () => T | Promise<T>,
    options: { retries?: number; delay?: number } = {}
  ): Promise<T> => {
    const retries = options.retries ?? 3;
    const delay = options.delay ?? 100;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await Timing.wait(delay);
      }
    }
    
    throw new Error('Retry failed');
  }
};

/**
 * Snapshot serializer for terminal output
 */
export function serializeSnapshot(output: ReadonlyArray<string>): string {
  return output
    .map(line => stripAnsi(line))
    .map(line => line.trimEnd())
    .join('\n');
}

/**
 * Compare two snapshots
 */
export function compareSnapshots(actual: string, expected: string): boolean {
  return actual === expected;
}

/**
 * Format diff between two snapshots
 */
export function formatDiff(actual: string, expected: string): string {
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');
  const maxLines = Math.max(actualLines.length, expectedLines.length);
  const diff: string[] = [];
  
  for (let i = 0; i < maxLines; i++) {
    const actualLine = actualLines[i] ?? '';
    const expectedLine = expectedLines[i] ?? '';
    
    if (actualLine !== expectedLine) {
      diff.push(`Line ${i + 1}:`);
      diff.push(`  - Expected: ${expectedLine}`);
      diff.push(`  + Actual:   ${actualLine}`);
    }
  }
  
  return diff.join('\n');
}