import path from 'path';
import { fileURLToPath } from 'url';
import { createTester } from '@xec-sh/tui-tester';
import { it, expect, describe, afterEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Debug Screen Test', { timeout: 30000 }, () => {
  let tester: any;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should show what screen looks like', async () => {
    tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
      sessionName: `debug-screen-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.sleep(1000); // Give shell time to be ready
    await tester.waitForText('TRM Test Application', { timeout: 10000 });
    
    const screen = await tester.getScreenText();
    console.log('=== Full screen content ===');
    console.log(screen);
    console.log('=== End of screen ===');
    
    const lines = screen.split('\n');
    console.log(`Total lines: ${lines.length}`);
    
    lines.forEach((line, index) => {
      if (line.trim()) {
        console.log(`Line ${index}: "${line}"`);
      }
    });
    
    // Find where TRM Test Application is
    const trmLine = lines.findIndex(line => line.includes('TRM Test Application'));
    console.log(`TRM Test Application found at line: ${trmLine}`);
    
    expect(screen).toContain('TRM Test Application');
  });
});