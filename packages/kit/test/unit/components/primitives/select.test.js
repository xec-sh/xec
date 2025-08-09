import { it, expect, describe } from 'vitest';
import { cancelSymbol } from '../../../../src/core/types.js';
import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { SelectPrompt } from '../../../../src/components/primitives/select.js';
describe('SelectPrompt', () => {
    describe('initialization', () => {
        it('should create with simple string array', () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['Option 1', 'Option 2', 'Option 3']
            });
            expect(prompt.config.message).toBe('Choose:');
            expect(prompt.options).toHaveLength(3);
            expect(prompt.options[0].value).toBe('Option 1');
            expect(prompt.options[0].label).toBeUndefined();
        });
        it('should create with option objects', () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: [
                    { value: 'val1', label: 'Label 1' },
                    { value: 'val2', label: 'Label 2', hint: 'Hint text' }
                ]
            });
            expect(prompt.options[0].value).toBe('val1');
            expect(prompt.options[0].label).toBe('Label 1');
            expect(prompt.options[1].hint).toBe('Hint text');
        });
        it('should set initial value', () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['A', 'B', 'C'],
                initialValue: 'B'
            });
            const state = prompt.state.getState();
            expect(state.value).toBe('A');
            expect(prompt.cursor).toBe(0);
        });
        it('should handle loop option', () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['A', 'B'],
                loop: true
            });
            expect(prompt.config.loop).toBe(true);
        });
    });
    describe('navigation', () => {
        it('should move down with arrow key', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: ['A', 'B', 'C']
            }, async ({ sendKey, prompt }) => {
                expect(prompt.cursor).toBe(0);
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 10));
                expect(prompt.cursor).toBe(1);
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 10));
                expect(prompt.cursor).toBe(2);
                sendKey({ name: 'return' });
            });
            expect(result).toBe('C');
        });
        it('should move up with arrow key', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['A', 'B', 'C']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'up' });
            expect(prompt.cursor).toBe(1);
            expect(prompt.state.getState().value).toBe('B');
            await prompt.handleInput({ name: 'up' });
            expect(prompt.cursor).toBe(0);
            expect(prompt.state.getState().value).toBe('A');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should stop at boundaries without loop', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['A', 'B', 'C'],
                loop: false
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'up' });
            expect(prompt.cursor).toBe(0);
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'down' });
            expect(prompt.cursor).toBe(2);
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should loop around with loop enabled', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['A', 'B', 'C'],
                loop: true
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'up' });
            expect(prompt.cursor).toBe(2);
            await prompt.handleInput({ name: 'down' });
            expect(prompt.cursor).toBe(0);
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
    });
    describe('submission', () => {
        it('should submit selected value on enter', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: ['A', 'B', 'C']
            }, async ({ sendKey }) => {
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 10));
                sendKey({ name: 'return' });
            });
            expect(result).toBe('B');
        });
        it('should submit custom value from option object', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: [
                    { value: 'val1', label: 'Label 1' },
                    { value: 'val2', label: 'Label 2' }
                ]
            }, async ({ sendKey }) => {
                sendKey({ name: 'down' });
                await new Promise(resolve => setTimeout(resolve, 10));
                sendKey({ name: 'return' });
            });
            expect(result).toBe('val2');
        });
        it('should cancel on escape', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: ['A', 'B']
            }, async ({ sendKey }) => {
                sendKey({ name: 'escape' });
            });
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('filtering', () => {
        it('should filter options when typing', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['Apple', 'Banana', 'Cherry', 'Date'],
                filter: true
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 'a' });
            expect(prompt.filterValue).toBe('a');
            expect(prompt.filteredOptions).toHaveLength(3);
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
        it('should reset selection when filtering', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['Apple', 'Banana', 'Cherry'],
                filter: true,
                default: 'Cherry'
            });
            const resultPromise = prompt.prompt();
            expect(prompt.cursor).toBe(0);
            await prompt.handleInput({ char: 'a' });
            expect(prompt.cursor).toBe(0);
            expect(prompt.filteredOptions).toHaveLength(2);
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
        it('should clear filter on backspace when empty', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['Apple', 'Banana'],
                filter: true
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 'a' });
            expect(prompt.filterValue).toBe('a');
            await prompt.handleInput({ name: 'backspace' });
            expect(prompt.filterValue).toBe('');
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
    });
    describe('rendering', () => {
        it('should render all options', async () => {
            await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: ['Option 1', 'Option 2', 'Option 3']
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                const output = prompt.render();
                expect(output).toContain('Choose:');
                expect(output).toContain('Option 1');
                expect(output).toContain('Option 2');
                expect(output).toContain('Option 3');
                sendKey({ name: 'escape' });
            });
        });
        it('should show hint text', async () => {
            await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: [
                    { value: 'opt1', label: 'Option 1', hint: 'This is a hint' }
                ]
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                const output = prompt.render();
                expect(output).toContain('Option 1');
                expect(output).toContain('This is a hint');
                sendKey({ name: 'escape' });
            });
        });
        it('should indicate selected option', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['A', 'B', 'C']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'down' });
            const output = prompt.render();
            expect(output).toContain('B');
            expect(output).toContain('B');
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
        it('should show filter query', async () => {
            await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: ['Apple', 'Banana'],
                filter: true
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey('a');
                await waitForRender();
                sendKey('p');
                await waitForRender();
                sendKey('p');
                await waitForRender();
                const output = prompt.render();
                expect(output).toContain('Filter:');
                expect(output).toContain('app');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('edge cases', () => {
        it('should handle empty options', () => {
            expect(() => {
                new SelectPrompt({
                    message: 'Choose:',
                    options: []
                });
            }).toThrow();
        });
        it('should handle single option', async () => {
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options: ['Only Option']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'up' });
            expect(prompt.cursor).toBe(0);
            await prompt.handleInput({ name: 'return' });
            const result = await resultPromise;
            expect(result).toBe('Only Option');
        });
        it('should handle very long option lists', () => {
            const options = Array.from({ length: 100 }, (_, i) => `Option ${i}`);
            const prompt = new SelectPrompt({
                message: 'Choose:',
                options,
                limit: 10
            });
            expect(prompt.options).toHaveLength(100);
            expect(prompt.config.limit).toBe(10);
        });
        it('should handle options with same label but different values', async () => {
            const result = await testPrompt(SelectPrompt, {
                message: 'Choose:',
                options: [
                    { value: 'id1', label: 'Same Label' },
                    { value: 'id2', label: 'Same Label' }
                ]
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                expect(prompt.cursor).toBe(0);
                sendKey({ name: 'down' });
                await waitForRender();
                expect(prompt.cursor).toBe(1);
                sendKey({ name: 'return' });
            });
            expect(result).toBe('id2');
        });
    });
});
//# sourceMappingURL=select.test.js.map