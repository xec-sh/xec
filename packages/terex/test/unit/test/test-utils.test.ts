import { it, vi, expect, describe, beforeEach } from 'vitest';

import { MockTerminal } from '../../../src/test/mock-terminal.js';
import { 
  Keys, 
  Mouse,
  Timing,
  TestData,
  formatDiff,
  extractText,
  waitForRender,
  StyleMatchers,
  TestMouseEvent,
  TestKeySequence,
  simulateKeyInput,
  OutputAssertions,
  compareSnapshots,
  createTestHarness,
  serializeSnapshot,
  simulateMouseInput,
  createTestComponent,
  assertRendersCorrectly,
  measureRenderPerformance,
  assertHandlesInputCorrectly
} from '../../../src/test/test-utils.js';

describe('Test Utils', () => {
  let mockTerminal: MockTerminal;

  beforeEach(() => {
    mockTerminal = new MockTerminal();
  });

  describe('createTestComponent', () => {
    it('should create a test component with default properties', () => {
      const component = createTestComponent();
      
      expect(component).toBeDefined();
      expect(component.type).toBe('test');
      expect(component.id).toBeDefined();
      expect(typeof component.render).toBe('function');
    });

    it('should create a test component with custom options', () => {
      const customComponent = createTestComponent({
        id: 'custom-test',
        initialState: { value: 'test-value' },
        renderLines: ['Custom Line 1', 'Custom Line 2']
      });

      expect(customComponent.id).toBe('custom-test');
      expect(customComponent.state.value).toBe('test-value');
      
      const output = customComponent.render();
      expect(output.lines).toEqual(['Custom Line 1', 'Custom Line 2']);
    });

    it('should handle custom render function', () => {
      const customRender = vi.fn(() => ({ lines: ['Custom Render'] }));
      const component = createTestComponent({
        renderFn: customRender
      });

      const output = component.render();
      expect(customRender).toHaveBeenCalled();
      expect(output.lines).toEqual(['Custom Render']);
    });

    it('should support event handling', async () => {
      const eventHandler = vi.fn();
      const component = createTestComponent({
        eventHandlers: {
          'test-event': eventHandler
        }
      });

      component.emit('test-event', 'test-data');
      expect(eventHandler).toHaveBeenCalledWith('test-data');
    });
  });

  describe('createTestHarness', () => {
    it('should create test harness with component', () => {
      const component = createTestComponent();
      const harness = createTestHarness(component, mockTerminal);

      expect(harness.component).toBe(component);
      expect(harness.terminal).toBe(mockTerminal);
      expect(typeof harness.render).toBe('function');
      expect(typeof harness.sendKey).toBe('function');
      expect(typeof harness.sendMouse).toBe('function');
    });

    it('should render component to terminal', () => {
      const component = createTestComponent({
        renderLines: ['Test Line 1', 'Test Line 2']
      });
      const harness = createTestHarness(component, mockTerminal);

      harness.render();

      const output = mockTerminal.getOutput();
      expect(output).toContain('Test Line 1');
      expect(output).toContain('Test Line 2');
    });

    it('should handle key input', () => {
      const keyHandler = vi.fn();
      const component = createTestComponent({
        keyHandler
      });
      const harness = createTestHarness(component, mockTerminal);

      harness.sendKey('enter');
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'enter' })
      );
    });

    it('should handle mouse input', () => {
      const mouseHandler = vi.fn();
      const component = createTestComponent({
        mouseHandler
      });
      const harness = createTestHarness(component, mockTerminal);

      harness.sendMouse({ type: 'click', x: 10, y: 5, button: 'left' });
      expect(mouseHandler).toHaveBeenCalledWith(
        expect.objectContaining({ 
          type: 'click', 
          x: 10, 
          y: 5, 
          button: 'left' 
        })
      );
    });
  });

  describe('waitForRender', () => {
    it('should wait for component to render', async () => {
      const component = createTestComponent();
      let renderCount = 0;
      
      const originalRender = component.render;
      component.render = () => {
        renderCount++;
        return originalRender.call(component);
      };

      const result = await waitForRender(component, 100);
      expect(result).toBe(true);
      expect(renderCount).toBeGreaterThan(0);
    });

    it('should timeout if render takes too long', async () => {
      const component = createTestComponent();
      
      // Make render never complete
      component.render = () => new Promise(() => {}) as any;

      const result = await waitForRender(component, 10);
      expect(result).toBe(false);
    });

    it('should wait for multiple render cycles', async () => {
      const component = createTestComponent();
      let renderCount = 0;

      const originalRender = component.render;
      component.render = () => {
        renderCount++;
        return originalRender.call(component);
      };

      // Trigger multiple renders
      setTimeout(() => component.invalidate(), 5);
      setTimeout(() => component.invalidate(), 10);
      setTimeout(() => component.invalidate(), 15);

      await waitForRender(component, 50);
      expect(renderCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('simulateKeyInput', () => {
    it('should simulate simple key presses', () => {
      const component = createTestComponent();
      const keyHandler = vi.fn();
      component.handleKeypress = keyHandler;

      simulateKeyInput(component, 'enter');
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'enter' })
      );
    });

    it('should simulate modified key combinations', () => {
      const component = createTestComponent();
      const keyHandler = vi.fn();
      component.handleKeypress = keyHandler;

      simulateKeyInput(component, 'c', { ctrl: true });
      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ 
          name: 'c', 
          ctrl: true 
        })
      );
    });

    it('should simulate key sequences', async () => {
      const component = createTestComponent();
      const keyHandler = vi.fn();
      component.handleKeypress = keyHandler;

      const sequence: TestKeySequence = [
        { key: 'h' },
        { key: 'e' },
        { key: 'l' },
        { key: 'l' },
        { key: 'o' },
        { key: 'enter' }
      ];

      await simulateKeyInput(component, sequence);
      expect(keyHandler).toHaveBeenCalledTimes(6);
      expect(keyHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'enter' })
      );
    });

    it('should handle delays in key sequences', async () => {
      const component = createTestComponent();
      const keyHandler = vi.fn();
      component.handleKeypress = keyHandler;

      const sequence: TestKeySequence = [
        { key: 'a', delay: 10 },
        { key: 'b', delay: 10 }
      ];

      const startTime = Date.now();
      await simulateKeyInput(component, sequence);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(15);
      expect(keyHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('simulateMouseInput', () => {
    it('should simulate mouse clicks', () => {
      const component = createTestComponent();
      const mouseHandler = vi.fn();
      component.handleMouseEvent = mouseHandler;

      simulateMouseInput(component, {
        type: 'click',
        x: 15,
        y: 25,
        button: 'left'
      });

      expect(mouseHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'click',
          x: 15,
          y: 25,
          button: 'left'
        })
      );
    });

    it('should simulate mouse movements', () => {
      const component = createTestComponent();
      const mouseHandler = vi.fn();
      component.handleMouseEvent = mouseHandler;

      simulateMouseInput(component, {
        type: 'move',
        x: 20,
        y: 30
      });

      expect(mouseHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'move',
          x: 20,
          y: 30
        })
      );
    });

    it('should simulate mouse events with modifiers', () => {
      const component = createTestComponent();
      const mouseHandler = vi.fn();
      component.handleMouseEvent = mouseHandler;

      simulateMouseInput(component, {
        type: 'click',
        x: 10,
        y: 10,
        button: 'right',
        ctrl: true,
        shift: true
      });

      expect(mouseHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          ctrl: true,
          shift: true
        })
      );
    });

    it('should simulate drag operations', async () => {
      const component = createTestComponent();
      const mouseHandler = vi.fn();
      component.handleMouseEvent = mouseHandler;

      const dragSequence: TestMouseEvent[] = [
        { type: 'mousedown', x: 5, y: 5, button: 'left' },
        { type: 'move', x: 10, y: 10 },
        { type: 'move', x: 15, y: 15 },
        { type: 'mouseup', x: 20, y: 20, button: 'left' }
      ];

      for (const event of dragSequence) {
        simulateMouseInput(component, event);
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      expect(mouseHandler).toHaveBeenCalledTimes(4);
      expect(mouseHandler).toHaveBeenNthCalledWith(1, 
        expect.objectContaining({ type: 'mousedown' })
      );
      expect(mouseHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'mouseup' })
      );
    });
  });

  describe('assertRendersCorrectly', () => {
    it('should validate component renders expected output', () => {
      const component = createTestComponent({
        renderLines: ['Expected Line 1', 'Expected Line 2']
      });

      expect(() => {
        assertRendersCorrectly(component, [
          'Expected Line 1',
          'Expected Line 2'
        ]);
      }).not.toThrow();
    });

    it('should fail when output does not match', () => {
      const component = createTestComponent({
        renderLines: ['Actual Line 1', 'Actual Line 2']
      });

      expect(() => {
        assertRendersCorrectly(component, [
          'Expected Line 1',
          'Expected Line 2'
        ]);
      }).toThrow();
    });

    it('should support partial matching', () => {
      const component = createTestComponent({
        renderLines: [
          'This is a long line with expected content',
          'Another line with some expected text'
        ]
      });

      expect(() => {
        assertRendersCorrectly(component, {
          contains: ['expected content', 'expected text']
        });
      }).not.toThrow();
    });

    it('should support regex matching', () => {
      const component = createTestComponent({
        renderLines: ['Line 1 with number 123', 'Line 2 with text ABC']
      });

      expect(() => {
        assertRendersCorrectly(component, {
          matches: [/Line \d+ with number \d+/, /Line \d+ with text [A-Z]+/]
        });
      }).not.toThrow();
    });
  });

  describe('assertHandlesInputCorrectly', () => {
    it('should validate component handles key input correctly', () => {
      const component = createTestComponent();
      const keyHandler = vi.fn().mockReturnValue(true);
      component.handleKeypress = keyHandler;

      expect(() => {
        assertHandlesInputCorrectly(component, {
          key: 'enter',
          expectHandled: true
        });
      }).not.toThrow();

      expect(keyHandler).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'enter' })
      );
    });

    it('should validate component handles mouse input correctly', () => {
      const component = createTestComponent();
      const mouseHandler = vi.fn().mockReturnValue(true);
      component.handleMouseEvent = mouseHandler;

      expect(() => {
        assertHandlesInputCorrectly(component, {
          mouse: { type: 'click', x: 10, y: 10, button: 'left' },
          expectHandled: true
        });
      }).not.toThrow();

      expect(mouseHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'click' })
      );
    });

    it('should fail when input handling does not match expectation', () => {
      const component = createTestComponent();
      const keyHandler = vi.fn().mockReturnValue(false);
      component.handleKeypress = keyHandler;

      expect(() => {
        assertHandlesInputCorrectly(component, {
          key: 'enter',
          expectHandled: true
        });
      }).toThrow();
    });
  });

  describe('measureRenderPerformance', () => {
    it('should measure single render performance', async () => {
      const component = createTestComponent({
        renderLines: ['Performance test line']
      });

      const result = await measureRenderPerformance(component);

      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.averageTime).toBeGreaterThan(0);
      expect(result.renderCount).toBe(1);
      expect(result.minTime).toBeGreaterThan(0);
      expect(result.maxTime).toBeGreaterThan(0);
    });

    it('should measure multiple render performance', async () => {
      const component = createTestComponent({
        renderLines: ['Performance test line']
      });

      const result = await measureRenderPerformance(component, 10);

      expect(result.renderCount).toBe(10);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.averageTime).toBe(result.totalTime / 10);
      expect(result.minTime).toBeLessThanOrEqual(result.maxTime);
    });

    it('should handle slow renders', async () => {
      const component = createTestComponent();
      
      // Make render artificially slow
      component.render = () => {
        const start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait for 10ms
        }
        return { lines: ['Slow render'] };
      };

      const result = await measureRenderPerformance(component, 3);
      
      expect(result.averageTime).toBeGreaterThan(5);
      expect(result.renderCount).toBe(3);
    });

    it('should provide detailed timing statistics', async () => {
      const component = createTestComponent();
      
      const result = await measureRenderPerformance(component, 5);
      
      expect(result).toHaveProperty('totalTime');
      expect(result).toHaveProperty('averageTime');
      expect(result).toHaveProperty('minTime');
      expect(result).toHaveProperty('maxTime');
      expect(result).toHaveProperty('renderCount');
      expect(result).toHaveProperty('rendersPerSecond');

      expect(result.rendersPerSecond).toBeGreaterThan(0);
      expect(result.minTime).toBeGreaterThan(0);
      expect(result.maxTime).toBeGreaterThanOrEqual(result.minTime);
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle complex user interaction flows', async () => {
      const component = createTestComponent({
        renderLines: ['Interactive Component']
      });
      
      const interactions = vi.fn();
      component.handleKeypress = interactions;
      component.handleMouseEvent = interactions;

      const harness = createTestHarness(component, mockTerminal);

      // Simulate complex interaction
      harness.render();
      harness.sendKey('tab');
      harness.sendMouse({ type: 'click', x: 5, y: 1, button: 'left' });
      harness.sendKey('enter', { ctrl: true });

      expect(interactions).toHaveBeenCalledTimes(3);
      expect(mockTerminal.getOutput()).toContain('Interactive Component');
    });

    it('should handle component lifecycle with events', async () => {
      const component = createTestComponent();
      const mountHandler = vi.fn();
      const unmountHandler = vi.fn();

      component.on('mount', mountHandler);
      component.on('unmount', unmountHandler);

      await component.mount();
      expect(mountHandler).toHaveBeenCalled();

      await component.unmount();
      expect(unmountHandler).toHaveBeenCalled();
    });

    it('should measure performance under load', async () => {
      const component = createTestComponent({
        renderLines: Array.from({ length: 100 }, (_, i) => `Line ${i}`)
      });

      const result = await measureRenderPerformance(component, 20);

      expect(result.renderCount).toBe(20);
      expect(result.averageTime).toBeLessThan(50); // Should render large content quickly
    });
  });

  describe('Test Index Exports Coverage', () => {
  // This test ensures we're covering all exports from test/index.ts
  it('should have all expected test utility exports', async () => {
    // Import all exports from test index
    const testIndex = await import('../../../src/test/index.js');
    const exports = Object.keys(testIndex);
    
    // Classes and factory functions
    expect(exports).toContain('MockTerminal');
    expect(exports).toContain('createMockTerminal');
    expect(exports).toContain('TestHarness');
    expect(exports).toContain('createTestHarness');
    
    // Utility objects and functions
    expect(exports).toContain('Keys');
    expect(exports).toContain('Mouse');
    expect(exports).toContain('extractText');
    expect(exports).toContain('StyleMatchers');
    expect(exports).toContain('OutputAssertions');
    expect(exports).toContain('TestData');
    expect(exports).toContain('Timing');
    expect(exports).toContain('serializeSnapshot');
    expect(exports).toContain('compareSnapshots');
    expect(exports).toContain('formatDiff');
    
    // Re-exported utilities
    expect(exports).toContain('stripAnsi');
    
    // TTY wrapper exports
    expect(exports).toContain('MockTTYStream');
    expect(exports).toContain('MockTTYInputStream');
    expect(exports).toContain('TTYTestEnvironment');
    expect(exports).toContain('withTTY');
    expect(exports).toContain('createMockProcess');
    expect(exports).toContain('setupGlobalTTY');
    expect(exports).toContain('createTTYTestEnvironment');
    expect(exports).toContain('createMockTTYStream');
    expect(exports).toContain('createMockTTYInputStream');
  });
  
  it('should create working instances from factory functions', async () => {
    const testIndex = await import('../../../src/test/index.js');
    
    // Test mock terminal creation
    const mockTerminal = testIndex.createMockTerminal();
    expect(mockTerminal).toBeInstanceOf(testIndex.MockTerminal);
    expect(typeof mockTerminal.write).toBe('function');
    expect(typeof mockTerminal.getOutput).toBe('function');
    
    // Test harness creation
    const testComp = createTestComponent();
    const harness = testIndex.createTestHarness();
    expect(harness).toBeDefined();
    expect(harness.terminal).toBeDefined();
    
    // Test that we can render a component
    await harness.render(testComp);
    const output = harness.getOutput();
    expect(output).toBeDefined();
    
    // Test TTY environment creation
    const ttyEnv = testIndex.createTTYTestEnvironment();
    expect(ttyEnv).toBeDefined();
    expect(ttyEnv.stdin).toBeDefined();
    expect(ttyEnv.stdout).toBeDefined();
    
    // Test mock process creation
    const mockProcess = testIndex.createMockProcess(ttyEnv);
    expect(mockProcess).toBeDefined();
    expect(mockProcess.stdout).toBeDefined();
    expect(mockProcess.stdin).toBeDefined();
  });
});

describe('Error Handling', () => {
    it('should handle components that throw during render', () => {
      const component = createTestComponent();
      component.render = () => {
        throw new Error('Render error');
      };

      expect(() => {
        assertRendersCorrectly(component, ['Any content']);
      }).toThrow();
    });

    it('should handle invalid key inputs gracefully', () => {
      const component = createTestComponent();
      const keyHandler = vi.fn();
      component.handleKeypress = keyHandler;

      expect(() => {
        simulateKeyInput(component, null as any);
        simulateKeyInput(component, undefined as any);
        simulateKeyInput(component, {} as any);
      }).not.toThrow();

      // Should still attempt to call handler even with invalid input
      expect(keyHandler).toHaveBeenCalled();
    });

    it('should handle components without event handlers', () => {
      const component = createTestComponent();
      // Don't set up any handlers

      expect(() => {
        simulateKeyInput(component, 'enter');
        simulateMouseInput(component, { type: 'click', x: 0, y: 0 });
      }).not.toThrow();
    });

    it('should handle edge cases in performance measurement', async () => {
      const component = createTestComponent();
      
      // Test with zero render count
      const result = await measureRenderPerformance(component, 0);
      expect(result.renderCount).toBe(0);
      expect(result.totalTime).toBe(0);
      expect(result.rendersPerSecond).toBe(0);
    });

    it('should handle component render errors in assertions', () => {
      const component = createTestComponent();
      component.render = () => {
        throw new Error('Critical render error');
      };
      
      expect(() => {
        assertRendersCorrectly(component, []);
      }).toThrow('Critical render error');
    });

    it('should handle missing mouse/key handlers in assertions', () => {
      const component = createTestComponent();
      // No handlers set
      
      // Should not throw, but handled should be false
      expect(() => {
        assertHandlesInputCorrectly(component, {
          key: 'enter',
          expectHandled: false
        });
      }).not.toThrow();
    });
  });
});

describe('Keys Helper Object', () => {
  describe('Special keys', () => {
    it('should create enter key', () => {
      const key = Keys.enter();
      expect(key.name).toBe('return');
      expect(key.sequence).toBe('\r');
      expect(key.ctrl).toBe(false);
    });

    it('should create escape key', () => {
      const key = Keys.escape();
      expect(key.name).toBe('escape');
      expect(key.sequence).toBe('\x1b');
    });

    it('should create tab key', () => {
      const key = Keys.tab();
      expect(key.name).toBe('tab');
      expect(key.sequence).toBe('\t');
    });

    it('should create backspace key', () => {
      const key = Keys.backspace();
      expect(key.name).toBe('backspace');
      expect(key.sequence).toBe('\x7f');
    });

    it('should create delete key', () => {
      const key = Keys.delete();
      expect(key.name).toBe('delete');
      expect(key.sequence).toBe('\x1b[3~');
    });
  });

  describe('Arrow keys', () => {
    it('should create arrow keys', () => {
      expect(Keys.up().name).toBe('up');
      expect(Keys.up().sequence).toBe('\x1b[A');
      
      expect(Keys.down().name).toBe('down');
      expect(Keys.down().sequence).toBe('\x1b[B');
      
      expect(Keys.right().name).toBe('right');
      expect(Keys.right().sequence).toBe('\x1b[C');
      
      expect(Keys.left().name).toBe('left');
      expect(Keys.left().sequence).toBe('\x1b[D');
    });
  });

  describe('Home/End keys', () => {
    it('should create home and end keys', () => {
      expect(Keys.home().name).toBe('home');
      expect(Keys.home().sequence).toBe('\x1b[H');
      
      expect(Keys.end().name).toBe('end');
      expect(Keys.end().sequence).toBe('\x1b[F');
    });
  });

  describe('Page keys', () => {
    it('should create page up and down keys', () => {
      expect(Keys.pageUp().name).toBe('pageup');
      expect(Keys.pageUp().sequence).toBe('\x1b[5~');
      
      expect(Keys.pageDown().name).toBe('pagedown');
      expect(Keys.pageDown().sequence).toBe('\x1b[6~');
    });
  });

  describe('Character keys', () => {
    it('should create character keys', () => {
      const char = Keys.char('a');
      expect(char.name).toBe('a');
      expect(char.sequence).toBe('a');
      expect(char.ctrl).toBe(false);
      expect(char.meta).toBe(false);
      expect(char.shift).toBe(false);
    });

    it('should create character keys with modifiers', () => {
      const char = Keys.char('b', { ctrl: true, meta: true, shift: true });
      expect(char.name).toBe('b');
      expect(char.ctrl).toBe(true);
      expect(char.meta).toBe(true);
      expect(char.shift).toBe(true);
    });

    it('should create ctrl combinations', () => {
      const ctrlA = Keys.ctrl('a');
      expect(ctrlA.name).toBe('a');
      expect(ctrlA.ctrl).toBe(true);
      expect(ctrlA.sequence).toBe('\x01'); // Ctrl+A
    });

    it('should create meta combinations', () => {
      const metaA = Keys.meta('a');
      expect(metaA.name).toBe('a');
      expect(metaA.meta).toBe(true);
    });

    it('should create shift combinations', () => {
      const shiftA = Keys.shift('a');
      expect(shiftA.name).toBe('a');
      expect(shiftA.shift).toBe(true);
    });
  });
});

describe('Mouse Helper Object', () => {
  describe('Basic mouse events', () => {
    it('should create click events', () => {
      const click = Mouse.click(10, 20);
      expect(click.type).toBe('click');
      expect(click.x).toBe(10);
      expect(click.y).toBe(20);
      expect(click.button).toBe('left');
      expect(click.modifiers.ctrl).toBe(false);
    });

    it('should create click events with different buttons', () => {
      const rightClick = Mouse.click(10, 20, 'right');
      expect(rightClick.button).toBe('right');
      
      const middleClick = Mouse.click(10, 20, 'middle');
      expect(middleClick.button).toBe('middle');
    });

    it('should create double-click events', () => {
      const dblclick = Mouse.dblclick(15, 25);
      expect(dblclick.type).toBe('dblclick');
      expect(dblclick.x).toBe(15);
      expect(dblclick.y).toBe(25);
      expect(dblclick.button).toBe('left');
    });

    it('should create move events', () => {
      const move = Mouse.move(30, 40);
      expect(move.type).toBe('mousemove');
      expect(move.x).toBe(30);
      expect(move.y).toBe(40);
    });

    it('should create wheel events', () => {
      const wheel = Mouse.wheel(50, 60);
      expect(wheel.type).toBe('wheel');
      expect(wheel.x).toBe(50);
      expect(wheel.y).toBe(60);
    });
  });

  describe('Mouse events with modifiers', () => {
    it('should add modifiers to mouse events', () => {
      const click = Mouse.click(10, 20);
      const modifiedClick = Mouse.withModifiers(click, { ctrl: true, shift: true });
      
      expect(modifiedClick.type).toBe('click');
      expect(modifiedClick.x).toBe(10);
      expect(modifiedClick.y).toBe(20);
      expect(modifiedClick.modifiers.ctrl).toBe(true);
      expect(modifiedClick.modifiers.shift).toBe(true);
      expect(modifiedClick.modifiers.meta).toBe(false);
      expect(modifiedClick.modifiers.alt).toBe(false);
    });

    it('should preserve existing event properties', () => {
      const dblclick = Mouse.dblclick(100, 200);
      const modified = Mouse.withModifiers(dblclick, { alt: true });
      
      expect(modified.type).toBe('dblclick');
      expect(modified.button).toBe('left');
      expect(modified.modifiers.alt).toBe(true);
    });
  });
});

describe('Text and Output Utilities', () => {
  describe('extractText', () => {
    it('should extract text from lines', () => {
      const lines = ['Plain text', '\x1b[31mColored text\x1b[0m', 'More text'];
      const extracted = extractText(lines);
      
      expect(extracted).toEqual(['Plain text', 'Colored text', 'More text']);
    });

    it('should handle empty lines', () => {
      const lines = ['', 'Text', ''];
      const extracted = extractText(lines);
      
      expect(extracted).toEqual(['', 'Text', '']);
    });

    it('should handle complex ANSI sequences', () => {
      const lines = ['\x1b[1;32mBold Green\x1b[0m Text'];
      const extracted = extractText(lines);
      
      expect(extracted).toEqual(['Bold Green Text']);
    });
  });

  describe('StyleMatchers', () => {
    it('should detect bold style', () => {
      const boldText = '\x1b[1mBold Text\x1b[0m';
      const plainText = 'Plain Text';
      
      expect(StyleMatchers.hasStyle(boldText, { bold: true })).toBe(true);
      expect(StyleMatchers.hasStyle(plainText, { bold: true })).toBe(false);
    });

    it('should detect italic style', () => {
      const italicText = '\x1b[3mItalic Text\x1b[0m';
      const plainText = 'Plain Text';
      
      expect(StyleMatchers.hasStyle(italicText, { italic: true })).toBe(true);
      expect(StyleMatchers.hasStyle(plainText, { italic: true })).toBe(false);
    });

    it('should detect underline style', () => {
      const underlineText = '\x1b[4mUnderlined Text\x1b[0m';
      const plainText = 'Plain Text';
      
      expect(StyleMatchers.hasStyle(underlineText, { underline: true })).toBe(true);
      expect(StyleMatchers.hasStyle(plainText, { underline: true })).toBe(false);
    });

    it('should detect colors', () => {
      const colorText = '\x1b[31mRed Text\x1b[0m';
      const plainText = 'Plain Text';
      
      expect(StyleMatchers.hasColor(colorText, 'red' as any)).toBe(true);
      expect(StyleMatchers.hasColor(plainText, 'red' as any)).toBe(false);
    });
  });

  describe('OutputAssertions', () => {
    const sampleOutput = [
      'Line 1: Hello World',
      '\x1b[31mLine 2: Colored\x1b[0m',
      'Line 3: Final line'
    ];

    it('should check if output contains text', () => {
      expect(OutputAssertions.contains(sampleOutput, 'Hello World')).toBe(true);
      expect(OutputAssertions.contains(sampleOutput, 'Colored')).toBe(true);
      expect(OutputAssertions.contains(sampleOutput, 'Not found')).toBe(false);
    });

    it('should check if output contains specific line', () => {
      expect(OutputAssertions.containsLine(sampleOutput, 'Hello World')).toBe(true);
      expect(OutputAssertions.containsLine(sampleOutput, 'Final line')).toBe(true);
      expect(OutputAssertions.containsLine(sampleOutput, 'Missing line')).toBe(false);
    });

    it('should match output against regex patterns', () => {
      expect(OutputAssertions.matches(sampleOutput, /Line \d+:/)).toBe(true);
      expect(OutputAssertions.matches(sampleOutput, /Hello \w+/)).toBe(true);
      expect(OutputAssertions.matches(sampleOutput, /Not matching/)).toBe(false);
    });

    it('should count lines correctly', () => {
      expect(OutputAssertions.lineCount(sampleOutput)).toBe(3);
      expect(OutputAssertions.lineCount([])).toBe(0);
      expect(OutputAssertions.lineCount(['Single line'])).toBe(1);
    });

    it('should check if output is empty', () => {
      expect(OutputAssertions.isEmpty([])).toBe(true);
      expect(OutputAssertions.isEmpty(['', '  ', ''])).toBe(true);
      expect(OutputAssertions.isEmpty(['', 'Not empty', ''])).toBe(false);
      expect(OutputAssertions.isEmpty(sampleOutput)).toBe(false);
    });
  });
});

describe('Test Data Generators', () => {
  describe('TestData.randomString', () => {
    it('should generate random strings of specified length', () => {
      const str5 = TestData.randomString(5);
      const str10 = TestData.randomString(10);
      
      expect(str5).toHaveLength(5);
      expect(str10).toHaveLength(10);
      expect(str5).not.toBe(str10);
    });

    it('should use custom charset', () => {
      const numericString = TestData.randomString(5, '0123456789');
      expect(numericString).toMatch(/^[0-9]{5}$/);
      
      const binaryString = TestData.randomString(8, '01');
      expect(binaryString).toMatch(/^[01]{8}$/);
    });

    it('should generate different strings on consecutive calls', () => {
      const str1 = TestData.randomString(20);
      const str2 = TestData.randomString(20);
      
      expect(str1).not.toBe(str2);
    });
  });

  describe('TestData.lorem', () => {
    it('should generate lorem ipsum text', () => {
      const lorem = TestData.lorem();
      expect(typeof lorem).toBe('string');
      expect(lorem.split(' ')).toHaveLength(10); // Default 10 words
    });

    it('should generate specified number of words', () => {
      const lorem5 = TestData.lorem(5);
      const lorem20 = TestData.lorem(20);
      
      expect(lorem5.split(' ')).toHaveLength(5);
      expect(lorem20.split(' ')).toHaveLength(20);
    });

    it('should contain valid lorem ipsum words', () => {
      const lorem = TestData.lorem(50);
      const words = lorem.split(' ');
      
      const loremWords = [
        'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur',
        'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor',
        'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua'
      ];
      
      words.forEach(word => {
        expect(loremWords).toContain(word);
      });
    });
  });

  describe('TestData.items', () => {
    it('should generate array of items using generator function', () => {
      const numbers = TestData.items(5, (i) => i * 2);
      expect(numbers).toEqual([0, 2, 4, 6, 8]);
    });

    it('should generate complex objects', () => {
      const users = TestData.items(3, (i) => ({ id: i, name: `User${i}` }));
      
      expect(users).toHaveLength(3);
      expect(users[0]).toEqual({ id: 0, name: 'User0' });
      expect(users[2]).toEqual({ id: 2, name: 'User2' });
    });

    it('should handle zero items', () => {
      const empty = TestData.items(0, () => 'item');
      expect(empty).toEqual([]);
    });
  });
});

describe('Timing Utilities', () => {
  describe('Timing.wait', () => {
    it('should wait for specified time', async () => {
      const start = Date.now();
      await Timing.wait(50);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(45);
    });

    it('should resolve with undefined', async () => {
      const result = await Timing.wait(1);
      expect(result).toBeUndefined();
    });
  });

  describe('Timing.measure', () => {
    it('should measure synchronous function execution', async () => {
      const testFn = () => {
        let sum = 0;
        for (let i = 0; i < 100; i++) sum += i;
        return sum;
      };
      
      const { result, time } = await Timing.measure(testFn);
      
      expect(result).toBe(4950); // Sum of 0 to 99
      expect(time).toBeGreaterThan(0);
    });

    it('should measure asynchronous function execution', async () => {
      const asyncFn = async () => {
        await Timing.wait(10);
        return 'async result';
      };
      
      const { result, time } = await Timing.measure(asyncFn);
      
      expect(result).toBe('async result');
      expect(time).toBeGreaterThanOrEqual(5);
    });

    it('should handle throwing functions', async () => {
      const throwingFn = () => {
        throw new Error('Test error');
      };
      
      await expect(Timing.measure(throwingFn)).rejects.toThrow('Test error');
    });
  });

  describe('Timing.retry', () => {
    it('should succeed on first try', async () => {
      const successFn = () => 'success';
      
      const result = await Timing.retry(successFn);
      expect(result).toBe('success');
    });

    it('should retry failing function', async () => {
      let attempts = 0;
      const retryFn = () => {
        attempts++;
        if (attempts < 3) throw new Error('Still failing');
        return 'finally succeeded';
      };
      
      const result = await Timing.retry(retryFn, { retries: 5, delay: 1 });
      expect(result).toBe('finally succeeded');
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const alwaysFailFn = () => {
        throw new Error('Always fails');
      };
      
      await expect(
        Timing.retry(alwaysFailFn, { retries: 2, delay: 1 })
      ).rejects.toThrow('Always fails');
    });

    it('should handle async functions', async () => {
      let attempts = 0;
      const asyncRetryFn = async () => {
        attempts++;
        await Timing.wait(1);
        if (attempts < 2) throw new Error('Async failure');
        return 'async success';
      };
      
      const result = await Timing.retry(asyncRetryFn, { retries: 3, delay: 1 });
      expect(result).toBe('async success');
      expect(attempts).toBe(2);
    });
  });
});

describe('Snapshot Utilities', () => {
  describe('serializeSnapshot', () => {
    it('should serialize terminal output to clean text', () => {
      const output = [
        'Plain line',
        '\x1b[31mColored line\x1b[0m',
        'Line with trailing spaces   '
      ];
      
      const serialized = serializeSnapshot(output);
      
      expect(serialized).toBe('Plain line\nColored line\nLine with trailing spaces');
    });

    it('should handle empty output', () => {
      const serialized = serializeSnapshot([]);
      expect(serialized).toBe('');
    });

    it('should handle lines with only ANSI codes', () => {
      const output = ['\x1b[31m\x1b[0m', 'Text'];
      const serialized = serializeSnapshot(output);
      
      expect(serialized).toBe('\nText');
    });
  });

  describe('compareSnapshots', () => {
    it('should return true for identical snapshots', () => {
      const snap1 = 'Line 1\nLine 2\nLine 3';
      const snap2 = 'Line 1\nLine 2\nLine 3';
      
      expect(compareSnapshots(snap1, snap2)).toBe(true);
    });

    it('should return false for different snapshots', () => {
      const snap1 = 'Line 1\nLine 2';
      const snap2 = 'Line 1\nLine 3';
      
      expect(compareSnapshots(snap1, snap2)).toBe(false);
    });

    it('should be case sensitive', () => {
      const snap1 = 'Hello World';
      const snap2 = 'hello world';
      
      expect(compareSnapshots(snap1, snap2)).toBe(false);
    });
  });

  describe('formatDiff', () => {
    it('should format differences between snapshots', () => {
      const actual = 'Line 1\nActual Line 2\nLine 3';
      const expected = 'Line 1\nExpected Line 2\nLine 3';
      
      const diff = formatDiff(actual, expected);
      
      expect(diff).toContain('Line 2:');
      expect(diff).toContain('- Expected: Expected Line 2');
      expect(diff).toContain('+ Actual:   Actual Line 2');
    });

    it('should handle different line counts', () => {
      const actual = 'Line 1\nLine 2';
      const expected = 'Line 1\nLine 2\nLine 3';
      
      const diff = formatDiff(actual, expected);
      
      expect(diff).toContain('Line 3:');
      expect(diff).toContain('- Expected: Line 3');
      expect(diff).toContain('+ Actual:   ');
    });

    it('should return empty string for identical snapshots', () => {
      const snap1 = 'Same content';
      const snap2 = 'Same content';
      
      const diff = formatDiff(snap1, snap2);
      expect(diff).toBe('');
    });
  });
});

describe('Advanced Test Utilities', () => {
  describe('waitForRender - additional edge cases', () => {
    it('should handle render functions that return promises', async () => {
      const component = createTestComponent();
      
      component.render = () => Promise.resolve({ lines: ['Async rendered'] }) as any;
      
      const result = await waitForRender(component, 100);
      expect(result).toBe(true);
    });

    it('should handle render functions that reject promises', async () => {
      const component = createTestComponent();
      
      component.render = () => Promise.reject(new Error('Render failed')) as any;
      
      const result = await waitForRender(component, 100);
      expect(result).toBe(false);
    });

    it('should wait for invalidate event when render throws', async () => {
      const component = createTestComponent();
      let renderCount = 0;
      
      component.render = () => {
        renderCount++;
        throw new Error('Render error');
      };
      
      // Trigger invalidate after short delay
      setTimeout(() => {
        component.emit('invalidate');
      }, 10);
      
      const result = await waitForRender(component, 100);
      expect(result).toBe(true);
    });
  });

  describe('simulateKeyInput - additional edge cases', () => {
    it('should handle invalid input types gracefully', async () => {
      const component = createTestComponent();
      const keyHandler = vi.fn();
      component.handleKeypress = keyHandler;
      
      // Test with various invalid inputs
      await simulateKeyInput(component, 123 as any);
      await simulateKeyInput(component, { invalid: 'object' } as any);
      await simulateKeyInput(component, true as any);
      
      // Should attempt to call handler even with invalid input
      expect(keyHandler).toHaveBeenCalledTimes(3);
    });

    it('should handle components without handleKeypress method', async () => {
      const component = createTestComponent();
      // Don't set handleKeypress
      
      // Should not throw
      await expect(simulateKeyInput(component, 'test')).resolves.toBeUndefined();
    });
  });

  describe('TestComponent lifecycle', () => {
    it('should generate unique IDs', () => {
      const comp1 = createTestComponent();
      const comp2 = createTestComponent();
      
      expect(comp1.id).not.toBe(comp2.id);
      expect(comp1.id).toMatch(/^test-\d+-[a-z0-9]+$/);
    });

    it('should support state management', () => {
      const component = createTestComponent({ initialState: { count: 0 } });
      
      expect(component.state.count).toBe(0);
      
      component.setState({ count: 5 });
      expect(component.state.count).toBe(5);
      
      // Should merge states
      component.setState({ name: 'test' });
      expect(component.state.count).toBe(5);
      expect(component.state.name).toBe('test');
    });

    it('should support invalidation', () => {
      const component = createTestComponent();
      const invalidateHandler = vi.fn();
      
      component.on('invalidate', invalidateHandler);
      component.invalidate();
      
      expect(invalidateHandler).toHaveBeenCalled();
    });

    it('should support mount/unmount lifecycle', async () => {
      const component = createTestComponent();
      const mountHandler = vi.fn();
      const unmountHandler = vi.fn();
      
      component.on('mount', mountHandler);
      component.on('unmount', unmountHandler);
      
      await component.mount();
      expect(mountHandler).toHaveBeenCalled();
      
      await component.unmount();
      expect(unmountHandler).toHaveBeenCalled();
    });
  });
});