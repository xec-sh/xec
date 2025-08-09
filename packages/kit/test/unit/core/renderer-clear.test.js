import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { Renderer } from '../../../src/core/renderer.js';
import { mockProcessStreams } from '../../helpers/mock-tty.js';
import { createDefaultTheme } from '../../../src/themes/default.js';
describe('Renderer clear() method', () => {
    let streams;
    beforeEach(() => {
        streams = mockProcessStreams({ isTTY: true });
        vi.useFakeTimers();
    });
    afterEach(() => {
        streams.restore();
        vi.useRealTimers();
    });
    it('should clear all lines and position cursor at the start', () => {
        const renderer = new Renderer({ theme: createDefaultTheme() });
        const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
        renderer.render(content);
        vi.runOnlyPendingTimers();
        streams.stdout.write.mockClear();
        streams.stdout.clearLine.mockClear();
        streams.stdout.cursorTo.mockClear();
        renderer.clear();
        expect(streams.stdout.clearLine).toHaveBeenCalledTimes(1);
        expect(streams.stdout.clearLine).toHaveBeenCalledWith(0);
        expect(streams.stdout.cursorTo).toHaveBeenCalledTimes(1);
        expect(streams.stdout.cursorTo).toHaveBeenCalledWith(0);
        const writeCalls = streams.stdout.write.mock.calls.map(call => call[0]);
        expect(writeCalls).toHaveLength(4);
        for (const call of writeCalls) {
            expect(call).toContain('\x1B[1A');
            expect(call).toContain('\x1B[2K');
        }
    });
    it('should handle single line content', () => {
        const renderer = new Renderer({ theme: createDefaultTheme() });
        renderer.render('Single line');
        vi.runOnlyPendingTimers();
        streams.stdout.write.mockClear();
        streams.stdout.clearLine.mockClear();
        streams.stdout.cursorTo.mockClear();
        renderer.clear();
        expect(streams.stdout.clearLine).toHaveBeenCalledTimes(1);
        expect(streams.stdout.clearLine).toHaveBeenCalledWith(0);
        const writeCalls = streams.stdout.write.mock.calls;
        expect(writeCalls).toHaveLength(0);
    });
    it('should handle empty previous frame', () => {
        const renderer = new Renderer({ theme: createDefaultTheme() });
        renderer.clear();
        expect(streams.stdout.write).not.toHaveBeenCalled();
    });
    it('should leave cursor at top after clearing multi-line content', () => {
        const renderer = new Renderer({ theme: createDefaultTheme() });
        renderer.render('Line 1\nLine 2\nLine 3');
        vi.runOnlyPendingTimers();
        streams.stdout.write.mockClear();
        streams.stdout.clearLine.mockClear();
        renderer.clear();
        expect(streams.stdout.clearLine).toHaveBeenCalledTimes(1);
        const clearCalls = streams.stdout.write.mock.calls.filter(call => typeof call[0] === 'string' && call[0].includes('\x1B[1A'));
        expect(clearCalls).toHaveLength(2);
        streams.stdout.write.mockClear();
        renderer.render('New line');
        vi.runOnlyPendingTimers();
        const renderOutput = streams.stdout.write.mock.calls
            .filter(call => typeof call[0] === 'string' && !call[0].includes('\x1B'))
            .map(call => call[0])
            .join('');
        expect(renderOutput).toBe('New line');
    });
});
//# sourceMappingURL=renderer-clear.test.js.map