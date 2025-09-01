#!/usr/bin/env tsx
/**
 * Box Component Demo
 *
 * Comprehensive demonstration of all box capabilities
 */

import picocolors from '../src/prism/index.js';
import { box } from '../src/components/box.js';

async function main() {
  console.log(picocolors.bold('\n📦 Box Component Demo\n'));

  // 1. Basic box with default settings
  console.log(picocolors.cyan('1. Basic Box:'));
  box('This is a simple box with default settings.', 'Basic Box');
  console.log();

  // 2. Box with rounded corners
  console.log(picocolors.cyan('2. Rounded Corners:'));
  box('This box has rounded corners for a softer appearance.', 'Rounded Box', {
    rounded: true,
  });
  console.log();

  // 3. Box with custom width
  console.log(picocolors.cyan('3. Custom Width (50% of terminal):'));
  box('This box takes up 50% of the terminal width.', 'Half Width', {
    width: 0.5,
    rounded: true,
  });
  console.log();

  // 4. Box with auto width
  console.log(picocolors.cyan('4. Auto Width (fits content):'));
  box('Short content.', 'Auto Width', {
    width: 'auto',
    rounded: true,
  });
  console.log();

  // 5. Content alignment variations
  console.log(picocolors.cyan('5. Content Alignment:'));

  box('Left aligned content (default)', 'Left Align', {
    contentAlign: 'left',
    rounded: true,
  });

  box('Center aligned content', 'Center Align', {
    contentAlign: 'center',
    rounded: true,
  });

  box('Right aligned content', 'Right Align', {
    contentAlign: 'right',
    rounded: true,
  });
  console.log();

  // 6. Title alignment variations
  console.log(picocolors.cyan('6. Title Alignment:'));

  box('Title aligned to the left', 'Left', {
    titleAlign: 'left',
    rounded: true,
  });

  box('Title aligned to the center', 'Center', {
    titleAlign: 'center',
    rounded: true,
  });

  box('Title aligned to the right', 'Right', {
    titleAlign: 'right',
    rounded: true,
  });
  console.log();

  // 7. Custom padding
  console.log(picocolors.cyan('7. Custom Padding:'));

  box('Minimal padding (1 space)', 'Tight Padding', {
    contentPadding: 1,
    titlePadding: 0,
    rounded: true,
  });

  box('Extra padding (4 spaces)', 'Spacious Padding', {
    contentPadding: 4,
    titlePadding: 2,
    rounded: true,
  });
  console.log();

  // 8. Multi-line content
  console.log(picocolors.cyan('8. Multi-line Content:'));
  const multilineContent = `Line 1: This is the first line
Line 2: This is the second line
Line 3: This is the third line
Line 4: This is the fourth line`;

  box(multilineContent, 'Multi-line Box', {
    rounded: true,
    contentAlign: 'left',
  });
  console.log();

  // 9. Long content with wrapping
  console.log(picocolors.cyan('9. Text Wrapping:'));
  const longContent =
    'This is a very long line of text that will automatically wrap to fit within the box boundaries. The wrapping is handled intelligently to maintain readability.';

  box(longContent, 'Text Wrapping Demo', {
    width: 0.6,
    rounded: true,
  });
  console.log();

  // 10. Custom border formatting
  console.log(picocolors.cyan('10. Styled Borders:'));

  box('Green border box', 'Success', {
    rounded: true,
    formatBorder: (text: string) => picocolors.green(text),
  });

  box('Red border box', 'Error', {
    rounded: true,
    formatBorder: (text: string) => picocolors.red(text),
  });

  box('Blue gradient border', 'Info', {
    rounded: true,
    formatBorder: (text: string) => picocolors.blue(text),
  });
  console.log();

  // 11. Box with prefix
  console.log(picocolors.cyan('11. Box with Prefix:'));
  box('This box includes a prefix on each line', 'Prefixed Box', {
    includePrefix: true,
    rounded: true,
  });
  console.log();

  // 12. Complex example with all options
  console.log(picocolors.cyan('12. Complex Example:'));
  const complexContent = `Welcome to the Box Component!

Features:
• Customizable borders
• Text alignment
• Automatic wrapping
• Color support
• Padding control`;

  box(complexContent, '✨ Feature Showcase ✨', {
    rounded: true,
    width: 0.7,
    contentAlign: 'left',
    titleAlign: 'center',
    contentPadding: 3,
    titlePadding: 2,
    formatBorder: (text: string) => picocolors.magenta(text),
  });
  console.log();

  // 13. Empty content box
  console.log(picocolors.cyan('13. Empty Content:'));
  box('', 'Empty Box', {
    rounded: true,
  });
  console.log();

  // 14. No title box
  console.log(picocolors.cyan('14. No Title:'));
  box('Box without a title', '', {
    rounded: true,
  });
  console.log();

  // 15. ASCII art box
  console.log(picocolors.cyan('15. ASCII Art:'));
  const asciiArt = `
    ╱|、
   (˚ˎ 。7  
    |、˜〵          
   じしˍ,)ノ
  `;

  box(asciiArt, '🐈 Cat', {
    rounded: true,
    contentAlign: 'center',
    width: 'auto',
  });
  console.log();

  // 16. Nested appearance (using prefix)
  console.log(picocolors.cyan('16. Nested Appearance:'));
  box('Level 1 content', 'Outer Box', {
    rounded: true,
  });
  box('  Level 2 content (indented)', '  Inner Box', {
    rounded: true,
    includePrefix: true,
  });
  console.log();

  // 17. Status boxes
  console.log(picocolors.cyan('17. Status Boxes:'));

  box('Operation completed successfully!', '✅ Success', {
    rounded: true,
    formatBorder: (text: string) => picocolors.green(text),
    width: 'auto',
  });

  box('Warning: Check your configuration', '⚠️  Warning', {
    rounded: true,
    formatBorder: (text: string) => picocolors.yellow(text),
    width: 'auto',
  });

  box('Error: Failed to connect', '❌ Error', {
    rounded: true,
    formatBorder: (text: string) => picocolors.red(text),
    width: 'auto',
  });
  console.log();

  // 18. Table-like content
  console.log(picocolors.cyan('18. Table-like Content:'));
  const tableContent = `
Name        Age    City
----        ---    ----
Alice       28     NYC
Bob         32     LA
Charlie     25     SF
  `.trim();

  box(tableContent, 'User Data', {
    rounded: false,
    contentAlign: 'left',
  });
  console.log();

  // 19. Combined styling
  console.log(picocolors.cyan('19. Rainbow Box:'));
  let colorIndex = 0;
  const colors = [
    picocolors.red,
    picocolors.yellow,
    picocolors.green,
    picocolors.cyan,
    picocolors.blue,
    picocolors.magenta,
  ];

  box('🌈 Rainbow content with cycling border colors!', '🎨 Colors', {
    rounded: true,
    formatBorder: (text: string) => {
      const color = colors[colorIndex % colors.length];
      colorIndex++;
      return color ? color(text) : text;
    },
  });
  console.log();

  // 20. Maximum width box
  console.log(picocolors.cyan('20. Full Width Box:'));
  box('This box spans the entire terminal width', 'Full Width', {
    width: 1,
    rounded: true,
    contentAlign: 'center',
    titleAlign: 'center',
  });

  console.log(picocolors.bold(picocolors.green('\n✨ Demo Complete!\n')));
}

main().catch(console.error);
