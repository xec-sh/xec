import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe } from 'vitest';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Simple Integration Test', () => {
  let tester: TmuxTester;

  it('should run a simple test', async () => {
    const fixturesDir = path.join(__dirname, '../fixtures');
    
    tester = createTester(`node ${fixturesDir}/test-simple.cjs`, {
      sessionName: `trm-simple-${Date.now()}`
    });
    
    await tester.start();
    await tester.waitForText('Simple Test Running', { timeout: 5000 });
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Simple Test Running');
    expect(screen).toContain('Test completed successfully');
    
    await tester.stop();
  });
});