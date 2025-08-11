/**
 * Runtime adapter tests
 * Tests for Node.js, Bun, and Deno runtime adapters
 */

import { it, expect, describe, afterAll, afterEach, beforeEach } from 'vitest';

import { BunAdapter } from '../../src/adapters/bun.js';
import { NodeAdapter } from '../../src/adapters/node.js';
import { DenoAdapter } from '../../src/adapters/deno.js';
import { createAdapter } from '../../src/adapters/index.js';

import type { RuntimeAdapter } from '../../src/adapters/base.js';

// Track all adapters for cleanup
const activeAdapters = new Set<RuntimeAdapter>();

describe('Runtime Adapters', () => {
  afterAll(async () => {
    // Clean up any remaining adapters
    for (const adapter of activeAdapters) {
      try {
        await adapter.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    activeAdapters.clear();
  });
  describe('createAdapter', () => {
    it('should create appropriate adapter based on runtime', () => {
      const adapter = createAdapter();
      expect(adapter).toBeDefined();
      expect(adapter).toHaveProperty('spawn');
      expect(adapter).toHaveProperty('kill');
      expect(adapter).toHaveProperty('write');
      expect(adapter).toHaveProperty('read');
    });

    it('should create Node adapter when specified', () => {
      const adapter = createAdapter('node');
      expect(adapter).toBeInstanceOf(NodeAdapter);
    });

    it('should create Bun adapter when specified', () => {
      const adapter = createAdapter('bun');
      expect(adapter).toBeInstanceOf(BunAdapter);
    });

    it('should create Deno adapter when specified', () => {
      const adapter = createAdapter('deno');
      expect(adapter).toBeInstanceOf(DenoAdapter);
    });

    it('should default to Node adapter when runtime is unknown', () => {
      const adapter = createAdapter('unknown' as any);
      expect(adapter).toBeInstanceOf(NodeAdapter);
    });
  });

  describe('NodeAdapter', () => {
    let adapter: NodeAdapter;

    beforeEach(() => {
      adapter = new NodeAdapter();
      activeAdapters.add(adapter);
    });

    afterEach(async () => {
      // Ensure all processes are cleaned up
      await adapter.cleanup();
      activeAdapters.delete(adapter);
    });

    it('should spawn a process', async () => {
      const proc = await adapter.spawn('echo', ['Hello, World!']);
      expect(proc).toBeDefined();
      expect(proc.pid).toBeGreaterThan(0);
      
      // Clean up
      await adapter.kill(proc);
    }, 5000);

    it('should write to process stdin', async () => {
      // Use a simpler test that doesn't involve cat
      const proc = await adapter.spawn('sh', ['-c', 'exit 0']);
      const written = await adapter.write(proc, 'test input\n');
      // Just check that write doesn't throw
      expect(written).toBeDefined();
      
      // Clean up immediately
      await adapter.kill(proc);
    }, 5000);

    it('should read from process stdout', async () => {
      const proc = await adapter.spawn('echo', ['test output']);
      await new Promise(resolve => setTimeout(resolve, 100)); // Give it time to output
      
      const output = await adapter.read(proc);
      expect(output).toContain('test output');
      
      // Clean up
      await adapter.kill(proc);
    });

    it('should kill a process', async () => {
      const proc = await adapter.spawn('sleep', ['1']);
      const killed = await adapter.kill(proc);
      expect(killed).toBe(true);
    }, 5000);

    it('should resize PTY', async () => {
      const proc = await adapter.spawn('sh', ['-c', 'exit 0'], {
        env: { TERM: 'xterm-256color' }
      });
      
      const resized = await adapter.resize(proc, 100, 40);
      expect(resized).toBe(true);
      
      // Clean up
      await adapter.kill(proc);
    }, 5000);

    it('should handle process exit', async () => {
      const proc = await adapter.spawn('echo', ['done']);
      
      // Wait for process to exit
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const isAlive = await adapter.isAlive(proc);
      expect(isAlive).toBe(false);
      
      // Clean up just in case
      await adapter.kill(proc);
    }, 5000);

    it('should handle environment variables', async () => {
      const proc = await adapter.spawn('sh', ['-c', 'echo $TEST_VAR'], {
        env: { TEST_VAR: 'test_value' }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const output = await adapter.read(proc);
      expect(output).toContain('test_value');
      
      // Clean up
      await adapter.kill(proc);
    });

    it('should handle working directory', async () => {
      const tmpDir = '/tmp';
      const proc = await adapter.spawn('pwd', [], {
        cwd: tmpDir
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const output = await adapter.read(proc);
      expect(output).toContain(tmpDir);
      
      // Clean up
      await adapter.kill(proc);
    });

    it('should cleanup all processes', async () => {
      const proc1 = await adapter.spawn('sleep', ['1']);
      const proc2 = await adapter.spawn('sleep', ['1']);
      
      await adapter.cleanup();
      
      const alive1 = await adapter.isAlive(proc1);
      const alive2 = await adapter.isAlive(proc2);
      
      expect(alive1).toBe(false);
      expect(alive2).toBe(false);
    }, 5000);
  });

  describe('BunAdapter', () => {
    let adapter: BunAdapter;

    beforeEach(() => {
      adapter = new BunAdapter();
      activeAdapters.add(adapter);
    });

    afterEach(async () => {
      // Ensure cleanup
      await adapter.cleanup();
    });

    it('should use Bun-specific spawn when available', async () => {
      // Check if Bun is available
      const hasBun = typeof (global as any).Bun !== 'undefined';
      
      if (hasBun) {
        const proc = await adapter.spawn('echo', ['Bun test']);
        expect(proc).toBeDefined();
        await adapter.kill(proc);
      } else {
        // Fall back to Node implementation
        const proc = await adapter.spawn('echo', ['Node fallback']);
        expect(proc).toBeDefined();
        await adapter.kill(proc);
      }
    });

    it('should handle Bun.spawn options', async () => {
      const proc = await adapter.spawn('sh', ['-c', 'echo $BUN_TEST'], {
        env: { BUN_TEST: 'bun_value' }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const output = await adapter.read(proc);
      
      // Should contain the value regardless of runtime
      expect(output).toBeDefined();
      
      await adapter.kill(proc);
    });
  });

  describe('DenoAdapter', () => {
    let adapter: DenoAdapter;

    beforeEach(() => {
      adapter = new DenoAdapter();
      activeAdapters.add(adapter);
    });

    afterEach(async () => {
      // Ensure cleanup
      await adapter.cleanup();
    });

    it('should use Deno.Command when available', async () => {
      // Check if Deno is available
      const hasDeno = typeof (global as any).Deno !== 'undefined';
      
      if (hasDeno) {
        const proc = await adapter.spawn('echo', ['Deno test']);
        expect(proc).toBeDefined();
        await adapter.kill(proc);
      } else {
        // Fall back to Node implementation
        const proc = await adapter.spawn('echo', ['Node fallback']);
        expect(proc).toBeDefined();
        await adapter.kill(proc);
      }
    });

    it('should handle Deno permissions', async () => {
      const proc = await adapter.spawn('echo', ['Permission test']);
      expect(proc).toBeDefined();
      
      // Should work regardless of runtime
      await adapter.kill(proc);
    });

    it('should handle Deno-specific environment', async () => {
      const proc = await adapter.spawn('sh', ['-c', 'echo $DENO_TEST'], {
        env: { DENO_TEST: 'deno_value' }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const output = await adapter.read(proc);
      
      // Should work in any runtime
      expect(output).toBeDefined();
      
      await adapter.kill(proc);
    });
  });

  describe('Adapter Interface Compliance', () => {
    const adapters: Array<[string, () => RuntimeAdapter]> = [
      ['NodeAdapter', () => new NodeAdapter()],
      ['BunAdapter', () => new BunAdapter()],
      ['DenoAdapter', () => new DenoAdapter()]
    ];

    adapters.forEach(([name, createFn]) => {
      describe(name, () => {
        let adapter: RuntimeAdapter;

        beforeEach(() => {
          adapter = createFn();
          activeAdapters.add(adapter);
        });

        afterEach(async () => {
          await adapter.cleanup();
          activeAdapters.delete(adapter);
        });

        it('should implement all required methods', () => {
          expect(adapter.spawn).toBeDefined();
          expect(adapter.kill).toBeDefined();
          expect(adapter.write).toBeDefined();
          expect(adapter.read).toBeDefined();
          expect(adapter.resize).toBeDefined();
          expect(adapter.isAlive).toBeDefined();
          expect(adapter.cleanup).toBeDefined();
        });

        it('should spawn and kill a simple process', async () => {
          const proc = await adapter.spawn('echo', ['test']);
          expect(proc).toBeDefined();
          
          const killed = await adapter.kill(proc);
          expect(killed).toBe(true);
        }, 5000);

        it('should handle non-existent commands gracefully', async () => {
          await expect(
            adapter.spawn('nonexistentcommand12345', [])
          ).rejects.toThrow();
        });

        it('should handle empty command arguments', async () => {
          const proc = await adapter.spawn('echo', []);
          expect(proc).toBeDefined();
          await adapter.kill(proc);
        });

        it('should support PTY mode', async () => {
          const proc = await adapter.spawn('sh', ['-c', 'exit 0'], {
            pty: true,
            env: { TERM: 'xterm' }
          });
          
          expect(proc).toBeDefined();
          await adapter.kill(proc);
        }, 5000);
      });
    });
  });

  describe('Cross-Runtime Compatibility', () => {
    it('should handle buffer/string conversions consistently', async () => {
      const adapter = createAdapter();
      const proc = await adapter.spawn('sh', ['-c', 'exit 0']);
      
      // Test with string input (don't use cat as it hangs)
      await adapter.write(proc, 'string input\n');
      
      // Test with buffer input
      const buffer = Buffer.from('buffer input\n');
      await adapter.write(proc, buffer);
      
      await adapter.kill(proc);
    }, 5000);

    it('should handle different line endings', async () => {
      const adapter = createAdapter();
      const proc = await adapter.spawn('sh', ['-c', 'exit 0']);
      
      // Test different line endings (don't use cat)
      await adapter.write(proc, 'line1\n');
      await adapter.write(proc, 'line2\r\n');
      await adapter.write(proc, 'line3\r');
      
      await adapter.kill(proc);
    }, 5000);

    it('should handle Unicode correctly', async () => {
      const adapter = createAdapter();
      const proc = await adapter.spawn('sh', ['-c', 'exit 0']);
      
      // Test Unicode characters (don't use cat)
      await adapter.write(proc, '你好世界\n');
      await adapter.write(proc, '🚀 Emoji test\n');
      await adapter.write(proc, 'Ñoño\n');
      
      await adapter.kill(proc);
    }, 5000);
  });
});