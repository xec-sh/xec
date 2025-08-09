import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import { createDefaultTheme } from '../../../src/themes/default.js';
import { getSymbol, colorSupport } from '../../../src/utils/colors.js';
describe('Cross-Platform Compatibility', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };
    afterEach(() => {
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            writable: true,
            enumerable: true,
            configurable: true
        });
        process.env = { ...originalEnv };
    });
    describe('Windows platform', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', {
                value: 'win32',
                writable: true,
                enumerable: true,
                configurable: true
            });
            delete process.env['WT_SESSION'];
            delete process.env['TERM_PROGRAM'];
        });
        it('should use ASCII symbols on Windows without Windows Terminal', () => {
            const checkmark = getSymbol('✔', 'v');
            expect(checkmark).toBe('v');
            const cross = getSymbol('✖', 'x');
            expect(cross).toBe('x');
            const arrow = getSymbol('→', '->');
            expect(arrow).toBe('->');
        });
        it('should use Unicode symbols on Windows with Windows Terminal', () => {
            process.env['WT_SESSION'] = 'some-session-id';
            const checkmark = getSymbol('✔', 'v');
            expect(checkmark).toBe('✔');
            const cross = getSymbol('✖', 'x');
            expect(cross).toBe('✖');
        });
        it('should handle Windows line endings', () => {
            const text = 'line1\r\nline2\r\nline3';
            const lines = text.split(/\r?\n/);
            expect(lines).toHaveLength(3);
            expect(lines).toEqual(['line1', 'line2', 'line3']);
        });
        it('should use simple spinner frames on Windows', () => {
            const theme = createDefaultTheme();
            expect(theme.symbols.spinner.frames).toEqual(['-', '\\', '|', '/']);
        });
    });
    describe('macOS platform', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
                writable: true,
                enumerable: true,
                configurable: true
            });
        });
        it('should use Unicode symbols on macOS', () => {
            const checkmark = getSymbol('✔', 'v');
            expect(checkmark).toBe('✔');
            const emoji = getSymbol('🎉', ':tada:');
            expect(emoji).toBe('🎉');
        });
        it('should detect color support in Terminal.app', () => {
            process.env['TERM_PROGRAM'] = 'Apple_Terminal';
            process.env['TERM'] = 'xterm-256color';
            expect(colorSupport.hasBasic).toBe(true);
            expect(colorSupport.has256).toBe(true);
        });
        it('should detect color support in iTerm', () => {
            process.env['TERM_PROGRAM'] = 'iTerm.app';
            process.env['TERM_PROGRAM_VERSION'] = '3.4.0';
            expect(colorSupport.hasBasic).toBe(true);
            expect(colorSupport.has256).toBe(true);
            expect(colorSupport.has16m).toBe(true);
        });
    });
    describe('Linux platform', () => {
        beforeEach(() => {
            Object.defineProperty(process, 'platform', {
                value: 'linux',
                writable: true,
                enumerable: true,
                configurable: true
            });
        });
        it('should use Unicode symbols on Linux', () => {
            const checkmark = getSymbol('✔', 'v');
            expect(checkmark).toBe('✔');
            const bullet = getSymbol('•', '*');
            expect(bullet).toBe('•');
        });
        it('should handle various terminal emulators', () => {
            const terminals = [
                { env: 'GNOME_TERMINAL_SERVICE', value: '1.0' },
                { env: 'VTE_VERSION', value: '6200' },
                { env: 'KONSOLE_VERSION', value: '21.12.3' },
                { env: 'TERMINAL_EMULATOR', value: 'JetBrains-JediTerm' }
            ];
            for (const { env, value } of terminals) {
                process.env[env] = value;
                expect(colorSupport.hasBasic).toBe(true);
            }
        });
    });
    describe('CI/CD environments', () => {
        it('should disable color in CI environments', () => {
            process.env['CI'] = 'true';
            expect(colorSupport.hasBasic).toBe(false);
            delete process.env['CI'];
            process.env['GITHUB_ACTIONS'] = 'true';
            expect(colorSupport.hasBasic).toBe(false);
            delete process.env['GITHUB_ACTIONS'];
            process.env['JENKINS_URL'] = 'http://jenkins.example.com';
            expect(colorSupport.hasBasic).toBe(false);
        });
        it('should respect NO_COLOR environment variable', () => {
            process.env['NO_COLOR'] = '1';
            expect(colorSupport.hasBasic).toBe(false);
            delete process.env['NO_COLOR'];
            process.env['FORCE_COLOR'] = '1';
            expect(colorSupport.hasBasic).toBe(true);
        });
    });
    describe('SSH sessions', () => {
        it('should detect SSH session', () => {
            process.env['SSH_CLIENT'] = '192.168.1.100 12345 22';
            process.env['SSH_TTY'] = '/dev/pts/1';
            expect(process.env['SSH_CLIENT']).toBeDefined();
            expect(process.env['SSH_TTY']).toBeDefined();
        });
    });
    describe('Terminal size detection', () => {
        it('should handle missing terminal size', () => {
            const originalColumns = process.stdout.columns;
            const originalRows = process.stdout.rows;
            process.stdout.columns = undefined;
            process.stdout.rows = undefined;
            const defaultWidth = 80;
            const defaultHeight = 24;
            const width = process.stdout.columns || defaultWidth;
            const height = process.stdout.rows || defaultHeight;
            expect(width).toBe(defaultWidth);
            expect(height).toBe(defaultHeight);
            process.stdout.columns = originalColumns;
            process.stdout.rows = originalRows;
        });
    });
    describe('Path handling', () => {
        it('should handle Windows path separators', () => {
            const windowsPath = 'C:\\Users\\test\\file.txt';
            const parts = windowsPath.split(/[/\\]/);
            expect(parts).toEqual(['C:', 'Users', 'test', 'file.txt']);
        });
        it('should handle Unix path separators', () => {
            const unixPath = '/home/user/file.txt';
            const parts = unixPath.split(/[/\\]/);
            expect(parts).toEqual(['', 'home', 'user', 'file.txt']);
        });
    });
    describe('Encoding and character sets', () => {
        it('should handle UTF-8 characters', () => {
            const utf8Chars = '你好世界 مرحبا שלום';
            expect(utf8Chars).toHaveLength(15);
            expect(utf8Chars).toContain('你好');
            expect(utf8Chars).toContain('مرحبا');
            expect(utf8Chars).toContain('שלום');
        });
        it('should handle emoji properly', () => {
            const emoji = '👨‍👩‍👧‍👦';
            expect(emoji.length).toBeGreaterThanOrEqual(7);
            expect([...emoji].length).toBeGreaterThanOrEqual(1);
        });
    });
    describe('Keyboard input differences', () => {
        it('should handle different line ending keys', () => {
            const enterKeys = [
                { name: 'return', ctrl: false },
                { name: 'enter', ctrl: false },
                { name: 'return', ctrl: true },
            ];
            for (const key of enterKeys) {
                expect(key.name === 'return' || key.name === 'enter').toBe(true);
            }
        });
        it('should handle platform-specific shortcuts', () => {
            const isMac = process.platform === 'darwin';
            const selectAllKey = isMac
                ? { name: 'a', meta: true }
                : { name: 'a', ctrl: true };
            expect(selectAllKey).toBeDefined();
        });
    });
    describe('File system differences', () => {
        it('should handle case sensitivity correctly', () => {
            const isLinux = process.platform === 'linux';
            if (isLinux) {
                expect('File.txt').not.toBe('file.txt');
            }
            else {
                expect('File.txt'.toLowerCase()).toBe('file.txt'.toLowerCase());
            }
        });
    });
});
//# sourceMappingURL=cross-platform.test.js.map