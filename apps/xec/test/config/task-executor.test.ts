/**
 * Tests for TaskExecutor
 * Using real commands instead of mocks for better reliability
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { TaskExecutor } from '../../src/config/task-executor.js';
import { TargetResolver } from '../../src/config/target-resolver.js';
import { VariableInterpolator } from '../../src/config/variable-interpolator.js';
import { ConfigurationManager } from '../../src/config/configuration-manager.js';

import type { TaskDefinition } from '../../src/config/types.js';

describe('TaskExecutor', () => {
  let executor: TaskExecutor;
  let interpolator: VariableInterpolator;
  let targetResolver: TargetResolver;
  let configManager: ConfigurationManager;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-test-'));

    configManager = new ConfigurationManager();
    interpolator = new VariableInterpolator();
    targetResolver = new TargetResolver(configManager);

    executor = new TaskExecutor({
      interpolator,
      targetResolver,
      defaultTimeout: 30000,
      debug: false,
      dryRun: false,
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('simple command execution', () => {
    it('should execute a simple command task', async () => {
      const outputFile = path.join(testDir, 'hello.txt');
      const task: TaskDefinition = {
        command: `echo "Hello World" > ${outputFile}`,
      };

      const result = await executor.execute('hello', task);

      expect(result.success).toBe(true);
      expect(result.task).toBe('hello');
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Verify the file was created
      const content = await fs.readFile(outputFile, 'utf-8');
      expect(content.trim()).toBe('Hello World');
    });

    it('should interpolate variables in command', async () => {
      const outputFile = path.join(testDir, 'message.txt');
      const task: TaskDefinition = {
        command: `echo "\${params.message}" > ${outputFile}`,
      };

      const result = await executor.execute('echo', task, {
        params: { message: 'Hello from params' },
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(outputFile, 'utf-8');
      expect(content.trim()).toBe('Hello from params');
    });

    it('should handle command failure', async () => {
      const task: TaskDefinition = {
        command: 'false',  // This command always fails
      };

      const result = await executor.execute('fail', task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('pipeline execution', () => {
    it('should execute steps sequentially', async () => {
      const outputFile = path.join(testDir, 'sequential.txt');
      const task: TaskDefinition = {
        steps: [
          { name: 'Step 1', command: `echo "1" >> ${outputFile}` },
          { name: 'Step 2', command: `echo "2" >> ${outputFile}` },
          { name: 'Step 3', command: `echo "3" >> ${outputFile}` },
        ],
      };

      const result = await executor.execute('pipeline', task);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps?.every(s => s.success)).toBe(true);

      // Verify the order
      const content = await fs.readFile(outputFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toEqual(['1', '2', '3']);
    });

    it('should execute steps in parallel', async () => {
      const task: TaskDefinition = {
        parallel: true,
        steps: [
          { name: 'Step 1', command: `echo "1" > ${path.join(testDir, 'p1.txt')}` },
          { name: 'Step 2', command: `echo "2" > ${path.join(testDir, 'p2.txt')}` },
          { name: 'Step 3', command: `echo "3" > ${path.join(testDir, 'p3.txt')}` },
        ],
      };

      const result = await executor.execute('parallel', task);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);

      // Verify all files were created
      for (let i = 1; i <= 3; i++) {
        const content = await fs.readFile(path.join(testDir, `p${i}.txt`), 'utf-8');
        expect(content.trim()).toBe(String(i));
      }
    });

    it('should respect maxConcurrent limit', async () => {
      const startTimes: number[] = [];
      const endTimes: number[] = [];

      const task: TaskDefinition = {
        parallel: true,
        maxConcurrent: 2,
        steps: [
          { command: `node -e "console.log(Date.now()); setTimeout(() => console.log(Date.now()), 100)" > ${path.join(testDir, 'c1.txt')}` },
          { command: `node -e "console.log(Date.now()); setTimeout(() => console.log(Date.now()), 100)" > ${path.join(testDir, 'c2.txt')}` },
          { command: `node -e "console.log(Date.now()); setTimeout(() => console.log(Date.now()), 100)" > ${path.join(testDir, 'c3.txt')}` },
          { command: `node -e "console.log(Date.now()); setTimeout(() => console.log(Date.now()), 100)" > ${path.join(testDir, 'c4.txt')}` },
        ],
      };

      const result = await executor.execute('concurrent', task);

      expect(result.success).toBe(true);

      // Read timestamps from files
      for (let i = 1; i <= 4; i++) {
        const content = await fs.readFile(path.join(testDir, `c${i}.txt`), 'utf-8');
        const times = content.trim().split('\n').map(Number);
        startTimes.push(times[0]);
        endTimes.push(times[1]);
      }

      // Sort start times to check concurrency
      startTimes.sort((a, b) => a - b);

      // The third task should start after the first has ended
      const overlapCount = startTimes.filter((start, idx) => {
        if (idx < 2) return false;
        return start < Math.min(...endTimes.slice(0, 2));
      }).length;

      expect(overlapCount).toBe(0);
    });

    it('should handle step failure with fail-fast', async () => {
      const task: TaskDefinition = {
        failFast: true,
        steps: [
          { name: 'Step 1', command: `echo "1" > ${path.join(testDir, 'ff1.txt')}` },
          { name: 'Step 2', command: 'false' },  // This will fail
          { name: 'Step 3', command: `echo "3" > ${path.join(testDir, 'ff3.txt')}` },
        ],
      };

      const result = await executor.execute('failfast', task);

      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(2); // Should stop after failure

      // First file should exist
      await expect(fs.access(path.join(testDir, 'ff1.txt'))).resolves.toBeUndefined();

      // Third file should not exist
      await expect(fs.access(path.join(testDir, 'ff3.txt'))).rejects.toThrow();
    });
  });

  describe('conditional execution', () => {
    it('should skip step when condition is false', async () => {
      const outputFile = path.join(testDir, 'conditional.txt');
      const task: TaskDefinition = {
        steps: [
          {
            name: 'Conditional step',
            command: `echo "Should not run" > ${outputFile}`,
            when: 'false',
          },
        ],
      };

      const result = await executor.execute('conditional', task);

      expect(result.success).toBe(true);
      expect(result.steps?.[0].success).toBe(true);
      expect(result.steps?.[0].output).toBeUndefined();

      // File should not exist
      await expect(fs.access(outputFile)).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should retry on failure', async () => {
      const attemptFile = path.join(testDir, 'attempts.txt');
      const successFile = path.join(testDir, 'success.txt');

      // Track retry events
      const retryEvents: any[] = [];
      executor.on('step:retry', event => {
        retryEvents.push(event);
      });

      // Create a script that fails on first attempt
      const scriptPath = path.join(testDir, 'retry-script.js');
      await fs.writeFile(scriptPath, `
        import { readFileSync, writeFileSync } from 'fs';
        const attemptFile = '${attemptFile}';
        const successFile = '${successFile}';
        
        // Count attempts
        let attempts = 0;
        try {
          const content = readFileSync(attemptFile, 'utf-8');
          attempts = parseInt(content) || 0;
        } catch (e) {
          // File doesn't exist yet
        }
        
        attempts++;
        writeFileSync(attemptFile, String(attempts));
        
        // Fail on first attempt
        if (attempts === 1) {
          process.exit(1);
        }
        
        // Succeed on retry
        writeFileSync(successFile, 'Success after retry');
      `);

      const task: TaskDefinition = {
        steps: [
          {
            name: 'Retry step',
            command: `node ${scriptPath}`,
            onFailure: {
              retry: 1,
              delay: '10ms',
            },
          },
        ],
      };

      const result = await executor.execute('retry', task);

      // Check attempts count first
      const attempts = await fs.readFile(attemptFile, 'utf-8');
      expect(attempts).toBe('2'); // Initial + 1 retry

      // Check if success file was created
      const successExists = await fs.access(successFile).then(() => true).catch(() => false);
      expect(successExists).toBe(true);

      if (successExists) {
        const success = await fs.readFile(successFile, 'utf-8');
        expect(success).toBe('Success after retry');
      }

      // Then check overall success
      expect(result.success).toBe(true);
      expect(result.steps?.[0].success).toBe(true);
    });

    it('should continue on error when specified', async () => {
      const task: TaskDefinition = {
        steps: [
          { name: 'Step 1', command: `echo "1" > ${path.join(testDir, 'cont1.txt')}` },
          {
            name: 'Step 2',
            command: 'false',  // This will fail
            onFailure: 'continue',
          },
          { name: 'Step 3', command: `echo "3" > ${path.join(testDir, 'cont3.txt')}` },
        ],
      };

      const result = await executor.execute('continue', task);

      expect(result.steps).toHaveLength(3);
      expect(result.steps?.[1].success).toBe(false); // Failed but continued due to 'continue' handler

      // Both files should exist
      await expect(fs.access(path.join(testDir, 'cont1.txt'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(testDir, 'cont3.txt'))).resolves.toBeUndefined();
    });
  });

  describe('dry run mode', () => {
    it('should not execute commands in dry run mode', async () => {
      const dryRunExecutor = new TaskExecutor({
        interpolator,
        targetResolver,
        dryRun: true,
      });

      const outputFile = path.join(testDir, 'dangerous.txt');
      const task: TaskDefinition = {
        command: `echo "Should not be created" > ${outputFile}`,
      };

      const result = await dryRunExecutor.execute('dangerous', task);

      expect(result.success).toBe(true);

      // File should not exist
      await expect(fs.access(outputFile)).rejects.toThrow();
    });
  });

  describe('event emission', () => {
    it('should emit task lifecycle events', async () => {
      const events: any[] = [];

      executor.on('task:start', event => events.push({ type: 'start', ...event }));
      executor.on('task:complete', event => events.push({ type: 'complete', ...event }));

      const task: TaskDefinition = {
        command: `echo "test" > ${path.join(testDir, 'events.txt')}`,
      };

      await executor.execute('events', task);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('start');
      expect(events[0].task).toBe('events');
      expect(events[1].type).toBe('complete');
      expect(events[1].result.success).toBe(true);
    });

    it('should emit error events', async () => {
      const events: any[] = [];
      executor.on('task:error', event => events.push(event));

      const task: TaskDefinition = {
        command: 'command-that-does-not-exist-12345',
      };

      await executor.execute('error', task);

      expect(events).toHaveLength(1);
      expect(events[0].error).toBeDefined();
    });
  });

  describe('step registration', () => {
    it('should register step output for use in subsequent steps', async () => {
      const task: TaskDefinition = {
        steps: [
          {
            name: 'Generate value',
            command: 'echo "generated-value"',
            register: 'generated',
          },
          {
            name: 'Use value',
            command: `echo "\${vars.generated}" > ${path.join(testDir, 'registered.txt')}`,
          },
        ],
      };

      await executor.execute('register', task);

      const content = await fs.readFile(path.join(testDir, 'registered.txt'), 'utf-8');
      expect(content.trim()).toBe('generated-value');
    });
  });

  describe('timeout handling', () => {
    it('should parse timeout strings correctly', async () => {
      const task: TaskDefinition = {
        command: `echo "test" > ${path.join(testDir, 'timeout-test.txt')}`,
        timeout: '5s',
      };

      const result = await executor.execute('timeout-test', task);

      expect(result.success).toBe(true);
      await expect(fs.access(path.join(testDir, 'timeout-test.txt'))).resolves.toBeUndefined();
    });

    it('should handle timeout numbers', async () => {
      const task: TaskDefinition = {
        command: `echo "test" > ${path.join(testDir, 'timeout-num.txt')}`,
        timeout: 3000,
      };

      const result = await executor.execute('timeout-num', task);

      expect(result.success).toBe(true);
      await expect(fs.access(path.join(testDir, 'timeout-num.txt'))).resolves.toBeUndefined();
    });
  });

  describe('script execution', () => {
    it('should execute script tasks', async () => {
      const scriptPath = path.join(testDir, 'script.js');
      await fs.writeFile(scriptPath, `
        import { writeFileSync } from 'fs';
        writeFileSync('${path.join(testDir, 'script-output.txt')}', 'Script executed');
      `);

      const task: TaskDefinition = {
        script: scriptPath,
      };

      const result = await executor.execute('script-task', task);

      expect(result.success).toBe(true);
      const content = await fs.readFile(path.join(testDir, 'script-output.txt'), 'utf-8');
      expect(content).toBe('Script executed');
    });

    it('should execute step scripts', async () => {
      const scriptPath = path.join(testDir, 'step-script.js');
      await fs.writeFile(scriptPath, `
        import { writeFileSync } from 'fs';
        writeFileSync('${path.join(testDir, 'step-script-output.txt')}', 'Step script executed');
      `);

      const task: TaskDefinition = {
        steps: [
          {
            name: 'Run script',
            script: scriptPath,
          },
        ],
      };

      const result = await executor.execute('step-script', task);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      const content = await fs.readFile(path.join(testDir, 'step-script-output.txt'), 'utf-8');
      expect(content).toBe('Step script executed');
    });
  });

  describe('working directory', () => {
    it('should use task workdir', async () => {
      const subDir = path.join(testDir, 'subdir');
      await fs.mkdir(subDir);

      const task: TaskDefinition = {
        command: 'pwd > workdir.txt',
        workdir: subDir,
      };

      await executor.execute('workdir-test', task);

      const content = await fs.readFile(path.join(subDir, 'workdir.txt'), 'utf-8');
      // Resolve symlinks on macOS which adds /private prefix
      const expectedPath = await fs.realpath(subDir);
      expect(content.trim()).toBe(expectedPath);
    });

    it('should use execution options cwd over task workdir', async () => {
      const subDir1 = path.join(testDir, 'subdir1');
      const subDir2 = path.join(testDir, 'subdir2');
      await fs.mkdir(subDir1);
      await fs.mkdir(subDir2);

      const task: TaskDefinition = {
        command: 'pwd > cwd-override.txt',
        workdir: subDir1,
      };

      await executor.execute('cwd-override', task, {
        cwd: subDir2,
      });

      const content = await fs.readFile(path.join(subDir2, 'cwd-override.txt'), 'utf-8');
      // Resolve symlinks on macOS which adds /private prefix
      const expectedPath = await fs.realpath(subDir2);
      expect(content.trim()).toBe(expectedPath);
    });
  });

  describe('environment variables', () => {
    it('should pass environment variables', async () => {
      const task: TaskDefinition = {
        command: `node -e "console.log(process.env.TEST_VAR)" > ${path.join(testDir, 'env-test.txt')}`,
      };

      await executor.execute('env-test', task, {
        env: { TEST_VAR: 'test-value' },
      });

      const content = await fs.readFile(path.join(testDir, 'env-test.txt'), 'utf-8');
      expect(content.trim()).toBe('test-value');
    });
  });

  describe('error propagation', () => {
    it('should handle task-level onError', async () => {
      const events: any[] = [];
      executor.on('event', event => events.push(event));

      const task: TaskDefinition = {
        command: 'false',  // Command that fails
        onError: {
          emit: 'task-failed',
        },
      };

      await executor.execute('error-handler', task);

      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('task-failed');
    });
  });

  describe('multiple targets', () => {
    it('should execute on multiple targets', async () => {
      // For this test, we'll simulate multiple target execution by creating
      // separate files for each simulated target execution
      const task: TaskDefinition = {
        steps: [
          {
            name: 'Target 1',
            command: `echo "target1" > ${path.join(testDir, 'target1.txt')}`,
          },
          {
            name: 'Target 2',
            command: `echo "target2" > ${path.join(testDir, 'target2.txt')}`,
          },
          {
            name: 'Target 3',
            command: `echo "target3" > ${path.join(testDir, 'target3.txt')}`,
          },
        ],
      };

      const result = await executor.execute('multi-target', task);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);

      // Check that all files were created
      const content1 = await fs.readFile(path.join(testDir, 'target1.txt'), 'utf-8');
      const content2 = await fs.readFile(path.join(testDir, 'target2.txt'), 'utf-8');
      const content3 = await fs.readFile(path.join(testDir, 'target3.txt'), 'utf-8');

      expect(content1.trim()).toBe('target1');
      expect(content2.trim()).toBe('target2');
      expect(content3.trim()).toBe('target3');
    });
  });

  describe('step retry mechanism', () => {
    it('should emit retry events', async () => {
      const retryEvents: any[] = [];
      executor.on('step:retry', event => retryEvents.push(event));

      const attemptFile = path.join(testDir, 'retry-attempts.txt');

      // Create a script that fails on first attempt
      const scriptPath = path.join(testDir, 'retry-event-script.js');
      await fs.writeFile(scriptPath, `
        import { readFileSync, writeFileSync } from 'fs';
        const attemptFile = '${attemptFile}';
        
        // Count attempts
        let attempts = 0;
        try {
          const content = readFileSync(attemptFile, 'utf-8');
          attempts = parseInt(content) || 0;
        } catch (e) {}
        
        attempts++;
        writeFileSync(attemptFile, String(attempts));
        
        // Fail on first attempt
        if (attempts === 1) {
          process.exit(1);
        }
      `);

      const task: TaskDefinition = {
        steps: [
          {
            name: 'Retry with events',
            command: `node ${scriptPath}`,
            onFailure: {
              retry: 1,
              delay: '5ms',
            },
          },
        ],
      };

      await executor.execute('retry-events', task);

      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0].attempt).toBe(1);
      expect(retryEvents[0].maxAttempts).toBe(1);
    });
  });

  describe('task output handling', () => {
    it('should suppress output in quiet mode', async () => {
      const consoleLog = jest.spyOn(console, 'log');
      const consoleError = jest.spyOn(console, 'error');

      const task: TaskDefinition = {
        command: `echo "test" > ${path.join(testDir, 'quiet.txt')}`,
      };

      await executor.execute('quiet-test', task, { quiet: true });

      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();

      consoleLog.mockRestore();
      consoleError.mockRestore();
    });
  });
});