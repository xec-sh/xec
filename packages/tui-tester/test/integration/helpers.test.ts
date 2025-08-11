import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { createTester } from '../../src/index.js';
import { isCommandAvailable } from '../../src/core/utils.js';
import { 
  step,
  runTest,
  scenario,
  TestRunner,
  InteractionHelper
} from '../../src/helpers/test-runner.js';
import {
  login,
  search,
  fillField,
  submitForm,
  selectText,
  clickOnText,
  navigateMenu,
  copySelection,
  selectMenuItem,
  executeCommand,
  waitForLoading,
  pasteFromClipboard
} from '../../src/helpers/interactions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures/apps');

// Skip tests if tmux is not available
const hasTmux = await isCommandAvailable('tmux');
const describeTmux = hasTmux ? describe : describe.skip;

describeTmux('Interaction Helpers', { timeout: 30000 }, () => {
  let tester: any; // Using any to avoid type issues

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  describe('navigateMenu()', () => {
    it('should navigate menu with arrow keys', async () => {
      tester = createTester(`node ${fixturesDir}/interactive-menu.js`);
      await tester.start();
      await tester.waitForText('Main Menu', { timeout: 5000 });
      
      // Navigate to Option 2
      await navigateMenu(tester, 1);
      await tester.sendKey('Enter');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Selected: Option 2');
    });

    it('should handle wrap-around navigation', async () => {
      tester = createTester(`node ${fixturesDir}/interactive-menu.js`);
      await tester.start();
      await tester.waitForText('Main Menu', { timeout: 5000 });
      
      // Navigate up from first item (should wrap to last)
      await navigateMenu(tester, -1);
      await tester.sendKey('Enter');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Selected: Exit');
    });
  });

  describe('selectMenuItem()', () => {
    it('should select menu item by text', async () => {
      tester = createTester(`node ${fixturesDir}/interactive-menu.js`);
      await tester.start();
      await tester.waitForText('Main Menu', { timeout: 5000 });
      
      await selectMenuItem(tester, 'Option 3');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Selected: Option 3');
    });
  });

  describe('fillField()', () => {
    it('should fill form field', async () => {
      tester = createTester(`node ${fixturesDir}/form-input.js`);
      await tester.start();
      await tester.waitForText('User Registration');
      
      await fillField(tester, 'Name:', 'Test User');
      await tester.sendKey('Enter');
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Email:');
    });
  });

  describe('submitForm()', () => {
    it('should fill and submit form', async () => {
      tester = createTester(`node ${fixturesDir}/form-input.js`);
      await tester.start();
      await tester.waitForText('User Registration');
      
      const formData = {
        'Name:': 'Alice',
        'Email:': 'alice@test.com',
        'Age:': '30'
      };
      
      await submitForm(tester, formData);
      await tester.waitForText('Summary');
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Name: Alice');
      expect(screen).toContain('Email: alice@test.com');
      expect(screen).toContain('Age: 30');
    });
  });

  describe('clickOnText()', () => {
    it('should click on text in terminal', async () => {
      tester = createTester(`node ${fixturesDir}/interactive-menu.js`);
      await tester.start();
      await tester.waitForText('Main Menu', { timeout: 5000 });
      
      await clickOnText(tester, 'Option 2');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Selected: Option 2');
    });
  });

  describe('executeCommand()', () => {
    it('should execute command and return output', async () => {
      tester = createTester('sh');
      await tester.start();
      await tester.sleep(200);
      
      const output = await executeCommand(tester, 'echo "Hello from shell"');
      expect(output).toContain('Hello from shell');
    });

    it('should handle command with timeout', async () => {
      tester = createTester('sh');
      await tester.start();
      await tester.sleep(200);
      
      const output = await executeCommand(tester, 'echo "Quick test"', { timeout: 1000 });
      expect(output).toContain('Quick test');
    });
  });

  describe('search()', () => {
    it('should search for text', async () => {
      tester = createTester(`node ${fixturesDir}/simple-echo.js`);
      await tester.start();
      await tester.waitForText('Ready');
      
      await tester.sendText('searchable content here');
      await tester.sleep(100);
      
      const found = await search(tester, 'searchable');
      expect(found).toBe(true);
      
      const notFound = await search(tester, 'nonexistent');
      expect(notFound).toBe(false);
    });
  });

  describe('waitForLoading()', () => {
    it('should wait for loading to complete', async () => {
      tester = createTester(`node ${fixturesDir}/progress-bar.js`);
      await tester.start();
      
      await waitForLoading(tester, {
        loadingText: 'Progress:',
        completeText: 'Complete!',
        timeout: 3000
      });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Complete!');
    });
  });
});

describeTmux('TestRunner', () => {
  let runner: TestRunner;

  afterEach(async () => {
    if (runner) {
      await runner.cleanup();
    }
  });

  it('should run test scenarios', async () => {
    runner = new TestRunner({
      command: `node ${fixturesDir}/simple-echo.js`,
      sessionName: `runner-test-${Date.now()}`
    });

    await runner.start();
    
    const result = await runner.runScenario('Echo Test', async (tester) => {
      await tester.waitForText('Ready');
      await tester.sendText('Test message');
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Test message');
    });

    expect(result.name).toBe('Echo Test');
    expect(result.passed).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should handle test failures', async () => {
    runner = new TestRunner({
      command: `node ${fixturesDir}/simple-echo.js`,
      sessionName: `runner-fail-${Date.now()}`
    });

    await runner.start();
    
    const result = await runner.runScenario('Failing Test', async (tester) => {
      await tester.waitForText('Ready');
      throw new Error('Test failure');
    });

    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Test failure');
  });

  it('should run multiple scenarios', async () => {
    runner = new TestRunner({
      command: `node ${fixturesDir}/simple-echo.js`,
      sessionName: `runner-multi-${Date.now()}`
    });

    await runner.start();
    
    await runner.runScenario('Test 1', async (tester) => {
      await tester.waitForText('Ready');
      await tester.sendText('Test 1');
    });

    await runner.runScenario('Test 2', async (tester) => {
      await tester.sendText('Test 2');
    });

    const results = runner.getResults();
    expect(results.scenarios).toHaveLength(2);
    expect(results.passed).toBe(2);
    expect(results.failed).toBe(0);
  });

  it('should capture screenshots on failure', async () => {
    runner = new TestRunner({
      command: `node ${fixturesDir}/simple-echo.js`,
      sessionName: `runner-screenshot-${Date.now()}`,
      captureOnFailure: true
    });

    await runner.start();
    
    const result = await runner.runScenario('Screenshot Test', async (tester) => {
      await tester.waitForText('Ready');
      await tester.sendText('Before failure');
      await tester.sleep(100);
      throw new Error('Capture this state');
    });

    expect(result.passed).toBe(false);
    expect(result.screenshot).toBeDefined();
    expect(result.screenshot).toContain('Before failure');
  });
});

describeTmux('Helper Functions', () => {
  it('should create scenarios with scenario()', () => {
    const testScenario = scenario('Test Scenario', [
      step('Step 1', async (tester) => {
        await tester.sendText('Step 1');
      }),
      step('Step 2', async (tester) => {
        await tester.sendText('Step 2');
      })
    ]);

    expect(testScenario.name).toBe('Test Scenario');
    expect(testScenario.steps).toHaveLength(2);
    expect(testScenario.steps[0].name).toBe('Step 1');
    expect(testScenario.steps[1].name).toBe('Step 2');
  });

  it('should run tests with runTest()', async () => {
    const result = await runTest({
      command: `node ${fixturesDir}/simple-echo.js`,
      sessionName: `runtest-${Date.now()}`,
      scenarios: [
        scenario('Scenario 1', [
          step('Wait for ready', async (tester) => {
            await tester.waitForText('Ready');
          }),
          step('Send input', async (tester) => {
            await tester.sendText('Input');
          })
        ])
      ]
    });

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].passed).toBe(true);
  });
});

describeTmux('InteractionHelper', () => {
  let helper: InteractionHelper;
  let tester: any;

  beforeEach(async () => {
    tester = createTester(`node ${fixturesDir}/interactive-menu.js`);
    await tester.start();
    await tester.waitForText('Main Menu');
    helper = new InteractionHelper(tester);
  });

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should navigate menus', async () => {
    await helper.navigateMenu(['Option 2']);
    await tester.sleep(200);
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Selected: Option 2');
  });

  it('should wait for conditions', async () => {
    const ready = await helper.waitForAny(['Main Menu', 'Error'], 1000);
    expect(ready).toBe('Main Menu');
  });

  it('should handle timeouts', async () => {
    const found = await helper.waitForAll(['Main Menu', 'NonExistent'], 500);
    expect(found).toBe(false);
  });
});

describeTmux('Complex Workflows', () => {
  it('should handle login workflow', async () => {
    // Create a mock login app
    tester = createTester('sh');
    await tester.start();
    await tester.sleep(200);
    
    // Simulate a login prompt
    await tester.sendCommand('echo "Username:"; read user; echo "Password:"; read -s pass; echo "Welcome $user"');
    await tester.sleep(100);
    
    // Use login helper
    await login(tester, 'testuser', 'testpass');
    await tester.sleep(200);
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Welcome testuser');
  });

  it('should handle copy and paste workflow', async () => {
    tester = createTester(`node ${fixturesDir}/simple-echo.js`);
    await tester.start();
    await tester.waitForText('Ready');
    
    // Type some text
    await tester.sendText('Copy this text');
    await tester.sleep(100);
    
    // Select text (simulate)
    await selectText(tester, 0, 5, 0, 14);
    
    // Copy (simulate)
    await copySelection(tester);
    
    // Paste (simulate)
    await pasteFromClipboard(tester);
    await tester.sleep(100);
    
    // Should have the text twice now
    const screen = await tester.getScreenText();
    expect(screen).toContain('Copy this text');
  });
});

describeTmux('Error Handling', () => {
  it('should handle app crashes gracefully', async () => {
    tester = createTester('sh');
    await tester.start();
    await tester.sleep(200);
    
    // Cause the shell to exit
    await tester.sendCommand('exit');
    await tester.sleep(200);
    
    // Tester should still be "running" from tmux perspective
    expect(tester.isRunning()).toBe(true);
    
    // But the shell should have exited
    const screen = await tester.getScreenText();
    expect(screen).toContain('[exited]');
  });

  it('should handle network timeouts', async () => {
    tester = createTester(`node ${fixturesDir}/simple-echo.js`);
    await tester.start();
    await tester.waitForText('Ready');
    
    // Try to wait for something that won't appear
    const timeout = 500;
    const startTime = Date.now();
    
    try {
      await tester.waitForText('This will never appear', { timeout });
    } catch (error) {
      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(timeout);
      expect(duration).toBeLessThan(timeout + 200); // Some margin
      expect(error).toBeDefined();
    }
  });
});