import { it, expect, describe } from 'vitest';
import { cancelSymbol } from '../../../../src/core/types.js';
import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { MultiSelectPrompt } from '../../../../src/components/primitives/multiselect.js';
describe('MultiSelectPrompt', () => {
    describe('initialization', () => {
        it('should create with simple string array', () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select items:',
                options: ['Item 1', 'Item 2', 'Item 3']
            });
            expect(prompt.config.message).toBe('Select items:');
            expect(prompt.options).toHaveLength(3);
            expect(prompt.options[0].value).toBe('Item 1');
            expect(prompt.options[0].label).toBeUndefined();
        });
        it('should create with option objects', () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select items:',
                options: [
                    { value: 'val1', label: 'Label 1' },
                    { value: 'val2', label: 'Label 2', selected: true }
                ]
            });
            expect(prompt.options[0].value).toBe('val1');
            expect(prompt.options[0].label).toBe('Label 1');
            expect(prompt.selected.has('val2')).toBe(true);
        });
        it('should respect initial selection', () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: [
                    { value: 'a', label: 'A' },
                    { value: 'b', label: 'B', selected: true },
                    { value: 'c', label: 'C', selected: true }
                ]
            });
            expect(prompt.selected.has('b')).toBe(true);
            expect(prompt.selected.has('c')).toBe(true);
            expect(prompt.selected.size).toBe(2);
        });
        it('should accept required option', () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B'],
                required: true
            });
            expect(prompt.config.required).toBe(true);
        });
        it('should accept min/max options', () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C'],
                min: 1,
                max: 2
            });
            expect(prompt.config.min).toBe(1);
            expect(prompt.config.max).toBe(2);
        });
    });
    describe('navigation', () => {
        it('should move cursor with arrow keys', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'down' });
            expect(prompt.cursor).toBe(1);
            await prompt.handleInput({ name: 'down' });
            expect(prompt.cursor).toBe(2);
            await prompt.handleInput({ name: 'up' });
            expect(prompt.cursor).toBe(1);
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should loop when enabled', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C'],
                loop: true
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'up' });
            expect(prompt.cursor).toBe(2);
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
    });
    describe('selection', () => {
        it('should toggle selection on space', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'space' });
            expect(prompt.selected.has('A')).toBe(true);
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'space' });
            expect(prompt.selected.has('A')).toBe(true);
            expect(prompt.selected.has('B')).toBe(true);
            await prompt.handleInput({ name: 'up' });
            await prompt.handleInput({ name: 'space' });
            expect(prompt.selected.has('A')).toBe(false);
            expect(prompt.selected.has('B')).toBe(true);
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should select all with Ctrl+A', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'a' });
            expect(prompt.selected.size).toBe(3);
            expect(prompt.selected.has('A')).toBe(true);
            expect(prompt.selected.has('B')).toBe(true);
            expect(prompt.selected.has('C')).toBe(true);
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should respect max selection', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C'],
                max: 2
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'space' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'space' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'space' });
            expect(prompt.selected.size).toBe(2);
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
    });
    describe('submission', () => {
        it('should submit selected values on enter', async () => {
            const result = await testPrompt(MultiSelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C']
            }, async ({ sendKey }) => {
                sendKey({ name: 'space' });
                sendKey({ name: 'down' });
                sendKey({ name: 'down' });
                sendKey({ name: 'space' });
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual(['A', 'C']);
        });
        it('should submit custom values from options', async () => {
            const result = await testPrompt(MultiSelectPrompt, {
                message: 'Select:',
                options: [
                    { value: 'val1', label: 'Label 1' },
                    { value: 'val2', label: 'Label 2' }
                ]
            }, async ({ sendKey }) => {
                sendKey({ name: 'space' });
                sendKey({ name: 'down' });
                sendKey({ name: 'space' });
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual(['val1', 'val2']);
        });
        it('should not submit if required and nothing selected', async () => {
            const result = await testPrompt(MultiSelectPrompt, {
                message: 'Select:',
                options: ['A', 'B'],
                required: true
            }, async ({ prompt, sendKey, waitForRender }) => {
                sendKey({ name: 'enter' });
                await waitForRender();
                const state = prompt.state.getState();
                expect(state.error).toBeTruthy();
                sendKey({ name: 'space' });
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual(['A']);
        });
        it('should enforce minimum selection', async () => {
            const result = await testPrompt(MultiSelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C'],
                min: 2
            }, async ({ prompt, sendKey, waitForRender }) => {
                sendKey({ name: 'space' });
                sendKey({ name: 'enter' });
                await waitForRender();
                const state = prompt.state.getState();
                expect(state.error).toContain('at least 2');
                sendKey({ name: 'down' });
                sendKey({ name: 'space' });
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual(['A', 'B']);
        });
        it('should cancel on escape', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'escape' });
            const result = await resultPromise;
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('rendering', () => {
        it('should render all options with checkboxes', async () => {
            await testPrompt(MultiSelectPrompt, {
                message: 'Select items:',
                options: ['Option 1', 'Option 2', 'Option 3']
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                const output = prompt.render();
                expect(output).toContain('Select items:');
                expect(output).toContain('Option 1');
                expect(output).toContain('Option 2');
                expect(output).toContain('Option 3');
                sendKey({ name: 'escape' });
            });
        });
        it('should show selected state', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'space' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'space' });
            const output = prompt.render();
            expect(output).toContain('2 selected');
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
        it('should show cursor position', async () => {
            await testPrompt(MultiSelectPrompt, {
                message: 'Select:',
                options: ['A', 'B', 'C']
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                sendKey({ name: 'down' });
                await waitForRender();
                const output = prompt.render();
                expect(output).toContain('B');
                sendKey({ name: 'escape' });
            });
        });
        it('should show hints', async () => {
            await testPrompt(MultiSelectPrompt, {
                message: 'Select:',
                options: [
                    { value: 'a', label: 'Option A', hint: 'First option' },
                    { value: 'b', label: 'Option B', hint: 'Second option' }
                ]
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                const output = prompt.render();
                expect(output).toContain('First option');
                expect(output).toContain('Second option');
                sendKey({ name: 'escape' });
            });
        });
        it('should show selection count', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C', 'D']
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'space' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'space' });
            const output = prompt.render();
            expect(output).toMatch(/2.*selected|selected.*2/i);
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
        it('should show min/max constraints', async () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B', 'C'],
                min: 1,
                max: 2
            });
            const resultPromise = prompt.prompt();
            const output = prompt.render();
            expect(output).toContain('Select:');
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
    });
    describe('edge cases', () => {
        it('should handle empty options', () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: []
            });
            expect(prompt.options).toHaveLength(0);
        });
        it('should handle single option', async () => {
            const result = await testPrompt(MultiSelectPrompt, {
                message: 'Select:',
                options: ['Only Option']
            }, async ({ sendKey }) => {
                sendKey({ name: 'space' });
                sendKey({ name: 'enter' });
            });
            expect(result).toEqual(['Only Option']);
        });
        it('should handle very long option lists', () => {
            const options = Array.from({ length: 100 }, (_, i) => `Option ${i}`);
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options,
                limit: 10
            });
            expect(prompt.options).toHaveLength(100);
            expect(prompt.config.limit).toBe(10);
        });
        it('should handle conflicting min/max', () => {
            const prompt = new MultiSelectPrompt({
                message: 'Select:',
                options: ['A', 'B'],
                min: 3,
                max: 2
            });
            expect(prompt.config.min).toBe(3);
            expect(prompt.config.max).toBe(2);
        });
    });
});
//# sourceMappingURL=multiselect.test.js.map