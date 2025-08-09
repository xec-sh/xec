import { it, expect, describe, afterEach } from '@jest/globals';
import { $ } from '../../src/index.js';
describe('Thenable Interpolation', () => {
    afterEach(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
    });
    it('should await promise interpolation', async () => {
        const promise = Promise.resolve('world');
        const result = await $ `echo hello ${promise}`;
        expect(result.stdout.trim()).toBe('hello world');
        expect(result.exitCode).toBe(0);
    });
    it('should await array promise interpolation', async () => {
        const arrayPromise = Promise.resolve(['foo', 'bar']);
        const result = await $ `echo ${arrayPromise}`;
        expect(result.stdout.trim()).toBe('foo bar');
        expect(result.exitCode).toBe(0);
    });
    it('should handle thenable objects', async () => {
        const thenable = {
            then(resolve) {
                resolve('thenable-value');
            }
        };
        const result = await $ `echo ${thenable}`;
        expect(result.stdout.trim()).toBe('thenable-value');
        expect(result.exitCode).toBe(0);
    });
    it('should handle nested promises in ExecutionResult', async () => {
        const a1 = $ `echo foo`;
        const a2 = Promise.resolve(['bar', 'baz']);
        const result = await $ `echo ${a1} ${a2}`;
        expect(result.stdout.trim()).toBe('foo bar baz');
        expect(result.exitCode).toBe(0);
    });
    it('should handle multiple promises', async () => {
        const p1 = Promise.resolve('one');
        const p2 = Promise.resolve('two');
        const p3 = Promise.resolve('three');
        const result = await $ `echo ${p1} ${p2} ${p3}`;
        expect(result.stdout.trim()).toBe('one two three');
        expect(result.exitCode).toBe(0);
    });
    it('should handle delayed promises', async () => {
        const delayedPromise = new Promise(resolve => setTimeout(() => resolve('delayed'), 10));
        const result = await $ `echo ${delayedPromise}`;
        expect(result.stdout.trim()).toBe('delayed');
        expect(result.exitCode).toBe(0);
    });
    it('should handle null and undefined in promises', async () => {
        const nullPromise = Promise.resolve(null);
        const undefinedPromise = Promise.resolve(undefined);
        const result = await $ `echo start ${nullPromise} middle ${undefinedPromise} end`;
        expect(result.stdout.trim()).toBe('start middle end');
        expect(result.exitCode).toBe(0);
    });
    it.skip('should handle promise rejection', async () => {
        const rejectedPromise = Promise.reject(new Error('Promise rejected'));
        rejectedPromise.catch(() => { });
        await expect($ `echo ${rejectedPromise}`).rejects.toThrow('Promise rejected');
    });
    it('should work with raw interpolation', async () => {
        const promise = Promise.resolve('test-value');
        const result = await $.raw `echo ${promise}`;
        expect(result.stdout.trim()).toBe('test-value');
        expect(result.exitCode).toBe(0);
    });
    it('should handle complex objects in promises', async () => {
        const objectPromise = Promise.resolve({ foo: 'bar', baz: 123 });
        const result = await $ `echo ${objectPromise}`;
        expect(result.stdout.trim()).toBe('{"foo":"bar","baz":123}');
        expect(result.exitCode).toBe(0);
    });
    it('should handle ExecutionResult stdout property', async () => {
        const cmd1 = await $ `echo hello`;
        const result = await $ `echo ${cmd1.stdout.trim()} world`;
        expect(result.stdout.trim()).toBe('hello world');
        expect(result.exitCode).toBe(0);
    });
    it('should preserve command chaining with thenables', async () => {
        const promise = Promise.resolve('test-dir');
        const result = await $ `echo ${promise}`
            .cwd('/tmp')
            .env({ TEST: 'value' })
            .timeout(5000);
        expect(result.stdout.trim()).toBe('test-dir');
        expect(result.exitCode).toBe(0);
    });
});
//# sourceMappingURL=thenable-interpolation.test.js.map