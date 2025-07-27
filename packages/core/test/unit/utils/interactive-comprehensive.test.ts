import { platform } from 'os';
import { existsSync } from 'fs';
import { it, expect, describe, afterEach } from '@jest/globals';

// Import the real function directly
import { createInteractiveSession } from '../../../src/utils/interactive-process.js';

// Helper to check if a command exists
function commandExists(cmd: string): boolean {
  if (platform() === 'win32') {
    return false; // Skip Windows for now
  }
  
  // Common command paths
  const paths = ['/bin/', '/usr/bin/', '/usr/local/bin/', '/opt/homebrew/bin/'];
  return paths.some(path => existsSync(path + cmd));
}

describe('Interactive Utility Comprehensive Tests', () => {
  const activeSessions: any[] = [];

  afterEach(async () => {
    // Clean up all active sessions
    for (const session of activeSessions) {
      try {
        await session.close(true);
      } catch {
        // Ignore errors during cleanup
      }
    }
    activeSessions.length = 0;
  });

  describe('Session Creation', () => {
    it('should create interactive session with defaults', async () => {
      const session = createInteractiveSession('echo "hello"');
      activeSessions.push(session);
      
      expect(session).toBeDefined();
      expect(session.send).toBeDefined();
      expect(session.expect).toBeDefined();
      expect(session.close).toBeDefined();
      
      const result = await session.expect('hello');
      expect(result).toContain('hello');
    });

    it('should create session with custom options', async () => {
      const options = {
        cwd: '/tmp',
        env: { ...process.env, TEST_VAR: 'custom_value' },
        timeout: 2000
      };
      
      // Use echo with the env var
      const session = createInteractiveSession('sh', options);
      activeSessions.push(session);
      
      // Send commands
      await session.send('pwd');
      const pwdResult = await session.expect('/tmp');
      expect(pwdResult).toContain('/tmp');
      
      await session.send('echo $TEST_VAR');
      const envResult = await session.expect('custom_value');
      expect(envResult).toContain('custom_value');
      
      await session.send('exit');
    });

    it('should handle command with arguments', async () => {
      const session = createInteractiveSession('echo test arguments');
      activeSessions.push(session);
      
      const result = await session.expect('test arguments');
      expect(result).toContain('test arguments');
    });

    it('should handle spawn errors', async () => {
      // Create session with non-existent command
      const session = createInteractiveSession('/nonexistent/command/that/should/not/exist');
      activeSessions.push(session);
      
      // Should get an error when trying to interact
      let errorOccurred = false;
      session.onError(() => {
        errorOccurred = true;
      });
      
      // Wait a bit for error to occur
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(errorOccurred).toBe(true);
    });
  });

  describe('Sending Commands', () => {
    it('should send simple command', async () => {
      const session = createInteractiveSession('cat');
      activeSessions.push(session);
      
      await session.send('test line');
      const result = await session.expect('test line');
      
      expect(result).toContain('test line');
    });

    it('should send command without newline', async () => {
      const session = createInteractiveSession('cat');
      activeSessions.push(session);
      
      await session.send('partial', false);
      await session.send(' line');
      
      const result = await session.expect('partial line');
      expect(result).toContain('partial line');
    });

    it('should handle sequential sends', async () => {
      const session = createInteractiveSession('cat');
      activeSessions.push(session);
      
      await session.send('line1');
      await session.send('line2');
      await session.send('line3');
      
      const result = await session.expect('line3');
      expect(result).toContain('line1');
      expect(result).toContain('line2');
      expect(result).toContain('line3');
    });

    it('should queue multiple sends', async () => {
      const session = createInteractiveSession('cat');
      activeSessions.push(session);
      
      // Send multiple commands quickly
      await Promise.all([
        session.send('cmd1'),
        session.send('cmd2'),
        session.send('cmd3')
      ]);
      
      const result = await session.expect('cmd3');
      expect(result).toContain('cmd1');
      expect(result).toContain('cmd2');
      expect(result).toContain('cmd3');
    });
  });

  describe('Expecting Output', () => {
    it('should match expected pattern', async () => {
      const session = createInteractiveSession('echo "test prompt>"');
      activeSessions.push(session);
      
      const result = await session.expect(/prompt>/);
      expect(result).toContain('prompt>');
    });

    it('should timeout when pattern not found', async () => {
      const session = createInteractiveSession('echo "something else"', { timeout: 100 });
      activeSessions.push(session);
      
      await expect(session.expect(/prompt>/)).rejects.toThrow(/timeout/i);
    });

    it('should match string pattern', async () => {
      const session = createInteractiveSession('echo "Welcome to bash" && echo "$ "');
      activeSessions.push(session);
      
      const result = await session.expect('$ ');
      expect(result).toContain('$ ');
    });

    it('should handle multiple patterns', async () => {
      const session = createInteractiveSession('echo "Password: "');
      activeSessions.push(session);
      
      const result = await session.expect([/Username:/, /Password:/]);
      expect(result).toContain('Password:');
    });

    it('should accumulate output until match', async () => {
      const session = createInteractiveSession('printf "line1\nline2\nprompt>"');
      activeSessions.push(session);
      
      const result = await session.expect(/prompt>/);
      expect(result).toContain('line1');
      expect(result).toContain('line2');
      expect(result).toContain('prompt>');
    });
  });

  describe('Interactive Workflows', () => {
    it('should handle interactive shell', async () => {
      if (!commandExists('bash')) {
        console.log('Skipping test: bash not available');
        return;
      }
      
      const session = createInteractiveSession('bash', { timeout: 2000 });
      activeSessions.push(session);
      
      // Send a command and wait for output
      await session.send('echo "test output"');
      const result = await session.expect('test output');
      expect(result).toContain('test output');
      
      // Send exit command
      await session.send('exit');
    });

    it('should handle interactive REPL', async () => {
      // Use node.js as it's more commonly available than Python
      if (!commandExists('node')) {
        console.log('Skipping test: node not available');
        return;
      }
      
      const session = createInteractiveSession('node -i', { timeout: 5000 });
      activeSessions.push(session);
      
      // Node might show version info first, wait for it to settle
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send calculation
      await session.send('2 + 2');
      
      // Wait for result
      const result = await session.expect('4');
      expect(result).toContain('4');
      
      // Exit REPL
      await session.send('.exit');
    });

    it('should handle interactive calculator', async () => {
      // Use bc (basic calculator) if available
      if (!commandExists('bc')) {
        console.log('Skipping test: bc not available');
        return;
      }
      
      const session = createInteractiveSession('bc -l', { timeout: 2000 });
      activeSessions.push(session);
      
      // Send calculation
      await session.send('2 + 2');
      const result1 = await session.expect('4');
      expect(result1).toContain('4');
      
      // Send another calculation
      await session.send('10 / 3');
      const result2 = await session.expect('3.33');
      expect(result2).toContain('3.33');
      
      // Quit bc
      await session.send('quit');
    });
  });

  describe('Error Handling', () => {
    it('should handle stderr output', async () => {
      const session = createInteractiveSession('sh');
      activeSessions.push(session);
      const stderrData: string[] = [];
      
      session.onStderr((data: string) => {
        stderrData.push(data);
      });
      
      // Send command that writes to stderr
      await session.send('echo error message >&2');
      
      // Send another command to stdout to ensure stderr was processed
      await session.send('echo done');
      await session.expect('done');
      
      expect(stderrData.some(d => d.includes('error message'))).toBe(true);
      
      await session.send('exit');
    });

    it('should handle process exit', async () => {
      const session = createInteractiveSession('sh');
      activeSessions.push(session);
      let exitCode: number | null = null;
      const exitPromise = new Promise<void>(resolve => {
        session.onExit((code: number | null) => {
          exitCode = code;
          resolve();
        });
      });
      
      // Send exit command with specific code
      await session.send('exit 42');
      
      // Wait for process to exit
      await exitPromise;
      
      expect(exitCode).toBe(42);
    });

    it('should handle command not found', async () => {
      const session = createInteractiveSession('bash');
      activeSessions.push(session);
      const stderrData: string[] = [];
      
      session.onStderr((data: string) => {
        stderrData.push(data);
      });
      
      // Send non-existent command
      await session.send('nonexistentcommand12345');
      
      // Wait for error
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(stderrData.some(d => d.includes('command not found') || d.includes('not found'))).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should close session gracefully', async () => {
      const session = createInteractiveSession('sleep 10');
      // Don't add to activeSessions since we're testing close
      
      // Wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Close gracefully
      await session.close();
      
      // Session should be closed
      await expect(session.expect('never', { timeout: 100 })).rejects.toThrow();
    });

    it('should force close session', async () => {
      const session = createInteractiveSession('sleep 10');
      // Don't add to activeSessions since we're testing close
      
      // Wait a bit for process to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force close
      await session.close(true);
      
      // Session should be closed
      await expect(session.expect('never', { timeout: 100 })).rejects.toThrow();
    });

    it('should handle session with exit handler', async () => {
      const session = createInteractiveSession('echo done && exit');
      let didExit = false;
      
      session.onExit(() => {
        didExit = true;
      });
      
      // Wait for natural exit
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(didExit).toBe(true);
    });

    it('should handle multiple close calls', async () => {
      const session = createInteractiveSession('cat');
      // Don't add to activeSessions since we're testing close
      
      await session.close();
      
      // Second call should not throw
      await expect(session.close()).resolves.not.toThrow();
    });
  });

  describe('Advanced Features', () => {
    it('should support custom encoding', async () => {
      const session = createInteractiveSession('echo "こんにちは"', { encoding: 'utf8' });
      activeSessions.push(session);
      
      const result = await session.expect('こんにちは');
      expect(result).toContain('こんにちは');
    });

    it('should handle binary data with xxd', async () => {
      if (!commandExists('xxd')) {
        console.log('Skipping test: xxd not available');
        return;
      }
      
      const session = createInteractiveSession('xxd');
      activeSessions.push(session);
      const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      
      session.sendRaw(binaryData);
      
      // Send EOF to xxd
      await session.close();
      
      // xxd should have processed the binary data
      // Note: We can't easily verify the output without complex parsing
    });

    it('should support timeout per operation', async () => {
      const session = createInteractiveSession('cat', { timeout: 5000 });
      activeSessions.push(session);
      
      // Override timeout for specific expect
      await expect(
        session.expect('never appears', { timeout: 100 })
      ).rejects.toThrow(/timeout/i);
    });

    it('should capture all output', async () => {
      const session = createInteractiveSession('sh');
      activeSessions.push(session);
      const allOutput: string[] = [];
      
      session.onData((data: string) => {
        allOutput.push(data);
      });
      
      // Send commands
      await session.send('echo stdout1');
      await session.send('echo stderr1 >&2');
      await session.send('echo stdout2');
      await session.send('echo done');
      
      // Wait for final output
      await session.expect('done');
      
      const combinedOutput = allOutput.join('');
      expect(combinedOutput).toContain('stdout1');
      expect(combinedOutput).toContain('stdout2');
      
      await session.send('exit');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle interactive script with prompts', async () => {
      // Create a simple interactive script that reads input
      const session = createInteractiveSession('sh');
      activeSessions.push(session);
      
      // Send commands one by one
      await session.send('echo -n "What is your name? "');
      await session.expect('What is your name?');
      
      await session.send('echo "Alice"');
      await session.expect('Alice');
      
      await session.send('echo "Hello, Alice!"');
      const greeting = await session.expect('Hello, Alice!');
      expect(greeting).toContain('Hello, Alice!');
      
      await session.send('exit');
    });

    it('should handle interactive confirmation prompt', async () => {
      // Use a simple echo-based confirmation
      const session = createInteractiveSession('cat');
      activeSessions.push(session);
      
      // Send prompt
      await session.send('This will delete all files.');
      await session.expect('This will delete all files.');
      
      await session.send('Are you sure? (yes/no):');
      await session.expect('Are you sure?');
      
      // Send answer
      await session.send('no');
      await session.expect('no');
      
      await session.send('Operation cancelled.');
      const result = await session.expect('Operation cancelled.');
      expect(result).toContain('Operation cancelled.');
      
      await session.close();
    });

    it('should handle multi-step interactive process', async () => {
      if (!commandExists('bc')) {
        console.log('Skipping test: bc not available');
        return;
      }
      
      const session = createInteractiveSession('bc -l');
      activeSessions.push(session);
      
      // Perform multiple calculations
      const calculations = [
        { expr: '10 + 20', expected: '30' },
        { expr: '100 / 4', expected: '25' },
        { expr: 'sqrt(16)', expected: '4' }
      ];
      
      for (const calc of calculations) {
        await session.send(calc.expr);
        const result = await session.expect(calc.expected);
        expect(result).toContain(calc.expected);
      }
      
      await session.send('quit');
    });
  });
});