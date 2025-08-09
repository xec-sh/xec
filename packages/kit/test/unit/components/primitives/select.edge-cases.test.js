import { it, expect, describe } from 'vitest';
import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { SelectPrompt } from '../../../../src/components/primitives/select.js';
describe('SelectPrompt - Edge Cases', () => {
    describe('empty and single option handling', () => {
        it('should throw error for empty options array', () => {
            expect(() => new SelectPrompt({
                message: 'Select:',
                options: []
            })).toThrow('at least one option');
        });
        it('should handle single option', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['Only Option']
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('Only Option');
        });
        it('should handle options with empty string values', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['', 'Option 2', 'Option 3']
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('');
        });
    });
    describe('extremely large option lists', () => {
        it('should handle 1000 options', async () => {
            const options = Array.from({ length: 1000 }, (_, i) => `Option ${i + 1}`);
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options
            }, async ({ sendKey }) => {
                sendKey({ name: 'end' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('Option 1000');
        });
        it('should handle very long option labels', async () => {
            const longLabel = 'x'.repeat(500);
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: [longLabel, 'Short']
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe(longLabel);
        });
    });
    describe('navigation edge cases', () => {
        it('should wrap around at boundaries', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['First', 'Second', 'Third']
            }, async ({ sendKey }) => {
                sendKey({ name: 'up' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('Third');
        });
        it('should handle rapid navigation', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C', 'D', 'E']
            }, async ({ sendKey }) => {
                for (let i = 0; i < 20; i++) {
                    sendKey({ name: 'down' });
                }
                sendKey({ name: 'return' });
            });
            expect(result).toBe('A');
        });
        it('should handle page up/down with small lists', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C']
            }, async ({ sendKey }) => {
                sendKey({ name: 'pagedown' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('C');
        });
    });
    describe('search/filtering edge cases', () => {
        it('should handle search with no matches', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['Apple', 'Banana', 'Cherry']
            }, async ({ sendKey, getLastRender }) => {
                sendKey('xyz');
                const output = getLastRender();
                expect(output).toContain('No matches');
                sendKey({ name: 'backspace' });
                sendKey({ name: 'backspace' });
                sendKey({ name: 'backspace' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('Apple');
        });
        it('should handle search with special regex characters', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['Option (1)', 'Option [2]', 'Option *3*']
            }, async ({ sendKey }) => {
                sendKey('(1)');
                sendKey({ name: 'return' });
            });
            expect(result).toBe('Option (1)');
        });
    });
    describe('complex option objects', () => {
        it('should handle options with null/undefined hints', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: [
                    { value: 'a', label: 'Option A', hint: null },
                    { value: 'b', label: 'Option B', hint: undefined },
                    { value: 'c', label: 'Option C', hint: 'Valid hint' }
                ]
            }, async ({ sendKey }) => {
                sendKey({ name: 'down' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('b');
        });
        it('should handle duplicate values', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: [
                    { value: 'same', label: 'Option 1' },
                    { value: 'same', label: 'Option 2' },
                    { value: 'different', label: 'Option 3' }
                ]
            }, async ({ sendKey }) => {
                sendKey({ name: 'down' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('same');
        });
        it('should handle options with complex objects as values', async () => {
            const complexValue = { id: 1, data: { nested: true } };
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: [
                    { value: complexValue, label: 'Complex Option' },
                    { value: 'simple', label: 'Simple Option' }
                ]
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toEqual(complexValue);
        });
    });
    describe('disabled options edge cases', () => {
        it('should skip all disabled options', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: [
                    { value: 'a', label: 'Disabled 1', disabled: true },
                    { value: 'b', label: 'Disabled 2', disabled: true },
                    { value: 'c', label: 'Enabled', disabled: false }
                ]
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('c');
        });
        it('should handle all options disabled', async () => {
            await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: [
                    { value: 'a', label: 'Disabled 1', disabled: true },
                    { value: 'b', label: 'Disabled 2', disabled: true }
                ]
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('display limit edge cases', () => {
        it('should handle displayLimit of 1', async () => {
            await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C', 'D', 'E'],
                displayLimit: 1
            }, async ({ getLastRender, sendKey }) => {
                const output = getLastRender();
                const visibleOptions = (output.match(/[A-E]/g) || []).length;
                expect(visibleOptions).toBe(1);
                sendKey({ name: 'escape' });
            });
        });
        it('should handle displayLimit larger than options', async () => {
            await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C'],
                displayLimit: 100
            }, async ({ getLastRender, sendKey }) => {
                const output = getLastRender();
                expect(output).toContain('A');
                expect(output).toContain('B');
                expect(output).toContain('C');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('unicode and special characters', () => {
        it('should handle emoji options', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['😀 Happy', '😢 Sad', '😡 Angry']
            }, async ({ sendKey }) => {
                sendKey({ name: 'down' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('😢 Sad');
        });
        it('should handle RTL text options', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['مرحبا', 'שלום', 'Hello']
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('مرحبا');
        });
    });
    describe('custom rendering edge cases', () => {
        it('should handle renderOption that returns empty string', async () => {
            await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C'],
                renderOption: () => ''
            }, async ({ sendKey }) => {
                sendKey({ name: 'down' });
                sendKey({ name: 'return' });
            });
        });
        it('should handle renderOption that throws', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C'],
                renderOption: () => {
                    throw new Error('Render error');
                }
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('A');
        });
    });
    describe('initial value edge cases', () => {
        it('should handle initial value not in options', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C'],
                initialValue: 'Z'
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('A');
        });
        it('should handle initial value with complex objects', async () => {
            const obj1 = { id: 1 };
            const obj2 = { id: 2 };
            const result = await testPrompt(SelectPrompt, {
                message: 'Select:',
                options: [
                    { value: obj1, label: 'Object 1' },
                    { value: obj2, label: 'Object 2' }
                ],
                initialValue: obj2
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe(obj2);
        });
    });
});
//# sourceMappingURL=select.edge-cases.test.js.map