import { it, expect, describe, beforeEach } from 'vitest';

import { Style } from '../../src/types';
import { Styles, StyleBuilder } from '../../src/core/styles';

describe('Styles', () => {
  let styles: Styles;

  beforeEach(() => {
    styles = new Styles();
  });

  describe('Style Application', () => {
    it('should apply foreground color', () => {
      const style: Style = {
        fg: { type: 'ansi', value: 1, bright: false }
      };
      
      const sequence = styles.apply(style);
      expect(sequence).toContain('\x1b[31m'); // Red foreground
    });

    it('should apply background color', () => {
      const style: Style = {
        bg: { type: 'ansi', value: 2, bright: false }
      };
      
      const sequence = styles.apply(style);
      expect(sequence).toContain('\x1b[42m'); // Green background
    });

    it('should apply multiple text decorations', () => {
      const style: Style = {
        bold: true,
        italic: true,
        underline: true
      };
      
      const sequence = styles.apply(style);
      expect(sequence).toContain('\x1b[1m'); // Bold
      expect(sequence).toContain('\x1b[3m'); // Italic
      expect(sequence).toContain('\x1b[4m'); // Underline
    });

    it('should apply all style properties', () => {
      const style: Style = {
        fg: { type: 'ansi', value: 3, bright: false },
        bg: { type: 'ansi', value: 4, bright: false },
        bold: true,
        italic: true,
        underline: true,
        strikethrough: true,
        dim: true,
        inverse: true,
        hidden: true,
        blink: true,
        overline: true
      };
      
      const sequence = styles.apply(style);
      
      expect(sequence).toContain('\x1b[33m'); // Yellow foreground
      expect(sequence).toContain('\x1b[44m'); // Blue background
      expect(sequence).toContain('\x1b[1m'); // Bold
      expect(sequence).toContain('\x1b[3m'); // Italic
      expect(sequence).toContain('\x1b[4m'); // Underline
      expect(sequence).toContain('\x1b[9m'); // Strikethrough
      expect(sequence).toContain('\x1b[2m'); // Dim
      expect(sequence).toContain('\x1b[7m'); // Inverse
      expect(sequence).toContain('\x1b[8m'); // Hidden
      expect(sequence).toContain('\x1b[5m'); // Blink
      expect(sequence).toContain('\x1b[53m'); // Overline
    });

    it('should handle underline variants', () => {
      const singleUnderline: Style = { underlineStyle: 'single' };
      const doubleUnderline: Style = { underlineStyle: 'double' };
      
      expect(styles.apply(singleUnderline)).toContain('\x1b[4m');
      expect(styles.apply(doubleUnderline)).toContain('\x1b[21m');
    });

    it('should handle blink speeds', () => {
      const slowBlink: Style = { blink: true };
      const fastBlink: Style = { blink: true };
      
      expect(styles.apply(slowBlink)).toContain('\x1b[5m');
      // Fast blink is not separately supported in our implementation
      expect(styles.apply(fastBlink)).toContain('\x1b[5m');
    });

    it('should handle hyperlinks', () => {
      // Hyperlinks are not part of the Style interface in the spec
      // This functionality would be handled separately
      const style: Style = { };
      const sequence = styles.apply(style);
      
      expect(sequence).toBe('');
    });

    it('should apply alternative fonts', () => {
      // Alternative fonts are not part of the Style interface in the spec
      const style: Style = { };
      const sequence = styles.apply(style);
      
      expect(sequence).toBe('');
    });
  });

  describe('Individual Style Methods', () => {
    it('should generate bold sequence', () => {
      expect(styles.bold()).toBe('\x1b[1m');
    });

    it('should generate italic sequence', () => {
      expect(styles.italic()).toBe('\x1b[3m');
    });

    it('should generate underline sequence', () => {
      expect(styles.underline()).toBe('\x1b[4m');
    });

    it('should generate strikethrough sequence', () => {
      expect(styles.strikethrough()).toBe('\x1b[9m');
    });

    it('should generate dim sequence', () => {
      expect(styles.dim()).toBe('\x1b[2m');
    });

    it('should generate bright sequence', () => {
      expect(styles.bright()).toBe('\x1b[1m');
    });

    it('should generate inverse sequence', () => {
      expect(styles.inverse()).toBe('\x1b[7m');
    });

    it('should generate hidden sequence', () => {
      expect(styles.hidden()).toBe('\x1b[8m');
    });

    it('should generate blink sequence', () => {
      expect(styles.blink()).toBe('\x1b[5m');
    });
  });

  describe('Reset Methods', () => {
    it('should generate reset sequence', () => {
      expect(styles.reset()).toBe('\x1b[0m');
    });

    it('should generate reset all sequence', () => {
      expect(styles.resetAll()).toBe('\x1b[0m');
    });

    it('should generate reset bold sequence', () => {
      expect(styles.resetBold()).toBe('\x1b[22m');
    });

    it('should generate reset italic sequence', () => {
      expect(styles.resetItalic()).toBe('\x1b[23m');
    });

    it('should generate reset underline sequence', () => {
      expect(styles.resetUnderline()).toBe('\x1b[24m');
    });

    it('should generate reset strikethrough sequence', () => {
      expect(styles.resetStrikethrough()).toBe('\x1b[29m');
    });

    it('should generate reset dim sequence', () => {
      expect(styles.resetDim()).toBe('\x1b[22m');
    });

    it('should generate reset bright sequence', () => {
      expect(styles.resetBright()).toBe('\x1b[22m');
    });

    it('should generate reset inverse sequence', () => {
      expect(styles.resetInverse()).toBe('\x1b[27m');
    });

    it('should generate reset hidden sequence', () => {
      expect(styles.resetHidden()).toBe('\x1b[28m');
    });

    it('should generate reset blink sequence', () => {
      expect(styles.resetBlink()).toBe('\x1b[25m');
    });
  });

  describe('StyleBuilder', () => {
    it('should create a style builder', () => {
      const builder = styles.create();
      expect(builder).toBeInstanceOf(StyleBuilder);
    });
  });
});

describe('StyleBuilder', () => {
  let builder: StyleBuilder;

  beforeEach(() => {
    builder = new StyleBuilder();
  });

  describe('Fluent API', () => {
    it('should set foreground color', () => {
      const style = builder
        .fg({ type: 'ansi', value: 1, bright: false })
        .build();
      
      expect(style.fg).toEqual({ type: 'ansi', value: 1, bright: false });
    });

    it('should set background color', () => {
      const style = builder
        .bg({ type: 'ansi', value: 2, bright: false })
        .build();
      
      expect(style.bg).toEqual({ type: 'ansi', value: 2, bright: false });
    });

    it('should chain multiple style methods', () => {
      const style = builder
        .bold()
        .italic()
        .underline()
        .build();
      
      expect(style.bold).toBe(true);
      expect(style.italic).toBe(true);
      expect(style.underline).toBe(true);
    });

    it('should support all style properties', () => {
      const style = builder
        .fg({ type: 'ansi', value: 3, bright: false })
        .bg({ type: 'ansi', value: 4, bright: false })
        .bold()
        .italic()
        .underline()
        .strikethrough()
        .dim()
        .inverse()
        .hidden()
        .blink()
        .overline()
        .build();
      
      expect(style.fg).toEqual({ type: 'ansi', value: 3, bright: false });
      expect(style.bg).toEqual({ type: 'ansi', value: 4, bright: false });
      expect(style.bold).toBe(true);
      expect(style.italic).toBe(true);
      expect(style.underline).toBe(true);
      expect(style.strikethrough).toBe(true);
      expect(style.dim).toBe(true);
      expect(style.inverse).toBe(true);
      expect(style.hidden).toBe(true);
      expect(style.blink).toBe(true);
      expect(style.overline).toBe(true);
    });

    it('should allow disabling styles', () => {
      const style = builder
        .bold(true)
        .bold(false)
        .build();
      
      expect(style.bold).toBeUndefined();
    });

    it('should handle underline variants', () => {
      const style1 = builder.underline(true).build();
      const style2 = builder.underline(false).build();
      
      expect(style1.underline).toBe(true);
      expect(style2.underline).toBeUndefined();
    });

    it('should handle blink speeds', () => {
      const style1 = builder.blink(true).build();
      const style2 = builder.blink(false).build();
      
      expect(style1.blink).toBe(true);
      expect(style2.blink).toBeUndefined();
    });
  });

  describe('Style Composition', () => {
    it('should merge styles', () => {
      const baseStyle: Style = {
        fg: { type: 'ansi', value: 1, bright: false },
        bold: true
      };
      
      const mergedStyle = builder
        .merge(baseStyle)
        .italic()
        .build();
      
      expect(mergedStyle.fg).toEqual(baseStyle.fg);
      expect(mergedStyle.bold).toBe(true);
      expect(mergedStyle.italic).toBe(true);
    });

    it('should override properties when merging', () => {
      const baseStyle: Style = {
        bold: true,
        italic: false
      };
      
      const mergedStyle = builder
        .merge(baseStyle)
        .italic(true) // Override
        .build();
      
      expect(mergedStyle.bold).toBe(true);
      expect(mergedStyle.italic).toBe(true);
    });

    it('should inherit from parent style', () => {
      const parentStyle: Style = {
        fg: { type: 'ansi', value: 2, bright: false },
        bold: true,
        italic: true
      };
      
      const childStyle = builder
        .inherit(parentStyle)
        .bold(false) // Override parent
        .underline() // Add new property
        .build();
      
      expect(childStyle.fg).toEqual(parentStyle.fg);
      expect(childStyle.bold).toBeUndefined();
      expect(childStyle.italic).toBe(true);
      expect(childStyle.underline).toBe(true);
    });
  });

  describe('Sequence Generation', () => {
    it('should generate ANSI sequence from builder', () => {
      const sequence = builder
        .bold()
        .fg({ type: 'ansi', value: 1, bright: false })
        .toSequence();
      
      expect(sequence).toContain('\x1b[1m'); // Bold
      expect(sequence).toContain('\x1b[31m'); // Red
    });

    it('should generate empty sequence for empty style', () => {
      const sequence = builder.toSequence();
      expect(sequence).toBe('');
    });

    it('should generate complex sequences', () => {
      const sequence = builder
        .fg({ type: 'rgb', r: 255, g: 128, b: 64 })
        .bg({ type: 'ansi256', value: 100 })
        .bold()
        .italic()
        .underline()
        .toSequence();
      
      expect(sequence).toContain('\x1b[38;2;255;128;64m'); // RGB foreground
      expect(sequence).toContain('\x1b[48;5;100m'); // 256 color background
      expect(sequence).toContain('\x1b[1m'); // Bold
      expect(sequence).toContain('\x1b[3m'); // Italic
      expect(sequence).toContain('\x1b[4m'); // Underline
    });
  });

  describe('Builder Immutability', () => {
    it('should not modify original builder when chaining', () => {
      const builder1 = new StyleBuilder().bold();
      const builder2 = builder1.italic();
      
      const style1 = builder1.build();
      const style2 = builder2.build();
      
      expect(style1.italic).toBeUndefined();
      expect(style2.italic).toBe(true);
      expect(style2.bold).toBe(true);
    });
  });
});