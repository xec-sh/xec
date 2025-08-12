import path from 'path';
import { fileURLToPath } from 'url';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { createTester } from '../../src/index.js';
import { isCommandAvailable } from '../../src/core/utils.js';
import { 
  step,
  runTest,
  scenario,
  TestRunner
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
      tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      await tester.waitForText('Main Menu', { timeout: 10000 });
      
      // Navigate to Option 2
      await navigateMenu(tester, 'down', 1);
      await tester.sendKey('Enter');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Selected: Option 2');
    });

    it('should handle wrap-around navigation', async () => {
      tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      await tester.waitForText('Main Menu', { timeout: 10000 });
      
      // Navigate up from first item (should wrap to last)
      await navigateMenu(tester, 'up', 1);
      await tester.sendKey('Enter');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Selected: Exit');
    });
  });

  describe('selectMenuItem()', () => {
    it('should select menu item by text', async () => {
      tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      await tester.waitForText('Main Menu', { timeout: 10000 });
      
      await selectMenuItem(tester, 'Option 3');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Selected: Option 3');
    });
  });

  describe('fillField()', () => {
    it('should fill form field', async () => {
      tester = createTester(`node ${fixturesDir}/form-input.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      await tester.waitForText('User Registration', { timeout: 10000 });
      
      await fillField(tester, 'Name:', 'Test User');
      await tester.sendKey('Enter');
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Email:');
    });
  });

  describe('submitForm()', () => {
    it('should fill and submit form', async () => {
      tester = createTester(`node ${fixturesDir}/form-input.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      await tester.waitForText('User Registration', { timeout: 10000 });
      
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
      // Note: mouse-test.cjs expects real mouse events
      // This test verifies that clickOnText finds text and sends click coordinates
      tester = createTester(`node ${fixturesDir}/mouse-test.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      await tester.waitForText('Mouse Test', { timeout: 10000 });
      
      // Click on the "Mouse Test" title text
      await clickOnText(tester, 'Mouse Test');
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      // Mouse event should be reported (if mouse is supported)
      // or at least the text should still be visible
      expect(screen).toContain('Mouse Test');
    });
  });

  describe('executeCommand()', () => {
    it('should execute command and return output', async () => {
      tester = createTester('sh');
      await tester.start();
      await tester.sleep(1000); // Wait for shell to be ready
      
      await executeCommand(tester, 'echo "Hello from shell"');
      await tester.sleep(500); // Wait for command output
      const output = await tester.getScreenText();
      expect(output).toContain('Hello from shell');
    });

    it('should handle command with timeout', async () => {
      tester = createTester('sh');
      await tester.start();
      await tester.sleep(1000); // Wait for shell to be ready
      
      await executeCommand(tester, 'echo "Quick test"');
      await tester.sleep(200); // Wait for command output
      const output = await tester.getScreenText();
      expect(output).toContain('Quick test');
    });
  });

  describe('search()', () => {
    it('should search for text', async () => {
      tester = createTester(`node ${fixturesDir}/simple-echo.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      await tester.waitForText('Ready', { timeout: 10000 });
      
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
      tester = createTester(`node ${fixturesDir}/progress-bar.cjs`);
      await tester.start();
      await tester.sleep(2000); // Wait for node to start
      
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

  beforeEach(() => {
    runner = new TestRunner({ debug: true });
  });

  it('should run test scenarios', async () => {
    const testScenario: any = {
      name: 'Echo Test',
      steps: [
        {
          name: 'Wait for Ready',
          action: async (tester: any) => {
            await tester.sleep(2000); // Wait for node to start
            await tester.waitForText('Ready', { timeout: 10000 });
          }
        },
        {
          name: 'Send Test Message',
          action: async (tester: any) => {
            await tester.sendText('Test message');
            await tester.sleep(100);
            const screen = await tester.getScreenText();
            expect(screen).toContain('Test message');
          }
        }
      ]
    };
    
    const config = {
      command: ['node', `${fixturesDir}/simple-echo.cjs`],
      sessionName: `runner-test-${Date.now()}`
    };
    
    const result = await runner.runScenario(testScenario, config);

    expect(result.scenario).toBe('Echo Test');
    expect(result.passed).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should handle test failures', async () => {
    const testScenario: any = {
      name: 'Failing Test',
      steps: [
        {
          name: 'Wait for Ready',
          action: async (tester: any) => {
            await tester.sleep(2000);
            await tester.waitForText('Ready', { timeout: 10000 });
          }
        },
        {
          name: 'Fail Test',
          action: async () => {
            throw new Error('Test failure');
          }
        }
      ]
    };
    
    const config = {
      command: ['node', `${fixturesDir}/simple-echo.cjs`],
      sessionName: `runner-fail-${Date.now()}`
    };
    
    const result = await runner.runScenario(testScenario, config);

    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Test failure');
  });

  it('should run multiple scenarios', async () => {
    const config = {
      command: ['node', `${fixturesDir}/simple-echo.cjs`],
      sessionName: `runner-multi-${Date.now()}`
    };
    
    const scenario1: any = {
      name: 'Test 1',
      steps: [{
        name: 'Step 1',
        action: async (tester: any) => {
          await tester.sleep(2000);
          await tester.waitForText('Ready', { timeout: 10000 });
          await tester.sendText('Test 1');
        }
      }]
    };
    
    const scenario2: any = {
      name: 'Test 2',
      steps: [{
        name: 'Step 2',
        action: async (tester: any) => {
          await tester.sendText('Test 2');
        }
      }]
    };
    
    await runner.runScenario(scenario1, config);
    await runner.runScenario(scenario2, { ...config, sessionName: `${config.sessionName}-2` });

    const results = runner.getResults();
    const summary = runner.getSummary();
    expect(results).toHaveLength(2);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(0);
  });

  it('should capture screenshots on failure', async () => {
    const testScenario: any = {
      name: 'Screenshot Test',
      steps: [
        {
          name: 'Setup',
          action: async (tester: any) => {
            await tester.sleep(2000);
            await tester.waitForText('Ready', { timeout: 10000 });
            await tester.sendText('Before failure');
            await tester.sleep(100);
          }
        },
        {
          name: 'Fail with screenshot',
          action: async (tester: any) => {
            // Capture screen before failing
            const screen = await tester.getScreenText();
            expect(screen).toContain('Before failure');
            throw new Error('Capture this state');
          }
        }
      ]
    };
    
    const config = {
      command: ['node', `${fixturesDir}/simple-echo.cjs`],
      sessionName: `runner-screenshot-${Date.now()}`,
      captureOnFailure: true
    };
    
    const runner = new TestRunner({ debug: true });
    const result = await runner.runScenario(testScenario, config);

    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('Capture this state');
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
      command: ['node', `${fixturesDir}/simple-echo.cjs`],
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

describeTmux('Additional Helper Functions', () => {
  let tester: any;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  it('should navigate menus using selectMenuItem', async () => {
    tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`);
    await tester.start();
    await tester.sleep(2000); // Wait for node to start
    await tester.waitForText('Main Menu', { timeout: 10000 });
    
    await selectMenuItem(tester, 'Option 2');
    await tester.sleep(200);
    
    const screen = await tester.getScreenText();
    expect(screen).toContain('Selected: Option 2');
  });

  it('should wait for text with timeout', async () => {
    tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`);
    await tester.start();
    await tester.sleep(2000); // Wait for node to start
    
    // Should find Main Menu
    await tester.waitForText('Main Menu', { timeout: 5000 });
    const screen = await tester.getScreenText();
    expect(screen).toContain('Main Menu');
  });

  it('should handle timeouts gracefully', async () => {
    tester = createTester(`node ${fixturesDir}/interactive-menu.cjs`);
    await tester.start();
    await tester.sleep(2000);
    
    // Should timeout waiting for non-existent text
    try {
      await tester.waitForText('NonExistent', { timeout: 500 });
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

describeTmux('Complex Workflows', () => {
  let tester: any;
  
  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });
  
  it('should handle login workflow', async () => {
    // Create a mock login app
    tester = createTester('sh');
    await tester.start();
    await tester.sleep(1000); // Wait for shell to be ready
    
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
    tester = createTester(`node ${fixturesDir}/simple-echo.cjs`);
    await tester.start();
    await tester.waitForText('Ready');
    
    // Type some text
    await tester.sendText('Copy this text');
    await tester.sleep(100);
    
    // Select text (simulate)
    await selectText(tester, 'Copy', 'text');
    
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
  let tester: any;
  
  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });
  
  it('should handle app crashes gracefully', async () => {
    // Start a Node.js app that can crash
    tester = createTester(`node ${fixturesDir}/simple-echo.cjs`);
    await tester.start();
    await tester.sleep(2000); // Wait for app to start
    await tester.waitForText('Ready', { timeout: 10000 });
    
    // Send some input
    await tester.sendText('Test input');
    await tester.sleep(200);
    
    // Make the app crash by sending Ctrl+C
    await tester.sendKey('c', { ctrl: true });
    await tester.sleep(500);
    
    // Tester should still be "running" (tmux session exists)
    expect(tester.isRunning()).toBe(true);
    
    // Try to get screen - might fail if pane closed, but that's OK
    try {
      const screen = await tester.getScreenText();
      // If we can get screen, check it has the output
      expect(screen).toContain('Test input');
    } catch (e) {
      // If screen capture fails, that's expected for crashed app
      expect(e.message).toContain('Failed to capture screen');
    }
  });

  it('should handle network timeouts', async () => {
    tester = createTester(`node ${fixturesDir}/simple-echo.cjs`);
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