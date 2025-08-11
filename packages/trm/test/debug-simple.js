#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugSimple() {
  console.log('Testing simple fixture...');
  
  const fixtureApp = path.join(__dirname, 'fixtures/test-simple.js');
  
  try {
    const tester = createTester(`node ${fixtureApp}`, {
      sessionName: `debug-simple-${Date.now()}`
    });
    
    console.log('Starting tester...');
    await tester.start();
    
    // Wait for output
    await tester.sleep(1000);
    
    console.log('Getting screen text...');
    const screen = await tester.getScreenText();
    console.log('=== Screen Output ===');
    console.log(screen);
    console.log('=== End Output ===');
    
    // Wait for app to exit
    await tester.sleep(2000);
    
    console.log('Stopping tester...');
    await tester.stop();
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugSimple().catch(console.error);