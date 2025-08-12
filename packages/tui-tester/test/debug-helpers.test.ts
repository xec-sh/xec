import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe, afterEach } from 'vitest';

import { createTester } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures/apps');

describe('Debug Helpers Test', { timeout: 30000 }, () => {
  let tester: any;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should run interactive menu with debugging', async () => {
    // First try with bash
    tester = createTester('bash', {
      sessionName: `debug-menu-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(1000); // Wait for bash to be ready
    
    console.log('=== Starting bash ===');
    let screen = await tester.getScreenText();
    console.log('Initial screen:', screen);
    
    // Now run the menu app
    await tester.sendCommand(`node ${fixturesDir}/interactive-menu.cjs`);
    
    // Wait for app to start
    for (let i = 1; i <= 5; i++) {
      await tester.sleep(1000);
      screen = await tester.getScreenText();
      console.log(`After ${i} seconds:`, screen);
      
      if (screen.includes('Main Menu')) {
        console.log('Found Main Menu!');
        break;
      }
    }
    
    expect(screen).toContain('Main Menu');
  });

  it('should test arrow key navigation', async () => {
    // Try with different approach - running directly
    tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`, {
      sessionName: `debug-arrow-${Date.now()}`,
      debug: true
    });

    await tester.start();
    
    // Wait longer for Node.js to start
    await tester.sleep(3000);
    
    let screen = await tester.getScreenText();
    console.log('Menu screen:', screen);
    
    if (screen.includes('Main Menu')) {
      // Try sending arrow down
      console.log('Sending Down arrow...');
      await tester.sendKey('Down');
      await tester.sleep(500);
      
      screen = await tester.getScreenText();
      console.log('After Down:', screen);
      
      // Try sending Enter
      console.log('Sending Enter...');
      await tester.sendKey('Enter');
      await tester.sleep(500);
      
      screen = await tester.getScreenText();
      console.log('After Enter:', screen);
    }
  });

  it('should test form input', async () => {
    tester = createTester('bash', {
      sessionName: `debug-form-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(1000);
    
    // Run form app
    await tester.sendCommand(`node ${fixturesDir}/form-input.cjs`);
    await tester.sleep(2000);
    
    let screen = await tester.getScreenText();
    console.log('Form screen:', screen);
    
    if (screen.includes('Name:')) {
      // Try typing a name
      console.log('Typing name...');
      await tester.sendText('Test User');
      await tester.sendKey('Enter');
      await tester.sleep(500);
      
      screen = await tester.getScreenText();
      console.log('After name:', screen);
      
      if (screen.includes('Email:')) {
        console.log('Typing email...');
        await tester.sendText('test@example.com');
        await tester.sendKey('Enter');
        await tester.sleep(500);
        
        screen = await tester.getScreenText();
        console.log('After email:', screen);
        
        if (screen.includes('Age:')) {
          console.log('Typing age...');
          await tester.sendText('25');
          await tester.sendKey('Enter');
          await tester.sleep(1000);
          
          screen = await tester.getScreenText();
          console.log('Final screen:', screen);
        }
      }
    }
  });
});