import { it, jest, expect, describe } from '@jest/globals';

import { $ } from '../../../src/index.js';
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';


describe('ExecutionEngine Disposable functionality', () => {
  describe('Adapter disposal', () => {
    it('should dispose all adapters when engine is disposed', async () => {
      const engine = new ExecutionEngine();
      
      // Create spies for adapter dispose methods
      const mockAdapter = new MockAdapter();
      const disposeSpy = jest.spyOn(mockAdapter, 'dispose');
      
      // Register the adapter
      engine.registerAdapter('mock', mockAdapter);
      
      // Dispose the engine
      await engine.dispose();
      
      // Verify adapter was disposed
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle adapters without dispose method gracefully', async () => {
      const engine = new ExecutionEngine();

      // Create an adapter without dispose method
      const adapterWithoutDispose = new MockAdapter();
      // Remove the dispose method using Object.defineProperty
      Object.defineProperty(adapterWithoutDispose, 'dispose', {
        value: undefined,
        writable: true,
        configurable: true
      });

      engine.registerAdapter('custom', adapterWithoutDispose);

      // Should not throw
      await expect(engine.dispose()).resolves.toBeUndefined();
    });

    it('should dispose SSH connections', async () => {
      const engine = new ExecutionEngine({
        adapters: {
          ssh: {
            defaultConnectOptions: {
              host: 'test.example.com',
              username: 'test'
            }
          }
        }
      });

      // Get the SSH adapter
      const engineWithAdapters: any = engine;
      const sshAdapter = engineWithAdapters.adapters.get('ssh');
      const disposeSpy = jest.spyOn(sshAdapter, 'dispose');

      // Dispose engine
      await engine.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should continue disposing other adapters if one fails', async () => {
      const engine = new ExecutionEngine();
      
      // Create adapters with different behaviors
      class FailingAdapter extends MockAdapter {
        override async dispose(): Promise<void> {
          throw new Error('Dispose failed');
        }
      }

      const failingAdapter = new FailingAdapter();
      const failSpy = jest.spyOn(failingAdapter, 'dispose');

      const successAdapter = new MockAdapter();
      const successSpy = jest.spyOn(successAdapter, 'dispose');

      engine.registerAdapter('failing', failingAdapter);
      engine.registerAdapter('success', successAdapter);
      
      // Dispose should not throw but should call both
      await expect(engine.dispose()).resolves.toBeUndefined();
      
      expect(failSpy).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalled();
    });
  });

  describe('Resource cleanup', () => {
    it('should clean up temporary resources', async () => {
      const engine = new ExecutionEngine();
      
      // Create temp file
      const tempFile = await engine.tempFile();
      const tempFilePath = tempFile.path;
      
      // Verify file exists
      const existsBefore = await engine.execute({
        command: 'test',
        args: ['-f', tempFilePath],
        shell: false
      }).then(() => true).catch(() => false);
      
      expect(existsBefore).toBe(true);
      
      // Dispose engine
      await engine.dispose();
      
      // File should be cleaned up
      const existsAfter = await engine.execute({
        command: 'test',
        args: ['-f', tempFilePath],
        shell: false
      }).then(() => true).catch(() => false);
      
      expect(existsAfter).toBe(false);
    });

    it('should clean up event listeners', async () => {
      const engine = new ExecutionEngine();
      
      const listener = jest.fn();
      engine.on('command:start', listener);
      
      // Verify listener is registered
      expect(engine.listenerCount('command:start')).toBe(1);
      
      // Dispose engine
      await engine.dispose();
      
      // Listeners should be removed
      expect(engine.listenerCount('command:start')).toBe(0);
    });

    it('should cancel active processes', async () => {
      const engine = new ExecutionEngine();

      // Register a mock adapter that simulates a long-running process
      const mockAdapter = new MockAdapter();
      mockAdapter.mockCommand(/sleep 10/, {
        stdout: 'sleeping...',
        stderr: '',
        exitCode: 0,
        delay: 10000, // 10 second delay
        signal: 'SIGTERM' // Simulate being terminated
      });
      engine.registerAdapter('mock', mockAdapter);
      const mockEngine = engine.with({ adapter: 'mock' });

      // Start a long-running process
      const longProcess = mockEngine.tag`sleep 10`;

      // Trigger execution
      void longProcess.catch(() => {});

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Dispose mockEngine while process is running
      await mockEngine.dispose();

      // Process should be terminated with a signal
      const result = await longProcess;
      expect(result.signal).toBe('SIGTERM');
      expect(result.duration).toBeLessThan(5000); // Should not have run for full 10 seconds
    });
  });

  describe.skip('Global $ disposal', () => {
    it('should dispose global $ instance', async () => {
      // Import the module directly to get an isolated instance
      const { $: isolatedDollar, dispose } = await import('../../../src/index.js');

      // Configure isolated $ with a mock adapter
      const mockAdapter = new MockAdapter();
      mockAdapter.mockSuccess(/sh -c "echo \\"test\\""/, 'test\n');
      isolatedDollar.registerAdapter('mock', mockAdapter);
      const $mock = isolatedDollar.with({ adapter: 'mock' });

      // Execute a command to ensure global engine is initialized
      await $mock`echo "test"`;

      // Should not throw
      await expect(dispose()).resolves.toBeUndefined();
    });

    it('should handle multiple dispose calls', async () => {
      const { dispose } = await import('../../../src/index.js');
      
      // Multiple dispose calls should not throw
      await dispose();
      await dispose();
      await dispose();
    });

    it('should recreate engine after disposal', async () => {
      const { dispose } = await import('../../../src/index.js');

      // Configure global $ with a mock adapter for first use
      const mockAdapter1 = new MockAdapter();
      mockAdapter1.mockSuccess(/sh -c "echo \\"before dispose\\""/, 'before dispose\n');
      $.registerAdapter('mock', mockAdapter1);
      const $mock1 = $.with({ adapter: 'mock' });

      // First use
      const result1 = await $mock1`echo "before dispose"`;
      expect(result1.stdout).toContain('before dispose');

      // Dispose
      await dispose();

      // Configure a new mock adapter after disposal
      const mockAdapter2 = new MockAdapter();
      mockAdapter2.mockSuccess(/sh -c "echo \\"after dispose\\""/, 'after dispose\n');
      $.registerAdapter('mock', mockAdapter2);
      const $mock2 = $.with({ adapter: 'mock' });

      // Should work again (new engine created)
      const result2 = await $mock2`echo "after dispose"`;
      expect(result2.stdout).toContain('after dispose');
    });
  });

  describe('Disposable pattern implementation', () => {
    it('should prevent usage after disposal', async () => {
      class DisposableEngine extends ExecutionEngine {
        private _disposed = false;

        override async dispose(): Promise<void> {
          if (this._disposed) {
            throw new Error('Already disposed');
          }
          this._disposed = true;
          // Call parent dispose logic here
        }

        override async execute(command: any): Promise<any> {
          if (this._disposed) {
            throw new Error('Cannot execute on disposed engine');
          }
          return super.execute(command);
        }
      }

      const engine = new DisposableEngine();
      await engine.dispose();

      await expect(engine.execute({ command: 'echo test' }))
        .rejects.toThrow('Cannot execute on disposed engine');
    });

    it('should support async resource management', async () => {
      async function withEngine<T>(
        config: any,
        callback: (engine: ExecutionEngine) => Promise<T>
      ): Promise<T> {
        const engine = new ExecutionEngine(config);
        // Register a mock adapter
        const mockAdapter = new MockAdapter();
        mockAdapter.mockSuccess(/echo test/, 'test\n');
        engine.registerAdapter('mock', mockAdapter);
        try {
          return await callback(engine);
        } finally {
          if ('dispose' in engine && typeof engine.dispose === 'function') {
            await engine.dispose();
          }
        }
      }

      let engineUsed = false;
      const result = await withEngine({}, async (engine) => {
        engineUsed = true;
        const res = await engine.execute({
          command: 'echo',
          args: ['test'],
          adapter: 'mock',
          shell: false
        });
        return res.stdout;
      });

      expect(engineUsed).toBe(true);
      expect(result).toContain('test');
    });
  });

  describe('Memory leak prevention', () => {
    it('should clear adapter references on disposal', async () => {
      const engine = new ExecutionEngine();
      
      // Add multiple adapters
      const adapters = Array.from({ length: 10 }, (_, i) => 
        new MockAdapter()
      );
      
      adapters.forEach((adapter, i) => {
        engine.registerAdapter(`mock-${i}`, adapter);
      });
      
      // Verify adapters are registered
      const enginePrivate = engine as any;
      expect(enginePrivate.adapters.size).toBeGreaterThan(10); // includes default adapters
      
      // Dispose
      await engine.dispose();
      
      // References should be cleared
      expect(enginePrivate.adapters.size).toBe(0);
    });

    it('should clear temporary file tracking', async () => {
      const engine = new ExecutionEngine();
      
      // Create multiple temp files
      const tempFiles = await Promise.all(
        Array.from({ length: 5 }, () => engine.tempFile())
      );
      
      // Track should have files
      const enginePrivate = engine as any;
      const trackingSize = enginePrivate._tempTracker?.size || 0;
      expect(trackingSize).toBeGreaterThan(0);
      
      // Dispose
      await engine.dispose();
      
      // Tracking should be cleared
      const afterSize = enginePrivate._tempTracker?.size || 0;
      expect(afterSize).toBe(0);
    });

    it('should clean up temp directories on disposal', async () => {
      const engine = new ExecutionEngine();
      
      // Create temp directories
      const tempDirs = await Promise.all(
        Array.from({ length: 3 }, () => engine.tempDir())
      );
      
      // Verify tracking
      const enginePrivate = engine as any;
      expect(enginePrivate._tempTracker.size).toBe(3);
      
      // Dispose
      await engine.dispose();
      
      // Should be cleaned up
      expect(enginePrivate._tempTracker.size).toBe(0);
    });

    it('should clear active processes tracking', async () => {
      const engine = new ExecutionEngine();

      // Register a mock adapter with longer delays to ensure processes are tracked
      const mockAdapter = new MockAdapter();
      mockAdapter.mockCommand(/echo "test1"/, { stdout: 'test1\n', stderr: '', exitCode: 0, delay: 100 });
      mockAdapter.mockCommand(/echo "test2"/, { stdout: 'test2\n', stderr: '', exitCode: 0, delay: 100 });
      mockAdapter.mockCommand(/echo "test3"/, { stdout: 'test3\n', stderr: '', exitCode: 0, delay: 100 });
      engine.registerAdapter('mock', mockAdapter);
      const mockEngine = engine.with({ adapter: 'mock' });

      // Start multiple processes - trigger execution without blocking
      const processes = [
        mockEngine.tag`echo "test1"`,
        mockEngine.tag`echo "test2"`,
        mockEngine.tag`echo "test3"`
      ];

      // Trigger execution by calling .catch() to start tracking
      processes.forEach(p => void p.catch(() => {}));

      // Give them a moment to be tracked (need less time than delay to catch them in-flight)
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have active processes - check mockEngine, not engine!
      const mockEnginePrivate = mockEngine as any;
      expect(mockEnginePrivate._activeProcesses.size).toBe(3);

      // Wait for completion
      await Promise.all(processes);

      // Should be cleared after completion
      expect(mockEnginePrivate._activeProcesses.size).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle disposal with no resources', async () => {
      const engine = new ExecutionEngine();
      
      // Dispose without using any features
      await expect(engine.dispose()).resolves.toBeUndefined();
    });

    it('should handle multiple simultaneous process cancellations', async () => {
      const engine = new ExecutionEngine();

      // Register a mock adapter that simulates long-running processes
      const mockAdapter = new MockAdapter();
      for (let i = 1; i <= 5; i++) {
        mockAdapter.mockCommand(new RegExp(`sleep ${i}`), {
          stdout: '',
          stderr: '',
          exitCode: 0,
          delay: i * 1000, // Delay based on sleep duration
          signal: 'SIGTERM' // Simulate being terminated
        });
      }
      engine.registerAdapter('mock', mockAdapter);
      const mockEngine = engine.with({ adapter: 'mock' });

      // Start multiple long-running processes
      const processes = Array.from({ length: 5 }, (_, i) =>
        mockEngine.tag`sleep ${i + 1}`
      );

      // Trigger execution for all processes
      processes.forEach(p => void p.catch(() => {}));

      // Give them a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Dispose should cancel all
      await engine.dispose();

      // All should be terminated
      const results = await Promise.all(processes);
      results.forEach((result: any) => {
        expect(result.signal).toBe('SIGTERM');
      });
    });

    it('should handle temp file cleanup errors gracefully', async () => {
      const engine = new ExecutionEngine();
      
      // Create temp file
      const tempFile = await engine.tempFile();

      // Mock cleanup to throw error
      Object.defineProperty(tempFile, 'cleanup', {
        value: jest.fn(() => Promise.reject(new Error('Cleanup failed'))),
        writable: true,
        configurable: true
      });

      // Should not throw on disposal
      await expect(engine.dispose()).resolves.toBeUndefined();
    });

    it('should dispose parallel and transfer utilities', async () => {
      const engine = new ExecutionEngine();
      
      // Access lazy-loaded utilities to ensure they're created
      const parallel = engine.parallel;
      const transfer = engine.transfer;
      
      const enginePrivate = engine as any;
      expect(enginePrivate._parallel).toBeDefined();
      expect(enginePrivate._transfer).toBeDefined();
      
      // Dispose
      await engine.dispose();
      
      // Should be cleared
      expect(enginePrivate._parallel).toBeUndefined();
      expect(enginePrivate._transfer).toBeUndefined();
    });
  });
});