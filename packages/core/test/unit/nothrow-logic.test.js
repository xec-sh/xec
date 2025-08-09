import { it, jest, expect, describe, beforeEach } from '@jest/globals';
import { CommandError } from '../../src/core/error.js';
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine } from '../../src/core/execution-engine.js';
describe('nothrow() and throwOnNonZeroExit logic', () => {
    let mockAdapter;
    beforeEach(() => {
        jest.clearAllMocks();
        mockAdapter = new MockAdapter();
        mockAdapter.clearMocks();
    });
    describe('when throwOnNonZeroExit is true (default for adapters)', () => {
        let engine;
        beforeEach(() => {
            engine = new ExecutionEngine({
                throwOnNonZeroExit: true
            });
            mockAdapter.clearMocks();
            engine.registerAdapter('mock', mockAdapter);
        });
        it('should throw CommandError on non-zero exit without nothrow()', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            });
            await expect(command).rejects.toThrow(CommandError);
        });
        it('should not throw on non-zero exit with nothrow()', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            }).nothrow();
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
        it('should not throw on zero exit with nothrow()', async () => {
            mockAdapter.mockDefault({
                stdout: 'success output',
                stderr: '',
                exitCode: 0
            });
            const command = engine.createProcessPromise({
                command: 'echo test',
                adapter: 'mock'
            }).nothrow();
            const result = await command;
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('success output');
            expect(result.stderr).toBe('');
        });
    });
    describe('when throwOnNonZeroExit is false', () => {
        let engine;
        beforeEach(() => {
            engine = new ExecutionEngine({
                throwOnNonZeroExit: false
            });
            mockAdapter.clearMocks();
            mockAdapter = new MockAdapter({ throwOnNonZeroExit: false });
            engine.registerAdapter('mock', mockAdapter);
        });
        it('should not throw on non-zero exit without nothrow()', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            });
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
        it('should not throw on non-zero exit with nothrow() (no-op)', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            }).nothrow();
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
        it('should not throw on zero exit with nothrow()', async () => {
            mockAdapter.mockDefault({
                stdout: 'success output',
                stderr: '',
                exitCode: 0
            });
            const command = engine.createProcessPromise({
                command: 'echo test',
                adapter: 'mock'
            }).nothrow();
            const result = await command;
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('success output');
            expect(result.stderr).toBe('');
        });
    });
    describe('method chaining with nothrow()', () => {
        let engine;
        beforeEach(() => {
            engine = new ExecutionEngine({
                throwOnNonZeroExit: true
            });
            mockAdapter.clearMocks();
            engine.registerAdapter('mock', mockAdapter);
        });
        it('should work with timeout().nothrow()', async () => {
            mockAdapter.clearMocks();
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            }).nothrow().timeout(5000);
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
        it('should work with nothrow().timeout()', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            }).nothrow().timeout(5000);
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
        it('should work with quiet().nothrow()', async () => {
            mockAdapter.clearMocks();
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            }).nothrow().quiet();
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
    });
    describe('edge cases', () => {
        let engine;
        beforeEach(() => {
            engine = new ExecutionEngine({
                throwOnNonZeroExit: true
            });
            mockAdapter.clearMocks();
            engine.registerAdapter('mock', mockAdapter);
        });
        it('should handle multiple nothrow() calls', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock'
            }).nothrow().nothrow().nothrow();
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
        it('should handle command with explicit nothrow field', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock',
                nothrow: true
            });
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
        it('should handle command with nothrow field and nothrow() method', async () => {
            mockAdapter.mockDefault({
                stdout: 'error output',
                stderr: 'error message',
                exitCode: 1
            });
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'mock',
                nothrow: true
            }).nothrow();
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe('error output');
            expect(result.stderr).toBe('error message');
        });
    });
    describe('with real command execution', () => {
        let engine;
        beforeEach(() => {
            engine = new ExecutionEngine({
                throwOnNonZeroExit: true
            });
        });
        it('should handle real command with nothrow()', async () => {
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'local'
            }).nothrow();
            const result = await command;
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('Command failed with exit code 1');
        });
        it('should handle real command without nothrow()', async () => {
            const command = engine.createProcessPromise({
                command: 'exit 1',
                adapter: 'local'
            });
            await expect(command).rejects.toThrow();
        });
    });
});
//# sourceMappingURL=nothrow-logic.test.js.map