#!/usr/bin/env tsx
/**
 * Compare inline vs alternate screen rendering modes
 */

import { createRenderer } from '../src/renderer/renderer.js';
import { BoxComponent } from '../src/components/box.js';
import { TextComponent } from '../src/components/text.js';
import { SelectComponent } from '../src/components/select.js';

async function runDemo(useAlternateScreen: boolean) {
  const renderer = await createRenderer({
    useAlternateScreen,
    exitOnCtrlC: false,
    targetFps: 30,
  });

  const root = renderer.root;

  const container = new BoxComponent({
    x: 0,
    y: 0,
    width: 60,
    height: 15,
    border: 'double',
    style: {
      borderColor: [1, 1, 1, 1],
      backgroundColor: [0.05, 0.05, 0.1, 1],
    }
  });

  const modeText = new TextComponent({
    x: 2,
    y: 1,
    content: `Mode: ${useAlternateScreen ? 'Alternate Screen' : 'Inline Rendering'}`,
    style: {
      color: useAlternateScreen ? [1, 0.5, 0, 1] : [0, 1, 0.5, 1],
    }
  });

  const descriptionText = new TextComponent({
    x: 2,
    y: 3,
    content: useAlternateScreen
      ? 'Full screen mode - takes over entire terminal'
      : 'Inline mode - renders in place like bubbletea',
    style: {
      color: [0.8, 0.8, 0.8, 1],
    }
  });

  const select = new SelectComponent({
    x: 2,
    y: 5,
    width: 40,
    height: 5,
    options: [
      { label: 'Option 1', value: '1' },
      { label: 'Option 2', value: '2' },
      { label: 'Option 3', value: '3' },
    ],
    style: {
      color: [1, 1, 1, 1],
      selectedColor: [0, 0, 0, 1],
      selectedBackgroundColor: [1, 1, 0, 1],
    }
  });

  const instructionsText = new TextComponent({
    x: 2,
    y: 11,
    content: 'Press "q" to quit, arrow keys to navigate',
    style: {
      color: [0.5, 0.5, 0.5, 1],
    }
  });

  container.appendChild(modeText);
  container.appendChild(descriptionText);
  container.appendChild(select);
  container.appendChild(instructionsText);
  root.appendChild(container);

  renderer.on('key', (data: Buffer) => {
    const key = data.toString();

    if (key === 'q') {
      renderer.stop();
      renderer.destroy();
      return true;
    }

    // Handle arrow keys for select component
    if (key === '\x1b[A') { // Up arrow
      select.selectPrevious();
      renderer.needsUpdate();
    } else if (key === '\x1b[B') { // Down arrow
      select.selectNext();
      renderer.needsUpdate();
    }
  });

  renderer.start();

  return new Promise<void>((resolve) => {
    renderer.on('key', (data: Buffer) => {
      if (data.toString() === 'q') {
        resolve();
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === '--alt') {
    console.log('Starting with alternate screen mode...');
    console.log('The terminal will be cleared and taken over.');
    console.log('Press any key to continue...');

    await new Promise(resolve => {
      process.stdin.once('data', resolve);
      process.stdin.setRawMode(true);
      process.stdin.resume();
    });

    await runDemo(true);
    console.log('Returned from alternate screen mode.');
  } else if (mode === '--inline') {
    console.log('Starting with inline rendering mode...');
    console.log('The UI will render below this text:');
    console.log('---');

    await runDemo(false);
    console.log('\\nExited inline mode. Terminal content preserved.');
  } else {
    console.log('Usage:');
    console.log('  tsx compare-rendering-modes.ts --inline    # Inline rendering (like bubbletea)');
    console.log('  tsx compare-rendering-modes.ts --alt       # Alternate screen mode');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});