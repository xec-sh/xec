import { it, vi, expect, describe } from 'vitest';
import { cancelSymbol } from '../../../../src/core/types.js';
import { TextPrompt } from '../../../../src/components/primitives/text.js';
import { testPrompt, testNonTTYPrompt } from '../../../helpers/prompt-test-utils.js';
describe('TextPrompt', () => {
    describe('initialization', () => {
        it('should create with message', () => {
            const prompt = new TextPrompt({ message: 'Enter name:' });
            expect(prompt.config.message).toBe('Enter name:');
        });
        it('should accept placeholder', () => {
            const prompt = new TextPrompt({
                message: 'Enter name:',
                placeholder: 'John Doe'
            });
            expect(prompt.config.placeholder).toBe('John Doe');
        });
        it('should accept default value', () => {
            const prompt = new TextPrompt({
                message: 'Enter name:',
                defaultValue: 'Alice'
            });
            expect(prompt.value).toBe('Alice');
        });
        it('should accept validation function', () => {
            const validate = vi.fn();
            const prompt = new TextPrompt({
                message: 'Enter name:',
                validate
            });
            expect(prompt.config.validate).toBe(validate);
        });
    });
    describe('non-TTY mode', () => {
        it('should return initial value in non-TTY', async () => {
            const result = await testNonTTYPrompt(TextPrompt, {
                message: 'Enter name:',
                initialValue: 'default-name'
            }, 'default-name');
            expect(result).toBe('default-name');
        });
        it('should return cancel symbol when no initial value', async () => {
            const result = await testNonTTYPrompt(TextPrompt, { message: 'Enter name:' });
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('TTY mode - input handling', () => {
        it('should accept character input', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:' }, async ({ sendKey }) => {
                sendKey('a');
                sendKey('b');
                sendKey('c');
                sendKey({ name: 'return' });
            });
            expect(result).toBe('abc');
        });
        it('should handle backspace', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'test' }, async ({ sendKey }) => {
                sendKey({ name: 'backspace' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('tes');
        });
        it('should handle delete key', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'test' }, async ({ sendKey }) => {
                sendKey({ name: 'home' });
                sendKey({ name: 'delete' });
                sendKey({ name: 'return' });
            });
            expect(result).toBe('est');
        });
        it('should submit on enter', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'hello' }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('hello');
        });
        it('should cancel on escape', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:' }, async ({ sendKey }) => {
                sendKey('test');
                sendKey({ name: 'escape' });
            });
            expect(result).toBe(cancelSymbol);
        });
        it('should cancel on Ctrl+C', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:' }, async ({ sendKey }) => {
                sendKey('test');
                sendKey({ ctrl: true, name: 'c' });
            });
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('cursor movement', () => {
        it('should move cursor left', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'test' }, async ({ sendKey }) => {
                sendKey({ name: 'left' });
                sendKey('X');
                sendKey({ name: 'return' });
            });
            expect(result).toBe('tesXt');
        });
        it('should move cursor right', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'test' }, async ({ sendKey }) => {
                sendKey({ name: 'home' });
                sendKey({ name: 'right' });
                sendKey('X');
                sendKey({ name: 'return' });
            });
            expect(result).toBe('tXest');
        });
        it('should move to home', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'test' }, async ({ sendKey }) => {
                sendKey({ name: 'home' });
                sendKey('X');
                sendKey({ name: 'return' });
            });
            expect(result).toBe('Xtest');
        });
        it('should move to end', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'test' }, async ({ sendKey }) => {
                sendKey({ name: 'home' });
                sendKey({ name: 'end' });
                sendKey('X');
                sendKey({ name: 'return' });
            });
            expect(result).toBe('testX');
        });
    });
    describe('validation', () => {
        it('should validate input', async () => {
            const validate = vi.fn((value) => {
                if (value.length < 3)
                    return 'Too short';
                return undefined;
            });
            const result = await testPrompt(TextPrompt, { message: 'Enter:', validate }, async ({ sendKey, waitForRender }) => {
                sendKey('ab');
                sendKey({ name: 'return' });
                await waitForRender();
                sendKey('c');
                sendKey({ name: 'return' });
            });
            expect(validate).toHaveBeenCalledWith('ab');
            expect(validate).toHaveBeenCalledWith('abc');
            expect(result).toBe('abc');
        });
        it('should handle async validation', async () => {
            const validate = vi.fn(async (value) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                if (value === 'taken')
                    return 'Username taken';
                return undefined;
            });
            const result = await testPrompt(TextPrompt, { message: 'Enter:', validate }, async ({ sendKey, waitForRender }) => {
                sendKey('taken');
                sendKey({ name: 'return' });
                await waitForRender();
                sendKey({ name: 'backspace' });
                sendKey({ name: 'backspace' });
                sendKey({ name: 'backspace' });
                sendKey({ name: 'backspace' });
                sendKey({ name: 'backspace' });
                sendKey('free');
                sendKey({ name: 'return' });
            });
            expect(validate).toHaveBeenCalledWith('taken');
            expect(validate).toHaveBeenCalledWith('free');
            expect(result).toBe('free');
        });
    });
    describe('rendering', () => {
        it('should render placeholder when empty', async () => {
            await testPrompt(TextPrompt, { message: 'Name:', placeholder: 'John Doe' }, async ({ mockStreams, sendKey }) => {
                expect(mockStreams.stdout.write).toHaveBeenCalled();
                const output = mockStreams.stdout.write.mock.calls.map(c => c[0]).join('');
                expect(output).toContain('Name:');
                expect(output).toContain('John Doe');
                sendKey({ name: 'escape' });
            });
        });
        it.skip('should not show placeholder when value exists', async () => {
            await testPrompt(TextPrompt, { message: 'Name:', placeholder: 'John Doe' }, async ({ mockStreams, sendKey, waitForRender }) => {
                for (const char of 'Alice') {
                    sendKey(char);
                    await waitForRender();
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                const writes = mockStreams.stdout.write.mock.calls
                    .map(c => c[0])
                    .filter(c => typeof c === 'string');
                const lastCompleteRender = writes.reverse().find(w => w.includes('Name:')) || '';
                const cleanOutput = lastCompleteRender.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                expect(cleanOutput).toContain('Alice');
                expect(cleanOutput).not.toContain('John Doe');
                sendKey({ name: 'escape' });
            });
        });
        it('should show cursor position', async () => {
            await testPrompt(TextPrompt, { message: 'Enter:', defaultValue: 'test' }, async ({ mockStreams, sendKey }) => {
                sendKey({ name: 'home' });
                await new Promise(resolve => setTimeout(resolve, 10));
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('password masking', () => {
        it.skip('should mask input when mask is true', async () => {
            await testPrompt(TextPrompt, { message: 'Password:', mask: '*' }, async ({ mockStreams, sendKey, waitForRender }) => {
                sendKey('secret');
                await waitForRender();
                const writes = mockStreams.stdout.write.mock.calls
                    .map(c => c[0])
                    .filter(c => typeof c === 'string');
                const lastCompleteRender = writes.reverse().find(w => w.includes('Password:')) || '';
                const cleanOutput = lastCompleteRender.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                expect(cleanOutput).toContain('******');
                expect(cleanOutput).not.toContain('secret');
                sendKey({ name: 'escape' });
            });
        });
        it.skip('should use custom mask function', async () => {
            const mask = vi.fn((char) => char === 'a' ? 'A' : '*');
            await testPrompt(TextPrompt, { message: 'Enter:', mask }, async ({ mockStreams, sendKey, waitForRender }) => {
                sendKey('abc');
                await waitForRender();
                const writes = mockStreams.stdout.write.mock.calls
                    .map(c => c[0])
                    .filter(c => typeof c === 'string');
                const lastCompleteRender = writes.reverse().find(w => w.includes('Enter:')) || '';
                const cleanOutput = lastCompleteRender.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                expect(cleanOutput).toContain('A**');
                expect(mask).toHaveBeenCalledWith('a');
                expect(mask).toHaveBeenCalledWith('b');
                expect(mask).toHaveBeenCalledWith('c');
                sendKey({ name: 'escape' });
            });
        });
    });
    describe('transform', () => {
        it('should transform final value', async () => {
            const transform = vi.fn((value) => value.toUpperCase());
            const result = await testPrompt(TextPrompt, { message: 'Enter:', transform }, async ({ sendKey }) => {
                sendKey('hello');
                sendKey({ name: 'return' });
            });
            expect(transform).toHaveBeenCalledWith('hello');
            expect(result).toBe('HELLO');
        });
    });
    describe('edge cases', () => {
        it('should handle empty submission when not required', async () => {
            const result = await testPrompt(TextPrompt, { message: 'Enter:' }, async ({ sendKey }) => {
                sendKey({ name: 'return' });
            });
            expect(result).toBe('');
        });
        it('should handle very long input', async () => {
            const longText = 'a'.repeat(1000);
            const result = await testPrompt(TextPrompt, { message: 'Enter:' }, async ({ sendKey }) => {
                for (const char of longText) {
                    sendKey(char);
                }
                sendKey({ name: 'return' });
            });
            expect(result).toBe(longText);
        });
        it('should handle special characters', async () => {
            const specialChars = '!@#$%^&*()_+-=[]{}|;:"<>,.?/~`';
            const result = await testPrompt(TextPrompt, { message: 'Enter:' }, async ({ sendKey }) => {
                for (const char of specialChars) {
                    sendKey(char);
                }
                sendKey({ name: 'return' });
            });
            expect(result).toBe(specialChars);
        });
    });
});
//# sourceMappingURL=text.test.js.map