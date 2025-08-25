#!/usr/bin/env tsx
/**
 * Simple test to debug inline rendering
 */

import { BoxComponent } from '../src/components/box.js';
import { TextComponent } from '../src/components/text.js';
import { createRenderer } from '../src/renderer/renderer.js';
import { setupCommonDemoKeys } from '../examples/lib/standalone-keys.js';

async function main() {
  process.stdout.write('=== Before renderer creation ===\n');
  process.stdout.write('Line 1 - This should be visible\n');
  process.stdout.write('Line 2 - This should also be visible\n');
  process.stdout.write('Line 3 - Starting renderer...\n');
  process.stdout.write('---\n');

  const renderer = await createRenderer({
    useAlternateScreen: false, // Use inline mode
    exitOnCtrlC: true,
    targetFps: 30,
  });
  setupCommonDemoKeys(renderer);

  // console.log('Renderer created, adding components...');

  // Create a simple UI
  const box = new BoxComponent("box", {
    width: '100%',
    height: 7,
    borderStyle: 'single',
    borderColor: '#238823', // Green border
    backgroundColor: '#002300', // Dark green background
  });

  const text = new TextComponent("text", {
    content: 'Inline rendering test!',
    fg: '#ffffff', // White text
  });

  box.add(text);
  renderer.root.add(box);

  // Start rendering
  renderer.start();

  const rootHeight = renderer.root.calculateLayout();
  console.log("Root height:", rootHeight);
  console.log("Box height:", box.height);
  // console.log("Box computed height:", box.layoutNode.yogaNode.getComputedHeight());
  // console.log("Root computed height:", renderer.root.layoutNode.yogaNode.getComputedHeight());

  // Stop after 3 seconds
  setTimeout(() => {
    console.log('Stopping renderer...');
    renderer.stop();
    renderer.destroy();
    console.log('=== After renderer destroyed ===');
    console.log('This line should appear after the box.');
    // console.log('Root height:', rootHeight);

    process.exit(0);
  }, 5000);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});