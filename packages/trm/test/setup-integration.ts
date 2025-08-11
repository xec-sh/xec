/**
 * Setup file for integration tests
 */

import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { afterAll, beforeAll } from 'vitest';

const execAsync = promisify(exec);

// Ensure tmux is available
beforeAll(async () => {
  try {
    // Check if tmux is installed
    const { stdout } = await execAsync('which tmux');
    if (!stdout.trim()) {
      throw new Error('tmux is not installed. Please install tmux to run integration tests.');
    }
    
    // Build the library
    console.log('Building TRM library...');
    const projectRoot = path.join(__dirname, '..');
    await execAsync('npm run build', { cwd: projectRoot });
    console.log('Build complete');
    
    // Ensure tui-tester is available
    try {
      require.resolve('@xec-sh/tui-tester');
    } catch (e) {
      console.log('Installing tui-tester...');
      await execAsync('npm install @xec-sh/tui-tester', { cwd: projectRoot });
    }
  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  }
});

// Clean up any remaining tmux sessions after all tests
afterAll(async () => {
  try {
    // Kill any test tmux sessions
    await execAsync('tmux ls | grep "trm-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {} 2>/dev/null || true');
  } catch (e) {
    // Ignore errors - sessions might not exist
  }
});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.FORCE_COLOR = '1'; // Enable colors in tests

// Mock global functions if needed for tests
if (typeof global.gc === 'undefined') {
  global.gc = () => {
    // Mock GC for performance tests
  };
}