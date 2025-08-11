import { promisify } from 'util';
import { exec } from 'child_process';
import { afterAll, beforeAll, afterEach, beforeEach } from 'vitest';

const execAsync = promisify(exec);

// Track active sessions for cleanup
const activeSessions = new Set<string>();

// Helper to kill tmux sessions with retries
async function killTmuxSession(sessionName: string, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await execAsync(`tmux kill-session -t ${sessionName} 2>/dev/null`);
      activeSessions.delete(sessionName);
      return;
    } catch {
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

// Helper to clean all test sessions
async function cleanAllTestSessions(): Promise<void> {
  try {
    const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""');
    const sessions = stdout
      .split('\n')
      .filter(line => line.includes('test-') || line.includes('tui-test') || line.includes('minimal-'))
      .map(line => line.split(':')[0])
      .filter(Boolean);
    
    await Promise.all(sessions.map(session => killTmuxSession(session)));
  } catch {
    // No sessions to clean
  }
}

// Global setup to ensure tmux is available and clean
beforeAll(async () => {
  // Ensure tmux is in PATH
  process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:${process.env.PATH}`;
  
  // Check if tmux is available
  try {
    await execAsync('which tmux');
  } catch {
    console.warn('tmux not found in PATH, tests will be skipped');
    return;
  }
  
  // Kill any leftover test sessions from previous runs
  await cleanAllTestSessions();
  
  // Kill tmux server if no sessions remain (ensures clean state)
  try {
    const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""');
    if (!stdout.trim()) {
      await execAsync('tmux kill-server 2>/dev/null || true');
    }
  } catch {
    // Server already dead or no sessions
  }
  
  console.log('Test environment setup complete');
}, 30000); // 30 second timeout for setup

// Track session per test for targeted cleanup
beforeEach(({ task }) => {
  // Store test name for session tracking
  if (task) {
    (global as any).__currentTestName = task.name;
  }
});

// Clean up after each test to prevent hanging sessions
afterEach(async () => {
  // Kill any test sessions that might be hanging
  await cleanAllTestSessions();
  
  // Additional cleanup for any tracked sessions
  if (activeSessions.size > 0) {
    await Promise.all(Array.from(activeSessions).map(session => killTmuxSession(session)));
  }
  
  // Clear the session tracking
  activeSessions.clear();
}, 10000); // 10 second timeout for cleanup

// Final cleanup
afterAll(async () => {
  // Kill ALL test sessions one more time
  await cleanAllTestSessions();
  
  // Final attempt to clean tmux server
  try {
    const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""');
    if (!stdout.trim() || stdout.split('\n').every(line => 
      line.includes('test-') || line.includes('tui-test') || line.includes('minimal-')
    )) {
      // Only kill server if all remaining sessions are test sessions
      await execAsync('tmux kill-server 2>/dev/null || true');
    }
  } catch {
    // Server cleanup failed, not critical
  }
  
  console.log('Test cleanup complete');
}, 30000); // 30 second timeout for cleanup

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.CI = 'false'; // Prevent CI-specific behavior during local tests

// Increase timeout for integration tests
if (process.argv.some(arg => arg.includes('integration'))) {
  process.env.TEST_TIMEOUT = '30000';
}

// Export helper for tests to register their sessions
export function registerSession(sessionName: string): void {
  activeSessions.add(sessionName);
}

// Export helper for manual cleanup
export async function cleanupSession(sessionName: string): Promise<void> {
  await killTmuxSession(sessionName);
}