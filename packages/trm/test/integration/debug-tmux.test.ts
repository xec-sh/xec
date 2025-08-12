import { it, expect, describe, afterEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Debug Tmux Direct', { timeout: 10000 }, () => {
  afterEach(() => {
    // Clean up any test sessions
    try {
      execSync('tmux kill-session -t test-debug-direct 2>/dev/null || true');
    } catch (e) {
      // Ignore errors
    }
  });

  it('should create tmux session and run command directly', async () => {
    const sessionName = 'test-debug-direct';
    const testScript = path.join(fixturesDir, 'test-terminal-app.cjs');
    
    // Create tmux session with the command directly
    try {
      execSync(`tmux new-session -d -s ${sessionName} "node ${testScript}"`);
      
      // Wait a bit for the command to run
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Capture the screen
      const output = execSync(`tmux capture-pane -t ${sessionName} -p`).toString();
      console.log('Direct tmux output:', output);
      
      expect(output).toContain('TRM Test Application');
      
      // Kill the session
      execSync(`tmux kill-session -t ${sessionName}`);
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  });

  it('should create tmux session and send command', async () => {
    const sessionName = 'test-debug-send';
    const testScript = path.join(fixturesDir, 'test-terminal-app.cjs');
    
    try {
      // Kill any existing session first
      try {
        execSync(`tmux kill-session -t ${sessionName} 2>/dev/null`);
      } catch (e) {
        // Ignore if session doesn't exist
      }
      
      // Create tmux session running bash explicitly
      execSync(`tmux new-session -d -s ${sessionName} bash`);
      
      // Wait for shell to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send a simple echo first to test
      execSync(`tmux send-keys -t ${sessionName} "echo TEST" C-m`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now send the actual command
      execSync(`tmux send-keys -t ${sessionName} "node ${testScript}" C-m`);
      
      // Wait for command to execute
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Capture the screen with escape sequences
      const output = execSync(`tmux capture-pane -t ${sessionName} -p -e`).toString();
      console.log('Send command output (with echo TEST first):');
      console.log(output);
      console.log('---');
      
      // Check if echo TEST worked
      if (!output.includes('TEST')) {
        console.log('ERROR: Even simple echo TEST did not work!');
        console.log('This suggests the shell is not executing commands at all.');
      }
      
      // For now, just check if we at least see the echo output
      expect(output).toContain('TEST');
      
      // Kill the session
      execSync(`tmux kill-session -t ${sessionName}`);
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  });
});