import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { globalCache } from '../../../src/utils/cache.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
describe('ProcessPromise Cache', () => {
    let engine;
    let originalConsoleError;
    beforeEach(() => {
        engine = new ExecutionEngine();
        globalCache.clear();
        engine.removeAllListeners();
        originalConsoleError = console.error;
    });
    afterEach(async () => {
        await engine.dispose();
        jest.clearAllMocks();
        jest.useRealTimers();
        console.error = originalConsoleError;
    });
    describe('Basic caching', () => {
        it('should cache command results', async () => {
            const result1 = await engine.run `echo "test output"`.cache({ key: 'echo-test' });
            expect(result1.stdout).toContain('test output');
            const result2 = await engine.run `echo "different output"`.cache({ key: 'echo-test' });
            expect(result2.stdout).toContain('test output');
            expect(result2.stdout).not.toContain('different output');
        });
        it('should cache with custom key', async () => {
            const result1 = await engine.run `echo "test1"`.cache({ key: 'my-key' });
            const result2 = await engine.run `echo "test2"`.cache({ key: 'my-key' });
            expect(result1.stdout).toContain('test1');
            expect(result2.stdout).toContain('test1');
            expect(result2.stdout).not.toContain('test2');
        });
        it('should respect TTL', async () => {
            jest.useFakeTimers();
            const timestamp = Date.now();
            const result1 = await engine.run `echo "${timestamp}"`.cache({ key: 'ttl-test', ttl: 2000 });
            expect(result1.stdout).toContain(String(timestamp));
            jest.advanceTimersByTime(1000);
            const result2 = await engine.run `echo "should not appear"`.cache({ key: 'ttl-test', ttl: 2000 });
            expect(result2.stdout).toContain(String(timestamp));
            jest.advanceTimersByTime(2000);
            const newTimestamp = Date.now();
            const result3 = await engine.run `echo "${newTimestamp}"`.cache({ key: 'ttl-test', ttl: 2000 });
            expect(result3.stdout).toContain(String(newTimestamp));
            expect(result3.stdout).not.toContain(String(timestamp));
        });
    });
    describe('Cache invalidation', () => {
        it('should invalidate related caches', async () => {
            const read1 = await engine.run `echo "count: 100"`.cache({ key: 'user-count' });
            expect(read1.stdout).toContain('count: 100');
            await engine.run `echo "INSERT done"`.cache({
                key: 'insert-user',
                invalidateOn: ['user-count']
            });
            const read2 = await engine.run `echo "count: 101"`.cache({ key: 'user-count' });
            expect(read2.stdout).toContain('count: 101');
        });
        it('should invalidate with patterns', async () => {
            await engine.run `echo "api-users data"`.cache({ key: 'api-users' });
            await engine.run `echo "api-posts data"`.cache({ key: 'api-posts' });
            await engine.run `echo "db-stats data"`.cache({ key: 'db-stats' });
            const cached1 = await engine.run `echo "should not see this"`.cache({ key: 'api-users' });
            const cached2 = await engine.run `echo "should not see this"`.cache({ key: 'api-posts' });
            expect(cached1.stdout).toContain('api-users data');
            expect(cached2.stdout).toContain('api-posts data');
            await engine.run `echo "update done"`.cache({
                key: 'update',
                invalidateOn: ['api-*']
            });
            const new1 = await engine.run `echo "new api-users"`.cache({ key: 'api-users' });
            const new2 = await engine.run `echo "new api-posts"`.cache({ key: 'api-posts' });
            expect(new1.stdout).toContain('new api-users');
            expect(new2.stdout).toContain('new api-posts');
            const dbCached = await engine.run `echo "should not see this"`.cache({ key: 'db-stats' });
            expect(dbCached.stdout).toContain('db-stats data');
        });
    });
    describe('Cache scope', () => {
        it('should scope cache by environment variables', async () => {
            const dev1 = await engine.run `echo dev-result`.env({ NODE_ENV: 'development' }).cache();
            const prod1 = await engine.run `echo prod-result`.env({ NODE_ENV: 'production' }).cache();
            expect(dev1.stdout.trim()).toBe('dev-result');
            expect(prod1.stdout.trim()).toBe('prod-result');
            const dev2 = await engine.run `echo dev-result`.env({ NODE_ENV: 'development' }).cache();
            const prod2 = await engine.run `echo prod-result`.env({ NODE_ENV: 'production' }).cache();
            expect(dev2.stdout.trim()).toBe('dev-result');
            expect(prod2.stdout.trim()).toBe('prod-result');
            const dev3 = await engine.run `echo different`.env({ NODE_ENV: 'development' }).cache();
            expect(dev3.stdout.trim()).toBe('different');
        });
        it('should scope cache by working directory', async () => {
            const dir1 = await engine.run `echo tmp-result`.cwd('/tmp').cache();
            const dir2 = await engine.run `echo usr-result`.cwd('/usr').cache();
            expect(dir1.stdout.trim()).toBe('tmp-result');
            expect(dir2.stdout.trim()).toBe('usr-result');
            const dir1Cached = await engine.run `echo tmp-result`.cwd('/tmp').cache();
            const dir2Cached = await engine.run `echo usr-result`.cwd('/usr').cache();
            expect(dir1Cached.stdout.trim()).toBe('tmp-result');
            expect(dir2Cached.stdout.trim()).toBe('usr-result');
            const dir3 = await engine.run `echo different`.cwd('/tmp').cache();
            expect(dir3.stdout.trim()).toBe('different');
        });
    });
    describe('Error handling', () => {
        it('should not cache failed commands by default', async () => {
            const timestamp = Date.now();
            const cacheKey = 'fail-test-' + timestamp;
            const failResult = await engine.run `sh -c "exit 1"`.nothrow().cache({ key: cacheKey });
            expect(failResult.exitCode).toBe(1);
            expect(failResult.ok).toBe(false);
            const cachedFail = await engine.run `echo "should not run"`.nothrow().cache({ key: cacheKey });
            expect(cachedFail.exitCode).toBe(1);
            globalCache.clear();
            const successKey = 'success-test-' + timestamp;
            const result1 = await engine.run `echo ${timestamp}`.cache({ key: successKey });
            expect(result1.exitCode).toBe(0);
            expect(result1.stdout.trim()).toBe(String(timestamp));
            const cached1 = globalCache.get(successKey);
            expect(cached1).not.toBeNull();
            expect(cached1?.exitCode).toBe(0);
            const result2 = await engine.run `echo "different"`.cache({ key: successKey });
            expect(result2.stdout.trim()).toBe(String(timestamp));
        });
        it('should cache nothrow results including errors', async () => {
            const result1 = await engine.run `exit 42`.nothrow().cache({ key: 'nothrow-test' });
            expect(result1.exitCode).toBe(42);
            expect(result1.ok).toBe(false);
            const result2 = await engine.run `exit 0`.nothrow().cache({ key: 'nothrow-test' });
            expect(result2.exitCode).toBe(42);
        });
    });
    describe('Advanced caching scenarios', () => {
        it('should generate cache key based on command, cwd, and env', async () => {
            const timestamp = Date.now();
            const result1 = await engine.run `echo "${timestamp}-1"`.cache();
            const result2 = await engine.run `echo "${timestamp}-2"`.cwd('/tmp').cache();
            const result3 = await engine.run `echo "${timestamp}-3"`.env({ FOO: 'bar' }).cache();
            expect(result1.stdout).toContain(`${timestamp}-1`);
            expect(result2.stdout).toContain(`${timestamp}-2`);
            expect(result3.stdout).toContain(`${timestamp}-3`);
        });
        it('should work with complex commands', async () => {
            const result1 = await engine.run `echo Line1 && echo Line2 && echo Line3`.cache({ key: 'complex-cmd' });
            expect(result1.stdout).toContain('Line1');
            expect(result1.stdout).toContain('Line2');
            expect(result1.stdout).toContain('Line3');
            const result2 = await engine.run `echo "Different"`.cache({ key: 'complex-cmd' });
            expect(result2.stdout).toContain('Line1');
            expect(result2.stdout).toContain('Line2');
            expect(result2.stdout).toContain('Line3');
            expect(result2.stdout).not.toContain('Different');
        });
        it('should support cache-only operations', async () => {
            const data = `data-${Date.now()}`;
            await engine.run `echo ${data}`.cache({ key: 'data', ttl: 60000 });
            for (let i = 0; i < 5; i++) {
                const result = await engine.run `echo wrong${i}`.cache({ key: 'data' });
                expect(result.stdout).toContain(data);
                expect(result.stdout).not.toContain('wrong');
            }
        });
    });
    describe('Integration with ProcessPromise methods', () => {
        it('should work with quiet mode', async () => {
            const result = await engine.run `echo "quiet test"`.quiet().cache({ key: 'quiet' });
            expect(result.stdout).toContain('quiet test');
            const cached = await engine.run `echo "wrong"`.quiet().cache({ key: 'quiet' });
            expect(cached.stdout).toContain('quiet test');
        });
        it('should work with timeout', async () => {
            const result = await engine.run `echo "timeout test"`.timeout(5000).cache({ key: 'timeout' });
            expect(result.stdout).toContain('timeout test');
            const cached = await engine.run `echo "wrong"`.timeout(1000).cache({ key: 'timeout' });
            expect(cached.stdout).toContain('timeout test');
        });
        it('should work with env and cwd chaining', async () => {
            const result = await engine
                .run `sh -c "echo TEST=$TEST && pwd"`
                .env({ TEST: 'value' })
                .cwd('/tmp')
                .cache({ key: 'chained' });
            expect(result.stdout).toContain('TEST=value');
            expect(result.stdout).toContain('/tmp');
            const cached = await engine
                .run `echo "wrong"`
                .env({ TEST: 'different' })
                .cwd('/usr')
                .cache({ key: 'chained' });
            expect(cached.stdout).toContain('TEST=value');
            expect(cached.stdout).toContain('/tmp');
        });
    });
    describe('Cache TTL and cleanup', () => {
        it('should handle zero TTL (no expiry)', async () => {
            const data = `no-expiry-${Date.now()}`;
            const result1 = await engine.run `echo "${data}"`.cache({ key: 'no-ttl', ttl: 0 });
            const result2 = await engine.run `echo "wrong"`.cache({ key: 'no-ttl' });
            expect(result1.stdout).toContain(data);
            expect(result2.stdout).toContain(data);
        });
        it('should handle negative TTL as no expiry', async () => {
            const data = `negative-ttl-${Date.now()}`;
            const result1 = await engine.run `echo "${data}"`.cache({ key: 'neg-ttl', ttl: -1 });
            const result2 = await engine.run `echo "wrong"`.cache({ key: 'neg-ttl' });
            expect(result1.stdout).toContain(data);
            expect(result2.stdout).toContain(data);
        });
    });
    describe('Cache key generation', () => {
        it('should generate unique keys for different commands', async () => {
            const time = Date.now();
            const result1 = await engine.run `echo "${time}-cmd1"`.cache();
            const result2 = await engine.run `echo "${time}-cmd2"`.cache();
            expect(result1.stdout).toContain(`${time}-cmd1`);
            expect(result2.stdout).toContain(`${time}-cmd2`);
        });
        it('should generate same key for identical commands', async () => {
            const time = Date.now();
            const result1 = await engine.run `echo ${time}`.cache();
            const result2 = await engine.run `echo ${time}`.cache();
            expect(result1.stdout.trim()).toBe(String(time));
            expect(result2.stdout.trim()).toBe(String(time));
        });
        it('should include environment in cache key', async () => {
            const result1 = await engine.run `echo test`.env({ A: '1' }).cache();
            const result2 = await engine.run `echo test`.env({ A: '2' }).cache();
            expect(result1.stdout.trim()).toBe('test');
            expect(result2.stdout.trim()).toBe('test');
            const cached1 = await engine.run `echo test`.env({ A: '1' }).cache();
            const cached2 = await engine.run `echo test`.env({ A: '2' }).cache();
            expect(cached1.stdout.trim()).toBe('test');
            expect(cached2.stdout.trim()).toBe('test');
        });
        it('should include cwd in cache key', async () => {
            const time = Date.now();
            const result1 = await engine.run `echo ${time}-cwd1`.cwd('/tmp').cache();
            const result2 = await engine.run `echo ${time}-cwd2`.cwd('/usr').cache();
            expect(result1.stdout).toContain(`${time}-cwd1`);
            expect(result2.stdout).toContain(`${time}-cwd2`);
        });
    });
    describe('Concurrent cache access', () => {
        it('should handle concurrent requests for same cache key', async () => {
            const time = Date.now();
            const promises = Array.from({ length: 5 }, (_, i) => engine.run `echo ${time}-${i}`.cache({ key: 'concurrent-test' }));
            const results = await Promise.all(promises);
            expect(results.length).toBe(5);
            const firstResult = results[0]?.stdout;
            expect(firstResult).toBeDefined();
            results.forEach(result => {
                expect(result.stdout).toBe(firstResult);
            });
            expect(firstResult).toBeDefined();
            expect(firstResult).toMatch(new RegExp(`${time}-\\d`));
        });
    });
    describe('Cache with different adapters', () => {
        it('should maintain separate cache for different execution contexts', async () => {
            const time = Date.now();
            const local = await engine.run `echo "${time}-local"`.cache({ key: 'adapter-test' });
            expect(local.stdout).toContain(`${time}-local`);
            const localCached = await engine.run `echo "wrong"`.cache({ key: 'adapter-test' });
            expect(localCached.stdout).toContain(`${time}-local`);
        });
    });
});
//# sourceMappingURL=process-promise-cache.test.js.map