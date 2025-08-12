import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe, afterEach } from 'vitest';

import { TmuxTester, createTester } from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures/apps');

describe('Test Fixed Menu', { timeout: 30000 }, () => {
  let tester: TmuxTester;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should navigate fixed menu correctly', async () => {
    tester = createTester(`node ${fixturesDir}/interactive-menu-fixed.cjs`, {
      sessionName: `test-fixed-menu-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.waitForText('Main Menu', { timeout: 5000 });
    
    console.log('=== Initial menu loaded ===');
    let screen = await tester.getScreenText();
    console.log(screen);
    
    // Navigate down twice to Option 3
    console.log('=== Navigating to Option 3 ===');
    await tester.sendKey('Down');
    await tester.sleep(200);
    await tester.sendKey('Down');
    await tester.sleep(200);
    
    screen = await tester.getScreenText();
    console.log('After navigation:', screen);
    expect(screen).toContain('> Option 3');
    
    // Select Option 3
    console.log('=== Selecting Option 3 ===');
    await tester.sendKey('Enter');
    await tester.sleep(200);
    
    screen = await tester.getScreenText();
    console.log('After selection:', screen);
    expect(screen).toContain('Selected: Option 3');
    
    // Wait for menu to return
    await tester.sleep(1400); // Wait for the 1500ms timeout
    await tester.waitForText('Main Menu', { timeout: 5000 });
    
    // Navigate to Exit (3 downs from position 0)
    console.log('=== Navigating to Exit ===');
    await tester.sendKey('Down');
    await tester.sleep(200);
    await tester.sendKey('Down');
    await tester.sleep(200);
    await tester.sendKey('Down');
    await tester.sleep(200);
    
    screen = await tester.getScreenText();
    console.log('After navigating to Exit:', screen);
    expect(screen).toContain('> Exit');
    
    // Select Exit
    console.log('=== Selecting Exit ===');
    await tester.sendKey('Enter');
    await tester.sleep(300);
    
    screen = await tester.getScreenText();
    console.log('Final screen:', screen);
    expect(screen).toContain('Goodbye!');
  });
});