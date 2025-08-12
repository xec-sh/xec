import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe, afterEach } from 'vitest';

import { TmuxTester, createTester } from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures/apps');

describe('Debug Input', { timeout: 30000 }, () => {
  let tester: TmuxTester;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should test key input', async () => {
    tester = createTester(`node ${fixturesDir}/test-menu-simple.cjs`, {
      sessionName: `test-input-${Date.now()}`,
      debug: true
    });

    await tester.start();
    await tester.waitForText('Test Menu Started', { timeout: 5000 });
    
    console.log('=== Sending Enter key ===');
    await tester.sendKey('Enter');
    await tester.sleep(200);
    
    let screen = await tester.getScreenText();
    console.log('After Enter:', screen);
    
    console.log('=== Sending Down arrow ===');
    await tester.sendKey('Down');
    await tester.sleep(200);
    
    screen = await tester.getScreenText();
    console.log('After Down:', screen);
    
    console.log('=== Sending character "a" ===');
    await tester.sendText('a');
    await tester.sleep(200);
    
    screen = await tester.getScreenText();
    console.log('After "a":', screen);
    
    expect(screen).toContain('ENTER key detected');
  });
});