/**
 * Advanced Example
 * Demonstrates advanced features including mouse, snapshots, and complex interactions
 */

import { it, expect, describe, afterAll, beforeAll } from 'vitest';

import { TmuxTester } from '../tmux-tester.js';
import { setupVitestMatchers } from '../integrations/vitest.js';
import { step, scenario, TestRunner } from '../helpers/test-runner.js';
import { 
  fillField,
  submitForm,
  selectText,
  clickOnText,
  navigateMenu,
  copySelection,
  selectMenuItem,
  waitForLoading,
  pasteFromClipboard,
  takeAnnotatedSnapshot
} from '../helpers/interactions.js';

import type { TesterConfig } from '../core/types.js';

// Setup Vitest matchers
setupVitestMatchers();

describe('Advanced TUI Application Tests', () => {
  let tester: TmuxTester;

  beforeAll(async () => {
    // Create tester for a complex TUI application
    tester = new TmuxTester({
      command: ['npm', 'run', 'start'],
      size: { cols: 120, rows: 40 },
      env: {
        NODE_ENV: 'test',
        COLORTERM: 'truecolor'
      },
      debug: process.env.DEBUG === 'true',
      recordingEnabled: true,
      snapshotDir: './__snapshots__'
    });

    await tester.start();
    await tester.waitForText('Ready', { timeout: 10000 });
  });

  afterAll(async () => {
    const recording = tester.stopRecording();
    console.log(`Test recording saved with ${recording.events.length} events`);
    
    await tester.stop();
  });

  describe('Menu Navigation', () => {
    it('should navigate through menu items with keyboard', async () => {
      // Navigate to menu
      await tester.sendKey('escape'); // Ensure we're at main menu
      await tester.waitForText('Main Menu');

      // Navigate through menu items
      await navigateMenu(tester, 'down', 2);
      
      // Verify selection
      const screen = await tester.captureScreen();
      expect(screen).toContainText('> Settings');
      
      // Take snapshot
      await expect(screen).toMatchTerminalSnapshot('menu-navigation');
    });

    it('should select menu item with mouse', async () => {
      // Click on menu item
      await clickOnText(tester, 'Dashboard');
      
      // Wait for dashboard to load
      await waitForLoading(tester);
      await tester.waitForText('Dashboard', { timeout: 5000 });
      
      // Verify we're on dashboard
      const screen = await tester.captureScreen();
      expect(screen).toMatchPattern(/Dashboard.*Overview/s);
    });
  });

  describe('Form Interactions', () => {
    it('should fill and submit a form', async () => {
      // Navigate to form
      await selectMenuItem(tester, 'Create New');
      await tester.waitForText('New Item Form');

      // Fill form fields
      await fillField(tester, 'Name', 'Test Item');
      await fillField(tester, 'Description', 'This is a test item');
      
      // Select dropdown option using arrow keys
      await tester.sendKey('tab'); // Move to dropdown
      await tester.sendKey('space'); // Open dropdown
      await navigateMenu(tester, 'down', 1);
      await tester.sendKey('enter'); // Select option

      // Take snapshot before submission
      const formScreen = await tester.captureScreen();
      await expect(formScreen).toMatchTerminalSnapshot('filled-form');

      // Submit form
      await submitForm(tester);
      
      // Wait for success message
      await tester.waitForText('Item created successfully', { timeout: 5000 });
      
      // Verify item appears in list
      await tester.sendKey('escape'); // Back to list
      await tester.assertScreenContains('Test Item');
    });
  });

  describe('Text Selection and Copy/Paste', () => {
    it('should select, copy and paste text', async () => {
      // Navigate to text editor
      await selectMenuItem(tester, 'Editor');
      await tester.waitForText('Text Editor');

      // Type some text
      await tester.typeText('Hello, this is a test message.');
      await tester.sendKey('enter');
      await tester.typeText('Second line of text.');

      // Select text using mouse
      await selectText(tester, 'Hello', 'message');
      
      // Copy selection
      await copySelection(tester);
      
      // Move cursor and paste
      await tester.sendKey('end');
      await tester.sendKey('enter');
      await pasteFromClipboard(tester);
      
      // Verify pasted text
      const screen = await tester.captureScreen();
      expect(screen.text.match(/Hello.*message/g)?.length).toBeGreaterThan(1);
    });
  });

  describe('Window Resizing', () => {
    it('should handle terminal resize', async () => {
      // Take snapshot before resize
      const beforeResize = await tester.captureScreen();
      expect(beforeResize).toHaveSize(120, 40);

      // Resize terminal
      await tester.resize({ cols: 80, rows: 24 });
      await tester.sleep(500); // Wait for resize to settle

      // Take snapshot after resize
      const afterResize = await tester.captureScreen();
      expect(afterResize).toHaveSize(80, 24);
      
      // Verify layout adjusted
      await expect(afterResize).toMatchTerminalSnapshot('resized-window');

      // Restore original size
      await tester.resize({ cols: 120, rows: 40 });
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle complex user workflow', async () => {
      const runner = new TestRunner({ debug: true });
      
      const complexScenario = scenario(
        'Complex User Workflow',
        [
          step(
            'Login to application',
            async (t) => {
              await t.sendKey('l', { ctrl: true }); // Clear screen
              await t.sendText('login');
              await t.sendKey('enter');
              await t.waitForText('Username:');
              await t.typeText('testuser');
              await t.sendKey('enter');
              await t.waitForText('Password:');
              await t.typeText('testpass');
              await t.sendKey('enter');
            },
            async (t) => {
              await t.assertScreenContains('Welcome, testuser');
            }
          ),
          
          step(
            'Navigate to settings',
            async (t) => {
              await selectMenuItem(t, 'Settings');
              await t.waitForText('Settings');
            },
            async (t) => {
              const screen = await t.captureScreen();
              expect(screen).toContainText('Preferences');
            }
          ),
          
          step(
            'Change theme',
            async (t) => {
              await clickOnText(t, 'Theme');
              await t.waitForText('Select Theme');
              await selectMenuItem(t, 'Dark');
            },
            async (t) => {
              await t.assertScreenContains('Theme: Dark');
            }
          ),
          
          step(
            'Save settings',
            async (t) => {
              await t.sendKey('s', { ctrl: true });
              await t.waitForText('Settings saved');
            }
          ),
          
          step(
            'Logout',
            async (t) => {
              await t.sendKey('q', { ctrl: true });
              await t.waitForText('Confirm logout?');
              await t.sendKey('y');
            },
            async (t) => {
              await t.assertScreenContains('Goodbye');
            }
          )
        ]
      );
      
      // Create a config for the scenario
      const scenarioConfig: TesterConfig = {
        command: ['node', 'advanced-app.js'],
        size: { cols: 120, rows: 40 },
        env: { NODE_ENV: 'test' }
      };
      const result = await runner.runScenario(complexScenario, scenarioConfig);
      expect(result.passed).toBe(true);
      
      // Take annotated snapshot of final state
      await takeAnnotatedSnapshot(tester, 'final-state', [
        { text: 'Logout successful', position: { x: 10, y: 5 } }
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should capture error state', async () => {
      // Trigger an error
      await tester.sendKey('x', { ctrl: true, shift: true }); // Simulate error trigger
      
      // Wait for error message
      const hasError = await tester.waitForText('Error')
        .then(() => true)
        .catch(() => false);
      
      if (hasError) {
        const errorScreen = await tester.captureScreen();
        await expect(errorScreen).toMatchTerminalSnapshot('error-state');
        
        // Recover from error
        await tester.sendKey('escape');
        await tester.waitForText('Main Menu');
      }
    });
  });

  describe('Recording and Playback', () => {
    it('should record and playback user actions', async () => {
      // Start fresh recording
      tester.startRecording();
      
      // Perform actions
      await tester.sendText('echo "Recording test"');
      await tester.sendKey('enter');
      await tester.waitForText('Recording test');
      
      // Stop recording
      const recording = tester.stopRecording();
      
      // Clear screen
      await tester.clear();
      
      // Playback recording
      await tester.playRecording(recording, 2); // 2x speed
      
      // Verify playback worked
      await tester.assertScreenContains('Recording test');
    });
  });
});

// Standalone test runner example
async function runStandaloneTests() {
  const runner = new TestRunner({
    beforeAll: async () => {
      console.log('Starting test suite...');
    },
    afterAll: async () => {
      console.log('Test suite complete.');
    },
    timeout: 30000,
    retries: 2,
    debug: true
  });

  const scenarios = [
    scenario('Quick Test', [
      step('Start app', async (t) => {
        await t.waitForText('Ready');
      }),
      step('Basic interaction', async (t) => {
        await t.sendText('test');
        await t.sendKey('enter');
      })
    ])
  ];

  await runner.runScenarios(scenarios, {
    command: ['node', 'app.js'],
    size: { cols: 80, rows: 24 }
  });

  runner.printResults();
  
  const summary = runner.getSummary();
  if (summary.failed > 0) {
    process.exit(1);
  }
}

// Export for use in other tests
export { runStandaloneTests };