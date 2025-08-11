import { it, expect, describe, afterEach } from 'vitest';

import { createTester } from '../../src/index.js';
import { isCommandAvailable } from '../../src/core/utils.js';

// Skip tests if tmux is not available
const hasTmux = await isCommandAvailable('tmux');
const describeTmux = hasTmux ? describe : describe.skip;

describeTmux('Simple Integration Test', { timeout: 30000 }, () => {
  let tester: any;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should start and stop a simple echo session', { timeout: 10000 }, async () => {
    tester = createTester('echo "Hello World"', {
      sessionName: `test-simple-${Date.now()}`,
      debug: true
    });

    expect(tester.isRunning()).toBe(false);
    
    await tester.start();
    expect(tester.isRunning()).toBe(true);
    
    // Wait a bit for the echo to complete
    await tester.sleep(500);
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Hello World');
    
    await tester.stop();
    expect(tester.isRunning()).toBe(false);
  });

  it('should handle a simple Node.js script', { timeout: 10000 }, async () => {
    // Create a simple inline Node.js script
    tester = createTester('node -e "console.log(\'Test Output\')"', {
      sessionName: `test-node-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(500);
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Test Output');
    
    await tester.stop();
  });

  it('should handle tmux commands', { timeout: 10000 }, async () => {
    tester = createTester('sh', {
      sessionName: `test-sh-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(500);
    
    // Send a simple command
    await tester.sendCommand('echo "From Shell"');
    await tester.sleep(500);
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('From Shell');
    
    await tester.stop();
  });
});