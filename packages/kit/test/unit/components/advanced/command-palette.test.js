import { it, vi, expect, describe } from 'vitest';
import { cancelSymbol } from '../../../../src/core/types.js';
import { mockProcessStreams } from '../../../helpers/mock-tty.js';
import { testPrompt, testNonTTYPrompt } from '../../../helpers/prompt-test-utils.js';
import { CommandPalette, commandPalette } from '../../../../src/components/advanced/command-palette.js';
describe('CommandPalette', () => {
    describe('non-TTY mode', () => {
        it('should return cancel symbol in non-TTY', async () => {
            const result = await testNonTTYPrompt(CommandPalette, {
                commands: sampleCommands,
                message: 'Select command',
            });
            expect(result).toBe(cancelSymbol);
        });
        it('should return initial value in non-TTY', async () => {
            const result = await testNonTTYPrompt(CommandPalette, {
                commands: sampleCommands,
                message: 'Select command',
                initialValue: 'file.new',
            }, 'file.new');
            expect(result).toBe('file.new');
        });
    });
    const sampleCommands = [
        {
            id: 'file.new',
            title: 'New File',
            shortcut: 'Ctrl+N',
            icon: '📄',
            action: vi.fn(),
            group: 'file',
        },
        {
            id: 'file.open',
            title: 'Open File',
            shortcut: 'Ctrl+O',
            icon: '📂',
            action: vi.fn(),
            group: 'file',
        },
        {
            id: 'edit.copy',
            title: 'Copy',
            shortcut: 'Ctrl+C',
            icon: '📋',
            action: vi.fn(),
            group: 'edit',
        },
        {
            id: 'edit.paste',
            title: 'Paste',
            shortcut: 'Ctrl+V',
            action: vi.fn(),
            group: 'edit',
            keywords: ['clipboard', 'insert'],
        },
        {
            id: 'view.zoom-in',
            title: 'Zoom In',
            shortcut: 'Ctrl++',
            action: vi.fn(),
            group: 'view',
        },
    ];
    const groups = [
        { id: 'file', title: 'File' },
        { id: 'edit', title: 'Edit' },
        { id: 'view', title: 'View' },
    ];
    describe('basic functionality', () => {
        it('should render command palette', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('Command Palette');
                expect(output).toContain('Type a command or search...');
                sendKey({ name: 'escape' });
            });
        });
        it('should show initial commands', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                maxResults: 3,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('New File');
                expect(output).toContain('Open File');
                expect(output).toContain('Copy');
                expect(output).not.toContain('Paste');
                sendKey({ name: 'escape' });
            });
        });
        it('should show recent commands first', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                recent: ['edit.paste', 'file.new'],
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                const lines = output.split('\n');
                const commandLines = lines.filter(l => l.includes('❯') || (l.startsWith('  ') && !l.trim().startsWith('↑')));
                expect(commandLines[0]).toContain('Paste');
                expect(commandLines[1]).toContain('New File');
                sendKey({ name: 'escape' });
            });
        });
        it('should display shortcuts and icons', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('📄');
                expect(output).toContain('Ctrl+N');
                expect(output).toContain('📂');
                expect(output).toContain('Ctrl+O');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('search functionality', () => {
        it('should filter commands by search term', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'f', sequence: 'f' });
                await waitForRender();
                sendKey({ name: 'i', sequence: 'i' });
                await waitForRender();
                sendKey({ name: 'l', sequence: 'l' });
                await waitForRender();
                sendKey({ name: 'e', sequence: 'e' });
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('> file|');
                expect(output).toContain('New File');
                expect(output).toContain('Open File');
                const lastFileSection = output.lastIndexOf('> file|');
                const outputAfterSearch = output.substring(lastFileSection);
                expect(outputAfterSearch).not.toContain('Edit\n');
                expect(outputAfterSearch).not.toContain('View\n');
                sendKey({ name: 'escape' });
            });
        });
        it('should perform fuzzy search', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'n', sequence: 'n' });
                sendKey({ name: 'f', sequence: 'f' });
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('New File');
                sendKey({ name: 'escape' });
            });
        });
        it('should search by keywords', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                const word = 'clipboard';
                for (const char of word) {
                    sendKey({ name: char, sequence: char });
                    await waitForRender();
                }
                const output = getLastRender();
                expect(output).toContain('> clipboard|');
                expect(output).toContain('Paste');
                const lastClipboardSection = output.lastIndexOf('> clipboard|');
                const outputAfterSearch = output.substring(lastClipboardSection);
                expect(outputAfterSearch).not.toContain('Copy');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle no results', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'x', sequence: 'x' });
                sendKey({ name: 'y', sequence: 'y' });
                sendKey({ name: 'z', sequence: 'z' });
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('No commands found');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle backspace', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'f', sequence: 'f' });
                await waitForRender();
                sendKey({ name: 'i', sequence: 'i' });
                await waitForRender();
                sendKey({ name: 'l', sequence: 'l' });
                await waitForRender();
                sendKey({ name: 'backspace' });
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('> fi|');
                sendKey({ name: 'escape' });
            });
        });
        it('should respect fuzzy threshold', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                fuzzyThreshold: 0.9,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'x', sequence: 'x' });
                await waitForRender();
                sendKey({ name: 'z', sequence: 'z' });
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('No commands found');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('navigation', () => {
        it('should navigate with arrow keys', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                maxResults: 3,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                let output = getLastRender();
                expect(output).toContain('❯ 📄 New File');
                sendKey({ name: 'down' });
                await waitForRender();
                output = getLastRender();
                expect(output).toContain('❯ 📂 Open File');
                sendKey({ name: 'down' });
                await waitForRender();
                output = getLastRender();
                expect(output).toContain('❯ 📋 Copy');
                sendKey({ name: 'up' });
                await waitForRender();
                output = getLastRender();
                expect(output).toContain('❯ 📂 Open File');
                sendKey({ name: 'escape' });
            });
        });
        it('should not navigate beyond bounds', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands.slice(0, 2),
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'up' });
                await waitForRender();
                let output = getLastRender();
                expect(output).toContain('❯ 📄 New File');
                sendKey({ name: 'down' });
                await waitForRender();
                sendKey({ name: 'down' });
                await waitForRender();
                output = getLastRender();
                expect(output).toContain('❯ 📂 Open File');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('selection', () => {
        it('should execute command on enter', async () => {
            const action = vi.fn();
            const commands = [{
                    id: 'test',
                    title: 'Test Command',
                    action,
                }];
            const result = await testPrompt(CommandPalette, {
                commands,
                message: 'Command Palette',
            }, async ({ sendKey }) => {
                sendKey({ name: 'enter' });
            });
            expect(action).toHaveBeenCalled();
            expect(result).toBe('test');
        });
        it('should add selected command to recent', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ sendKey, prompt }) => {
                sendKey({ name: 'down' });
                sendKey({ name: 'enter' });
                await new Promise(resolve => setTimeout(resolve, 10));
                const state = prompt.state.getState();
                expect(state.recentCommands[0]).toBe('file.open');
            });
        });
        it('should cancel on escape', async () => {
            const result = await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ sendKey }) => {
                sendKey({ name: 'escape' });
            });
            expect(result).toBe(cancelSymbol);
        });
        it('should not execute when no commands found', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ sendKey, prompt, waitForRender }) => {
                sendKey({ name: 'x', sequence: 'x' });
                sendKey({ name: 'x', sequence: 'x' });
                sendKey({ name: 'x', sequence: 'x' });
                await waitForRender();
                sendKey({ name: 'enter' });
                await waitForRender();
                const state = prompt.state.getState();
                expect(state.status).toBe('active');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('grouping', () => {
        it('should display group headers', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                groups,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('File');
                expect(output).toContain('Edit');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle commands without groups', async () => {
            const commands = [
                { id: 'a', title: 'Command A', action: vi.fn() },
                { id: 'b', title: 'Command B', action: vi.fn(), group: 'test' },
            ];
            await testPrompt(CommandPalette, {
                commands,
                groups: [{ id: 'test', title: 'Test Group' }],
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('Command A');
                expect(output).toContain('Command B');
                expect(output).toContain('Test Group');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('factory function', () => {
        it('should work with factory function', async () => {
            const action = vi.fn();
            const mockStreams = mockProcessStreams({ isTTY: true });
            try {
                const resultPromise = commandPalette({
                    commands: [{
                            id: 'test',
                            title: 'Test',
                            action,
                        }],
                    message: 'Select command',
                });
                await new Promise(resolve => setTimeout(resolve, 10));
                mockStreams.sendKey({ name: 'enter' });
                const result = await resultPromise;
                expect(action).toHaveBeenCalled();
                expect(result).toBe('test');
            }
            finally {
                mockStreams.restore();
            }
        });
    });
    describe('edge cases', () => {
        it('should handle empty commands array', async () => {
            await testPrompt(CommandPalette, {
                commands: [],
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('No commands found');
                sendKey({ name: 'escape' });
            });
        });
        it('should handle custom placeholder', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                placeholder: 'Search commands...',
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                expect(output).toContain('Search commands...');
                sendKey({ name: 'escape' });
            });
        });
        it('should limit results by maxResults', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                maxResults: 2,
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                await waitForRender();
                const output = getLastRender();
                const lines = output.split('\n');
                const commandLines = lines.filter(line => line.trim().startsWith('❯') ||
                    (line.startsWith('  ') && (line.includes('📄') || line.includes('📂') || line.includes('📋'))));
                expect(commandLines.length).toBeLessThanOrEqual(2);
                sendKey({ name: 'escape' });
            });
        });
        it('should handle async actions', async () => {
            const asyncAction = vi.fn(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
            });
            await testPrompt(CommandPalette, {
                commands: [{
                        id: 'async',
                        title: 'Async Command',
                        action: asyncAction,
                    }],
                message: 'Command Palette',
            }, async ({ sendKey }) => {
                sendKey({ name: 'enter' });
            });
            expect(asyncAction).toHaveBeenCalled();
        });
        it('should boost recent commands in search', async () => {
            await testPrompt(CommandPalette, {
                commands: [
                    { id: 'copy', title: 'Copy', action: vi.fn() },
                    { id: 'cut', title: 'Cut', action: vi.fn() },
                ],
                recent: ['cut'],
                message: 'Command Palette',
            }, async ({ getLastRender, sendKey, waitForRender }) => {
                sendKey({ name: 'c', sequence: 'c' });
                await waitForRender();
                const output = getLastRender();
                const lastSearchIndex = output.lastIndexOf('> c|');
                const outputAfterSearch = output.substring(lastSearchIndex);
                const lines = outputAfterSearch.split('\n');
                const commandLines = lines.filter(l => l.includes('❯') ||
                    (l.startsWith('  ') && !l.trim().startsWith('↑') && (l.includes('Cut') || l.includes('Copy'))));
                const cutIndex = commandLines.findIndex(l => l.includes('Cut'));
                const copyIndex = commandLines.findIndex(l => l.includes('Copy'));
                expect(cutIndex).toBeLessThan(copyIndex);
                expect(cutIndex).toBe(0);
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('state management', () => {
        it('should emit update events', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                message: 'Command Palette',
            }, async ({ prompt, sendKey }) => {
                const updateHandler = vi.fn();
                prompt.on('update', updateHandler);
                sendKey({ name: 'a', sequence: 'a' });
                await new Promise(resolve => setTimeout(resolve, 10));
                expect(updateHandler).toHaveBeenCalled();
                sendKey({ name: 'escape' });
            });
        });
        it('should maintain search state', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                message: 'Command Palette',
            }, async ({ prompt, sendKey, waitForRender }) => {
                sendKey({ name: 't', sequence: 't' });
                sendKey({ name: 'e', sequence: 'e' });
                sendKey({ name: 's', sequence: 's' });
                await waitForRender();
                const state = prompt.state.getState();
                expect(state.searchTerm).toBe('tes');
                sendKey({ name: 'escape' });
            });
        });
        it('should reset selection on search', async () => {
            await testPrompt(CommandPalette, {
                commands: sampleCommands,
                message: 'Command Palette',
            }, async ({ prompt, sendKey, waitForRender }) => {
                sendKey({ name: 'down' });
                sendKey({ name: 'down' });
                await waitForRender();
                let state = prompt.state.getState();
                expect(state.selectedIndex).toBe(2);
                sendKey({ name: 'f', sequence: 'f' });
                await waitForRender();
                state = prompt.state.getState();
                expect(state.selectedIndex).toBe(0);
                sendKey({ name: 'escape' });
            });
        });
    });
});
//# sourceMappingURL=command-palette.test.js.map