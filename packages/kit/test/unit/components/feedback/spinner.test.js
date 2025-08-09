import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { Spinner, spinner } from '../../../../src/components/feedback/spinner.js';
const mockWrite = vi.fn();
const originalWrite = process.stdout.write;
vi.useFakeTimers();
describe('Spinner', () => {
    beforeEach(() => {
        process.stdout.write = mockWrite;
        mockWrite.mockClear();
    });
    afterEach(() => {
        process.stdout.write = originalWrite;
        vi.clearAllTimers();
    });
    describe('initialization', () => {
        it('should create with default options', () => {
            const s = new Spinner();
            expect(s).toBeDefined();
            expect(s.text).toBe('');
            expect(s.frames).toHaveLength(10);
            expect(s.interval).toBe(80);
        });
        it('should create with text', () => {
            const s = new Spinner('Loading...');
            expect(s.text).toBe('Loading...');
        });
        it('should create with options', () => {
            const s = new Spinner('Loading', {
                frames: ['|', '/', '-', '\\'],
                interval: 100
            });
            expect(s.frames).toEqual(['|', '/', '-', '\\']);
            expect(s.interval).toBe(100);
        });
        it('should accept text in options', () => {
            const s = new Spinner(undefined, {
                text: 'Processing...'
            });
            expect(s.text).toBe('Processing...');
        });
    });
    describe('start/stop', () => {
        it('should start spinning', () => {
            const s = new Spinner('Loading');
            s.start();
            expect(s.isSpinning).toBe(true);
            expect(mockWrite).toHaveBeenCalled();
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Loading');
            expect(output).toContain('⠋');
            s.stop();
        });
        it('should stop spinning', () => {
            const s = new Spinner('Loading');
            s.start();
            mockWrite.mockClear();
            s.stop();
            expect(s.isSpinning).toBe(false);
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('\x1b[?25h');
        });
        it('should update frames on interval', () => {
            const s = new Spinner('Loading', {
                frames: ['1', '2', '3'],
                interval: 100
            });
            s.start();
            expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('1'));
            mockWrite.mockClear();
            vi.advanceTimersByTime(100);
            expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('2'));
            mockWrite.mockClear();
            vi.advanceTimersByTime(100);
            expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('3'));
            s.stop();
        });
        it('should cycle through frames', () => {
            const s = new Spinner('Loading', {
                frames: ['A', 'B'],
                interval: 50
            });
            s.start();
            for (let i = 0; i < 5; i++) {
                vi.advanceTimersByTime(50);
            }
            expect(s.frameIndex).toBeLessThan(2);
            s.stop();
        });
        it('should handle multiple start calls', () => {
            const s = new Spinner('Loading');
            s.start();
            const firstTimer = s.timer;
            s.start();
            expect(s.timer).toBe(firstTimer);
            s.stop();
        });
        it('should handle multiple stop calls', () => {
            const s = new Spinner('Loading');
            s.start();
            s.stop();
            expect(() => {
                s.stop();
            }).not.toThrow();
        });
    });
    describe('text updates', () => {
        it('should update text while spinning', () => {
            const s = new Spinner('Initial');
            s.start();
            mockWrite.mockClear();
            s.setText('Updated');
            vi.advanceTimersByTime(80);
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Updated');
            s.stop();
        });
        it('should accept text in start method', () => {
            const s = new Spinner();
            s.start('New text');
            expect(s.text).toBe('New text');
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('New text');
            s.stop();
        });
    });
    describe('completion methods', () => {
        it('should show success', () => {
            const s = new Spinner('Loading');
            s.start();
            mockWrite.mockClear();
            s.success('Done!');
            expect(s.isSpinning).toBe(false);
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('✓');
            expect(output).toContain('Done!');
        });
        it('should show error', () => {
            const s = new Spinner('Loading');
            s.start();
            mockWrite.mockClear();
            s.error('Failed!');
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('✗');
            expect(output).toContain('Failed!');
        });
        it('should show warning', () => {
            const s = new Spinner('Loading');
            s.start();
            mockWrite.mockClear();
            s.warn('Warning!');
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('⚠');
            expect(output).toContain('Warning!');
        });
        it('should show info', () => {
            const s = new Spinner('Loading');
            s.start();
            mockWrite.mockClear();
            s.info('Information');
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('ℹ');
            expect(output).toContain('Information');
        });
        it('should use original text if not provided', () => {
            const s = new Spinner('Original text');
            s.start();
            mockWrite.mockClear();
            s.success();
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('Original text');
        });
    });
    describe('configuration', () => {
        it('should update frames', () => {
            const s = new Spinner('Loading');
            s.setFrames(['X', 'O']);
            expect(s.frames).toEqual(['X', 'O']);
            expect(s.frameIndex).toBe(0);
        });
        it('should update interval', () => {
            const s = new Spinner('Loading');
            s.start();
            s.setInterval(200);
            expect(s.interval).toBe(200);
            s.stop();
        });
        it('should restart timer with new interval', () => {
            const s = new Spinner('Loading');
            s.start();
            const oldTimer = s.timer;
            s.setInterval(200);
            expect(s.timer).not.toBe(oldTimer);
            s.stop();
        });
    });
    describe('status checks', () => {
        it('should report active status', () => {
            const s = new Spinner('Loading');
            expect(s.isActive()).toBe(false);
            s.start();
            expect(s.isActive()).toBe(true);
            s.stop();
            expect(s.isActive()).toBe(false);
        });
    });
    describe('events', () => {
        it('should emit start event', () => {
            const s = new Spinner('Loading');
            const handler = vi.fn();
            s.on('start', handler);
            s.start();
            expect(handler).toHaveBeenCalled();
            s.stop();
        });
        it('should emit stop event', () => {
            const s = new Spinner('Loading');
            const handler = vi.fn();
            s.on('stop', handler);
            s.start();
            s.stop();
            expect(handler).toHaveBeenCalled();
        });
        it('should emit success event', () => {
            const s = new Spinner('Loading');
            const handler = vi.fn();
            s.on('success', handler);
            s.start();
            s.success('Done');
            expect(handler).toHaveBeenCalledWith('Done');
        });
        it('should emit error event', () => {
            const s = new Spinner('Loading');
            const handler = vi.fn();
            s.on('error', handler);
            s.start();
            s.error('Failed');
            expect(handler).toHaveBeenCalledWith('Failed');
        });
        it('should support removing event listeners', () => {
            const s = new Spinner('Loading');
            const handler = vi.fn();
            s.on('start', handler);
            s.off('start', handler);
            s.start();
            expect(handler).not.toHaveBeenCalled();
            s.stop();
        });
    });
    describe('factory function', () => {
        it('should create and start spinner', () => {
            const s = spinner('Loading');
            expect(s).toBeInstanceOf(Spinner);
            expect(s.isActive()).toBe(true);
            s.stop();
        });
        it('should accept options', () => {
            const s = spinner('Loading', {
                frames: ['A', 'B'],
                interval: 200
            });
            expect(s.frames).toEqual(['A', 'B']);
            expect(s.interval).toBe(200);
            s.stop();
        });
    });
    describe('rendering', () => {
        it('should hide cursor', () => {
            const s = new Spinner('Loading');
            s.start();
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('\x1b[?25l');
            s.stop();
        });
        it('should clear previous lines', () => {
            const s = new Spinner('Line 1\nLine 2');
            s.start();
            vi.advanceTimersByTime(80);
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toContain('\x1b[1A');
            expect(output).toContain('\x1b[2K');
            s.stop();
        });
        it.skip('should handle color in frames', () => {
            const s = new Spinner('Loading');
            s.start();
            const output = mockWrite.mock.calls.map(call => call[0]).join('');
            expect(output).toMatch(/\x1b\[\d+m.*⠋/);
            s.stop();
        });
    });
    describe('method chaining', () => {
        it('should support method chaining', () => {
            const s = new Spinner();
            const result = s
                .setText('Loading')
                .setFrames(['1', '2'])
                .setInterval(100)
                .start();
            expect(result).toBe(s);
            s.stop();
        });
    });
});
//# sourceMappingURL=spinner.test.js.map