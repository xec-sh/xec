#!/usr/bin/env tsx
/**
 * Example 04: Input Handling and Events
 * Demonstrates keyboard input, mouse events, and event handling
 */

import { ColorSystem } from '../src/core/color.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { x, y, ColorDepth, MouseButton, MouseAction } from '../src/types.js';

import type {
  KeyEvent,
  MouseEvent
} from '../src/types.js';

async function main() {
  console.log('=== TRM Core Example: Input and Events ===\n');

  const terminal = new TerminalImpl({
    rawMode: true,  // Enable raw mode for input
    cursorHidden: false
  });
  await terminal.init();

  const colors = new ColorSystem(ColorDepth.Extended);

  console.log('Terminal is in raw mode. Press Ctrl+C to exit.\n');
  console.log('Available commands:');
  console.log('  m - Enable/disable mouse');
  console.log('  p - Enable/disable bracketed paste');
  console.log('  f - Enable/disable focus tracking');
  console.log('  c - Clear screen');
  console.log('  q or Ctrl+C - Quit\n');

  // Use the terminal's input handler
  const input = terminal.input;

  // Keyboard input is already enabled by default
  console.log('Keyboard input enabled');

  // Subscribe to terminal events for key and mouse handling
  const keyHandler = terminal.events.on('key', (event: KeyEvent) => {
    handleKeyEvent(event);
  });

  const mouseHandler = terminal.events.on('mouse', (event: MouseEvent) => {
    handleMouseEvent(event);
  });

  const resizeHandler = terminal.events.on('resize', (rows, cols) => {
    console.log(`\nTerminal resized to ${cols}x${rows}`);
  });

  const pasteHandler = terminal.events.on('paste', (event) => {
    console.log(`\nPasted text (${event.data.length} chars): "${event.data.substring(0, 50)}..."`);
  });

  const focusHandler = terminal.events.on('focus', (focused) => {
    console.log(`\nTerminal ${focused ? 'focused' : 'blurred'}`);
  });

  const blurHandler = terminal.events.on('blur', () => {
    console.log(`\nTerminal blurred`);
  });

  // Track state
  let mouseEnabled = false;
  let pasteEnabled = false;
  let focusEnabled = false;
  let running = true;

  // Handle key events
  function handleKeyEvent(event: KeyEvent) {
    // Display key info
    terminal.cursor.moveTo(x(0), y(20));
    terminal.screen.clearLine(y(20));

    let keyInfo = `Key: "${event.key}" (code: ${event.code || 'N/A'})`;
    if (event.ctrl) keyInfo += ' +Ctrl';
    if (event.alt) keyInfo += ' +Alt';
    if (event.shift) keyInfo += ' +Shift';
    if (event.meta) keyInfo += ' +Meta';
    if (event.isSpecial) keyInfo += ` [Special: ${event.name}]`;

    terminal.stream.write(colors.toForeground(colors.yellow) + keyInfo);

    // Handle commands
    if (event.key === 'q' || (event.ctrl && event.key === 'c')) {
      running = false;
    } else if (event.key === 'm') {
      mouseEnabled = !mouseEnabled;
      if (mouseEnabled) {
        input.enableMouse();
        console.log('\nMouse enabled - Click, drag, and scroll!');
      } else {
        input.disableMouse();
        console.log('\nMouse disabled');
      }
    } else if (event.key === 'p') {
      pasteEnabled = !pasteEnabled;
      if (pasteEnabled) {
        input.enableBracketedPaste();
        console.log('\nBracketed paste enabled - Try pasting text!');
      } else {
        input.disableBracketedPaste();
        console.log('\nBracketed paste disabled');
      }
    } else if (event.key === 'f') {
      focusEnabled = !focusEnabled;
      if (focusEnabled) {
        input.enableFocusTracking();
        console.log('\nFocus tracking enabled - Click outside terminal!');
      } else {
        input.disableFocusTracking();
        console.log('\nFocus tracking disabled');
      }
    } else if (event.key === 'c') {
      terminal.screen.clear();
      terminal.cursor.moveTo(x(0), y(0));
      console.log('Screen cleared\n');
    }

    // Display raw sequence
    terminal.cursor.moveTo(x(0), y(21));
    terminal.screen.clearLine(y(21));
    terminal.stream.write(colors.toForeground(colors.gray) +
      `Raw sequence: ${JSON.stringify(event.sequence)}`);
  }

  // Handle mouse events
  function handleMouseEvent(event: MouseEvent) {
    terminal.cursor.moveTo(x(0), y(22));
    terminal.screen.clearLine(y(22));

    const buttonNames: Record<MouseButton, string> = {
      [MouseButton.Left]: 'Left',
      [MouseButton.Middle]: 'Middle',
      [MouseButton.Right]: 'Right',
      [MouseButton.None]: 'None',
      [MouseButton.ScrollUp]: 'ScrollUp',
      [MouseButton.ScrollDown]: 'ScrollDown'
    };

    const actionNames: Record<MouseAction, string> = {
      [MouseAction.Press]: 'Press',
      [MouseAction.Release]: 'Release',
      [MouseAction.Move]: 'Move',
      [MouseAction.Drag]: 'Drag',
      [MouseAction.ScrollUp]: 'ScrollUp',
      [MouseAction.ScrollDown]: 'ScrollDown'
    };

    const mouseInfo = `Mouse: ${actionNames[event.action]} ${buttonNames[event.button]} at (${event.x}, ${event.y})`;
    terminal.stream.write(colors.toForeground(colors.cyan) + mouseInfo);

    // Draw at mouse position for visual feedback
    if (event.action === MouseAction.Press || event.action === MouseAction.Drag) {
      const prevPos = terminal.cursor.position;
      terminal.cursor.moveTo(event.x, event.y);

      let char = '·';
      if (event.button === MouseButton.Left) char = '●';
      else if (event.button === MouseButton.Right) char = '○';
      else if (event.button === MouseButton.Middle) char = '◐';

      terminal.stream.write(colors.toForeground(colors.brightGreen) + char);
      terminal.cursor.moveTo(prevPos.x, prevPos.y);
    }
  }

  // Process input events
  console.log('\nListening for input events...\n');

  // Keep the program running until user exits
  while (running) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Clean up
  console.log('\n\nCleaning up...');

  // Remove event handlers
  keyHandler.dispose();
  mouseHandler.dispose();
  resizeHandler.dispose();
  pasteHandler.dispose();
  focusHandler.dispose();
  blurHandler.dispose();

  // Close terminal (this will handle cleanup)
  await terminal.close();
  console.log('Done!');
}

// Run the example
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});