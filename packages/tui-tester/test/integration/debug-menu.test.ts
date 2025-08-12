import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe, afterEach } from 'vitest';

import { TmuxTester, createTester } from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures/apps');

describe('Debug Menu Navigation', { timeout: 30000 }, () => {
  let tester: TmuxTester;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should navigate menus with arrow keys - debug version', async () => {
    tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`, {
      sessionName: `test-menu-debug-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.waitForText('Main Menu', { timeout: 5000 });
    
    console.log('=== Initial menu loaded ===');
    let screen = await tester.getScreenText();
    console.log(screen);
    
    // Navigate down twice
    console.log('=== Navigating down twice ===');
    await tester.sendKey('Down');
    await tester.sleep(200);
    await tester.sendKey('Down');
    await tester.sleep(200);
    
    screen = await tester.getScreenText();
    console.log(screen);
    
    // Select Option 3
    console.log('=== Selecting Option 3 ===');
    await tester.sendKey('Enter');
    await tester.sleep(1600); // Wait for the 1500ms timeout + buffer
    
    screen = await tester.getScreenText();
    console.log(screen);
    expect(screen).toContain('Selected: Option 3');
    
    // Wait for menu to return
    await tester.waitForText('Main Menu', { timeout: 5000 });
    console.log('=== Menu returned ===');
    screen = await tester.getScreenText();
    console.log(screen);
    
    // Navigate to Exit (should be 3 downs from position 0)
    console.log('=== Navigating to Exit ===');
    await tester.sendKey('Down');
    await tester.sleep(200);
    screen = await tester.getScreenText();
    console.log('After 1st down:', screen);
    
    await tester.sendKey('Down');
    await tester.sleep(200);
    screen = await tester.getScreenText();
    console.log('After 2nd down:', screen);
    
    await tester.sendKey('Down');
    await tester.sleep(200);
    screen = await tester.getScreenText();
    console.log('After 3rd down:', screen);
    
    console.log('=== Selecting Exit ===');
    await tester.sendKey('Enter');
    await tester.sleep(500);
    
    screen = await tester.getScreenText();
    console.log('Final screen:', screen);
    
    // Check if Goodbye! is there
    if (!screen.includes('Goodbye!')) {
      console.log('ERROR: Goodbye! not found in screen');
      console.log('Waiting more...');
      await tester.sleep(2000);
      screen = await tester.getScreenText();
      console.log('After extra wait:', screen);
    }
    
    expect(screen).toContain('Goodbye!');
  });
});