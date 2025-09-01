#!/usr/bin/env tsx
/**
 * Note Component Demo
 *
 * Comprehensive demonstration of all note component features
 * including formatting, wrapping, titles, and custom styles
 */

import { Writable } from 'node:stream';

import { prism as color } from '../src/index.js';
import { note } from '../src/components/note.js';

// Pause between examples for better visibility
const pause = (ms: number = 1000) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(color.bold(color.cyan('\n📝 Note Component Examples\n')));

  // Example 1: Basic note with title and message
  console.log(color.yellow('Example 1: Basic Note'));
  note('This is a simple note message', 'Information');
  await pause();

  // Example 2: Note without title
  console.log(color.yellow('\nExample 2: Note without title'));
  note('A note without a title - just the message content.');
  await pause();

  // Example 3: Note with only title
  console.log(color.yellow('\nExample 3: Note with only title'));
  note('', 'Title Only');
  await pause();

  // Example 4: Long message with automatic wrapping
  console.log(color.yellow('\nExample 4: Long message with wrapping'));
  const longMessage =
    'This is a very long message that will automatically wrap to fit within the terminal width. The note component handles text wrapping intelligently, preserving word boundaries and ensuring readability. It also respects terminal width constraints and adjusts accordingly.';
  note(longMessage, 'Long Content');
  await pause();

  // Example 5: Multi-line message
  console.log(color.yellow('\nExample 5: Multi-line message'));
  const multilineMessage = `First line of the note
Second line with more information
Third line with additional details
Fourth line to demonstrate spacing`;
  note(multilineMessage, 'Multi-line');
  await pause();

  // Example 6: Note with special characters and emojis
  console.log(color.yellow('\nExample 6: Special characters and emojis'));
  note('✨ Unicode support: ★ ✓ ✗ → ← ↑ ↓ 📝 🎉', 'Unicode & Emojis');
  await pause();

  // Example 7: Custom formatting function (bold text)
  console.log(color.yellow('\nExample 7: Custom formatting - Bold'));
  note('This message will be displayed in bold text', 'Bold Format', {
    format: (line: string) => color.bold(line),
  });
  await pause();

  // Example 8: Custom formatting function (colored text)
  console.log(color.yellow('\nExample 8: Custom formatting - Colored'));
  note('This message has custom cyan coloring', 'Colored Note', {
    format: (line: string) => color.cyan(line),
  });
  await pause();

  // Example 9: Multiple custom formats combined
  console.log(color.yellow('\nExample 9: Combined formatting'));
  note('Bold, italic, and magenta combined!', 'Styled Note', {
    format: (line: string) => color.bold(color.italic(color.magenta(line))),
  });
  await pause();

  // Example 10: Different note styles for different purposes
  console.log(color.yellow('\nExample 10: Different note styles'));

  // Success note
  note('Operation completed successfully!', '✅ Success', {
    format: (line: string) => color.green(line),
  });
  await pause(500);

  // Warning note
  note('Please review the configuration before proceeding', '⚠️  Warning', {
    format: (line: string) => color.yellow(line),
  });
  await pause(500);

  // Error note
  note('An error occurred during processing', '❌ Error', {
    format: (line: string) => color.red(line),
  });
  await pause(500);

  // Info note
  note('Additional information about the process', 'ℹ️  Info', {
    format: (line: string) => color.blue(line),
  });
  await pause();

  // Example 11: Code snippet in note
  console.log(color.yellow('\nExample 11: Code snippet'));
  const codeSnippet = `const result = await fetch(url);
const data = await result.json();
console.log(data);`;
  note(codeSnippet, 'Code Example', {
    format: (line: string) => color.green(line),
  });
  await pause();

  // Example 12: List in note
  console.log(color.yellow('\nExample 12: List items'));
  const listContent = `• First item in the list
• Second item with more text
• Third item to demonstrate
• Fourth and final item`;
  note(listContent, 'Task List');
  await pause();

  // Example 13: Wide title handling
  console.log(color.yellow('\nExample 13: Wide title'));
  note('Short message', 'This is a very long title that extends beyond the message width');
  await pause();

  // Example 14: Empty note (edge case)
  console.log(color.yellow('\nExample 14: Empty note'));
  note();
  await pause();

  // Example 15: Note with line breaks and formatting
  console.log(color.yellow('\nExample 15: Complex formatting'));
  const complexMessage = `Header Section
${'='.repeat(20)}

Body paragraph with some text that explains the concept in detail.

Another paragraph:
- Point one
- Point two
- Point three

Footer Section
${'='.repeat(20)}`;
  note(complexMessage, 'Document', {
    format: (line: string) => {
      // Different formatting for different lines
      if (line.includes('=')) return color.dim(color.blue(line));
      if (line.startsWith('-')) return color.cyan(line);
      if (line.includes('Header') || line.includes('Footer')) return color.bold(line);
      return color.dim(line);
    },
  });
  await pause();

  // Example 16: Using custom output stream (demonstration)
  console.log(color.yellow('\nExample 16: Custom output stream'));

  // Create a custom writable stream that prefixes each line
  const customStream = new Writable({
    write(chunk, encoding, callback) {
      const lines = chunk.toString().split('\n');
      lines.forEach((line: string) => {
        if (line) process.stdout.write(`[CUSTOM] ${line}\n`);
      });
      callback();
    },
  });

  // Set columns property for the custom stream
  (customStream as any).columns = 60;

  note('This note uses a custom output stream', 'Custom Output', {
    output: customStream,
  });
  await pause();

  // Example 17: Nested notes effect
  console.log(color.yellow('\nExample 17: Multiple notes in sequence'));
  note('Step 1: Initialize the process', 'Process Start', {
    format: (line: string) => color.dim(line),
  });
  note('Step 2: Validate configuration', 'Validation', {
    format: (line: string) => color.yellow(line),
  });
  note('Step 3: Execute main operation', 'Execution', {
    format: (line: string) => color.cyan(line),
  });
  note('Step 4: Process completed!', 'Complete', {
    format: (line: string) => color.green(line),
  });
  await pause();

  // Example 18: Dynamic width handling
  console.log(color.yellow('\nExample 18: Terminal width awareness'));
  const terminalWidth = process.stdout.columns || 80;
  note(
    `This note adapts to your terminal width. Current width: ${terminalWidth} columns. The text will wrap appropriately based on the available space.`,
    'Responsive Note'
  );
  await pause();

  // Example 19: Performance tip in note
  console.log(color.yellow('\nExample 19: Performance metrics'));
  const metrics = `Execution Time: 123ms
Memory Usage: 45.2 MB
CPU Usage: 12%
Network Latency: 5ms`;
  note(metrics, '📊 Performance', {
    format: (line: string) => {
      if (line.includes('Time')) return color.yellow(line);
      if (line.includes('Memory')) return color.blue(line);
      if (line.includes('CPU')) return color.magenta(line);
      if (line.includes('Network')) return color.cyan(line);
      return line;
    },
  });
  await pause();

  // Example 20: ASCII art in note
  console.log(color.yellow('\nExample 20: ASCII Art'));
  const asciiArt = `    ╭─────╮
    │ ◉ ◉ │
    │  ▽  │
    ╰─────╯`;
  note(asciiArt, 'ASCII Robot', {
    format: (line: string) => color.cyan(line),
  });

  console.log(color.bold(color.green('\n✨ All note examples completed!\n')));
}

// Run the demo
main().catch(console.error);
