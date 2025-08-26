#!/usr/bin/env tsx
/**
 * Simple test to debug inline rendering
 */

import { TextComponent } from '../src/index.js';
import { TextAttributes } from '../src/types.js';
import { BoxComponent } from '../src/components/box.js';
import { createRenderer } from '../src/renderer/renderer.js';
import { setupCommonDemoKeys } from '../examples/lib/standalone-keys.js';

async function main() {
  const renderer = await createRenderer({
    useAlternateScreen: false, // Use inline mode
    exitOnCtrlC: true,
    targetFps: 30,
  });
  setupCommonDemoKeys(renderer);

  // console.log('Renderer created, adding components...');

  // // Create a simple UI
  // const box1 = new BoxComponent("box", {
  //   width: 80,
  //   height: 7,
  //   title: 'Unicode width test: 你好',
  //   border: true,
  //   borderStyle: 'single',
  //   borderColor: '#238823', // Green border
  //   backgroundColor: '#002300', // Dark green background
  // });

  // renderer.root.add(box1);

  const txt = new TextComponent("text", {
    content: 'Unicode width test\n📁 hello\nok ok ok',
    fg: 'white',
    attributes: TextAttributes.BOLD,
  });



  const box2 = new BoxComponent("box", {
    width: 80,
    height: 7,
    title: '📁 Unicode width test',
    border: true,
    borderStyle: 'single',
    // borderColor: '#238823', // Green border
    // backgroundColor: '#002300', // Dark green background
  });

  box2.add(txt);
  renderer.root.add(box2);

  // Start rendering
  renderer.start();

  // Stop after 3 seconds
  setTimeout(() => {
    console.log('Stopping renderer...');
    renderer.stop();
    renderer.destroy();
    console.log('=== After renderer destroyed ===');
    console.log('This line should appear after the box.');
    // console.log('Root height:', rootHeight);

    process.exit(0);
  }, 1000);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});