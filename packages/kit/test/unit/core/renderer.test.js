import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { Renderer } from '../../../src/core/renderer.js';
import { createDefaultTheme } from '../../../src/themes/default.js';
const mockWrite = vi.fn();
const mockClearScreen = vi.fn();
const mockClearLine = vi.fn();
describe('Renderer', () => {
    let mockStream;
    beforeEach(() => {
        vi.useFakeTimers();
        mockStream = {
            write: mockWrite,
            clearScreen: mockClearScreen,
            clearLine: mockClearLine,
            getSize: () => ({ width: 80, height: 24 })
        };
        mockWrite.mockClear();
        mockClearScreen.mockClear();
        mockClearLine.mockClear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });
    describe('basic rendering', () => {
        it('should create renderer with theme', () => {
            const theme = createDefaultTheme();
            const renderer = new Renderer({ theme, stream: mockStream });
            expect(renderer.theme).toStrictEqual(theme);
        });
        it('should render simple content', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            renderer.render('Hello World');
            vi.runAllTimers();
            expect(mockWrite).toHaveBeenCalledWith('Hello World');
        });
        it('should clear screen', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            renderer.clearScreen();
            expect(mockClearScreen).toHaveBeenCalled();
        });
        it('should clear previous content', async () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            renderer.render('Line 1\nLine 2');
            vi.runAllTimers();
            mockWrite.mockClear();
            mockClearLine.mockClear();
            vi.advanceTimersByTime(20);
            renderer.render('New content');
            vi.runAllTimers();
            expect(mockWrite).toHaveBeenCalledWith('New content');
        });
    });
    describe('frame management', () => {
        it('should track previous frame', async () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            renderer.render('Frame 1');
            vi.runAllTimers();
            expect(renderer.previousFrame).toBe('Frame 1');
            vi.advanceTimersByTime(20);
            renderer.render('Frame 2');
            vi.runAllTimers();
            expect(renderer.previousFrame).toBe('Frame 2');
        });
        it('should not re-render identical frames', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            renderer.render('Same Frame');
            vi.runAllTimers();
            mockWrite.mockClear();
            vi.advanceTimersByTime(20);
            renderer.render('Same Frame');
            vi.runAllTimers();
            expect(mockWrite).not.toHaveBeenCalled();
        });
    });
    describe('region updates', () => {
        it('should update specific region', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const mockCursorTo = vi.fn();
            mockStream.cursorTo = mockCursorTo;
            renderer.update({ x: 10, y: 5, width: 20, height: 3 }, 'Region content');
            expect(mockCursorTo).toHaveBeenCalled();
            expect(mockWrite).toHaveBeenCalled();
        });
    });
    describe('text measurement', () => {
        it('should measure text dimensions', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const dims = renderer.measureText('Hello\nWorld\nTest');
            expect(dims.width).toBe(5);
            expect(dims.height).toBe(3);
        });
        it('should handle empty text', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const dims = renderer.measureText('');
            expect(dims.width).toBe(0);
            expect(dims.height).toBe(1);
        });
        it('should find longest line', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const dims = renderer.measureText('Short\nThis is a longer line\nMed');
            expect(dims.width).toBe(21);
            expect(dims.height).toBe(3);
        });
    });
    describe('theme integration', () => {
        it('should use theme for rendering', () => {
            const theme = createDefaultTheme();
            const renderer = new Renderer({ theme, stream: mockStream });
            expect(renderer.theme).toStrictEqual(theme);
            expect(renderer.theme.symbols.success).toBeDefined();
            expect(renderer.theme.formatters.error).toBeDefined();
        });
    });
    describe('node rendering', () => {
        it('should render text nodes', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const renderNode = renderer.renderNode.bind(renderer);
            const node = {
                type: 'text',
                content: 'Hello World'
            };
            const output = renderNode(node);
            expect(output).toBe('Hello World');
        });
        it('should render text nodes with style', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const renderNode = renderer.renderNode.bind(renderer);
            const node = {
                type: 'text',
                content: 'Styled Text',
                style: { fg: 'red' }
            };
            const output = renderNode(node);
            expect(output).toContain('Styled Text');
            expect(output).toContain('\x1B[31m');
        });
        it('should render box nodes', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const renderNode = renderer.renderNode.bind(renderer);
            const node = {
                type: 'box',
                content: 'Box Content\nLine 2'
            };
            const output = renderNode(node);
            expect(output).toContain('╭');
            expect(output).toContain('╯');
            expect(output).toContain('╰');
            expect(output).toContain('╯');
            expect(output).toContain('Box Content');
            expect(output).toContain('Line 2');
        });
        it('should render line nodes', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const renderNode = renderer.renderNode.bind(renderer);
            const node = { type: 'line' };
            const output = renderNode(node);
            expect(output).toMatch(/─{80}/);
        });
        it('should render group nodes', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const renderNode = renderer.renderNode.bind(renderer);
            const node = {
                type: 'group',
                children: [
                    { type: 'text', content: 'First' },
                    { type: 'text', content: 'Second' }
                ]
            };
            const output = renderNode(node);
            expect(output).toBe('FirstSecond');
        });
        it('should handle unknown node types', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const renderNode = renderer.renderNode.bind(renderer);
            const node = { type: 'unknown' };
            const output = renderNode(node);
            expect(output).toBe('');
        });
        it('should handle nodes without children in group', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const renderNode = renderer.renderNode.bind(renderer);
            const node = {
                type: 'group'
            };
            const output = renderNode(node);
            expect(output).toBe('');
        });
    });
    describe('style application', () => {
        it('should apply foreground color', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const applyStyle = renderer.applyStyle.bind(renderer);
            const styled = applyStyle('Text', { fg: 'blue' });
            expect(styled).toContain('\x1B[34m');
            expect(styled).toContain('Text');
            expect(styled).toContain('\x1B[39m');
        });
        it('should apply background color', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const applyStyle = renderer.applyStyle.bind(renderer);
            const styled = applyStyle('Text', { bg: 'yellow' });
            expect(styled).toContain('\x1B[43m');
            expect(styled).toContain('Text');
            expect(styled).toContain('\x1B[49m');
        });
        it('should handle unknown colors', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const applyStyle = renderer.applyStyle.bind(renderer);
            const styled = applyStyle('Text', { fg: 'unknown' });
            expect(styled).toBe('Text\x1B[39m');
        });
        it('should handle no style', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const applyStyle = renderer.applyStyle.bind(renderer);
            const styled = applyStyle('Text', undefined);
            expect(styled).toBe('Text');
        });
        it('should handle style attributes that are not implemented', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const applyStyle = renderer.applyStyle.bind(renderer);
            const styled = applyStyle('Text', {
                bold: true,
                italic: true,
                underline: true,
                dim: true
            });
            expect(styled).toBe('Text');
        });
    });
    describe('theme methods', () => {
        it('should get theme', () => {
            const theme = createDefaultTheme();
            const renderer = new Renderer({ theme, stream: mockStream });
            expect(renderer.getTheme()).toStrictEqual(theme);
        });
        it('should set theme', () => {
            const theme1 = createDefaultTheme();
            const renderer = new Renderer({ theme: theme1, stream: mockStream });
            const theme2 = createDefaultTheme();
            renderer.setTheme(theme2);
            expect(renderer.getTheme()).toStrictEqual(theme2);
        });
    });
    describe('ANSI stripping', () => {
        it('should strip ANSI codes when measuring', () => {
            const renderer = new Renderer({ theme: createDefaultTheme(), stream: mockStream });
            const coloredText = '\x1b[31mRed Text\x1b[0m';
            const dims = renderer.measureText(coloredText);
            expect(dims.width).toBe(8);
        });
    });
});
//# sourceMappingURL=renderer.test.js.map