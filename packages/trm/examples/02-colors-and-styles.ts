#!/usr/bin/env tsx
/**
 * Example 02: Colors and Styles
 * Demonstrates color system, style builder, and text formatting
 */

import { ansi } from '../src/core/ansi.js';
import { ColorDepth } from '../src/types.js';
import { ColorSystem } from '../src/core/color.js';
import { StylesImpl } from '../src/core/styles.js';
import { TerminalImpl } from '../src/core/terminal.js';

import type { Style } from '../src/types.js';

async function main() {
  console.log('=== TRM Core Example: Colors and Styles ===\n');

  const terminal = new TerminalImpl();
  await terminal.init();

  const colorDepth = terminal.stream.colorDepth;
  console.log(`Terminal color depth: ${ColorDepth[colorDepth]}\n`);

  // Create color system based on terminal capabilities
  const colors = new ColorSystem(colorDepth);
  const styles = new StylesImpl(colors);

  // Basic ANSI colors
  console.log('Basic ANSI Colors:');
  console.log(colors.toForeground(colors.red) + 'Red text' + ansi.reset());
  console.log(colors.toForeground(colors.green) + 'Green text' + ansi.reset());
  console.log(colors.toForeground(colors.blue) + 'Blue text' + ansi.reset());
  console.log(colors.toForeground(colors.yellow) + 'Yellow text' + ansi.reset());
  console.log(colors.toForeground(colors.magenta) + 'Magenta text' + ansi.reset());
  console.log(colors.toForeground(colors.cyan) + 'Cyan text' + ansi.reset());
  console.log();

  // Bright colors
  console.log('Bright Colors:');
  console.log(colors.toForeground(colors.brightRed) + 'Bright red text' + ansi.reset());
  console.log(colors.toForeground(colors.brightGreen) + 'Bright green text' + ansi.reset());
  console.log(colors.toForeground(colors.brightBlue) + 'Bright blue text' + ansi.reset());
  console.log();

  // Background colors
  console.log('Background Colors:');
  console.log(colors.toBackground(colors.red) + 'Red background' + ansi.reset());
  console.log(colors.toBackground(colors.green) + 'Green background' + ansi.reset());
  console.log(colors.toBackground(colors.blue) + 'Blue background' + ansi.reset());
  console.log();

  // 256 colors (if supported)
  if (colorDepth >= ColorDepth.Extended) {
    console.log('256 Color Palette:');
    for (let i = 0; i < 16; i++) {
      let line = '';
      for (let j = 0; j < 16; j++) {
        const colorIndex = i * 16 + j;
        const color = colors.ansi256(colorIndex);
        line += colors.toBackground(color) + ' ' + String(colorIndex).padStart(3) + ' ';
      }
      console.log(line + ansi.reset());
    }
    console.log();
  }

  // RGB colors (if supported)
  if (colorDepth >= ColorDepth.TrueColor) {
    console.log('True Color (RGB) Gradient:');
    for (let i = 0; i < 10; i++) {
      const r = Math.floor(255 * (i / 9));
      const g = Math.floor(128 + 127 * Math.sin(i * Math.PI / 9));
      const b = Math.floor(255 - 255 * (i / 9));
      const color = colors.rgb(r, g, b);
      console.log(colors.toForeground(color) + `RGB(${r}, ${g}, ${b})` + ansi.reset());
    }
    console.log();
  }

  // Style builder examples
  console.log('Style Builder Examples:');

  const builder = styles.builder();

  // Bold text
  const boldStyle = builder.bold().build();
  console.log(styles.apply(boldStyle) + 'Bold text' + ansi.reset());

  // Italic text
  const italicStyle = styles.builder().italic().build();
  console.log(styles.apply(italicStyle) + 'Italic text' + ansi.reset());

  // Underlined text
  const underlineStyle = styles.builder().underline().build();
  console.log(styles.apply(underlineStyle) + 'Underlined text' + ansi.reset());

  // Strikethrough text
  const strikeStyle = styles.builder().strikethrough().build();
  console.log(styles.apply(strikeStyle) + 'Strikethrough text' + ansi.reset());

  // Combined styles
  const combinedStyle = styles.builder()
    .fg(colors.rgb(255, 128, 0))  // Orange
    .bg(colors.ansi256(236))       // Dark gray background
    .bold()
    .underline()
    .build();
  console.log(styles.apply(combinedStyle) + 'Combined styles' + ansi.reset());
  console.log();

  // Merge styles
  console.log('Merged Styles:');
  const style1: Style = { fg: colors.red, bold: true };
  const style2: Style = { bg: colors.yellow, italic: true };
  const merged = styles.merge(style1, style2);
  console.log(styles.apply(merged) + 'Merged red on yellow, bold italic' + ansi.reset());
  console.log();

  // Text effects
  console.log('Text Effects:');
  console.log(ansi.dim() + 'Dim text' + ansi.reset());
  console.log(ansi.inverse() + 'Inverse text' + ansi.reset());
  console.log(ansi.hidden() + 'Hidden text (you should not see this)' + ansi.reset());
  console.log(ansi.blink() + 'Blinking text (if supported)' + ansi.reset());
  console.log();

  // Custom color conversions
  console.log('Color Conversions:');
  const hexColor = colors.hex('#FF6B35');
  console.log(colors.toForeground(hexColor) + 'Color from hex #FF6B35' + ansi.reset());

  const hslColor = colors.hsl(120, 100, 50); // Green
  console.log(colors.toForeground(hslColor) + 'Color from HSL(120, 100%, 50%)' + ansi.reset());

  // Convert RGB to other formats
  const rgbOrange = colors.rgb(255, 165, 0);
  const orangeAs256 = colors.toAnsi256(rgbOrange);
  const orangeAsHSL = colors.toHSL(rgbOrange);
  const orangeAsHex = colors.toHex(rgbOrange);

  console.log(`Orange RGB(255, 165, 0) conversions:`);
  console.log(`  As 256-color: ${orangeAs256.value}`);
  console.log(`  As HSL: H=${orangeAsHSL.h}, S=${orangeAsHSL.s}, L=${orangeAsHSL.l}`);
  console.log(`  As Hex: ${orangeAsHex}`);
  console.log();

  // Rainbow text
  console.log('Rainbow Text:');
  const rainbowText = 'RAINBOW TEXT';
  let rainbowOutput = '';
  for (let i = 0; i < rainbowText.length; i++) {
    const hue = (i * 360) / rainbowText.length;
    const rainbowColor = colors.hsl(hue, 100, 50);
    rainbowOutput += colors.toForeground(rainbowColor) + rainbowText[i];
  }
  console.log(rainbowOutput + ansi.reset());
  console.log();

  // Clean up
  await terminal.close();
  console.log('Done!');
}

// Run the example
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});