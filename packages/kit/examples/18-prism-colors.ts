/**
 * 18 - Prism Color System
 *
 * Built-in zero-dependency color library with modifiers,
 * 16 colors, 256 colors, RGB/HSL/hex, and CSS named colors.
 */
import { prism } from '../src/index.js';

console.log('\n=== Prism Color System ===\n');

// Modifiers
console.log(prism.bold('Bold text'));
console.log(prism.dim('Dim text'));
console.log(prism.italic('Italic text'));
console.log(prism.underline('Underlined text'));
console.log(prism.strikethrough('Strikethrough text'));
console.log(prism.inverse('Inverse text'));

// Basic 16 colors
console.log('\n--- Foreground Colors ---');
const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'gray', 'white'] as const;
for (const c of colors) {
  process.stdout.write(prism[c](`  ${c}  `));
}
console.log();

// Bright variants
console.log('\n--- Bright Colors ---');
const brightColors = [
  'redBright', 'greenBright', 'yellowBright', 'blueBright',
  'magentaBright', 'cyanBright',
] as const;
for (const c of brightColors) {
  process.stdout.write(prism[c](`  ${c}  `));
}
console.log();

// Background colors
console.log('\n--- Background Colors ---');
console.log(prism.bgRed(prism.white(' Red bg ')));
console.log(prism.bgGreen(prism.black(' Green bg ')));
console.log(prism.bgBlue(prism.white(' Blue bg ')));
console.log(prism.bgYellow(prism.black(' Yellow bg ')));

// Chaining
console.log('\n--- Chained Styles ---');
console.log(prism.bold(prism.red('Bold red')));
console.log(prism.italic(prism.underline(prism.cyan('Italic underline cyan'))));
console.log(prism.bgWhite(prism.black(prism.bold(' Badge '))));

// Hex colors
console.log('\n--- Hex Colors ---');
console.log(prism.hex('#ff6b6b')('Coral'));
console.log(prism.hex('#48dbfb')('Sky blue'));
console.log(prism.hex('#feca57')('Sunshine'));
console.log(prism.hex('#ff9ff3')('Pink'));

// RGB
console.log('\n--- RGB Colors ---');
console.log(prism.rgb(255, 100, 0)('Orange (255, 100, 0)'));
console.log(prism.rgb(100, 255, 100)('Light green (100, 255, 100)'));

// CSS named colors
console.log('\n--- CSS Named Colors ---');
console.log(prism.css('dodgerblue')('DodgerBlue'));
console.log(prism.css('tomato')('Tomato'));
console.log(prism.css('gold')('Gold'));
console.log(prism.css('mediumseagreen')('MediumSeaGreen'));
