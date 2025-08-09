/**
 * Test suite for render modes (inline vs fullscreen)
 * Verifies the fix for terminal clearing issue
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import {
  RenderEngine,
  BaseComponent,
  type TerminalStream,
  createCustomRenderEngine
} from '../src/core/index.js';

// Simple test component
class TestComponent extends BaseComponent<{}> {
  private content: string;

  constructor(content: string) {
    super({});
    this.content = content;
  }

  render() {
    return {
      lines: [this.content]
    };
  }
}

describe('Render Modes', () => {
  let mockStream: TerminalStream;
  let writeOutput: string;

  beforeEach(() => {
    writeOutput = '';
    mockStream = {
      input: process.stdin,
      output: {
        write: vi.fn((data: string) => {
          writeOutput += data;
          return true;
        }),
        columns: 80,
        rows: 24,
        isTTY: true,
        on: vi.fn(),
      } as any,
      isTTY: true,
      colorMode: 'truecolor'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Inline Mode', () => {
    it('should render at cursor position without clearing terminal', async () => {
      // Create custom mock stream that captures output
      const capturedOutput: string[] = [];
      const customMockStream: TerminalStream = {
        input: process.stdin,
        output: {
          write: vi.fn((data: string) => {
            capturedOutput.push(data);
            return true;
          }),
          columns: 80,
          rows: 24,
          isTTY: true,
          on: vi.fn(),
        } as any,
        isTTY: true,
        colorMode: 'truecolor'
      };

      // Create engine with mock stream from the start
      const engine = new RenderEngine(customMockStream, {
        mode: 'inline',
        preserveState: true,
        enhancedInput: false,
        enableFrameScheduling: false
      });

      const component = new TestComponent('Hello Inline');
      await engine.start(component);

      // Force a render to ensure output is generated
      await engine.forceRender();

      const fullOutput = capturedOutput.join('');

      // Check output for inline mode characteristics
      expect(fullOutput).toContain('Hello Inline');
      // Should have cursor save/restore sequences
      expect(fullOutput).toContain('\x1b[s'); // Save cursor
      expect(fullOutput).toContain('\x1b[2K'); // Clear line
      // Should NOT have clear screen sequence
      expect(fullOutput).not.toContain('\x1b[2J'); // Clear screen
      expect(fullOutput).not.toContain('\x1b[H'); // Move to home

      await engine.stop();
    });

    it('should use inline mode by default', async () => {
      const engine = createCustomRenderEngine();

      // Check that mode is set to inline
      expect((engine as any).options.mode).toBe('inline');
      expect((engine as any).options.logUpdateStyle).toBe(true);
    });

    it('should not enable draggable/resizable in inline mode', async () => {
      const engine = createCustomRenderEngine();
      (engine as any).stream = mockStream;

      // Test that mouse events are ignored in inline mode
      const mockMouseEvent = {
        type: 'mousedown',
        x: 10,
        y: 10
      };

      const component = new TestComponent('Test');
      await engine.start(component);

      // Try to handle mouse event
      (engine as any).handleMouseEvent(mockMouseEvent);

      // Should not set dragging component
      expect((engine as any).draggingComponent).toBeNull();
      expect((engine as any).resizingComponent).toBeNull();

      await engine.stop();
    });
  });

  describe('Fullscreen Mode', () => {
    it('should clear terminal and render from top', async () => {
      // Create custom mock stream that captures output
      const capturedOutput: string[] = [];
      const customMockStream: TerminalStream = {
        input: process.stdin,
        output: {
          write: vi.fn((data: string) => {
            capturedOutput.push(data);
            return true;
          }),
          columns: 80,
          rows: 24,
          isTTY: true,
          on: vi.fn(),
        } as any,
        isTTY: true,
        colorMode: 'truecolor'
      };

      // Create engine with mock stream from the start
      const engine = new RenderEngine(customMockStream, {
        mode: 'fullscreen',
        preserveState: false,
        enhancedInput: false,
        enableFrameScheduling: false
      });

      const component = new TestComponent('Hello Fullscreen');
      await engine.start(component);

      // Force a render to ensure output is generated
      await engine.forceRender();

      const fullOutput = capturedOutput.join('');

      // Check output for fullscreen mode characteristics
      expect(fullOutput).toContain('Hello Fullscreen');
      // Should have clear screen and move to home sequences
      expect(fullOutput).toContain('\x1b[2J'); // Clear screen
      // Move to home can be either \x1b[H or \x1b[1;1H
      expect(fullOutput.includes('\x1b[H') || fullOutput.includes('\x1b[1;1H')).toBe(true);

      await engine.stop();
    });

    it('should use fullscreen mode settings', async () => {
      const engine = createCustomRenderEngine();

      // Check that mode is set to fullscreen
      expect((engine as any).options.mode).toBe('fullscreen');
      expect((engine as any).options.logUpdateStyle).toBe(false);
      expect((engine as any).options.autoResize).toBe(true);
    });

    it('should enable draggable/resizable in fullscreen mode', async () => {
      const engine = createCustomRenderEngine();
      (engine as any).stream = mockStream;

      // Create a draggable component
      class DraggableComponent extends BaseComponent<{}> {
        constructor() {
          super({});
          this.setDraggable(true);
        }

        render() {
          return { lines: ['Draggable'] };
        }
      }

      const component = new DraggableComponent();
      await engine.start(component);

      // Verify fullscreen mode allows dragging
      expect((engine as any).options.mode).toBe('fullscreen');

      // The component should be able to be dragged
      expect(component.canDrag()).toBe(true);

      await engine.stop();
    });

    it('should use layerManager for z-index support', async () => {
      const engine = createCustomRenderEngine();
      (engine as any).stream = mockStream;

      const component = new TestComponent('Layered');
      component.setZIndex(10);

      await engine.start(component);

      // LayerManager should be used in fullscreen mode
      const layerManager = (engine as any).layerManager;
      expect(layerManager).toBeDefined();

      // Trigger a render to test layer management
      await engine.forceRender();

      await engine.stop();
    });
  });

  describe('Mode Compatibility', () => {
    it('should support legacy logUpdateStyle option for inline mode', async () => {
      const engine = createCustomRenderEngine({
        logUpdateStyle: true // Legacy option
      });

      expect((engine as any).options.mode).toBe('inline');
      expect((engine as any).options.logUpdateStyle).toBe(true);
    });

    it('should support legacy logUpdateStyle=false for fullscreen mode', async () => {
      const engine = createCustomRenderEngine({
        logUpdateStyle: false // Legacy option
      });

      expect((engine as any).options.mode).toBe('fullscreen');
      expect((engine as any).options.logUpdateStyle).toBe(false);
    });
  });
});