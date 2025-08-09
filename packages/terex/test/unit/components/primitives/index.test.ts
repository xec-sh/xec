/**
 * Tests for components/primitives/index.ts exports
 * Ensures all primitive component exports are properly covered and functional
 */

import { it, expect, describe } from 'vitest';

import * as PrimitivesIndex from '../../../../src/components/primitives/index.js';

describe('Primitives Index Exports', () => {
  describe('Text component exports', () => {
    it('should export Text class', () => {
      expect(typeof PrimitivesIndex.Text).toBe('function');
    });

    it('should export text factory functions', () => {
      expect(typeof PrimitivesIndex.text).toBe('function');
      expect(typeof PrimitivesIndex.styledText).toBe('function');
      expect(typeof PrimitivesIndex.centeredText).toBe('function');
      
      // Test factory functions
      const basicText = PrimitivesIndex.text('Hello World');
      expect(basicText).toBeInstanceOf(PrimitivesIndex.Text);
      expect(basicText.state.content).toBe('Hello World');
      
      const styledTextComponent = PrimitivesIndex.styledText('Styled', { bold: true });
      expect(styledTextComponent).toBeInstanceOf(PrimitivesIndex.Text);
      expect(styledTextComponent.state.content).toBe('Styled');
      expect(styledTextComponent.state.style.bold).toBe(true);
      
      const centeredTextComponent = PrimitivesIndex.centeredText('Centered', 20);
      expect(centeredTextComponent).toBeInstanceOf(PrimitivesIndex.Text);
      expect(centeredTextComponent.state.content).toBe('Centered');
      expect(centeredTextComponent.state.centered).toBe(true);
      expect(centeredTextComponent.state.width).toBe(20);
    });

    it('should create text components with different content types', () => {
      const textComponent = PrimitivesIndex.text('Simple text');
      expect(textComponent.state.content).toBe('Simple text');
      
      const emptyText = PrimitivesIndex.text('');
      expect(emptyText.state.content).toBe('');
      
      const multilineText = PrimitivesIndex.text('Line 1\\nLine 2');
      expect(multilineText.state.content).toBe('Line 1\\nLine 2');
    });
  });

  describe('Space component exports', () => {
    it('should export Space class', () => {
      expect(typeof PrimitivesIndex.Space).toBe('function');
    });

    it('should export space factory functions', () => {
      expect(typeof PrimitivesIndex.space).toBe('function');
      expect(typeof PrimitivesIndex.vSpace).toBe('function');
      expect(typeof PrimitivesIndex.hSpace).toBe('function');
      expect(typeof PrimitivesIndex.emptyLine).toBe('function');
      expect(typeof PrimitivesIndex.separator).toBe('function');
      
      // Test factory functions
      const basicSpace = PrimitivesIndex.space(5);
      expect(basicSpace).toBeInstanceOf(PrimitivesIndex.Space);
      expect(basicSpace.state.width).toBe(5);
      expect(basicSpace.state.height).toBe(1);
      
      const verticalSpace = PrimitivesIndex.vSpace(3);
      expect(verticalSpace).toBeInstanceOf(PrimitivesIndex.Space);
      expect(verticalSpace.state.height).toBe(3);
      expect(verticalSpace.state.width).toBe(1);
      
      const horizontalSpace = PrimitivesIndex.hSpace(10);
      expect(horizontalSpace).toBeInstanceOf(PrimitivesIndex.Space);
      expect(horizontalSpace.state.width).toBe(10);
      expect(horizontalSpace.state.height).toBe(1);
      
      const emptyLineComponent = PrimitivesIndex.emptyLine();
      expect(emptyLineComponent).toBeInstanceOf(PrimitivesIndex.Space);
      expect(emptyLineComponent.state.height).toBe(1);
      
      const separatorComponent = PrimitivesIndex.separator('-', 20);
      expect(separatorComponent).toBeInstanceOf(PrimitivesIndex.Space);
      expect(separatorComponent.state.width).toBe(20);
      expect(separatorComponent.state.char).toBe('-');
    });

    it('should create space components with different dimensions', () => {
      const smallSpace = PrimitivesIndex.space(1);
      expect(smallSpace.state.width).toBe(1);
      
      const largeSpace = PrimitivesIndex.space(100);
      expect(largeSpace.state.width).toBe(100);
      
      const tallVerticalSpace = PrimitivesIndex.vSpace(10);
      expect(tallVerticalSpace.state.height).toBe(10);
      
      const wideHorizontalSpace = PrimitivesIndex.hSpace(50);
      expect(wideHorizontalSpace.state.width).toBe(50);
    });
  });

  describe('Line component exports', () => {
    it('should export Line class', () => {
      expect(typeof PrimitivesIndex.Line).toBe('function');
    });

    it('should export LINE_CHARS constant', () => {
      expect(typeof PrimitivesIndex.LINE_CHARS).toBe('object');
      expect(PrimitivesIndex.LINE_CHARS).toBeDefined();
      
      // Test that LINE_CHARS contains expected properties
      expect(PrimitivesIndex.LINE_CHARS.single.horizontal).toBeDefined();
      expect(PrimitivesIndex.LINE_CHARS.single.vertical).toBeDefined();
      expect(typeof PrimitivesIndex.LINE_CHARS.single.horizontal).toBe('string');
      expect(typeof PrimitivesIndex.LINE_CHARS.single.vertical).toBe('string');
    });

    it('should export line factory functions', () => {
      expect(typeof PrimitivesIndex.hLine).toBe('function');
      expect(typeof PrimitivesIndex.vLine).toBe('function');
      expect(typeof PrimitivesIndex.divider).toBe('function');
      expect(typeof PrimitivesIndex.doubleDivider).toBe('function');
      expect(typeof PrimitivesIndex.heavyDivider).toBe('function');
      expect(typeof PrimitivesIndex.customLine).toBe('function');
      
      // Test factory functions
      const horizontalLine = PrimitivesIndex.hLine(20);
      expect(horizontalLine).toBeInstanceOf(PrimitivesIndex.Line);
      expect(horizontalLine.state.length).toBe(20);
      expect(horizontalLine.state.direction).toBe('horizontal');
      
      const verticalLine = PrimitivesIndex.vLine(10);
      expect(verticalLine).toBeInstanceOf(PrimitivesIndex.Line);
      expect(verticalLine.state.length).toBe(10);
      expect(verticalLine.state.direction).toBe('vertical');
      
      const dividerLine = PrimitivesIndex.divider(30);
      expect(dividerLine).toBeInstanceOf(PrimitivesIndex.Line);
      expect(dividerLine.state.length).toBe(30);
      expect(dividerLine.state.style).toBe('light');
      
      const doubleDividerLine = PrimitivesIndex.doubleDivider(25);
      expect(doubleDividerLine).toBeInstanceOf(PrimitivesIndex.Line);
      expect(doubleDividerLine.state.style).toBe('double');
      
      const heavyDividerLine = PrimitivesIndex.heavyDivider(15);
      expect(heavyDividerLine).toBeInstanceOf(PrimitivesIndex.Line);
      expect(heavyDividerLine.state.style).toBe('heavy');
      
      const customLineComponent = PrimitivesIndex.customLine('*', 12);
      expect(customLineComponent).toBeInstanceOf(PrimitivesIndex.Line);
      expect(customLineComponent.state.length).toBe(12);
      expect(customLineComponent.state.char).toBe('*');
    });

    it('should create lines with different styles and lengths', () => {
      const shortLine = PrimitivesIndex.hLine(1);
      expect(shortLine.state.length).toBe(1);
      
      const longLine = PrimitivesIndex.hLine(200);
      expect(longLine.state.length).toBe(200);
      
      const customCharLine = PrimitivesIndex.customLine('=', 30);
      expect(customCharLine.state.char).toBe('=');
      expect(customCharLine.state.length).toBe(30);
      
      const customSymbolLine = PrimitivesIndex.customLine('→', 5);
      expect(customSymbolLine.state.char).toBe('→');
      expect(customSymbolLine.state.length).toBe(5);
    });
  });

  describe('Export completeness', () => {
    it('should have all expected exports available', () => {
      const primitivesExports = Object.keys(PrimitivesIndex);
      
      // Classes
      expect(primitivesExports).toContain('Text');
      expect(primitivesExports).toContain('Space');
      expect(primitivesExports).toContain('Line');
      
      // Constants
      expect(primitivesExports).toContain('LINE_CHARS');
      
      // Text factories
      expect(primitivesExports).toContain('text');
      expect(primitivesExports).toContain('styledText');
      expect(primitivesExports).toContain('centeredText');
      
      // Space factories
      expect(primitivesExports).toContain('space');
      expect(primitivesExports).toContain('vSpace');
      expect(primitivesExports).toContain('hSpace');
      expect(primitivesExports).toContain('emptyLine');
      expect(primitivesExports).toContain('separator');
      
      // Line factories
      expect(primitivesExports).toContain('hLine');
      expect(primitivesExports).toContain('vLine');
      expect(primitivesExports).toContain('divider');
      expect(primitivesExports).toContain('doubleDivider');
      expect(primitivesExports).toContain('heavyDivider');
      expect(primitivesExports).toContain('customLine');
    });
  });

  describe('Factory function integration', () => {
    it('should create working instances from all text factories', () => {
      const textComp = PrimitivesIndex.text('Test');
      const output = textComp.render();
      expect(output.lines).toEqual(['Test']);
      
      const styledComp = PrimitivesIndex.styledText('Bold', { bold: true });
      expect(styledComp.state.style.bold).toBe(true);
      
      const centeredComp = PrimitivesIndex.centeredText('Center', 10);
      const centeredOutput = centeredComp.render();
      expect(centeredOutput.lines[0]?.includes('Center')).toBe(true);
    });

    it('should create working instances from all space factories', () => {
      const spaceComp = PrimitivesIndex.space(3);
      const output = spaceComp.render();
      expect(output.lines).toHaveLength(1);
      expect(output.lines[0]).toBe('   ');
      
      const vSpaceComp = PrimitivesIndex.vSpace(2);
      const vOutput = vSpaceComp.render();
      expect(vOutput.lines).toHaveLength(2);
      
      const hSpaceComp = PrimitivesIndex.hSpace(5);
      const hOutput = hSpaceComp.render();
      expect(hOutput.lines[0]).toBe('     ');
      
      const emptyLineComp = PrimitivesIndex.emptyLine();
      const emptyOutput = emptyLineComp.render();
      expect(emptyOutput.lines).toHaveLength(1);
      expect(emptyOutput.lines[0]).toBe(' '); // emptyLine returns a space, not empty string
      
      const separatorComp = PrimitivesIndex.separator('~', 4);
      const sepOutput = separatorComp.render();
      expect(sepOutput.lines[0]).toBe('~~~~');
    });

    it('should create working instances from all line factories', () => {
      const hLineComp = PrimitivesIndex.hLine(5);
      const hOutput = hLineComp.render();
      expect(hOutput.lines).toHaveLength(1);
      expect(hOutput.lines[0]).toHaveLength(5);
      
      const vLineComp = PrimitivesIndex.vLine(3);
      const vOutput = vLineComp.render();
      expect(vOutput.lines).toHaveLength(3);
      
      const dividerComp = PrimitivesIndex.divider(4);
      const divOutput = dividerComp.render();
      expect(divOutput.lines[0]).toHaveLength(4);
      
      const doubleDivComp = PrimitivesIndex.doubleDivider(3);
      const doubleOutput = doubleDivComp.render();
      expect(doubleOutput.lines[0]).toHaveLength(3);
      
      const heavyDivComp = PrimitivesIndex.heavyDivider(2);
      const heavyOutput = heavyDivComp.render();
      expect(heavyOutput.lines[0]).toHaveLength(2);
      
      const customLineComp = PrimitivesIndex.customLine('#', 6);
      const customOutput = customLineComp.render();
      expect(customOutput.lines[0]).toBe('######');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle zero-length components', () => {
      expect(() => PrimitivesIndex.text('')).not.toThrow();
      expect(() => PrimitivesIndex.space(0)).not.toThrow();
      expect(() => PrimitivesIndex.hLine(0)).not.toThrow();
      expect(() => PrimitivesIndex.vLine(0)).not.toThrow();
      expect(() => PrimitivesIndex.customLine('x', 0)).not.toThrow();
    });

    it('should handle large dimensions', () => {
      expect(() => PrimitivesIndex.space(1000)).not.toThrow();
      expect(() => PrimitivesIndex.hLine(500)).not.toThrow();
      expect(() => PrimitivesIndex.vLine(100)).not.toThrow();
    });

    it('should handle special characters', () => {
      expect(() => PrimitivesIndex.text('Hello 🌟 World')).not.toThrow();
      expect(() => PrimitivesIndex.customLine('🔥', 3)).not.toThrow();
      expect(() => PrimitivesIndex.separator('→', 5)).not.toThrow();
    });

    it('should handle null and undefined gracefully', () => {
      expect(() => PrimitivesIndex.text(null as any)).not.toThrow();
      expect(() => PrimitivesIndex.customLine('', 5)).not.toThrow();
      expect(() => PrimitivesIndex.separator(undefined as any, 3)).not.toThrow();
    });
  });

  describe('Component state and behavior', () => {
    it('should maintain correct component state', () => {
      const textComp = PrimitivesIndex.text('State Test');
      expect(textComp.state.content).toBe('State Test');
      expect(textComp.state.style).toBeDefined();
      
      const spaceComp = PrimitivesIndex.space(7);
      expect(spaceComp.state.width).toBe(7);
      expect(spaceComp.state.height).toBe(1);
      
      const lineComp = PrimitivesIndex.hLine(12);
      expect(lineComp.state.length).toBe(12);
      expect(lineComp.state.direction).toBe('horizontal');
    });

    it('should support component methods', () => {
      const textComp = PrimitivesIndex.text('Method Test');
      
      expect(typeof textComp.render).toBe('function');
      expect(typeof textComp.mount).toBe('function');
      expect(typeof textComp.unmount).toBe('function');
      expect(typeof textComp.focus).toBe('function');
      expect(typeof textComp.blur).toBe('function');
      
      const output = textComp.render();
      expect(output).toBeDefined();
      expect(output.lines).toBeDefined();
      expect(Array.isArray(output.lines)).toBe(true);
    });

    it('should support lifecycle methods', async () => {
      const textComp = PrimitivesIndex.text('Lifecycle Test');
      
      // Test mount
      await expect(textComp.mount()).resolves.toBeUndefined();
      
      // Test unmount
      await expect(textComp.unmount()).resolves.toBeUndefined();
      
      // Test focus/blur
      expect(() => textComp.focus()).not.toThrow();
      expect(() => textComp.blur()).not.toThrow();
    });
  });
});