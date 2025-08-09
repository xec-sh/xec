import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import { getSymbol, createColors, colorSupport, supportsUnicode, getFallbackTheme, detectColorSupport } from '../../../src/utils/colors.js';
describe('color utilities', () => {
    let originalEnv;
    let originalStdout;
    beforeEach(() => {
        originalEnv = { ...process.env };
        originalStdout = process.stdout.isTTY;
    });
    afterEach(() => {
        process.env = originalEnv;
        Object.defineProperty(process.stdout, 'isTTY', {
            value: originalStdout,
            writable: true
        });
    });
    describe('detectColorSupport', () => {
        it('should detect no color when NO_COLOR is set', () => {
            process.env.NO_COLOR = '1';
            const support = detectColorSupport();
            expect(support.level).toBe(0);
            expect(support.hasBasic).toBe(false);
            expect(support.has256).toBe(false);
            expect(support.has16m).toBe(false);
        });
        it('should detect no color when TERM is dumb', () => {
            process.env.TERM = 'dumb';
            const support = detectColorSupport();
            expect(support.level).toBe(0);
        });
        it('should detect no color when NODE_DISABLE_COLORS is set', () => {
            process.env.NODE_DISABLE_COLORS = '1';
            const support = detectColorSupport();
            expect(support.level).toBe(0);
        });
        it('should force 24-bit color when FORCE_COLOR=3', () => {
            process.env.FORCE_COLOR = '3';
            const support = detectColorSupport();
            expect(support.level).toBe(3);
            expect(support.hasBasic).toBe(true);
            expect(support.has256).toBe(true);
            expect(support.has16m).toBe(true);
        });
        it('should force 256 color when FORCE_COLOR=2', () => {
            process.env.FORCE_COLOR = '2';
            const support = detectColorSupport();
            expect(support.level).toBe(2);
            expect(support.hasBasic).toBe(true);
            expect(support.has256).toBe(true);
            expect(support.has16m).toBe(false);
        });
        it('should force basic color when FORCE_COLOR=1', () => {
            process.env.FORCE_COLOR = '1';
            const support = detectColorSupport();
            expect(support.level).toBe(1);
            expect(support.hasBasic).toBe(true);
            expect(support.has256).toBe(false);
            expect(support.has16m).toBe(false);
        });
        it('should force basic color when FORCE_COLOR=true', () => {
            process.env.FORCE_COLOR = 'true';
            const support = detectColorSupport();
            expect(support.level).toBe(1);
        });
        it('should detect no color when not TTY', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: false,
                writable: true
            });
            const support = detectColorSupport();
            expect(support.level).toBe(0);
        });
        it('should detect 24-bit color for truecolor terminals', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.COLORTERM = 'truecolor';
            const support = detectColorSupport();
            expect(support.level).toBe(3);
            expect(support.has16m).toBe(true);
        });
        it('should detect 24-bit color for 24bit terminals', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.COLORTERM = '24bit';
            const support = detectColorSupport();
            expect(support.level).toBe(3);
        });
        it('should detect 24-bit color for xterm-kitty', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.TERM = 'xterm-kitty';
            const support = detectColorSupport();
            expect(support.level).toBe(3);
        });
        it('should detect 24-bit color for iTerm', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.TERM = 'iTerm.app';
            const support = detectColorSupport();
            expect(support.level).toBe(3);
        });
        it('should detect 256 color for xterm-256', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.TERM = 'xterm-256color';
            const support = detectColorSupport();
            expect(support.level).toBe(2);
            expect(support.has256).toBe(true);
            expect(support.has16m).toBe(false);
        });
        it('should detect 256 color for iTerm.app', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.TERM_PROGRAM = 'iTerm.app';
            const support = detectColorSupport();
            expect(support.level).toBe(2);
        });
        it('should detect basic color for standard xterm', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.TERM = 'xterm';
            const support = detectColorSupport();
            expect(support.level).toBe(1);
            expect(support.hasBasic).toBe(true);
            expect(support.has256).toBe(false);
        });
        it('should detect basic color when COLORTERM is set', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.COLORTERM = '1';
            const support = detectColorSupport();
            expect(support.level).toBe(1);
        });
        it('should detect no color for unknown terminals', () => {
            Object.defineProperty(process.stdout, 'isTTY', {
                value: true,
                writable: true
            });
            process.env.TERM = 'unknown';
            const support = detectColorSupport();
            expect(support.level).toBe(0);
        });
    });
    describe('createColors', () => {
        it('should create colors based on support level', () => {
            const colors = createColors(0);
            expect(colors.red('test')).toBe('test');
        });
        it('should create colors with forced level', () => {
            const colors = createColors(3);
            expect(colors.red('test')).toContain('\x1b[');
        });
        it('should use detected level when not forced', () => {
            process.env.FORCE_COLOR = '1';
            const colors = createColors();
            expect(colors.red('test')).toContain('\x1b[');
        });
    });
    describe('getSymbol', () => {
        it('should return unicode on non-Windows', () => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
                writable: true
            });
            const symbol = getSymbol('✓', 'v');
            expect(symbol).toBe('✓');
        });
        it('should return ASCII on Windows without special terminal', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            delete process.env.TERM_PROGRAM;
            delete process.env.WT_SESSION;
            delete process.env.TERMINAL_EMULATOR;
            const symbol = getSymbol('✓', 'v');
            expect(symbol).toBe('v');
        });
        it('should return unicode on Windows with VS Code', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            process.env.TERM_PROGRAM = 'vscode';
            const symbol = getSymbol('✓', 'v');
            expect(symbol).toBe('✓');
        });
        it('should return unicode on Windows Terminal', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            process.env.WT_SESSION = '1';
            const symbol = getSymbol('✓', 'v');
            expect(symbol).toBe('✓');
        });
        it('should return unicode on JetBrains terminal', () => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true
            });
            process.env.TERMINAL_EMULATOR = 'JetBrains-JediTerm';
            const symbol = getSymbol('✓', 'v');
            expect(symbol).toBe('✓');
        });
    });
    describe('getFallbackTheme', () => {
        it('should return plain text theme for no color support', () => {
            const theme = getFallbackTheme({
                level: 0,
                hasBasic: false,
                has256: false,
                has16m: false
            });
            expect(theme.symbol.success).toBe('[OK]');
            expect(theme.symbol.error).toBe('[ERROR]');
            expect(theme.symbol.warning).toBe('[WARN]');
            expect(theme.symbol.checkbox.on).toBe('[x]');
        });
        it('should return ASCII theme for basic color support', () => {
            const theme = getFallbackTheme({
                level: 1,
                hasBasic: true,
                has256: false,
                has16m: false
            });
            expect(theme.symbol.success).toMatch(/[✓√]/);
            expect(theme.symbol.pointer).toMatch(/[▶>]/);
        });
    });
    describe('exports', () => {
        it('should export singleton colorSupport', () => {
            expect(colorSupport).toBeDefined();
            expect(colorSupport.level).toBeDefined();
        });
        it('should export supportsUnicode boolean', () => {
            expect(typeof supportsUnicode).toBe('boolean');
        });
    });
});
//# sourceMappingURL=colors.test.js.map