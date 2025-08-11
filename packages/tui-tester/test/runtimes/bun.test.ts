/**
 * Bun Runtime Tests
 * Specific tests for Bun runtime compatibility
 */

import { test, expect, describe, afterAll, beforeAll } from 'bun:test';

import { TmuxTester } from '../../src/tmux-tester';
import { BunAdapter } from '../../src/adapters/bun';
import { delay, isCommandAvailable } from '../../src/core/utils';

// Only run if we're in Bun runtime
const isBun = typeof Bun !== 'undefined';
const describeBun = isBun ? describe : describe.skip;

describeBun('Bun Runtime Support', () => {
  describe('BunAdapter Specific Features', () => {
    let adapter: BunAdapter;

    beforeAll(() => {
      adapter = new BunAdapter();
    });

    afterAll(async () => {
      await adapter.cleanup();
    });

    test('should use Bun.spawn for process creation', async () => {
      const proc = await adapter.spawn('echo', ['Bun test']);
      expect(proc).toBeDefined();
      expect(proc.pid).toBeGreaterThan(0);
      
      await adapter.kill(proc);
    });

    test('should handle Bun.write for stdin', async () => {
      // Use echo instead of cat for simpler testing
      const proc = await adapter.spawn('sh', ['-c', 'read line && echo "Got: $line"']);
      
      const input = 'Bun input test\n';
      await adapter.write(proc, input);
      
      await delay(100);
      const output = await adapter.read(proc);
      expect(output).toContain('Got: Bun input test');
      
      await adapter.kill(proc);
    });

    test('should handle Bun environment variables', async () => {
      const proc = await adapter.spawn('sh', ['-c', 'echo $BUN_VERSION'], {
        env: { ...Bun.env, BUN_VERSION: 'test-version' }
      });
      
      await delay(100);
      const output = await adapter.read(proc);
      expect(output).toContain('test-version');
      
      await adapter.kill(proc);
    });

    test('should handle Bun file operations', async () => {
      // Use echo to write to file directly
      const content = 'Bun file test content';
      const proc = await adapter.spawn('sh', ['-c', `echo '${content}' > /tmp/bun-test.txt`]);
      
      await delay(100);
      await adapter.kill(proc);
      
      // Read the file using Bun API
      const file = Bun.file('/tmp/bun-test.txt');
      const savedContent = await file.text();
      expect(savedContent).toContain(content);
    });

    test('should handle Bun ArrayBuffer/Uint8Array', async () => {
      // Use echo to test binary data handling
      const proc = await adapter.spawn('sh', ['-c', 'read line && echo "Buffer: $line"']);
      
      const encoder = new TextEncoder();
      const buffer = encoder.encode('Bun buffer test\n');
      
      await adapter.write(proc, buffer);
      
      await delay(100);
      const output = await adapter.read(proc);
      expect(output).toContain('Buffer: Bun buffer test');
      
      await adapter.kill(proc);
    });

    test('should handle concurrent processes', async () => {
      const procs = await Promise.all([
        adapter.spawn('echo', ['Process 1']),
        adapter.spawn('echo', ['Process 2']),
        adapter.spawn('echo', ['Process 3'])
      ]);
      
      expect(procs).toHaveLength(3);
      procs.forEach(proc => expect(proc.pid).toBeGreaterThan(0));
      
      await Promise.all(procs.map(proc => adapter.kill(proc)));
    });
  });

  describe('TmuxTester with Bun', () => {
    describe('Tmux Integration', () => {
      let tester: TmuxTester | null = null;

      afterAll(async () => {
        if (tester) {
          await tester.stop();
        }
      });

      test('should work with Bun runtime', async () => {
        const hasTmux = await isCommandAvailable('tmux');
        if (!hasTmux) {
          console.log('Skipping test - tmux not available');
          return;
        }
        tester = new TmuxTester({
          command: ['bun', '--version'],
          runtime: 'bun'
        });

        await tester.start();
        await delay(100);

        const content = await tester.getScreenContent();
        expect(content).toMatch(/\d+\.\d+\.\d+/); // Version number
      });

      test('should run Bun scripts', async () => {
        const hasTmux = await isCommandAvailable('tmux');
        if (!hasTmux) {
          console.log('Skipping test - tmux not available');
          return;
        }
        // Create a temporary Bun script
        const script = `
          console.log('Hello from Bun!');
          console.log('Runtime:', typeof Bun !== 'undefined' ? 'Bun' : 'Not Bun');
        `;
        
        await Bun.write('/tmp/test-script.js', script);

        tester = new TmuxTester({
          command: ['bun', '/tmp/test-script.js'],
          runtime: 'bun'
        });

        await tester.start();
        await delay(200);

        const content = await tester.getScreenContent();
        expect(content).toContain('Hello from Bun!');
        expect(content).toContain('Runtime: Bun');
      });

      test('should handle Bun REPL', async () => {
        const hasTmux = await isCommandAvailable('tmux');
        if (!hasTmux) {
          console.log('Skipping test - tmux not available');
          return;
        }
        tester = new TmuxTester({
          command: ['bun', 'repl'],
          runtime: 'bun'
        });

        await tester.start();
        await tester.waitForText('>', { timeout: 3000 });

        await tester.typeText('1 + 1');
        await tester.sendKey('enter');
        await delay(100);

        const content = await tester.getScreenContent();
        expect(content).toContain('2');

        await tester.typeText('process.versions.bun');
        await tester.sendKey('enter');
        await delay(100);

        const content2 = await tester.getScreenContent();
        expect(content2).toMatch(/'\d+\.\d+\.\d+'/);
      });
    });
  });

  describe('Bun-specific Utilities', () => {
    test('should detect Bun runtime correctly', () => {
      const runtime = typeof Bun !== 'undefined' ? 'bun' : 'other';
      expect(runtime).toBe('bun');
    });

    test('should access Bun.env', () => {
      expect(Bun.env).toBeDefined();
      expect(typeof Bun.env).toBe('object');
    });

    test('should use Bun performance APIs', () => {
      const start = Bun.nanoseconds();
      
      // Do some work
      for (let i = 0; i < 1000; i++) {
        Math.sqrt(i);
      }
      
      const end = Bun.nanoseconds();
      const elapsed = end - start;
      
      expect(elapsed).toBeGreaterThan(0);
    });

    test('should handle Bun.sleep', async () => {
      const start = Date.now();
      await Bun.sleep(50);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('File System Operations with Bun', () => {
    test('should save and load snapshots using Bun APIs', async () => {
      const content = 'Bun snapshot content';
      const path = '/tmp/bun-snapshot.txt';
      
      // Save using Bun
      await Bun.write(path, content);
      
      // Load using Bun
      const file = Bun.file(path);
      const loaded = await file.text();
      
      expect(loaded).toBe(content);
    });

    test('should handle binary snapshots', async () => {
      const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const path = '/tmp/bun-binary.dat';
      
      await Bun.write(path, buffer);
      
      const file = Bun.file(path);
      const loaded = await file.arrayBuffer();
      const loadedArray = new Uint8Array(loaded);
      
      expect(loadedArray).toEqual(buffer);
    });
  });

  describe('Network Operations with Bun', () => {
    test('should create HTTP server for testing', async () => {
      const server = Bun.serve({
        port: 0, // Random port
        fetch(req) {
          return new Response('Test response');
        }
      });

      const response = await fetch(`http://localhost:${server.port}`);
      const text = await response.text();
      
      expect(text).toBe('Test response');
      
      server.stop();
    });

    test('should test WebSocket connections', async () => {
      const messages: string[] = [];
      
      const server = Bun.serve({
        port: 0,
        fetch(req, server) {
          if (server.upgrade(req)) {
            return; // WebSocket upgraded
          }
          return new Response('Not a WebSocket');
        },
        websocket: {
          message(ws, message) {
            messages.push(message.toString());
            ws.send('Echo: ' + message);
          }
        }
      });

      const ws = new WebSocket(`ws://localhost:${server.port}`);
      
      await new Promise((resolve) => {
        ws.onopen = () => {
          ws.send('Test message');
        };
        ws.onmessage = (event) => {
          expect(event.data).toBe('Echo: Test message');
          ws.close();
          resolve(undefined);
        };
      });
      
      expect(messages).toContain('Test message');
      server.stop();
    });
  });

  describe('Performance Benchmarks', () => {
    test('should benchmark TUI operations', async () => {
      const adapter = new BunAdapter();
      const iterations = 100;
      
      const start = Bun.nanoseconds();
      
      for (let i = 0; i < iterations; i++) {
        const proc = await adapter.spawn('echo', [`Test ${i}`]);
        await adapter.kill(proc);
      }
      
      const end = Bun.nanoseconds();
      const avgTime = (end - start) / iterations / 1_000_000; // Convert to ms
      
      console.log(`Average spawn/kill time: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(100); // Should be fast
    });

    test('should benchmark snapshot operations', async () => {
      const iterations = 100;
      const content = 'Test content'.repeat(100);
      
      const start = Bun.nanoseconds();
      
      for (let i = 0; i < iterations; i++) {
        const path = `/tmp/bench-${i}.txt`;
        await Bun.write(path, content);
        const file = Bun.file(path);
        await file.text();
      }
      
      const end = Bun.nanoseconds();
      const avgTime = (end - start) / iterations / 1_000_000;
      
      console.log(`Average snapshot save/load time: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(10);
    });
  });

  describe('Error Handling in Bun', () => {
    test('should handle spawn errors', async () => {
      const adapter = new BunAdapter();
      
      try {
        await adapter.spawn('nonexistentcommand12345', []);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle file errors', async () => {
      try {
        const file = Bun.file('/nonexistent/path/file.txt');
        await file.text();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle process crashes', async () => {
      const adapter = new BunAdapter();
      const proc = await adapter.spawn('sh', ['-c', 'exit 1']);
      
      await delay(100);
      
      const isAlive = await adapter.isAlive(proc);
      expect(isAlive).toBe(false);
    });
  });
});