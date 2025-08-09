/**
 * Test helper utilities for Terex components
 * Provides common mocking, setup, and assertion utilities
 */

import { vi } from 'vitest';

import { Screen } from '../../src/core/screen.js';
import { Cursor } from '../../src/core/cursor.js';
import { Renderer } from '../../src/core/renderer.js';
import { BaseComponent } from '../../src/core/component.js';
import { EventSystem } from '../../src/core/event-system.js';
import { RenderEngine } from '../../src/core/render-engine.js';
import { ReactiveState } from '../../src/core/reactive-state.js';
import { createMockTerminal } from '../../src/test/mock-terminal.js';

import type { Key, Output, TerminalStream } from '../../src/core/types.js';

// ============================================================================
// Mock Component Setup
// ============================================================================

/**
 * Create a properly mocked Select component for testing
 */
export function createMockSelectComponent(options: any = {}) {
  // Ensure options has the required structure
  const selectOptions = {
    options: options.options || [],
    defaultValue: options.defaultValue,
    placeholder: options.placeholder || 'Select an option',
    filter: options.filter || false,
    ...options
  };

  const { Select } = require('../../src/components/input/select.js');
  return new Select(selectOptions);
}

/**
 * Create a properly configured TextInput component for testing
 */
export function createMockTextInput(options: any = {}) {
  const { TextInput } = require('../../src/components/input/text-input.js');
  return new TextInput(options);
}

// ============================================================================
// Mock Terminal Stream
// ============================================================================

/**
 * Create a mock terminal stream with proper event handling
 */
export function createMockTerminalStream(): TerminalStream {
  const stream = {
    input: {
      on: vi.fn(),
      off: vi.fn(),
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn()
    },
    output: {
      write: vi.fn(),
      clearLine: vi.fn(),
      clearScreen: vi.fn(),
      moveCursor: vi.fn(),
      getWindowSize: vi.fn(() => ({ columns: 80, rows: 24 }))
    },
    columns: 80,
    rows: 24
  } as any;

  return stream;
}

// ============================================================================
// Event Simulation
// ============================================================================

/**
 * Simulate keyboard input on a component
 */
export async function simulateKeyInput(component: BaseComponent<any>, key: Key): Promise<void> {
  if (typeof (component as any).handleInput === 'function') {
    await (component as any).handleInput(key);
  } else if (typeof component.handleKeypress === 'function') {
    component.handleKeypress(key);
  }
}

/**
 * Simulate typing a string of characters
 */
export async function simulateTyping(component: BaseComponent<any>, text: string): Promise<void> {
  for (const char of text) {
    await simulateKeyInput(component, {
      name: char,
      sequence: char,
      ctrl: false,
      meta: false,
      shift: false
    });
  }
}

// ============================================================================
// Component State Helpers
// ============================================================================

/**
 * Wait for component to be in a specific state
 */
export async function waitForState<T>(
  component: BaseComponent<T>,
  predicate: (state: T) => boolean,
  timeout = 1000
): Promise<void> {
  const start = Date.now();
  
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate(component.getState())) {
        resolve();
        return;
      }
      
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for state condition`));
        return;
      }
      
      setTimeout(check, 10);
    };
    
    check();
  });
}

/**
 * Create a spy that tracks component method calls
 */
export function spyOnComponent<T>(component: BaseComponent<T>, method: string) {
  return vi.spyOn(component as any, method);
}

// ============================================================================
// Async Testing Helpers
// ============================================================================

/**
 * Wait for async operations to complete
 */
export async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Run function in next tick
 */
export async function nextTick(fn?: () => void): Promise<void> {
  await new Promise(resolve => {
    setImmediate(() => {
      fn?.();
      resolve(void 0);
    });
  });
}

// ============================================================================
// Output Validation Helpers
// ============================================================================

/**
 * Validate component output structure
 */
export function validateOutput(output: Output): boolean {
  return (
    typeof output === 'object' &&
    Array.isArray(output.lines) &&
    output.lines.every(line => typeof line === 'string')
  );
}

/**
 * Extract plain text from styled output
 */
export function extractPlainText(output: Output): string[] {
  return output.lines.map(line => 
    line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  );
}

/**
 * Check if output contains specific text
 */
export function outputContains(output: Output, text: string): boolean {
  const plainText = extractPlainText(output).join('\n');
  return plainText.includes(text);
}

// ============================================================================
// Setup and Teardown Helpers
// ============================================================================

/**
 * Setup test environment with proper mocks
 */
export function setupTestEnvironment() {
  const terminal = createMockTerminal();
  const cleanup: Array<() => void> = [];
  
  // Mock performance.now if not available in test environment
  if (typeof performance === 'undefined') {
    (global as any).performance = {
      now: () => Date.now()
    };
  }
  
  return {
    terminal,
    cleanup: () => {
      cleanup.forEach(fn => fn());
    }
  };
}

/**
 * Create a test component with proper lifecycle setup
 */
export async function createTestComponent<T>(
  ComponentClass: new (...args: any[]) => BaseComponent<T>,
  options: any = {}
): Promise<BaseComponent<T>> {
  const component = new ComponentClass(options);
  await component.mount();
  return component;
}

// ============================================================================
// Reactive State Test Helpers
// ============================================================================

/**
 * Create a mock change function for reactive state testing
 */
export function createMockChangeFunction() {
  return vi.fn((newState, oldState, changedKeys) => {
    // Default mock implementation
  });
}

/**
 * Create a proper reactive state with subscribe method for testing
 */
export function createMockReactiveState<T>(initialState: T) {
  const listeners: Array<(state: T) => void> = [];
  let currentState = initialState;
  
  return {
    getState: () => currentState,
    setState: (newState: T) => {
      currentState = newState;
      listeners.forEach(listener => listener(newState));
    },
    subscribe: (listener: (state: T) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      };
    },
    listenerCount: () => listeners.length
  };
}

/**
 * Enhanced application state mock with proper event handling
 */
export function createMockApplicationState(initialState: any = {}) {
  const reactiveState = createMockReactiveState(initialState);
  
  return {
    ...reactiveState,
    update: (updates: any) => {
      const newState = { ...reactiveState.getState(), ...updates };
      reactiveState.setState(newState);
    },
    reset: () => {
      reactiveState.setState(initialState);
    }
  };
}

/**
 * Wait for a reactive state change to occur
 */
export async function waitForStateChange<T>(
  reactiveState: any,
  timeout = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout waiting for state change'));
    }, timeout);
    
    const unsubscribe = reactiveState.addListener(() => {
      clearTimeout(timeoutId);
      unsubscribe();
      resolve();
    });
  });
}

// ============================================================================
// Enhanced Test Infrastructure
// ============================================================================

/**
 * Create a proper reactive state for testing
 */
export function createTestReactiveState<T>(initialState: T): ReactiveState<T> {
  return new ReactiveState(initialState);
}

/**
 * Create a mock renderer with all required functionality
 */
export function createMockRenderer(): Renderer {
  const screen = new Screen({ width: 80, height: 24 });
  const cursor = new Cursor();
  const renderer = new Renderer({ screen, cursor });
  
  // Mock the render method to capture output
  const originalRender = renderer.render.bind(renderer);
  renderer.render = vi.fn(originalRender);
  
  return renderer;
}

/**
 * Create a full test environment with all components
 */
export function createFullTestEnvironment() {
  const terminal = createMockTerminal();
  const eventSystem = new EventSystem();
  const screen = new Screen({ width: 80, height: 24 });
  const cursor = new Cursor();
  const renderer = new Renderer({ screen, cursor });
  const renderEngine = new RenderEngine({ eventSystem, renderer });
  
  return {
    terminal,
    eventSystem,
    screen,
    cursor,
    renderer,
    renderEngine,
    cleanup: () => {
      eventSystem.dispose?.();
      renderEngine.dispose?.();
    }
  };
}

/**
 * Simulate real application state with proper lifecycle
 */
export async function simulateApplicationLifecycle<T>(
  component: BaseComponent<T>,
  actions: Array<() => Promise<void> | void>
): Promise<void> {
  await component.mount();
  
  try {
    for (const action of actions) {
      await action();
      await flushPromises();
    }
  } finally {
    await component.unmount();
  }
}

/**
 * Advanced component testing with full lifecycle management
 */
export class ComponentTestHarness<T> {
  private component: BaseComponent<T>;
  private environment: ReturnType<typeof createFullTestEnvironment>;
  private mounted = false;
  
  constructor(
    private ComponentClass: new (...args: any[]) => BaseComponent<T>,
    private options: any = {}
  ) {
    this.environment = createFullTestEnvironment();
    this.component = new ComponentClass(options);
  }
  
  async mount(): Promise<void> {
    if (this.mounted) return;
    await this.component.mount();
    this.mounted = true;
  }
  
  async unmount(): Promise<void> {
    if (!this.mounted) return;
    await this.component.unmount();
    this.mounted = false;
  }
  
  getComponent(): BaseComponent<T> {
    return this.component;
  }
  
  getState(): T {
    return this.component.getState();
  }
  
  async simulateInput(key: Key): Promise<void> {
    if (!this.mounted) {
      throw new Error('Component must be mounted before simulating input');
    }
    await simulateKeyInput(this.component, key);
    await flushPromises();
  }
  
  async simulateTyping(text: string): Promise<void> {
    for (const char of text) {
      await this.simulateInput({
        name: char,
        sequence: char,
        ctrl: false,
        meta: false,
        shift: false
      });
    }
  }
  
  async waitForState(predicate: (state: T) => boolean, timeout = 1000): Promise<void> {
    return waitForState(this.component, predicate, timeout);
  }
  
  getOutput(): Output {
    return this.component.render();
  }
  
  dispose(): void {
    if (this.mounted) {
      this.component.unmount();
    }
    this.environment.cleanup();
  }
}

/**
 * Memory leak detection helper
 */
export class MemoryLeakDetector {
  private initialMemory: number;
  private components: BaseComponent<any>[] = [];
  private listeners: Array<() => void> = [];
  
  constructor() {
    this.initialMemory = this.getMemoryUsage();
  }
  
  trackComponent<T>(component: BaseComponent<T>): void {
    this.components.push(component);
  }
  
  trackListener(unsubscribe: () => void): void {
    this.listeners.push(unsubscribe);
  }
  
  async cleanup(): Promise<void> {
    // Cleanup all tracked resources
    for (const component of this.components) {
      try {
        await component.unmount();
      } catch (error) {
        console.warn('Component cleanup error:', error);
      }
    }
    
    for (const unsubscribe of this.listeners) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('Listener cleanup error:', error);
      }
    }
    
    this.components = [];
    this.listeners = [];
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  checkForLeaks(threshold = 10 * 1024 * 1024): boolean { // 10MB threshold
    const currentMemory = this.getMemoryUsage();
    const memoryIncrease = currentMemory - this.initialMemory;
    return memoryIncrease > threshold;
  }
  
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }
}

/**
 * Performance measurement helpers
 */
export class PerformanceMeasurer {
  private measurements: Map<string, number[]> = new Map();
  
  async measure<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const end = performance.now();
      const duration = end - start;
      
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);
    }
  }
  
  getStats(name: string) {
    const measurements = this.measurements.get(name) || [];
    if (measurements.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0 };
    }
    
    const sorted = [...measurements].sort((a, b) => a - b);
    return {
      count: measurements.length,
      avg: measurements.reduce((sum, val) => sum + val, 0) / measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
  
  clear(): void {
    this.measurements.clear();
  }
}

/**
 * Enhanced matchers for better assertions
 */
export const customMatchers = {
  toRenderCorrectly: (received: Output) => {
    const isValid = validateOutput(received);
    return {
      message: () => `Expected output to be valid, but got: ${JSON.stringify(received)}`,
      pass: isValid
    };
  },
  
  toContainText: (received: Output, expected: string) => {
    const contains = outputContains(received, expected);
    return {
      message: () => {
        const plainText = extractPlainText(received).join('\n');
        return `Expected output to contain "${expected}"\nReceived: "${plainText}"`;
      },
      pass: contains
    };
  },
  
  toBeWithinRange: (received: number, min: number, max: number) => {
    const inRange = received >= min && received <= max;
    return {
      message: () => `Expected ${received} to be between ${min} and ${max}`,
      pass: inRange
    };
  }
};

/**
 * Stress testing utilities
 */
export async function stressTestComponent<T>(
  component: BaseComponent<T>,
  iterations: number,
  action: (iteration: number) => Promise<void> | void
): Promise<void> {
  const detector = new MemoryLeakDetector();
  detector.trackComponent(component);
  
  await component.mount();
  
  try {
    for (let i = 0; i < iterations; i++) {
      await action(i);
      
      // Check for memory leaks every 100 iterations
      if (i % 100 === 0 && detector.checkForLeaks()) {
        throw new Error(`Memory leak detected after ${i} iterations`);
      }
    }
  } finally {
    await detector.cleanup();
  }
}

/**
 * Race condition testing
 */
export async function testRaceConditions<T>(
  setup: () => BaseComponent<T>,
  operations: Array<(component: BaseComponent<T>) => Promise<void>>,
  iterations = 10
): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    const component = setup();
    await component.mount();
    
    try {
      // Run all operations concurrently
      await Promise.all(operations.map(op => op(component)));
    } finally {
      await component.unmount();
    }
  }
}

/**
 * Error boundary testing
 */
export class TestErrorBoundary {
  private errors: Error[] = [];
  private recovered = false;
  
  handleError(error: Error): void {
    this.errors.push(error);
  }
  
  recover(): void {
    this.recovered = true;
    this.errors = [];
  }
  
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
  
  getErrors(): Error[] {
    return [...this.errors];
  }
  
  hasRecovered(): boolean {
    return this.recovered;
  }
}