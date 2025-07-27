import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { globalCache } from '../../../src/utils/cache.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';

import type { ExecutionResult } from '../../../src/core/result.js';

describe('ProcessPromise Cache', () => {
  let engine: ExecutionEngine;
  
  beforeEach(() => {
    engine = new ExecutionEngine();
    globalCache.clear();
  });
  
  afterEach(async () => {
    await engine.dispose();
  });
  
  describe('Basic caching', () => {
    it('should cache command results', async () => {
      // Mock execute to track calls
      let executeCalls = 0;
      const originalExecute = engine.execute.bind(engine);
      engine.execute = jest.fn().mockImplementation(async (cmd) => {
        executeCalls++;
        return {
          stdout: `Execution ${executeCalls}`,
          stderr: '',
          exitCode: 0,
          signal: undefined,
          command: cmd.command || '',
          duration: 100,
          startedAt: new Date(),
          finishedAt: new Date(),
          adapter: 'mock',
          toString: () => `Execution ${executeCalls}`,
          toJSON: () => ({ stdout: `Execution ${executeCalls}`, stderr: '', exitCode: 0 }),
          throwIfFailed: () => {},
          isSuccess: () => true
        };
      });
      
      // First execution
      const result1 = await engine.run`echo test`.cache();
      expect(result1.stdout).toBe('Execution 1');
      expect(executeCalls).toBe(1);
      
      // Second execution should use cache
      const result2 = await engine.run`echo test`.cache();
      expect(result2.stdout).toBe('Execution 1'); // Same result
      expect(executeCalls).toBe(1); // Not called again
    });
    
    it('should cache with custom key', async () => {
      let executeCalls = 0;
      engine.execute = jest.fn().mockImplementation(async () => {
        executeCalls++;
        return {
          stdout: `Call ${executeCalls}`,
          stderr: '',
          exitCode: 0,
          signal: undefined,
          command: 'test',
          duration: 100,
          startedAt: new Date(),
          finishedAt: new Date(),
          adapter: 'mock',
          toString: () => `Call ${executeCalls}`,
          toJSON: () => ({ stdout: `Call ${executeCalls}`, stderr: '', exitCode: 0 }),
          throwIfFailed: () => {},
          isSuccess: () => true
        };
      });
      
      // Different commands but same cache key
      const result1 = await engine.run`echo test1`.cache({ key: 'my-key' });
      const result2 = await engine.run`echo test2`.cache({ key: 'my-key' });
      
      expect(result1.stdout).toBe('Call 1');
      expect(result2.stdout).toBe('Call 1'); // Same cached result
      expect(executeCalls).toBe(1);
    });
    
    it('should respect TTL', async () => {
      jest.useFakeTimers();
      
      let counter = 0;
      engine.execute = jest.fn().mockImplementation(async () => {
        counter++;
        return {
          stdout: `Counter: ${counter}`,
          stderr: '',
          exitCode: 0,
          signal: undefined,
          command: 'test',
          duration: 100,
          startedAt: new Date(),
          finishedAt: new Date(),
          adapter: 'mock',
          toString: () => `Counter: ${counter}`,
          toJSON: () => ({ stdout: `Counter: ${counter}`, stderr: '', exitCode: 0 }),
          throwIfFailed: () => {},
          isSuccess: () => true
        };
      });
      
      // Cache with 2 second TTL
      const result1 = await engine.run`echo test`.cache({ ttl: 2000 });
      expect(result1.stdout).toBe('Counter: 1');
      
      // Still cached
      jest.advanceTimersByTime(1000);
      const result2 = await engine.run`echo test`.cache({ ttl: 2000 });
      expect(result2.stdout).toBe('Counter: 1');
      
      // Expired
      jest.advanceTimersByTime(2000);
      const result3 = await engine.run`echo test`.cache({ ttl: 2000 });
      expect(result3.stdout).toBe('Counter: 2');
      
      jest.useRealTimers();
    });
  });
  
  describe('Cache invalidation', () => {
    it('should invalidate related caches', async () => {
      let dbCount = 100;
      engine.execute = jest.fn().mockImplementation(async (cmd) => {
        if (cmd.command?.includes('SELECT COUNT')) {
          return {
            stdout: `${dbCount}`,
            stderr: '',
            exitCode: 0,
            signal: undefined,
            command: cmd.command,
            duration: 100,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'mock',
            toString: () => `${dbCount}`,
            toJSON: () => ({ stdout: `${dbCount}`, stderr: '', exitCode: 0 }),
            throwIfFailed: () => {},
            isSuccess: () => true
          };
        } else if (cmd.command?.includes('INSERT')) {
          dbCount++;
          return {
            stdout: 'INSERT successful',
            stderr: '',
            exitCode: 0,
            signal: undefined,
            command: cmd.command,
            duration: 100,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'mock',
            toString: () => 'INSERT successful',
            toJSON: () => ({ stdout: 'INSERT successful', stderr: '', exitCode: 0 }),
            throwIfFailed: () => {},
            isSuccess: () => true
          };
        }
        return {} as ExecutionResult;
      });
      
      // Cache read operation
      const count1 = await engine.run`SELECT COUNT(*) FROM users`.cache({ key: 'user-count' });
      expect(count1.stdout).toBe('100');
      
      // Write operation that invalidates cache
      await engine.run`INSERT INTO users VALUES (...)`.cache({
        key: 'insert-user',
        invalidateOn: ['user-count']
      });
      
      // Read again - should execute again
      const count2 = await engine.run`SELECT COUNT(*) FROM users`.cache({ key: 'user-count' });
      expect(count2.stdout).toBe('101');
    });
    
    it('should invalidate with patterns', async () => {
      engine.execute = jest.fn().mockImplementation(async (cmd) => ({
        stdout: cmd.command || '',
        stderr: '',
        exitCode: 0,
        signal: undefined,
        command: cmd.command || '',
        duration: 100,
        startedAt: new Date(),
        finishedAt: new Date(),
        adapter: 'mock',
        toString: () => cmd.command || '',
        toJSON: () => ({ stdout: cmd.command || '', stderr: '', exitCode: 0 }),
        throwIfFailed: () => {},
        isSuccess: () => true
      }));
      
      // Cache multiple related operations
      await engine.run`api-users`.cache({ key: 'api-users' });
      await engine.run`api-posts`.cache({ key: 'api-posts' });
      await engine.run`db-stats`.cache({ key: 'db-stats' });
      
      // Verify all are cached
      const executeCalls = (engine.execute as jest.Mock).mock.calls.length;
      
      // Access cached values
      await engine.run`api-users`.cache({ key: 'api-users' });
      await engine.run`api-posts`.cache({ key: 'api-posts' });
      expect((engine.execute as jest.Mock).mock.calls.length).toBe(executeCalls);
      
      // Invalidate all api-* caches
      await engine.run`update-api`.cache({
        key: 'update',
        invalidateOn: ['api-*']
      });
      
      // API caches should be invalidated
      await engine.run`api-users`.cache({ key: 'api-users' });
      await engine.run`api-posts`.cache({ key: 'api-posts' });
      
      // Should have executed 2 more times (api-users and api-posts)
      expect((engine.execute as jest.Mock).mock.calls.length).toBe(executeCalls + 3);
      
      // DB cache should still be valid
      const callsBefore = (engine.execute as jest.Mock).mock.calls.length;
      await engine.run`db-stats`.cache({ key: 'db-stats' });
      expect((engine.execute as jest.Mock).mock.calls.length).toBe(callsBefore);
    });
  });
  
  describe('Cache scope', () => {
    it('should scope cache by environment variables', async () => {
      let executeCalls = 0;
      engine.execute = jest.fn().mockImplementation(async (cmd) => {
        executeCalls++;
        const env = cmd.env?.NODE_ENV || 'default';
        return {
          stdout: `Environment: ${env}, Call: ${executeCalls}`,
          stderr: '',
          exitCode: 0,
          signal: undefined,
          command: cmd.command || '',
          duration: 100,
          startedAt: new Date(),
          finishedAt: new Date(),
          adapter: 'mock',
          toString: () => `Environment: ${env}, Call: ${executeCalls}`,
          toJSON: () => ({ stdout: `Environment: ${env}, Call: ${executeCalls}`, stderr: '', exitCode: 0 }),
          throwIfFailed: () => {},
          isSuccess: () => true
        };
      });
      
      // Same command, different environments
      const dev = await engine.run`echo config`.env({ NODE_ENV: 'development' }).cache();
      const prod = await engine.run`echo config`.env({ NODE_ENV: 'production' }).cache();
      
      expect(dev.stdout).toContain('Environment: development');
      expect(prod.stdout).toContain('Environment: production');
      expect(executeCalls).toBe(2); // Both executed
      
      // Access again - should use cache
      const dev2 = await engine.run`echo config`.env({ NODE_ENV: 'development' }).cache();
      const prod2 = await engine.run`echo config`.env({ NODE_ENV: 'production' }).cache();
      
      expect(dev2.stdout).toBe(dev.stdout);
      expect(prod2.stdout).toBe(prod.stdout);
      expect(executeCalls).toBe(2); // No new executions
    });
    
    it('should scope cache by working directory', async () => {
      let executeCalls = 0;
      engine.execute = jest.fn().mockImplementation(async (cmd) => {
        executeCalls++;
        return {
          stdout: `CWD: ${cmd.cwd}, Call: ${executeCalls}`,
          stderr: '',
          exitCode: 0,
          signal: undefined,
          command: cmd.command || '',
          duration: 100,
          startedAt: new Date(),
          finishedAt: new Date(),
          adapter: 'mock',
          toString: () => `CWD: ${cmd.cwd}, Call: ${executeCalls}`,
          toJSON: () => ({ stdout: `CWD: ${cmd.cwd}, Call: ${executeCalls}`, stderr: '', exitCode: 0 }),
          throwIfFailed: () => {},
          isSuccess: () => true
        };
      });
      
      // Same command, different directories
      const dir1 = await engine.run`ls`.cwd('/tmp').cache();
      const dir2 = await engine.run`ls`.cwd('/home').cache();
      
      expect(dir1.stdout).toContain('CWD: /tmp');
      expect(dir2.stdout).toContain('CWD: /home');
      expect(executeCalls).toBe(2);
    });
  });
  
  describe('Error handling', () => {
    it('should not cache failed commands by default', async () => {
      let callCount = 0;
      engine.execute = jest.fn().mockImplementation(async () => {
        callCount++;
        throw new Error(`Error ${callCount}`);
      });
      
      // First execution fails
      try {
        await engine.run`failing-command`.cache();
      } catch (error: any) {
        expect(error.message).toBe('Error 1');
      }
      
      // Second execution should also execute (not cached)
      try {
        await engine.run`failing-command`.cache();
      } catch (error: any) {
        expect(error.message).toBe('Error 2');
      }
      
      expect(callCount).toBe(2);
    });
    
    it('should handle cache with nothrow', async () => {
      let executeCalls = 0;
      engine.execute = jest.fn().mockImplementation(async () => {
        executeCalls++;
        if (executeCalls === 1) {
          throw new Error('First call fails');
        }
        return {
          stdout: 'Success',
          stderr: '',
          exitCode: 0,
          signal: undefined,
          command: 'test',
          duration: 100,
          startedAt: new Date(),
          finishedAt: new Date(),
          adapter: 'mock',
          toString: () => 'Success',
          toJSON: () => ({ stdout: 'Success', stderr: '', exitCode: 0 }),
          throwIfFailed: () => {},
          isSuccess: () => true
        };
      });
      
      // First call with nothrow returns error result
      const result1 = await engine.run`test-command`.nothrow().cache();
      expect(result1.exitCode).toBe(1);
      expect(result1.stderr).toContain('First call fails');
      
      // Error results are cached
      const result2 = await engine.run`test-command`.nothrow().cache();
      expect(result2.exitCode).toBe(1);
      expect(executeCalls).toBe(1); // Not called again
    });
  });
  
  describe('Cache events', () => {
    it('should emit cache hit events', async () => {
      const cacheEvents: any[] = [];
      engine.on('cache:hit', (event) => {
        cacheEvents.push(event);
      });
      
      engine.execute = jest.fn().mockResolvedValue({
        stdout: 'Cached result',
        stderr: '',
        exitCode: 0,
        signal: undefined,
        command: 'test',
        duration: 100,
        startedAt: new Date(),
        finishedAt: new Date(),
        adapter: 'mock',
        toString: () => 'Cached result',
        toJSON: () => ({ stdout: 'Cached result', stderr: '', exitCode: 0 }),
        throwIfFailed: () => {},
        isSuccess: () => true
      });
      
      // First execution - no cache hit
      await engine.run`echo test`.cache({ key: 'test-key' });
      expect(cacheEvents.length).toBe(0);
      
      // Second execution - cache hit
      await engine.run`echo test`.cache({ key: 'test-key' });
      expect(cacheEvents.length).toBe(1);
      expect(cacheEvents[0].command).toBe('echo test');
      expect(cacheEvents[0].key).toBe('test-key');
    });
  });
});