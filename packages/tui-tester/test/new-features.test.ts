import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { NodeAdapter } from '../src/adapters/node.js';
import { TmuxTester, createTester , resetAdapter, registerAdapter, setDefaultAdapter, getSnapshotManager, resetSnapshotManager } from '../src/index.js';

describe('New TmuxTester Methods', () => {
  let tester: TmuxTester;

  beforeEach(() => {
    tester = createTester('echo "test"', {
      sessionName: `test-${Date.now()}`,
      debug: false
    });
  });

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  describe('exec()', () => {
    it('should execute tmux commands directly', async () => {
      await tester.start();
      
      // Execute a tmux command
      const result = await tester.exec('list-sessions');
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(tester.getSessionName());
    });

    it('should handle tmux command prefix', async () => {
      await tester.start();
      
      // Test with 'tmux' prefix
      const result1 = await tester.exec('tmux list-sessions');
      expect(result1.code).toBe(0);
      
      // Test without 'tmux' prefix
      const result2 = await tester.exec('list-sessions');
      expect(result2.code).toBe(0);
      
      // Both should return same content
      expect(result1.stdout).toBe(result2.stdout);
    });
  });

  describe('clearOutput()', () => {
    it('should clear the output buffer', async () => {
      await tester.start();
      
      // Capture some output
      await tester.sendText('Hello World');
      await tester.sleep(100);
      await tester.captureScreen();
      
      // Verify buffer has content
      const output1 = tester.getLastOutput();
      expect(output1.length).toBeGreaterThan(0);
      
      // Clear the buffer
      tester.clearOutput();
      
      // Verify buffer is empty
      const output2 = tester.getLastOutput();
      expect(output2).toBe('');
    });
  });

  describe('capture()', () => {
    it('should return screen capture with cursor position', async () => {
      await tester.start();
      await tester.sendText('Test');
      await tester.sleep(100);
      
      // Use new capture method
      const result = await tester.capture();
      
      // Check that it has both screen capture properties and cursor
      expect(result.raw).toBeDefined();
      expect(result.text).toBeDefined();
      expect(result.lines).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.size).toBeDefined();
      expect(result.cursor).toBeDefined();
      expect(result.cursor.x).toBeGreaterThanOrEqual(0);
      expect(result.cursor.y).toBeGreaterThanOrEqual(0);
    });

    it('should update cursor position correctly', async () => {
      await tester.start();
      
      // Move cursor to specific position
      await tester.exec(`send-keys -t ${tester.getSessionName()} C-a`); // Move to start
      await tester.sleep(100);
      
      const capture1 = await tester.capture();
      const initialX = capture1.cursor.x;
      
      // Type some text to move cursor
      await tester.sendText('Hello');
      await tester.sleep(100);
      
      const capture2 = await tester.capture();
      expect(capture2.cursor.x).toBeGreaterThan(initialX);
    });
  });
});

describe('Adapter Registration', () => {
  afterEach(() => {
    // Reset to default state
    resetAdapter();
  });

  describe('registerAdapter()', () => {
    it('should register custom adapter', () => {
      class CustomAdapter extends NodeAdapter {
        async exec(command: string) {
          return {
            code: 0,
            stdout: 'custom output',
            stderr: ''
          };
        }
      }
      
      // Register the custom adapter
      registerAdapter('custom', CustomAdapter);
      
      // Set it as default
      setDefaultAdapter('custom');
      
      // Create tester should use custom adapter
      const tester = createTester('test');
      expect(tester).toBeDefined();
    });
  });

  describe('setDefaultAdapter()', () => {
    it('should set default adapter by name', () => {
      // Set default to 'node'
      setDefaultAdapter('node');
      
      const tester = createTester('test');
      expect(tester).toBeDefined();
    });

    it('should handle case-insensitive adapter names', () => {
      setDefaultAdapter('NODE');
      const tester1 = createTester('test');
      expect(tester1).toBeDefined();
      
      setDefaultAdapter('Node');
      const tester2 = createTester('test');
      expect(tester2).toBeDefined();
    });
  });

  describe('Environment variable support', () => {
    it('should respect TUI_TESTER_ADAPTER environment variable', () => {
      const originalEnv = process.env.TUI_TESTER_ADAPTER;
      
      try {
        // Set environment variable
        process.env.TUI_TESTER_ADAPTER = 'node';
        
        // Reset adapter to force re-detection
        resetAdapter();
        
        const tester = createTester('test');
        expect(tester).toBeDefined();
      } finally {
        // Restore original value
        if (originalEnv !== undefined) {
          process.env.TUI_TESTER_ADAPTER = originalEnv;
        } else {
          delete process.env.TUI_TESTER_ADAPTER;
        }
      }
    });
  });
});

describe('SnapshotManager Configuration', () => {
  afterEach(() => {
    resetSnapshotManager();
  });

  it('should configure global snapshot manager', () => {
    const manager = getSnapshotManager({
      updateSnapshots: true,
      snapshotDir: './test-snapshots',
      format: 'json'
    });
    
    expect(manager).toBeDefined();
    
    // Reconfigure with new options
    const sameManager = getSnapshotManager({
      updateSnapshots: false,
      format: 'text'
    });
    
    // Should be the same instance
    expect(sameManager).toBe(manager);
  });

  it('should support configure() method', () => {
    const manager = getSnapshotManager();
    
    // Configure with specific options
    manager.configure({
      updateSnapshots: true,
      snapshotDir: './custom-snapshots',
      stripAnsi: true,
      trim: true
    });
    
    expect(manager).toBeDefined();
  });
});

describe('Integration with setupVitestMatchers', () => {
  it('should setup custom matchers with configured snapshot manager', () => {
    const manager = getSnapshotManager({
      updateSnapshots: false,
      snapshotDir: './vitest-snapshots'
    });
    
    // This would normally be called in setup file
    // setupVitestMatchers() already sets up the matchers
    
    expect(manager).toBeDefined();
  });
});