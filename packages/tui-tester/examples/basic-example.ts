/**
 * Basic Example
 * Simple demonstration of E2E testing framework
 */

import { createTester } from '../index.js';

async function basicExample() {
  console.log('Starting basic E2E test example...\n');

  // Create a tester for a simple Node.js application
  const tester = createTester('node app.js', {
    cols: 80,
    rows: 24,
    debug: true
  });

  try {
    // Start the application
    await tester.start();
    console.log('✓ Application started');

    // Wait for the welcome message
    await tester.waitForText('Welcome', { timeout: 5000 });
    console.log('✓ Welcome message appeared');

    // Type some text
    await tester.typeText('Hello, World!');
    console.log('✓ Typed text');

    // Press Enter
    await tester.sendKey('enter');
    console.log('✓ Pressed Enter');

    // Wait for response
    await tester.waitForText('Received:', { timeout: 3000 });
    console.log('✓ Response received');

    // Take a snapshot
    await tester.takeSnapshot('basic-test');
    console.log('✓ Snapshot taken');

    // Verify screen content
    await tester.assertScreenContains('Hello, World!');
    console.log('✓ Screen content verified');

    // Get screen lines for inspection
    const lines = await tester.getScreenLines();
    console.log('\nScreen content:');
    console.log('-'.repeat(40));
    lines.forEach((line, i) => {
      if (line.trim()) {
        console.log(`${i.toString().padStart(2)}: ${line}`);
      }
    });
    console.log('-'.repeat(40));

    // Exit the application
    await tester.sendKey('q');
    console.log('\n✓ Sent quit command');

  } catch (error) {
    console.error('Test failed:', error);
    
    // Capture screen on error for debugging
    try {
      const errorCapture = await tester.captureScreen();
      console.log('\nScreen at time of error:');
      console.log(errorCapture.text);
    } catch {
      // Ignore capture errors
    }
  } finally {
    // Clean up
    await tester.stop();
    console.log('✓ Tester stopped');
  }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  basicExample().catch(console.error);
}