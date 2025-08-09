import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { Box } from '../../../../src/components/containers/box.js';
import { MockTerminal } from '../../../../src/test/mock-terminal.js';
import { Text } from '../../../../src/components/primitives/text.js';


describe('Box Component', () => {
  let mockTerminal: MockTerminal;
  let box: Box;

  beforeEach(() => {
    mockTerminal = new MockTerminal();
    box = new Box();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create box with default properties', () => {
      expect(box).toBeInstanceOf(Box);
      expect(box.type).toBe('box');
      expect(box.children).toEqual([]);
      expect(box.dimensions.width).toBe(0);
      expect(box.dimensions.height).toBe(0);
    });

    it('should accept custom dimensions', () => {
      const customBox = new Box({
        width: 20,
        height: 10
      });
      expect(customBox.dimensions.width).toBe(20);
      expect(customBox.dimensions.height).toBe(10);
    });

    it('should accept border style options', () => {
      const borderedBox = new Box({
        borderStyle: 'single',
        borderColor: 'blue'
      });
      expect(borderedBox.state.borderStyle).toBe('single');
      expect(borderedBox.state.borderColor).toBe('blue');
    });

    it('should accept padding options', () => {
      const paddedBox = new Box({
        padding: 2
      });
      expect(paddedBox.state.padding).toEqual({
        top: 2,
        right: 2,
        bottom: 2,
        left: 2
      });
    });

    it('should accept margin options', () => {
      const marginBox = new Box({
        margin: 1
      });
      expect(marginBox.state.margin).toBe(1);
    });
  });

  describe('Child Management', () => {
    it('should add child components', () => {
      const child = new Text({ content: 'Hello' });
      box.appendChild(child);
      expect(box.children).toContain(child);
      expect(child.parent).toBe(box);
    });

    it('should remove child components', () => {
      const child = new Text({ content: 'Hello' });
      box.appendChild(child);
      box.removeChild(child);
      expect(box.children).not.toContain(child);
      expect(child.parent).toBeNull();
    });

    it('should handle multiple children', () => {
      const child1 = new Text({ content: 'First' });
      const child2 = new Text({ content: 'Second' });
      const child3 = new Text({ content: 'Third' });
      
      box.appendChild(child1);
      box.appendChild(child2);
      box.appendChild(child3);
      
      expect(box.children).toHaveLength(3);
      expect(box.children).toEqual([child1, child2, child3]);
    });

    it('should clear all children', () => {
      const child1 = new Text({ content: 'First' });
      const child2 = new Text({ content: 'Second' });
      
      box.appendChild(child1);
      box.appendChild(child2);
      box.clearChildren();
      
      expect(box.children).toHaveLength(0);
      expect(child1.parent).toBeNull();
      expect(child2.parent).toBeNull();
    });
  });

  describe('Rendering', () => {
    it('should render empty box', () => {
      box.dimensions = { width: 10, height: 3 };
      const output = box.render();
      expect(output.lines).toHaveLength(3);
      expect(output.lines[0]).toBe('          ');
      expect(output.lines[1]).toBe('          ');
      expect(output.lines[2]).toBe('          ');
    });

    it('should render box with text content', () => {
      box.dimensions = { width: 10, height: 3 };
      const text = new Text({ content: 'Hello' });
      box.appendChild(text);
      
      const output = box.render();
      expect(output.lines).toHaveLength(3);
      expect(output.lines[0]).toContain('Hello');
    });

    it('should render box with single border', () => {
      const borderedBox = new Box({
        width: 10,
        height: 5,
        borderStyle: 'single'
      });
      
      const output = borderedBox.render();
      expect(output.lines[0]).toContain('─');
      expect(output.lines[0]).toContain('┌');
      expect(output.lines[0]).toContain('┐');
      expect(output.lines[output.lines.length - 1]).toContain('└');
      expect(output.lines[output.lines.length - 1]).toContain('┘');
    });

    it('should render box with double border', () => {
      const borderedBox = new Box({
        width: 10,
        height: 5,
        borderStyle: 'double'
      });
      
      const output = borderedBox.render();
      expect(output.lines[0]).toContain('═');
      expect(output.lines[0]).toContain('╔');
      expect(output.lines[0]).toContain('╗');
      expect(output.lines[output.lines.length - 1]).toContain('╚');
      expect(output.lines[output.lines.length - 1]).toContain('╝');
    });

    it('should render box with rounded border', () => {
      const borderedBox = new Box({
        width: 10,
        height: 5,
        borderStyle: 'rounded'
      });
      
      const output = borderedBox.render();
      expect(output.lines[0]).toContain('╭');
      expect(output.lines[0]).toContain('╮');
      expect(output.lines[output.lines.length - 1]).toContain('╰');
      expect(output.lines[output.lines.length - 1]).toContain('╯');
    });

    it('should apply padding to content', () => {
      const paddedBox = new Box({
        width: 12,
        height: 5,
        padding: 1
      });
      const text = new Text({ content: 'Hello' });
      paddedBox.appendChild(text);
      
      const output = paddedBox.render();
      // Content should be padded from edges
      expect(output.lines[1]).toMatch(/^\s+Hello\s+$/);
    });

    it('should apply margin around box', () => {
      const marginBox = new Box({
        width: 10,
        height: 3,
        margin: 1
      });
      
      const output = marginBox.render();
      // First line should have margin
      expect(output.lines[0]).toMatch(/^\s{1}/);
    });

    it('should clip content that exceeds box boundaries', () => {
      box.dimensions = { width: 5, height: 2 };
      const longText = new Text({ content: 'This is a very long text' });
      box.appendChild(longText);
      
      const output = box.render();
      expect(output.lines[0].length).toBeLessThanOrEqual(5);
    });

    it('should handle nested boxes', () => {
      const outerBox = new Box({ width: 20, height: 10 });
      const innerBox = new Box({ width: 10, height: 5 });
      const text = new Text({ content: 'Nested' });
      
      innerBox.appendChild(text);
      outerBox.appendChild(innerBox);
      
      const output = outerBox.render();
      expect(output.lines).toBeTruthy();
      expect(output.lines.some(line => line.includes('Nested'))).toBe(true);
    });
  });

  describe('Styling', () => {
    it('should apply background color', () => {
      const coloredBox = new Box({
        width: 10,
        height: 3,
        backgroundColor: 'blue'
      });
      
      const output = coloredBox.render();
      // Should contain ANSI color codes for background
      expect(output.lines.some(line => line.includes('\x1b['))).toBe(true);
    });

    it('should apply border color', () => {
      const coloredBorderBox = new Box({
        width: 10,
        height: 3,
        borderStyle: 'single',
        borderColor: 'red'
      });
      
      const output = coloredBorderBox.render();
      // Should contain ANSI color codes for border
      expect(output.lines[0]).toContain('\x1b[');
    });

    it('should handle overflow with scrolling', () => {
      const scrollBox = new Box({
        width: 10,
        height: 5,
        overflow: 'scroll'
      });
      
      // Add many children to cause overflow
      for (let i = 0; i < 10; i++) {
        scrollBox.appendChild(new Text({ content: `Line ${i}` }));
      }
      
      const output = scrollBox.render();
      expect(output.lines).toHaveLength(5);
    });

    it('should handle overflow with hidden', () => {
      const hiddenOverflowBox = new Box({
        width: 10,
        height: 3,
        overflow: 'hidden'
      });
      
      // Add content that exceeds box height
      for (let i = 0; i < 5; i++) {
        hiddenOverflowBox.appendChild(new Text({ content: `Line ${i}` }));
      }
      
      const output = hiddenOverflowBox.render();
      expect(output.lines).toHaveLength(3);
    });
  });

  describe('Focus Management', () => {
    it('should handle focus state', () => {
      box.focus();
      expect(box.focused).toBe(true);
      
      box.blur();
      expect(box.focused).toBe(false);
    });

    it('should apply focus styling', () => {
      const focusableBox = new Box({
        width: 10,
        height: 3,
        borderStyle: 'single',
        focusBorderColor: 'yellow'
      });
      
      focusableBox.focus();
      const focusedOutput = focusableBox.render();
      
      focusableBox.blur();
      const unfocusedOutput = focusableBox.render();
      
      // Border color should change when focused
      expect(focusedOutput.lines[0]).not.toBe(unfocusedOutput.lines[0]);
    });
  });

  describe('Event Handling', () => {
    it('should emit mount event', () => {
      const mountSpy = vi.fn();
      box.on('mount', mountSpy);
      box.mount();
      expect(mountSpy).toHaveBeenCalled();
    });

    it('should emit unmount event', () => {
      const unmountSpy = vi.fn();
      box.on('unmount', unmountSpy);
      box.mount();
      box.unmount();
      expect(unmountSpy).toHaveBeenCalled();
    });

    it('should handle custom events on itself', () => {
      const eventSpy = vi.fn();
      box.on('custom' as any, eventSpy);
      
      // Emit event directly on box
      (box as any).events.emit('custom', { data: 'test' });
      expect(eventSpy).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should handle child events when explicitly set up', () => {
      const eventSpy = vi.fn();
      
      const child = new Text({ content: 'Child' });
      box.appendChild(child);
      
      // Set up manual event forwarding from child to parent
      child.on('custom' as any, (data) => {
        (box as any).events.emit('custom', data);
      });
      
      // Listen for the event on the box
      box.on('custom' as any, eventSpy);
      
      child.emit('custom', { data: 'test' });
      expect(eventSpy).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  describe('Layout Calculation', () => {
    it('should calculate content area with border', () => {
      const borderedBox = new Box({
        width: 10,
        height: 5,
        borderStyle: 'single'
      });
      
      const contentArea = borderedBox.getContentArea();
      expect(contentArea.width).toBe(8); // 10 - 2 for borders
      expect(contentArea.height).toBe(3); // 5 - 2 for borders
    });

    it('should calculate content area with padding', () => {
      const paddedBox = new Box({
        width: 10,
        height: 5,
        padding: 1
      });
      
      const contentArea = paddedBox.getContentArea();
      expect(contentArea.width).toBe(8); // 10 - 2 for padding
      expect(contentArea.height).toBe(3); // 5 - 2 for padding
    });

    it('should calculate content area with border and padding', () => {
      const complexBox = new Box({
        width: 10,
        height: 5,
        borderStyle: 'single',
        padding: 1
      });
      
      const contentArea = complexBox.getContentArea();
      expect(contentArea.width).toBe(6); // 10 - 2 (border) - 2 (padding)
      expect(contentArea.height).toBe(1); // 5 - 2 (border) - 2 (padding)
    });
  });

  describe('Performance', () => {
    it('should handle large number of children efficiently', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        box.appendChild(new Text({ content: `Item ${i}` }));
      }
      
      box.dimensions = { width: 50, height: 20 };
      box.render();
      
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(100); // Should render in under 100ms
    });

    it('should cache render output when nothing changes', () => {
      box.dimensions = { width: 10, height: 3 };
      const text = new Text({ content: 'Cached' });
      box.appendChild(text);
      
      const output1 = box.render();
      const output2 = box.render();
      
      // Should return same output when nothing changed
      expect(output1).toEqual(output2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid dimensions gracefully', () => {
      const invalidBox = new Box({
        width: -10,
        height: -5
      });
      
      expect(() => invalidBox.render()).not.toThrow();
      const output = invalidBox.render();
      expect(output.lines).toHaveLength(0);
    });

    it('should handle null children gracefully', () => {
      box.children.push(null as any);
      expect(() => box.render()).not.toThrow();
    });

    it('should handle rendering errors in children', () => {
      const errorChild = new Text({ content: 'Error' });
      errorChild.render = () => {
        throw new Error('Render error');
      };
      
      box.appendChild(errorChild);
      expect(() => box.render()).not.toThrow();
    });
  });

  describe('Integration with MockTerminal', () => {
    it('should render to mock terminal', () => {
      box.dimensions = { width: 20, height: 5 };
      const text = new Text({ content: 'Terminal Test' });
      box.appendChild(text);
      
      const output = box.render();
      mockTerminal.write(output.lines.join('\n'));
      
      const terminalOutput = mockTerminal.getOutput();
      expect(terminalOutput).toContain('Terminal Test');
    });
  });
});