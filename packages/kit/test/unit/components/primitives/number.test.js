import { it, vi, expect, describe } from 'vitest';
import { cancelSymbol } from '../../../../src/core/types.js';
import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { NumberPrompt } from '../../../../src/components/primitives/number.js';
describe('NumberPrompt', () => {
    describe('initialization', () => {
        it('should create with message', () => {
            const prompt = new NumberPrompt({ message: 'Enter number:' });
            expect(prompt.config.message).toBe('Enter number:');
        });
        it('should accept min/max values', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                min: 0,
                max: 100
            });
            expect(prompt.min).toBe(0);
            expect(prompt.max).toBe(100);
        });
        it('should accept step value', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                step: 5
            });
            expect(prompt.step).toBe(5);
        });
        it('should accept default value', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                default: 42
            });
            const state = prompt.state.getState();
            expect(state.value).toBe('42');
        });
        it('should accept validation function', () => {
            const validate = vi.fn();
            const prompt = new NumberPrompt({
                message: 'Enter:',
                validate
            });
            expect(prompt.validate).toBe(validate);
        });
    });
    describe('input handling', () => {
        it.skip('should accept numeric input', async () => {
            const prompt = new NumberPrompt({ message: 'Number:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'backspace' });
            await prompt.handleInput({ char: '4' });
            await prompt.handleInput({ char: '2' });
            const state = prompt.state.getState();
            expect(state.value).toBe('42');
            await prompt.handleInput({ name: 'return' });
            const result = await resultPromise;
            expect(result).toBe(42);
        });
        it.skip('should accept decimal numbers', async () => {
            const result = await testPrompt(NumberPrompt, { message: 'Number:' }, async ({ prompt, sendKey, waitForRender }) => {
                sendKey({ name: 'backspace' });
                await waitForRender();
                sendKey({ char: '3' });
                await waitForRender();
                sendKey({ char: '.' });
                await waitForRender();
                sendKey({ char: '1' });
                await waitForRender();
                sendKey({ char: '4' });
                await waitForRender();
                const state = prompt.state.getState();
                expect(state.value).toBe('3.14');
                sendKey({ name: 'return' });
            });
            expect(result).toBe(3.14);
        });
        it.skip('should accept negative numbers', async () => {
            const result = await testPrompt(NumberPrompt, { message: 'Number:' }, async ({ prompt, sendKey, waitForRender }) => {
                sendKey({ name: 'backspace' });
                await waitForRender();
                sendKey({ char: '-' });
                await waitForRender();
                sendKey({ char: '5' });
                await waitForRender();
                const state = prompt.state.getState();
                expect(state.value).toBe('-5');
                sendKey({ name: 'return' });
            });
            expect(result).toBe(-5);
        });
        it('should handle backspace', async () => {
            const prompt = new NumberPrompt({ message: 'Number:', default: 123 });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'backspace' });
            const state = prompt.state.getState();
            expect(state.value).toBe('12');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should handle arrow up/down for increment/decrement', async () => {
            const prompt = new NumberPrompt({
                message: 'Number:',
                default: 10,
                step: 5
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'up' });
            let state = prompt.state.getState();
            expect(state.value).toBe('15');
            await prompt.handleInput({ name: 'down' });
            await prompt.handleInput({ name: 'down' });
            state = prompt.state.getState();
            expect(state.value).toBe('5');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should respect min/max when using arrows', async () => {
            const prompt = new NumberPrompt({
                message: 'Number:',
                default: 5,
                min: 0,
                max: 10,
                step: 1
            });
            const resultPromise = prompt.prompt();
            for (let i = 0; i < 10; i++) {
                await prompt.handleInput({ name: 'up' });
            }
            let state = prompt.state.getState();
            expect(state.value).toBe('10');
            for (let i = 0; i < 15; i++) {
                await prompt.handleInput({ name: 'down' });
            }
            state = prompt.state.getState();
            expect(state.value).toBe('0');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should handle cursor movement', async () => {
            const prompt = new NumberPrompt({ message: 'Number:', default: 123 });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'left' });
            await prompt.handleInput({ name: 'left' });
            let state = prompt.state.getState();
            expect(state.cursorPosition).toBe(1);
            await prompt.handleInput({ char: '4' });
            state = prompt.state.getState();
            expect(state.value).toBe('1423');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it.skip('should submit on enter', async () => {
            const result = await testPrompt(NumberPrompt, { message: 'Number:' }, async ({ sendKey }) => {
                sendKey({ name: 'backspace' });
                sendKey({ char: '9' });
                sendKey({ char: '9' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe(99);
        });
        it('should cancel on escape', async () => {
            const result = await testPrompt(NumberPrompt, { message: 'Number:' }, async ({ sendKey }) => {
                sendKey({ name: 'escape' });
            });
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('validation', () => {
        it.skip('should validate min/max bounds', async () => {
            const result = await testPrompt(NumberPrompt, {
                message: 'Number:',
                min: 10,
                max: 20
            }, async ({ prompt, sendKey, waitForRender }) => {
                await waitForRender();
                const state1 = prompt.state.getState();
                expect(state1.error).toBe('Value must be at least 10');
                sendKey({ name: 'backspace' });
                await waitForRender();
                sendKey({ char: '1' });
                await waitForRender();
                sendKey({ char: '5' });
                await waitForRender();
                const state2 = prompt.state.getState();
                expect(state2.error).toBeUndefined();
                sendKey({ name: 'return' });
            });
            expect(result).toBe(15);
        });
        it.skip('should use custom validation', async () => {
            const validate = vi.fn((value) => {
                if (value % 2 !== 0)
                    return 'Must be even';
                return undefined;
            });
            const result = await testPrompt(NumberPrompt, {
                message: 'Number:',
                validate
            }, async ({ prompt, sendKey, waitForRender }) => {
                sendKey({ name: 'backspace' });
                await waitForRender();
                sendKey({ char: '3' });
                await waitForRender();
                expect(validate).not.toHaveBeenCalled();
                sendKey({ name: 'return' });
                await waitForRender();
                expect(validate).toHaveBeenCalledWith(3);
                const state = prompt.state.getState();
                expect(state.error).toBe('Must be even');
                sendKey({ name: 'backspace' });
                await waitForRender();
                sendKey({ char: '4' });
                await waitForRender();
                sendKey({ name: 'return' });
            });
            expect(result).toBe(4);
        });
        it.skip('should not submit with validation error', async () => {
            const prompt = new NumberPrompt({
                message: 'Number:',
                validate: () => 'Always fails'
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'return' });
            const state = prompt.state.getState();
            expect(state.error).toBe('Always fails');
            await prompt.handleInput({ name: 'escape' });
            const result = await resultPromise;
            expect(result).toBe(Symbol.for('kit.cancel'));
        });
        it('should validate during typing', async () => {
            await testPrompt(NumberPrompt, {
                message: 'Number:',
                min: 10
            }, async ({ prompt, sendKey }) => {
                sendKey({ char: 'a' });
                sendKey({ char: 'b' });
                const state = prompt.state.getState();
                expect(state.value).toBe('0');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('rendering', () => {
        it('should render current value', () => {
            const prompt = new NumberPrompt({
                message: 'Enter number:',
                default: 42
            });
            const output = prompt.render();
            expect(output).toContain('Enter number:');
            expect(output).toContain('42');
        });
        it('should show range hint', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                min: 0,
                max: 100
            });
            const output = prompt.render();
            expect(output).toContain('(0 - 100)');
        });
        it('should show min hint only', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                min: 18
            });
            const output = prompt.render();
            expect(output).toContain('(>= 18)');
        });
        it('should show max hint only', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                max: 99
            });
            const output = prompt.render();
            expect(output).toContain('(<= 99)');
        });
        it('should show validation error', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                min: 10
            });
            prompt.state.setState({
                value: '5',
                cursorPosition: 1,
                error: 'Value must be at least 10'
            });
            const output = prompt.render();
            expect(output).toContain('Value must be at least 10');
        });
        it('should show cursor position', () => {
            const prompt = new NumberPrompt({
                message: 'Enter:',
                default: 123
            });
            prompt.state.setState({
                value: '123',
                cursorPosition: 1,
                error: undefined
            });
            const output = prompt.render();
            expect(output).toContain('123');
        });
    });
    describe('edge cases', () => {
        it('should handle empty submission with default', async () => {
            const result = await testPrompt(NumberPrompt, {
                message: 'Number:',
                default: 42
            }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe(42);
        });
        it.skip('should handle partial numbers', async () => {
            await testPrompt(NumberPrompt, { message: 'Number:' }, async ({ prompt, sendKey }) => {
                sendKey({ name: 'backspace' });
                sendKey({ char: '-' });
                let state = prompt.state.getState();
                expect(state.value).toBe('-');
                expect(state.error).toBeUndefined();
                sendKey({ name: 'backspace' });
                sendKey({ char: '.' });
                state = prompt.state.getState();
                expect(state.value).toBe('.');
                sendKey({ name: 'escape' });
            });
        });
        it.skip('should handle scientific notation', async () => {
            await testPrompt(NumberPrompt, { message: 'Number:' }, async ({ prompt, sendKey }) => {
                sendKey({ name: 'backspace' });
                sendKey({ char: '1' });
                sendKey({ char: 'e' });
                sendKey({ char: '3' });
                const state = prompt.state.getState();
                expect(state.value).toBe('13');
                sendKey({ name: 'escape' });
            });
        });
        it.skip('should ignore non-numeric characters', async () => {
            const result = await testPrompt(NumberPrompt, { message: 'Number:' }, async ({ prompt, sendKey }) => {
                sendKey({ name: 'backspace' });
                sendKey({ char: '1' });
                sendKey({ char: 'a' });
                sendKey({ char: '2' });
                sendKey({ char: 'b' });
                sendKey({ char: '3' });
                const state = prompt.state.getState();
                expect(state.value).toBe('123');
                sendKey({ name: 'return' });
            });
            expect(result).toBe(123);
        });
    });
});
//# sourceMappingURL=number.test.js.map