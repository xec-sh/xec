import { it, expect, describe } from 'vitest';
import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { columns, ColumnsPrompt } from '../../../../src/components/layout/columns.js';
describe('ColumnsPrompt', () => {
    describe('initialization', () => {
        it('should create with panes', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    { content: 'Left pane' },
                    { content: 'Right pane' }
                ]
            });
            expect(prompt.config.panes).toHaveLength(2);
        });
        it('should accept pane configurations', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    {
                        content: 'Pane 1',
                        size: '30%',
                        minWidth: 20,
                        maxWidth: 50,
                        border: true,
                        padding: 2,
                        title: 'Files',
                        scrollable: true
                    },
                    {
                        content: 'Pane 2',
                        size: '70%'
                    }
                ]
            });
            const firstPane = prompt.config.panes[0];
            expect(firstPane.size).toBe('30%');
            expect(firstPane.minWidth).toBe(20);
            expect(firstPane.maxWidth).toBe(50);
            expect(firstPane.border).toBe(true);
            expect(firstPane.padding).toBe(2);
            expect(firstPane.title).toBe('Files');
            expect(firstPane.scrollable).toBe(true);
        });
        it('should accept layout options', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [],
                border: true,
                gap: 2,
                resizable: true,
                focusedPane: 1,
                height: 20
            });
            expect(prompt.config.border).toBe(true);
            expect(prompt.config.gap).toBe(2);
            expect(prompt.config.resizable).toBe(true);
            expect(prompt.config.focusedPane).toBe(1);
            expect(prompt.config.height).toBe(20);
        });
    });
    describe('rendering', () => {
        it('should render multiple panes', async () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    { content: 'Left content' },
                    { content: 'Right content' }
                ],
                border: false
            });
            const rendered = prompt.render();
            expect(rendered).toContain('Left content');
            expect(rendered).toContain('Right content');
        });
        it('should render pane titles', async () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    { content: 'Content 1', title: 'Panel 1' },
                    { content: 'Content 2', title: 'Panel 2' }
                ]
            });
            const rendered = prompt.render();
            expect(rendered).toContain('Panel 1');
            expect(rendered).toContain('Panel 2');
        });
        it('should apply borders', async () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    { content: 'Content' }
                ],
                border: true
            });
            const rendered = prompt.render();
            expect(rendered).toContain('┌');
            expect(rendered).toContain('│');
            expect(rendered).toContain('└');
        });
        it('should handle dynamic content', async () => {
            let counter = 0;
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    {
                        content: () => `Dynamic content ${++counter}`
                    }
                ]
            });
            const rendered1 = prompt.render();
            expect(rendered1).toContain('Dynamic content 1');
            const rendered2 = prompt.render();
            expect(rendered2).toContain('Dynamic content 2');
        });
        it('should show status line when resizable', async () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [{ content: 'Content' }],
                resizable: true
            });
            const rendered = prompt.render();
            expect(rendered).toContain('Switch pane');
            expect(rendered).toContain('Resize');
            expect(rendered).toContain('Exit');
        });
    });
    describe('pane sizing', () => {
        it('should calculate sizes based on percentages', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    { content: 'Pane 1', size: '30%' },
                    { content: 'Pane 2', size: '70%' }
                ]
            });
            prompt.calculatePaneSizes();
            const sizes = prompt.paneSizes;
            expect(sizes).toHaveLength(2);
            expect(sizes[0]).toBeLessThan(sizes[1]);
        });
        it('should handle fixed sizes', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    { content: 'Pane 1', size: 40 },
                    { content: 'Pane 2' }
                ]
            });
            prompt.calculatePaneSizes();
            const sizes = prompt.paneSizes;
            expect(sizes[0]).toBe(40);
            expect(sizes[1]).toBeGreaterThan(0);
        });
        it('should respect min/max constraints', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test Columns',
                panes: [
                    { content: 'Pane', size: 10, minWidth: 20, maxWidth: 30 }
                ]
            });
            prompt.calculatePaneSizes();
            const sizes = prompt.paneSizes;
            expect(sizes[0]).toBe(20);
        });
    });
    describe('navigation', () => {
        it('should switch focus between panes', async () => {
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [
                    { content: 'Pane 1' },
                    { content: 'Pane 2' },
                    { content: 'Pane 3' }
                ]
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                expect(prompt.state.getState().focusedPaneIndex).toBe(0);
                sendKey('tab');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().focusedPaneIndex).toBe(1);
                sendKey('tab');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().focusedPaneIndex).toBe(2);
                sendKey('tab');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().focusedPaneIndex).toBe(0);
                sendKey('q');
            });
        });
        it('should navigate with arrow keys', async () => {
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [
                    { content: 'Pane 1' },
                    { content: 'Pane 2' }
                ]
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey('right');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().focusedPaneIndex).toBe(1);
                sendKey('left');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().focusedPaneIndex).toBe(0);
                sendKey('q');
            });
        });
        it('should navigate with shift+tab', async () => {
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [
                    { content: 'Pane 1' },
                    { content: 'Pane 2' }
                ],
                focusedPane: 1
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                expect(prompt.state.getState().focusedPaneIndex).toBe(1);
                sendKey({ name: 'tab', shift: true });
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().focusedPaneIndex).toBe(0);
                sendKey('q');
            });
        });
    });
    describe('scrolling', () => {
        it('should handle scrolling in scrollable panes', async () => {
            const longContent = Array(20).fill('Line').map((l, i) => `${l} ${i + 1}`);
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [
                    {
                        content: longContent,
                        scrollable: true
                    }
                ]
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                expect(prompt.state.getState().scrollOffsets[0]).toBe(0);
                sendKey('down');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().scrollOffsets[0]).toBe(1);
                sendKey('up');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().scrollOffsets[0]).toBe(0);
                sendKey('pagedown');
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().scrollOffsets[0]).toBeGreaterThan(0);
                sendKey('q');
            });
        });
    });
    describe('resizing', () => {
        it('should toggle resize mode', async () => {
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [
                    { content: 'Pane 1' },
                    { content: 'Pane 2' }
                ],
                resizable: true
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                expect(prompt.state.getState().isResizing).toBe(false);
                sendKey({ name: 'r', ctrl: true });
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().isResizing).toBe(true);
                sendKey({ name: 'r', ctrl: true });
                await new Promise(resolve => setTimeout(resolve, 50));
                expect(prompt.state.getState().isResizing).toBe(false);
                sendKey('q');
            });
        });
        it('should adjust pane sizes in resize mode', async () => {
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [
                    { content: 'Pane 1', size: 50 },
                    { content: 'Pane 2', size: 50 }
                ],
                resizable: true
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                const initialSizes = [...prompt.paneSizes];
                sendKey({ name: 'r', ctrl: true });
                await waitForRender();
                sendKey('right');
                await new Promise(resolve => setTimeout(resolve, 50));
                const newSizes = prompt.paneSizes;
                expect(newSizes[0]).toBeGreaterThan(initialSizes[0]);
                expect(newSizes[1]).toBeLessThan(initialSizes[1]);
                sendKey('q');
            });
        });
    });
    describe('exit behavior', () => {
        it.skip('should exit on return', async () => {
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [{ content: 'Content' }]
            }, async ({ sendKey, waitForRender }) => {
                await waitForRender();
                sendKey('enter');
            }).then(result => {
                expect(result).toBeUndefined();
            });
        });
        it('should exit on q', async () => {
            await testPrompt(ColumnsPrompt, {
                message: 'Test Columns',
                panes: [{ content: 'Content' }]
            }, async ({ sendKey, waitForRender }) => {
                await waitForRender();
                sendKey('q');
            }).then(result => {
                expect(result).toBeUndefined();
            });
        });
    });
    describe('helper function', () => {
        it('should create columns with options', () => {
            const columnsPrompt = columns({
                panes: [
                    { content: 'Left', size: '50%' },
                    { content: 'Right', size: '50%' }
                ],
                border: true,
                resizable: true
            });
            expect(columnsPrompt).toBeInstanceOf(ColumnsPrompt);
            expect(columnsPrompt.config.border).toBe(true);
            expect(columnsPrompt.config.resizable).toBe(true);
        });
    });
    describe('utility methods', () => {
        it('should center text', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test',
                panes: []
            });
            const centered = prompt.centerText('Hello', 10);
            expect(centered).toBe('  Hello   ');
            expect(centered.length).toBe(10);
        });
        it('should truncate long text', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test',
                panes: []
            });
            const truncated = prompt.truncateText('This is a very long text', 10);
            expect(truncated).toBe('This is...');
            expect(truncated.length).toBe(10);
        });
    });
    describe('final render', () => {
        it('should return empty string', () => {
            const prompt = new ColumnsPrompt({
                message: 'Test',
                panes: []
            });
            const finalRender = prompt.renderFinal();
            expect(finalRender).toBe('');
        });
    });
});
//# sourceMappingURL=columns.test.js.map