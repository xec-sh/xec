import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe, afterEach } from 'vitest';

import { createTester } from '../../src/index.js';
import { isCommandAvailable } from '../../src/core/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures/apps');

const hasTmux = await isCommandAvailable('tmux');
const describeTmux = hasTmux ? describe : describe.skip;

describeTmux('Debug Helpers Tests', { timeout: 30000 }, () => {
  let tester: any;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should run interactive-menu and see output', async () => {
    console.log('Starting interactive-menu.cjs...');
    tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`, {
      sessionName: `debug-menu-${Date.now()}`,
      debug: true
    });
    
    await tester.start();
    console.log('Tester started, waiting 2 seconds...');
    await tester.sleep(2000);
    
    const screen = await tester.getScreenText();
    console.log('Screen output:');
    console.log('---');
    console.log(screen);
    console.log('---');
    
    // Check what we actually see
    expect(screen).toBeDefined();
    expect(screen.length).toBeGreaterThan(0);
    
    // Try to find any part of the menu
    const hasMenu = screen.includes('Main Menu') || 
                    screen.includes('Option 1') || 
                    screen.includes('Option 2');
    console.log('Has menu content:', hasMenu);
    
    if (!hasMenu) {
      console.log('Menu not found. Looking for command in output...');
      console.log('Screen contains "node":', screen.includes('node'));
      console.log('Screen contains "interactive-menu":', screen.includes('interactive-menu'));
    }
    
    expect(hasMenu).toBe(true);
  });

  it('should run simple-echo and interact', async () => {
    console.log('Starting simple-echo.cjs...');
    tester = createTester(`node ${fixturesDir}/simple-echo.cjs`, {
      sessionName: `debug-echo-${Date.now()}`,
      debug: true
    });
    
    await tester.start();
    console.log('Waiting for Ready...');
    
    // Wait longer for node to start
    await tester.sleep(2000);
    
    const screen = await tester.getScreenText();
    console.log('Screen output:');
    console.log('---');
    console.log(screen);
    console.log('---');
    
    const hasReady = screen.includes('Ready');
    console.log('Has "Ready":', hasReady);
    
    if (!hasReady) {
      console.log('Trying to wait more...');
      await tester.sleep(2000);
      const screen2 = await tester.getScreenText();
      console.log('Screen after 4s total:');
      console.log(screen2);
    }
    
    expect(screen).toContain('Ready');
  });

  it('should run bash and then execute node command', async () => {
    console.log('Starting bash first...');
    tester = createTester('bash', {
      sessionName: `debug-bash-${Date.now()}`,
      debug: true
    });
    
    await tester.start();
    await tester.sleep(1000);
    
    console.log('Sending node command...');
    await tester.sendCommand(`node ${fixturesDir}/interactive-menu.cjs`);
    await tester.sleep(2000);
    
    const screen = await tester.getScreenText();
    console.log('Screen output after bash + node:');
    console.log('---');
    console.log(screen);
    console.log('---');
    
    const hasMenu = screen.includes('Main Menu') || 
                    screen.includes('Option 1');
    console.log('Has menu content:', hasMenu);
    
    expect(hasMenu).toBe(true);
  });
});