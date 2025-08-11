#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugTest() {
  console.log('Starting debug test...');
  
  // Create a simple test script
  const testScript = `
    console.log('Test output');
    setTimeout(() => {
      console.log('Delayed output');
      process.exit(0);
    }, 500);
  `;
  
  // Write test script
  const fs = await import('fs/promises');
  const tempFile = path.join(__dirname, 'temp-test.js');
  await fs.writeFile(tempFile, testScript);
  
  try {
    // Create tester
    console.log('Creating tester...');
    const tester = createTester(`node ${tempFile}`, {
      sessionName: `debug-test-${Date.now()}`
    });
    
    console.log('Starting tester...');
    await tester.start();
    
    console.log('Waiting for text...');
    await tester.waitForText('Test output', { timeout: 5000 });
    
    console.log('Getting screen text...');
    const screen = await tester.getScreenText();
    console.log('Screen content:', screen);
    
    console.log('Stopping tester...');
    await tester.stop();
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Cleanup
    await fs.unlink(tempFile).catch(() => {});
  }
}

debugTest().catch(console.error);