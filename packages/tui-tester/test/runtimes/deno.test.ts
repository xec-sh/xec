/// <reference lib="deno.ns" />

/**
 * Deno Runtime Tests
 * Specific tests for Deno runtime compatibility
 */

// Use conditional imports based on runtime
let assert: any, assertEquals: any, assertExists: any;
let it: any, describe: any, afterAll: any, beforeAll: any;

// Check if we're in Deno runtime
const isDeno = typeof (globalThis as any).Deno !== 'undefined';

if (isDeno) {
  // Dynamic imports for Deno (these will be skipped in other runtimes)
  try {
    const assertMod = await import("https://deno.land/std@0.208.0/assert/mod.ts");
    assert = assertMod.assert;
    assertEquals = assertMod.assertEquals;
    assertExists = assertMod.assertExists;
    
    const bddMod = await import("https://deno.land/std@0.208.0/testing/bdd.ts");
    it = bddMod.it;
    describe = bddMod.describe;
    afterAll = bddMod.afterAll;
    beforeAll = bddMod.beforeAll;
  } catch {
    // Failed to import Deno modules
  }
} else {
  // Use vitest for non-Deno runtimes
  try {
    const vitest = await import('vitest');
    it = vitest.it;
    describe = vitest.describe;
    afterAll = vitest.afterAll || vitest.afterEach;
    beforeAll = vitest.beforeAll || vitest.beforeEach;
    assert = vitest.expect;
    assertEquals = (actual: any, expected: any) => vitest.expect(actual).toBe(expected);
    assertExists = (value: any) => vitest.expect(value).toBeDefined();
  } catch {
    // Vitest not available
  }
}

// Import our modules with proper extensions for Deno
import { TmuxTester } from '../../src/tmux-tester.ts';
import { DenoAdapter } from '../../src/adapters/deno.ts';
import { delay, isCommandAvailable } from '../../src/core/utils.ts';

// Only run if we're in Deno runtime and have test functions
const describeDeno = (isDeno && describe) ? describe : () => {};

describeDeno('Deno Runtime Support', () => {
  describe('DenoAdapter Specific Features', () => {
    let adapter: DenoAdapter;

    beforeAll(() => {
      adapter = new DenoAdapter();
    });

    afterAll(async () => {
      await adapter.cleanup();
    });

    it('should use Deno.Command for process creation', async () => {
      const proc = await adapter.spawn('echo', ['Deno test']);
      assertExists(proc);
      assert(proc.pid > 0);
      
      await adapter.kill(proc);
    });

    it('should handle Deno stdin/stdout', async () => {
      const proc = await adapter.spawn('cat', []);
      
      const input = 'Deno input test\n';
      await adapter.write(proc, input);
      
      await delay(50);
      const output = await adapter.read(proc);
      assert(output.includes('Deno input test'));
      
      await adapter.kill(proc);
    });

    it('should handle Deno environment variables', async () => {
      const proc = await adapter.spawn('sh', ['-c', 'echo $DENO_VERSION'], {
        env: { DENO_VERSION: 'test-version' }
      });
      
      await delay(100);
      const output = await adapter.read(proc);
      assert(output.includes('test-version'));
      
      await adapter.kill(proc);
    });

    it('should handle Deno permissions', async () => {
      if (isDeno) {
        // Request necessary permissions
        const readPerm = await (globalThis as any).Deno.permissions.request({ name: 'read' });
        const writePerm = await (globalThis as any).Deno.permissions.request({ name: 'write' });
        const runPerm = await (globalThis as any).Deno.permissions.request({ name: 'run' });
        
        assertEquals(readPerm.state, 'granted');
        assertEquals(writePerm.state, 'granted');
        assertEquals(runPerm.state, 'granted');
      } else {
        // Skip permission test in non-Deno runtimes
        assert(true);
      }
    });

    it('should handle Deno file operations', async () => {
      const proc = await adapter.spawn('sh', ['-c', 'cat > /tmp/deno-test.txt']);
      
      const content = 'Deno file test content';
      await adapter.write(proc, content);
      await adapter.write(proc, '\x04'); // EOF
      
      await delay(100);
      await adapter.kill(proc);
      
      // Read the file using Deno API or fs
      if (isDeno) {
        const savedContent = await (globalThis as any).Deno.readTextFile('/tmp/deno-test.txt');
        assert(savedContent.includes(content));
      } else {
        // Use Node fs for verification in non-Deno runtimes
        try {
          const fs = await import('fs/promises');
          const savedContent = await fs.readFile('/tmp/deno-test.txt', 'utf-8');
          assert(savedContent.includes(content));
        } catch {
          // Skip file verification in environments without fs access
          assert(true);
        }
      }
    });

    it('should handle Uint8Array buffers', async () => {
      const proc = await adapter.spawn('cat', []);
      
      const encoder = new TextEncoder();
      const buffer = encoder.encode('Deno buffer test\n');
      
      await adapter.write(proc, buffer);
      
      await delay(50);
      const output = await adapter.read(proc);
      assert(output.includes('Deno buffer test'));
      
      await adapter.kill(proc);
    });

    it('should handle concurrent processes', async () => {
      const procs = await Promise.all([
        adapter.spawn('echo', ['Process 1']),
        adapter.spawn('echo', ['Process 2']),
        adapter.spawn('echo', ['Process 3'])
      ]);
      
      assertEquals(procs.length, 3);
      procs.forEach(proc => assert(proc.pid > 0));
      
      await Promise.all(procs.map(proc => adapter.kill(proc)));
    });
  });

  describe('TmuxTester with Deno', () => {
    describe('Tmux Integration', () => {
      let tester: TmuxTester | null = null;

      afterAll(async () => {
        if (tester) {
          await tester.stop();
        }
      });

      it('should work with Deno runtime', async () => {
        const hasTmux = await isCommandAvailable('tmux');
        if (!hasTmux) {
          console.log('Skipping test - tmux not available');
          return;
        }
        tester = new TmuxTester({
          command: ['deno', '--version'],
          runtime: 'deno'
        });

        await tester.start();
        await delay(100);

        const content = await tester.getScreenContent();
        assert(content.match(/deno \d+\.\d+\.\d+/)); // Version pattern
      });

      it('should run Deno scripts', async () => {
        const hasTmux = await isCommandAvailable('tmux');
        if (!hasTmux) {
          console.log('Skipping test - tmux not available');
          return;
        }
        // Create a temporary Deno script
        const script = `
          console.log('Hello from Deno!');
          console.log('Runtime:', typeof Deno !== 'undefined' ? 'Deno' : 'Not Deno');
          console.log('Version:', Deno.version.deno);
        `;
        
        await Deno.writeTextFile('/tmp/test-script.ts', script);

        tester = new TmuxTester({
          command: ['deno', 'run', '/tmp/test-script.ts'],
          runtime: 'deno'
        });

        await tester.start();
        await delay(200);

        const content = await tester.getScreenContent();
        assert(content.includes('Hello from Deno!'));
        assert(content.includes('Runtime: Deno'));
      });

      it('should handle Deno REPL', async () => {
        const hasTmux = await isCommandAvailable('tmux');
        if (!hasTmux) {
          console.log('Skipping test - tmux not available');
          return;
        }
        tester = new TmuxTester({
          command: ['deno', 'repl'],
          runtime: 'deno'
        });

        await tester.start();
        await tester.waitForText('>', { timeout: 3000 });

        await tester.typeText('1 + 1');
        await tester.sendKey('enter');
        await delay(100);

        const content = await tester.getScreenContent();
        assert(content.includes('2'));

        await tester.typeText('Deno.version');
        await tester.sendKey('enter');
        await delay(100);

        const content2 = await tester.getScreenContent();
        assert(content2.includes('deno:'));
      });
    });
  });

  describe('Deno-specific Utilities', () => {
    it('should detect Deno runtime correctly', () => {
      const runtime = typeof Deno !== 'undefined' ? 'deno' : 'other';
      assertEquals(runtime, 'deno');
    });

    it('should access Deno.env', () => {
      assertExists(Deno.env);
      const path = Deno.env.get('PATH');
      assertExists(path);
    });

    it('should use Deno performance APIs', () => {
      const start = performance.now();
      
      // Do some work
      for (let i = 0; i < 1000; i++) {
        Math.sqrt(i);
      }
      
      const end = performance.now();
      const elapsed = end - start;
      
      assert(elapsed > 0);
    });

    it('should handle async operations', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      
      assert(elapsed >= 45);
      assert(elapsed < 100);
    });

    it('should get Deno version info', () => {
      assertExists(Deno.version);
      assertExists(Deno.version.deno);
      assertExists(Deno.version.v8);
      assertExists(Deno.version.typescript);
    });
  });

  describe('File System Operations with Deno', () => {
    it('should save and load snapshots using Deno APIs', async () => {
      const content = 'Deno snapshot content';
      const path = '/tmp/deno-snapshot.txt';
      
      // Save using Deno
      await Deno.writeTextFile(path, content);
      
      // Load using Deno
      const loaded = await Deno.readTextFile(path);
      
      assertEquals(loaded, content);
    });

    it('should handle binary snapshots', async () => {
      const buffer = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const path = '/tmp/deno-binary.dat';
      
      await Deno.writeFile(path, buffer);
      
      const loaded = await Deno.readFile(path);
      assertEquals(loaded, buffer);
    });

    it('should handle file metadata', async () => {
      const path = '/tmp/deno-meta.txt';
      await Deno.writeTextFile(path, 'test');
      
      const stat = await Deno.stat(path);
      assertExists(stat);
      assert(stat.isFile);
      assert(!stat.isDirectory);
      assert(stat.size > 0);
    });

    it('should watch file changes', async () => {
      const path = '/tmp/deno-watch.txt';
      await Deno.writeTextFile(path, 'initial');
      
      const watcher = Deno.watchFs(path);
      
      // Write to trigger change
      setTimeout(() => {
        Deno.writeTextFile(path, 'changed');
      }, 10);
      
      for await (const event of watcher) {
        if (event.kind === 'modify') {
          break;
        }
      }
      
      const content = await Deno.readTextFile(path);
      assertEquals(content, 'changed');
    });
  });

  describe('Network Operations with Deno', () => {
    it('should create HTTP server for testing', async () => {
      const server = Deno.serve(
        { port: 0 }, // Random port
        (_req) => new Response('Test response')
      );

      const response = await fetch(`http://localhost:${server.addr.port}`);
      const text = await response.text();
      
      assertEquals(text, 'Test response');
      
      await server.shutdown();
    });

    it('should handle WebSocket connections', async () => {
      const messages: string[] = [];
      
      const server = Deno.serve(
        { port: 0 },
        (req) => {
          if (req.headers.get('upgrade') === 'websocket') {
            const { socket, response } = Deno.upgradeWebSocket(req);
            
            socket.onmessage = (event) => {
              messages.push(event.data);
              socket.send('Echo: ' + event.data);
            };
            
            return response;
          }
          return new Response('Not a WebSocket');
        }
      );

      const ws = new WebSocket(`ws://localhost:${server.addr.port}`);
      
      await new Promise<void>((resolve) => {
        ws.onopen = () => {
          ws.send('Test message');
        };
        ws.onmessage = (event) => {
          assertEquals(event.data, 'Echo: Test message');
          ws.close();
          resolve();
        };
      });
      
      assert(messages.includes('Test message'));
      await server.shutdown();
    });
  });

  describe('Worker Operations with Deno', () => {
    it('should run code in worker', async () => {
      const workerCode = `
        self.onmessage = (e) => {
          const result = e.data * 2;
          self.postMessage(result);
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      
      const worker = new Worker(workerUrl, { type: 'module' });
      
      const result = await new Promise<number>((resolve) => {
        worker.onmessage = (e) => {
          resolve(e.data);
        };
        worker.postMessage(21);
      });
      
      assertEquals(result, 42);
      worker.terminate();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should benchmark TUI operations', async () => {
      const adapter = new DenoAdapter();
      const iterations = 100;
      
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const proc = await adapter.spawn('echo', [`Test ${i}`]);
        await adapter.kill(proc);
      }
      
      const end = performance.now();
      const avgTime = (end - start) / iterations;
      
      console.log(`Average spawn/kill time: ${avgTime.toFixed(2)}ms`);
      assert(avgTime < 100); // Should be fast
    });

    it('should benchmark snapshot operations', async () => {
      const iterations = 100;
      const content = 'Test content'.repeat(100);
      
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const path = `/tmp/bench-${i}.txt`;
        await Deno.writeTextFile(path, content);
        await Deno.readTextFile(path);
      }
      
      const end = performance.now();
      const avgTime = (end - start) / iterations;
      
      console.log(`Average snapshot save/load time: ${avgTime.toFixed(2)}ms`);
      assert(avgTime < 10);
    });
  });

  describe('Error Handling in Deno', () => {
    it('should handle spawn errors', async () => {
      const adapter = new DenoAdapter();
      
      try {
        await adapter.spawn('nonexistentcommand12345', []);
        assert(false, 'Should have thrown');
      } catch (error) {
        assertExists(error);
      }
    });

    it('should handle file errors', async () => {
      try {
        await Deno.readTextFile('/nonexistent/path/file.txt');
        assert(false, 'Should have thrown');
      } catch (error) {
        assertExists(error);
      }
    });

    it('should handle permission errors', async () => {
      // Revoke permissions temporarily
      await Deno.permissions.revoke({ name: 'read', path: '/etc/passwd' });
      
      try {
        await Deno.readTextFile('/etc/passwd');
        assert(false, 'Should have thrown');
      } catch (error) {
        assertExists(error);
        assert(error instanceof Deno.errors.PermissionDenied);
      }
    });

    it('should handle process crashes', async () => {
      const adapter = new DenoAdapter();
      const proc = await adapter.spawn('sh', ['-c', 'exit 1']);
      
      await delay(100);
      
      const isAlive = await adapter.isAlive(proc);
      assertEquals(isAlive, false);
    });
  });

  describe('Signal Handling', () => {
    it('should handle process signals', async () => {
      const adapter = new DenoAdapter();
      const proc = await adapter.spawn('sleep', ['10']);
      
      // Send SIGTERM
      await adapter.kill(proc, 'SIGTERM');
      await delay(100);
      
      const isAlive = await adapter.isAlive(proc);
      assertEquals(isAlive, false);
    });

    it('should handle Deno signal listeners', () => {
      const listeners = ['SIGINT', 'SIGTERM', 'SIGHUP'];
      
      listeners.forEach(signal => {
        const listener = Deno.addSignalListener(signal as Deno.Signal, () => {
          console.log(`Received ${signal}`);
        });
        
        assertExists(listener);
        Deno.removeSignalListener(signal as Deno.Signal, listener);
      });
    });
  });
});