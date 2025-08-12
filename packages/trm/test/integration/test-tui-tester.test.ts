import path from 'path';
import { fileURLToPath } from 'url';
import { createTester } from '@xec-sh/tui-tester';
import { it, expect, describe, afterEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Test TUI Tester Directly', { timeout: 30000 }, () => {
  let tester: any;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should work with simple echo', async () => {
    tester = createTester('echo "Hello World"', {
      sessionName: `test-echo-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(500);
    
    const screen = await tester.getScreenText();
    console.log('Echo screen:', screen);
    expect(screen).toContain('Hello World');
  });

  it('should work with node script', async () => {
    tester = createTester(`node -e "console.log('Node Test')"`, {
      sessionName: `test-node-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(1000);
    
    const screen = await tester.getScreenText();
    console.log('Node screen:', screen);
    expect(screen).toContain('Node Test');
  });

  it('should work with test fixture using bash', async () => {
    // Start bash first, then send command
    tester = createTester('bash', {
      sessionName: `test-bash-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(1000); // Wait for bash to start
    
    // Now send the node command
    await tester.sendCommand(`node ${fixturesDir}/test-terminal-app.cjs`);
    await tester.sleep(2000); // Wait for node to execute
    
    const screen = await tester.getScreenText();
    console.log('Bash + Node screen:', screen);
    
    expect(screen).toContain('TRM Test Application');
  });

  it('should debug what happens with direct command', async () => {
    tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
      sessionName: `test-direct-${Date.now()}`,
      debug: true
    });

    await tester.start();
    
    // Check at various intervals
    for (let i = 1; i <= 5; i++) {
      await tester.sleep(1000);
      const screen = await tester.getScreenText();
      console.log(`After ${i} seconds:`);
      console.log(screen);
      console.log('---');
      
      if (screen.includes('TRM Test Application')) {
        console.log(`Found text after ${i} seconds!`);
        break;
      }
    }
    
    const finalScreen = await tester.getScreenText();
    expect(finalScreen).toContain('TRM Test Application');
  });
});