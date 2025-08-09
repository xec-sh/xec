/**
 * Test harness for component testing
 * Provides utilities for rendering and interacting with components in tests
 */

import { ColorSystem } from '../core/color.js';
import { MockTerminal } from './mock-terminal.js';
import { CursorController } from '../core/cursor.js';
import { ScreenController } from '../core/screen.js';
import {
  Key,
  Position,
  Component,
  MouseEvent,
  TestHarness as ITestHarness
} from '../core/types.js';

/**
 * Test harness implementation
 */
export class TestHarness implements ITestHarness {
  public readonly terminal: MockTerminal;
  private readonly cursor: CursorController;
  private readonly color: ColorSystem;
  private readonly screen: ScreenController;
  private currentComponent?: Component<unknown>;
  private renderOutput: string[] = [];

  constructor(options: {
    width?: number;
    height?: number;
    colorMode?: 'none' | '16' | '256' | 'truecolor';
  } = {}) {
    this.terminal = new MockTerminal({
      isTTY: true,
      colorMode: options.colorMode ?? 'none',
      width: options.width ?? 80,
      height: options.height ?? 24
    });

    const stream = this.terminal.asStream();
    this.cursor = new CursorController(stream);
    this.color = new ColorSystem(stream);
    this.screen = new ScreenController(stream, this.cursor);
  }

  /**
   * Render a component
   */
  async render(component: Component<unknown>): Promise<void> {
    this.currentComponent = component;
    
    // Mount component
    if (component.mount) {
      await component.mount();
    }

    // Render component
    const output = component.render();
    this.renderOutput = [...output.lines];

    // Write to terminal
    for (const line of output.lines) {
      this.terminal.output.write(line + '\n');
    }

    // Position cursor if specified
    if (output.cursor) {
      this.cursor.moveTo(output.cursor.x, output.cursor.y);
    }
  }

  /**
   * Send a key press to the component
   */
  sendKey(key: Partial<Key>): void {
    this.terminal.sendKey(key);
    
    if (this.currentComponent?.onKeyPress) {
      const fullKey: Key = {
        sequence: key.sequence ?? '',
        name: key.name ?? '',
        ctrl: key.ctrl ?? false,
        meta: key.meta ?? false,
        shift: key.shift ?? false,
        code: key.code
      };
      this.currentComponent.onKeyPress(fullKey);
    }
  }

  /**
   * Send a mouse event to the component
   */
  sendMouse(event: Partial<MouseEvent>): void {
    this.terminal.sendMouse(event);
    
    if (this.currentComponent?.onMouseEvent) {
      const fullEvent: MouseEvent = {
        type: event.type ?? 'click',
        x: event.x ?? 0,
        y: event.y ?? 0,
        button: event.button,
        modifiers: {
          ctrl: event.modifiers?.ctrl ?? false,
          meta: event.modifiers?.meta ?? false,
          shift: event.modifiers?.shift ?? false,
          alt: event.modifiers?.alt ?? false
        }
      };
      this.currentComponent.onMouseEvent(fullEvent);
    }
  }

  /**
   * Send text input
   */
  sendInput(text: string): void {
    this.terminal.sendText(text);
    
    // Simulate key presses for each character
    for (const char of text) {
      this.sendKey({ name: char, sequence: char });
    }
  }

  /**
   * Get rendered output lines
   */
  getOutput(): ReadonlyArray<string> {
    const buffer = this.terminal.getBuffer();
    return buffer.length > 0 ? buffer : [...this.renderOutput];
  }

  /**
   * Get full output as a single string
   */
  getFullOutput(): string {
    return this.terminal.getAllOutput();
  }

  /**
   * Get raw output with ANSI codes
   */
  getRawOutput(): string {
    return this.terminal.getAllOutput();
  }

  /**
   * Clear the terminal and render output
   */
  clear(): void {
    this.terminal.clearOutput();
    this.renderOutput = [];
    this.screen.clear();
  }

  /**
   * Wait for specific output
   */
  async waitFor(
    predicate: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const timeout = options.timeout ?? 1000;
    const interval = options.interval ?? 10;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await predicate()) {
        return;
      }
      await this.sleep(interval);
    }

    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }

  /**
   * Wait for specific output text
   */
  async waitForOutput(matcher: string | RegExp, timeout = 1000): Promise<void> {
    await this.terminal.waitForOutput(matcher, timeout);
  }

  /**
   * Simulate terminal resize
   */
  resize(width: number, height: number): void {
    this.terminal.setSize({
      columns: width,
      rows: height,
      width,
      height
    });

    if (this.currentComponent?.onResize) {
      this.currentComponent.onResize({
        columns: width,
        rows: height,
        width,
        height
      });
    }
  }

  /**
   * Focus the component
   */
  focus(): void {
    if (this.currentComponent && this.currentComponent.focus) {
      this.currentComponent.focus();
    }
  }

  /**
   * Blur the component
   */
  blur(): void {
    if (this.currentComponent && this.currentComponent.blur) {
      this.currentComponent.blur();
    }
  }

  /**
   * Get cursor position
   */
  getCursorPosition(): Position {
    return this.cursor.getPosition();
  }

  /**
   * Get terminal snapshot
   */
  snapshot(): {
    output: string[];
    cursor: Position;
    size: { width: number; height: number };
  } {
    const terminalSnapshot = this.terminal.snapshot();
    return {
      output: this.renderOutput,
      cursor: this.cursor.getPosition(),
      size: {
        width: terminalSnapshot.size.width,
        height: terminalSnapshot.size.height
      }
    };
  }

  /**
   * Reset the test harness
   */
  reset(): void {
    this.terminal.reset();
    this.clear();
    this.currentComponent = undefined;
  }

  /**
   * Unmount current component
   */
  async unmount(): Promise<void> {
    if (this.currentComponent?.unmount) {
      await this.currentComponent.unmount();
    }
    this.currentComponent = undefined;
  }

  /**
   * Cleanup test harness resources
   */
  cleanup(): void {
    this.reset();
    this.terminal.clearOutput();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a test harness
 */
export function createTestHarness(options?: {
  width?: number;
  height?: number;
  colorMode?: 'none' | '16' | '256' | 'truecolor';
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
}): TestHarness;
export function createTestHarness(terminal: MockTerminal): TestHarness;
export function createTestHarness(optionsOrTerminal?: MockTerminal | {
  width?: number;
  height?: number;
  colorMode?: 'none' | '16' | '256' | 'truecolor';
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
}): TestHarness {
  if (optionsOrTerminal instanceof MockTerminal) {
    // Create a harness wrapper that uses the provided MockTerminal
    const harness = new TestHarness();
    // Replace the default terminal with the provided one
    (harness as any).terminal = optionsOrTerminal;
    return harness;
  }
  return new TestHarness(optionsOrTerminal);
}