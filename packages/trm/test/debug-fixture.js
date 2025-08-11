#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugFixture() {
  console.log('Testing fixture app...');
  
  const fixtureApp = path.join(__dirname, 'fixtures/test-terminal-app.js');
  
  try {
    const tester = createTester(`node ${fixtureApp}`, {
      sessionName: `debug-fixture-${Date.now()}`
    });
    
    console.log('Starting tester...');
    await tester.start();
    
    // Wait a bit for the app to start
    await tester.sleep(2000);
    
    console.log('Getting screen text...');
    const screen = await tester.getScreenText();
    console.log('=== Screen Output ===');
    console.log(screen);
    console.log('=== End Output ===');
    
    // Try to send a key to exit
    await tester.sendKey('q');
    await tester.sleep(500);
    
    console.log('Stopping tester...');
    await tester.stop();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugFixture().catch(console.error);