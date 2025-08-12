import path from 'path';
import { fileURLToPath } from 'url';
import { createTester } from '@xec-sh/tui-tester';
import { it, expect, describe, afterEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Simple Debug Test', { timeout: 30000 }, () => {
  let tester: any;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should run simple echo command', async () => {
    tester = createTester('echo "Hello TRM"', {
      sessionName: `debug-echo-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(500);
    
    const screen = await tester.getScreenText();
    console.log('Screen output:', screen);
    expect(screen).toContain('Hello TRM');
  });

  it('should run test fixture with shell', async () => {
    // Try creating with bash shell first
    tester = createTester('bash', {
      sessionName: `debug-shell-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(500); // Wait for shell to start
    
    // Now send the node command
    await tester.sendCommand(`node ${fixturesDir}/test-terminal-app.cjs`);
    await tester.sleep(2000); // Wait for node to run
    
    const screen = await tester.getScreenText();
    console.log('Fixture output with shell:', screen);
    
    expect(screen).toContain('TRM Test Application');
  });

  it('should run test fixture directly', async () => {
    tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
      sessionName: `debug-fixture-${Date.now()}`,
      debug: true,
      shell: '/bin/bash' // Explicitly set shell
    });

    await tester.start();
    await tester.sleep(2000); // Give it even more time for node to start and run
    
    const screen = await tester.getScreenText();
    console.log('Fixture output after 2s:', screen);
    
    // Check if we get ANY output at all
    expect(screen.length).toBeGreaterThan(0);
    
    // Try to find the text
    if (!screen.includes('TRM Test Application')) {
      console.log('Expected text not found.');
      console.log('Trying to wait more...');
      await tester.sleep(1000);
      const screen2 = await tester.getScreenText();
      console.log('Fixture output after 3s:', screen2);
    }
    
    expect(screen).toContain('TRM Test Application');
  });
});