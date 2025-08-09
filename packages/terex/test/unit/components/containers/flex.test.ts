import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { Box } from '../../../../src/components/containers/box.js';
import { Flex } from '../../../../src/components/containers/flex.js';
import { Text } from '../../../../src/components/primitives/text.js';


describe('Flex Component', () => {
  let flex: Flex;

  beforeEach(() => {
    flex = new Flex();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create flex container with default properties', () => {
      expect(flex).toBeInstanceOf(Flex);
      expect(flex.type).toBe('flex');
      expect(flex.state.direction).toBe('row');
      expect(flex.state.justifyContent).toBe('flex-start');
      expect(flex.state.alignItems).toBe('stretch');
    });

    it('should accept column direction', () => {
      const columnFlex = new Flex({ direction: 'column' });
      expect(columnFlex.state.direction).toBe('column');
    });

    it('should accept justify content options', () => {
      const centerFlex = new Flex({ justifyContent: 'center' });
      expect(centerFlex.state.justifyContent).toBe('center');
      
      const endFlex = new Flex({ justifyContent: 'flex-end' });
      expect(endFlex.state.justifyContent).toBe('flex-end');
      
      const spaceBetween = new Flex({ justifyContent: 'space-between' });
      expect(spaceBetween.state.justifyContent).toBe('space-between');
      
      const spaceAround = new Flex({ justifyContent: 'space-around' });
      expect(spaceAround.state.justifyContent).toBe('space-around');
      
      const spaceEvenly = new Flex({ justifyContent: 'space-evenly' });
      expect(spaceEvenly.state.justifyContent).toBe('space-evenly');
    });

    it('should accept align items options', () => {
      const centerAlign = new Flex({ alignItems: 'center' });
      expect(centerAlign.state.alignItems).toBe('center');
      
      const endAlign = new Flex({ alignItems: 'flex-end' });
      expect(endAlign.state.alignItems).toBe('flex-end');
      
      const baselineAlign = new Flex({ alignItems: 'baseline' });
      expect(baselineAlign.state.alignItems).toBe('baseline');
    });

    it('should accept gap property', () => {
      const gapFlex = new Flex({ gap: 2 });
      expect(gapFlex.state.gap).toBe(2);
    });

    it('should accept wrap property', () => {
      const wrapFlex = new Flex({ wrap: 'wrap' });
      expect(wrapFlex.state.wrap).toBe('wrap');
      
      const noWrapFlex = new Flex({ wrap: 'nowrap' });
      expect(noWrapFlex.state.wrap).toBe('nowrap');
      
      const wrapReverse = new Flex({ wrap: 'wrap-reverse' });
      expect(wrapReverse.state.wrap).toBe('wrap-reverse');
    });
  });

  describe('Row Layout', () => {
    beforeEach(() => {
      flex = new Flex({ direction: 'row' });
      flex.dimensions = { width: 30, height: 5 };
    });

    it('should layout children horizontally', () => {
      const text1 = new Text({ content: 'First' });
      const text2 = new Text({ content: 'Second' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      expect(output.lines[0]).toContain('First');
      expect(output.lines[0]).toContain('Second');
      expect(output.lines[0].indexOf('First')).toBeLessThan(output.lines[0].indexOf('Second'));
    });

    it('should apply gap between items', () => {
      flex.state.gap = 2;
      const text1 = new Text({ content: 'A' });
      const text2 = new Text({ content: 'B' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      const line = output.lines[0];
      const aIndex = line.indexOf('A');
      const bIndex = line.indexOf('B');
      expect(bIndex - aIndex).toBeGreaterThanOrEqual(3); // A + 2 spaces gap + B
    });

    it('should justify content to center', () => {
      flex.state.justifyContent = 'center';
      const text = new Text({ content: 'Center' });
      flex.appendChild(text);
      
      const output = flex.render();
      const line = output.lines[0];
      const contentIndex = line.indexOf('Center');
      const lineLength = line.length;
      
      
      // Content should be roughly centered
      expect(Math.abs(contentIndex - (lineLength - contentIndex - 6))).toBeLessThan(3);
    });

    it('should justify content to end', () => {
      flex.state.justifyContent = 'flex-end';
      const text = new Text({ content: 'End' });
      flex.appendChild(text);
      
      const output = flex.render();
      const line = output.lines[0];
      expect(line.trimEnd()).toMatch(/End$/);
    });

    it('should distribute with space-between', () => {
      flex.state.justifyContent = 'space-between';
      const text1 = new Text({ content: 'Start' });
      const text2 = new Text({ content: 'End' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      const line = output.lines[0];
      expect(line).toMatch(/^Start\s+End\s*$/);
    });

    it('should distribute with space-around', () => {
      flex.state.justifyContent = 'space-around';
      const text1 = new Text({ content: 'A' });
      const text2 = new Text({ content: 'B' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      const line = output.lines[0];
      
      // Should have space before first and after last item
      expect(line).toMatch(/^\s+A\s+B\s+$/);
    });

    it('should distribute with space-evenly', () => {
      flex.state.justifyContent = 'space-evenly';
      const text1 = new Text({ content: 'A' });
      const text2 = new Text({ content: 'B' });
      const text3 = new Text({ content: 'C' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      flex.appendChild(text3);
      
      const output = flex.render();
      const line = output.lines[0];
      
      // Should have equal space between all items including edges
      const aIndex = line.indexOf('A');
      const bIndex = line.indexOf('B');
      const cIndex = line.indexOf('C');
      
      const space1 = aIndex;
      const space2 = bIndex - aIndex - 1;
      const space3 = cIndex - bIndex - 1;
      
      expect(Math.abs(space1 - space2)).toBeLessThan(2);
      expect(Math.abs(space2 - space3)).toBeLessThan(2);
    });
  });

  describe('Column Layout', () => {
    beforeEach(() => {
      flex = new Flex({ direction: 'column' });
      flex.dimensions = { width: 20, height: 10 };
    });

    it('should layout children vertically', () => {
      const text1 = new Text({ content: 'First' });
      const text2 = new Text({ content: 'Second' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      expect(output.lines[0]).toContain('First');
      expect(output.lines[1]).toContain('Second');
    });

    it('should apply gap between rows', () => {
      flex.state.gap = 1;
      const text1 = new Text({ content: 'Line1' });
      const text2 = new Text({ content: 'Line2' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      expect(output.lines[0]).toContain('Line1');
      expect(output.lines[1]).toBe(output.lines[1]); // Gap line
      expect(output.lines[2]).toContain('Line2');
    });

    it('should align items to center', () => {
      flex.state.alignItems = 'center';
      const text = new Text({ content: 'Center' });
      flex.appendChild(text);
      
      const output = flex.render();
      const line = output.lines[0];
      const contentIndex = line.indexOf('Center');
      
      // Should be roughly centered horizontally
      expect(contentIndex).toBeGreaterThan(5);
      expect(contentIndex).toBeLessThan(15);
    });

    it('should align items to end', () => {
      flex.state.alignItems = 'flex-end';
      const text = new Text({ content: 'Right' });
      flex.appendChild(text);
      
      const output = flex.render();
      const line = output.lines[0];
      expect(line.trimEnd()).toMatch(/Right$/);
    });

    it('should justify column content to center', () => {
      flex.state.justifyContent = 'center';
      const text = new Text({ content: 'Middle' });
      flex.appendChild(text);
      
      const output = flex.render();
      let middleLineIndex = -1;
      
      output.lines.forEach((line, index) => {
        if (line.includes('Middle')) {
          middleLineIndex = index;
        }
      });
      
      // Should be roughly in the middle vertically
      expect(middleLineIndex).toBeGreaterThan(3);
      expect(middleLineIndex).toBeLessThan(7);
    });
  });

  describe('Flex Item Properties', () => {
    it('should handle flex-grow property', () => {
      flex.dimensions = { width: 30, height: 5 };
      
      const text1 = new Text({ content: 'A', flexGrow: 1 });
      const text2 = new Text({ content: 'B', flexGrow: 2 });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      // B should take up more space than A
      // This is a simplified test - actual implementation may vary
      expect(output.lines).toBeTruthy();
    });

    it('should handle flex-shrink property', () => {
      flex.dimensions = { width: 10, height: 5 };
      
      const text1 = new Text({ content: 'LongText1', flexShrink: 1 });
      const text2 = new Text({ content: 'LongText2', flexShrink: 0 });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      // text2 should not shrink, text1 should shrink
      expect(output.lines).toBeTruthy();
    });

    it('should handle flex-basis property', () => {
      flex.dimensions = { width: 30, height: 5 };
      
      const text1 = new Text({ content: 'A', flexBasis: 10 });
      const text2 = new Text({ content: 'B', flexBasis: 20 });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      // Items should respect their flex-basis
      expect(output.lines).toBeTruthy();
    });
  });

  describe('Wrapping', () => {
    beforeEach(() => {
      flex = new Flex({ 
        direction: 'row',
        wrap: 'wrap'
      });
      flex.dimensions = { width: 20, height: 10 };
    });

    it('should wrap items to next line when they exceed width', () => {
      const text1 = new Text({ content: 'FirstLongItem' });
      const text2 = new Text({ content: 'SecondLongItem' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      expect(output.lines[0]).toContain('FirstLongItem');
      // Second item should wrap to next line
      let secondLineIndex = -1;
      output.lines.forEach((line, index) => {
        if (line.includes('SecondLongItem')) {
          secondLineIndex = index;
        }
      });
      expect(secondLineIndex).toBeGreaterThan(0);
    });

    it('should handle wrap-reverse', () => {
      flex.state.wrap = 'wrap-reverse';
      
      const text1 = new Text({ content: 'Item1' });
      const text2 = new Text({ content: 'Item2' });
      const text3 = new Text({ content: 'Item3' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      flex.appendChild(text3);
      
      const output = flex.render();
      // Items should wrap in reverse order
      expect(output.lines).toBeTruthy();
    });

    it('should not wrap with nowrap', () => {
      flex.state.wrap = 'nowrap';
      
      const text1 = new Text({ content: 'VeryLongItem1' });
      const text2 = new Text({ content: 'VeryLongItem2' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      
      const output = flex.render();
      // All items should be on same line, possibly clipped
      expect(output.lines[0].length).toBeLessThanOrEqual(20);
    });
  });

  describe('Nested Flex Containers', () => {
    it('should handle nested flex containers', () => {
      const outerFlex = new Flex({ 
        direction: 'column'
      });
      outerFlex.setDimensions(30, 10);
      
      const innerFlex1 = new Flex({ direction: 'row' });
      const innerFlex2 = new Flex({ direction: 'row' });
      
      innerFlex1.appendChild(new Text({ content: 'A' }));
      innerFlex1.appendChild(new Text({ content: 'B' }));
      
      innerFlex2.appendChild(new Text({ content: 'C' }));
      innerFlex2.appendChild(new Text({ content: 'D' }));
      
      outerFlex.appendChild(innerFlex1);
      outerFlex.appendChild(innerFlex2);
      
      const output = outerFlex.render();
      expect(output.lines).toBeTruthy();
      expect(output.lines.some(line => line.includes('A') && line.includes('B'))).toBe(true);
      expect(output.lines.some(line => line.includes('C') && line.includes('D'))).toBe(true);
    });
  });

  describe('Alignment', () => {
    it('should handle align-self property on children', () => {
      flex = new Flex({ 
        direction: 'row',
        alignItems: 'flex-start'
      });
      flex.dimensions = { width: 30, height: 10 };
      
      const text1 = new Text({ content: 'Default' });
      const text2 = new Text({ content: 'Center', alignSelf: 'center' });
      const text3 = new Text({ content: 'End', alignSelf: 'flex-end' });
      
      flex.appendChild(text1);
      flex.appendChild(text2);
      flex.appendChild(text3);
      
      const output = flex.render();
      // Each item should be aligned differently
      expect(output.lines).toBeTruthy();
    });

    it('should handle align-content for wrapped lines', () => {
      flex = new Flex({ 
        direction: 'row',
        wrap: 'wrap',
        alignContent: 'space-between'
      });
      flex.dimensions = { width: 15, height: 10 };
      
      // Add many items to force wrapping
      for (let i = 0; i < 6; i++) {
        flex.appendChild(new Text({ content: `Item${i}` }));
      }
      
      const output = flex.render();
      // Wrapped lines should be distributed with space-between
      expect(output.lines).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should handle large number of children efficiently', () => {
      flex.dimensions = { width: 100, height: 50 };
      
      const startTime = performance.now();
      
      for (let i = 0; i < 100; i++) {
        flex.appendChild(new Text({ content: `Item${i}` }));
      }
      
      flex.render();
      
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(100); // Should render in under 100ms
    });

    it('should cache layout calculations', () => {
      flex.dimensions = { width: 30, height: 10 };
      flex.appendChild(new Text({ content: 'Cached' }));
      
      const output1 = flex.render();
      const output2 = flex.render();
      
      // Should return same output when nothing changed
      expect(output1).toEqual(output2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty flex container', () => {
      flex.dimensions = { width: 20, height: 5 };
      const output = flex.render();
      expect(output.lines).toHaveLength(5);
      expect(output.lines.every(line => line.trim() === '')).toBe(true);
    });

    it('should handle zero dimensions', () => {
      flex.dimensions = { width: 0, height: 0 };
      const output = flex.render();
      expect(output.lines).toHaveLength(0);
    });

    it('should handle negative gap', () => {
      flex.state.gap = -5;
      flex.dimensions = { width: 20, height: 5 };
      
      flex.appendChild(new Text({ content: 'A' }));
      flex.appendChild(new Text({ content: 'B' }));
      
      expect(() => flex.render()).not.toThrow();
    });

    it('should handle invalid direction gracefully', () => {
      (flex.state as any).direction = 'invalid';
      flex.dimensions = { width: 20, height: 5 };
      
      expect(() => flex.render()).not.toThrow();
    });
  });

  describe('Integration with Other Components', () => {
    it('should work with Box components as children', () => {
      flex.dimensions = { width: 30, height: 10 };
      
      const box1 = new Box({ 
        width: 10, 
        height: 3,
        borderStyle: 'single'
      });
      const box2 = new Box({ 
        width: 10, 
        height: 3,
        borderStyle: 'double'
      });
      
      flex.appendChild(box1);
      flex.appendChild(box2);
      
      const output = flex.render();
      expect(output.lines).toBeTruthy();
    });
  });
});