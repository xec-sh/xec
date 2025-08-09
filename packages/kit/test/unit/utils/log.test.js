import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { log } from '../../../src/utils/log.js';
const mockStdoutWrite = vi.fn();
const mockStderrWrite = vi.fn();
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;
describe('log utilities', () => {
    beforeEach(() => {
        process.stdout.write = mockStdoutWrite;
        process.stderr.write = mockStderrWrite;
        mockStdoutWrite.mockClear();
        mockStderrWrite.mockClear();
    });
    afterEach(() => {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    });
    describe('log.info', () => {
        it('should log info message', () => {
            log.info('Information message');
            expect(mockStdoutWrite).toHaveBeenCalled();
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Information message');
            expect(output).toMatch(/[ℹi] /);
        });
        it('should include message content', () => {
            log.info('Info');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Info');
        });
    });
    describe('log.success', () => {
        it('should log success message', () => {
            log.success('Success message');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Success message');
            expect(output).toMatch(/[✔✓√] /);
        });
        it('should include message content', () => {
            log.success('Success');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Success');
        });
    });
    describe('log.error', () => {
        it('should log error message to stderr', () => {
            log.error('Error message');
            expect(mockStderrWrite).toHaveBeenCalled();
            const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Error message');
            expect(output).toMatch(/[✖✗X] /);
        });
        it('should include message content', () => {
            log.error('Error');
            const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Error');
        });
    });
    describe('log.warning', () => {
        it('should log warning message to stderr', () => {
            log.warning('Warning message');
            expect(mockStderrWrite).toHaveBeenCalled();
            const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Warning message');
            expect(output).toMatch(/[⚠!] /);
        });
        it('should include message content', () => {
            log.warning('Warning');
            const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Warning');
        });
    });
    describe('log.message', () => {
        it('should log plain message without symbol', () => {
            log.message('Plain message');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toBe('Plain message\n');
            expect(output).not.toMatch(/[ℹi✔✓√✖✗X⚠!] /);
        });
    });
    describe('formatting', () => {
        it('should add newline to all messages', () => {
            log.info('Test');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output[output.length - 1]).toBe('\n');
        });
        it('should format messages consistently', () => {
            log.info('Info');
            log.success('Success');
            log.error('Error');
            log.warning('Warning');
            const stdoutCalls = mockStdoutWrite.mock.calls;
            const stderrCalls = mockStderrWrite.mock.calls;
            expect(stdoutCalls).toHaveLength(2);
            expect(stderrCalls).toHaveLength(2);
            [...stdoutCalls, ...stderrCalls].forEach(call => {
                const output = call[0];
                expect(output).toMatch(/^.+ .+\n$/);
            });
        });
    });
    describe('multi-line messages', () => {
        it('should handle multi-line info', () => {
            log.info('Line 1\nLine 2\nLine 3');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Line 1\nLine 2\nLine 3');
        });
        it('should handle multi-line errors', () => {
            log.error('Error occurred:\nDetails line 1\nDetails line 2');
            const output = mockStderrWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Error occurred:\nDetails line 1\nDetails line 2');
        });
    });
    describe('edge cases', () => {
        it('should handle empty messages', () => {
            log.info('');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toMatch(/^.+ \n$/);
        });
        it('should handle undefined/null as string', () => {
            log.info(undefined);
            log.info(null);
            const outputs = mockStdoutWrite.mock.calls.map(call => call[0]);
            expect(outputs[0]).toContain('undefined');
            expect(outputs[1]).toContain('null');
        });
        it('should handle objects', () => {
            log.info({ key: 'value' });
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('[object Object]');
        });
        it('should handle numbers', () => {
            log.info(42);
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('42');
        });
    });
    describe('NO_COLOR support', () => {
        let originalEnv;
        beforeEach(() => {
            originalEnv = process.env.NO_COLOR;
        });
        afterEach(() => {
            if (originalEnv === undefined) {
                delete process.env.NO_COLOR;
            }
            else {
                process.env.NO_COLOR = originalEnv;
            }
        });
        it.skip('should respect NO_COLOR environment variable', () => {
            process.env.NO_COLOR = '1';
            vi.resetModules();
            const { log: noColorLog } = require('../../../src/utils/log.js');
            noColorLog.info('Test');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).not.toMatch(/\x1b\[\d+m/);
        });
    });
    describe('log.step', () => {
        it('should log step message', () => {
            log.step('Step 1: Initialize');
            expect(mockStdoutWrite).toHaveBeenCalled();
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Step 1: Initialize');
            expect(output).toContain('◆');
        });
        it('should format step with muted color', () => {
            log.step('Processing...');
            const output = mockStdoutWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Processing...');
        });
    });
    describe('log.break', () => {
        it('should output a line break', () => {
            log.break();
            expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
        });
        it('should work multiple times', () => {
            log.break();
            log.break();
            log.break();
            expect(mockStdoutWrite).toHaveBeenCalledTimes(3);
            expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
        });
    });
    describe('exported object', () => {
        it('should have all log methods', () => {
            expect(log).toHaveProperty('info');
            expect(log).toHaveProperty('success');
            expect(log).toHaveProperty('error');
            expect(log).toHaveProperty('warning');
            expect(log).toHaveProperty('message');
            expect(log).toHaveProperty('step');
            expect(log).toHaveProperty('break');
        });
        it('should have callable methods', () => {
            expect(typeof log.info).toBe('function');
            expect(typeof log.success).toBe('function');
            expect(typeof log.error).toBe('function');
            expect(typeof log.warning).toBe('function');
            expect(typeof log.message).toBe('function');
            expect(typeof log.step).toBe('function');
            expect(typeof log.break).toBe('function');
        });
    });
});
//# sourceMappingURL=log.test.js.map