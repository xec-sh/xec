import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { cancelSymbol } from '../../../../src/core/types.js';
import { PasswordPrompt } from '../../../../src/components/primitives/password.js';
const mockWrite = vi.fn();
const originalWrite = process.stdout.write;
describe('PasswordPrompt', () => {
    beforeEach(() => {
        process.stdout.write = mockWrite;
        mockWrite.mockClear();
    });
    afterEach(() => {
        process.stdout.write = originalWrite;
    });
    describe('initialization', () => {
        it('should create with message', () => {
            const prompt = new PasswordPrompt({ message: 'Enter password:' });
            expect(prompt.config.message).toBe('Enter password:');
        });
        it('should accept custom mask character', () => {
            const prompt = new PasswordPrompt({
                message: 'Enter password:',
                mask: '*'
            });
            expect(prompt.config.mask).toBe('*');
        });
        it('should default to bullet mask', () => {
            const prompt = new PasswordPrompt({
                message: 'Enter password:'
            });
            expect(prompt.config.mask).toBe('•');
        });
        it('should accept validation function', () => {
            const validate = vi.fn();
            const prompt = new PasswordPrompt({
                message: 'Enter password:',
                validate
            });
            expect(prompt.config.validate).toBe(validate);
        });
    });
    describe('input handling', () => {
        it.skip('should accept character input', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 's' });
            await prompt.handleInput({ char: 'e' });
            await prompt.handleInput({ char: 'c' });
            await prompt.handleInput({ char: 'r' });
            await prompt.handleInput({ char: 'e' });
            await prompt.handleInput({ char: 't' });
            const state = prompt.state.getState();
            expect(state.value).toBe('secret');
            await prompt.handleInput({ name: 'return' });
            const result = await resultPromise;
            expect(result).toBe('secret');
        });
        it('should handle backspace', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 't' });
            await prompt.handleInput({ char: 'e' });
            await prompt.handleInput({ char: 's' });
            await prompt.handleInput({ char: 't' });
            await prompt.handleInput({ name: 'backspace' });
            const state = prompt.state.getState();
            expect(state.value).toBe('tes');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should handle delete key', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 't' });
            await prompt.handleInput({ char: 'e' });
            await prompt.handleInput({ char: 's' });
            await prompt.handleInput({ char: 't' });
            await prompt.handleInput({ name: 'home' });
            await prompt.handleInput({ name: 'delete' });
            const state = prompt.state.getState();
            expect(state.value).toBe('est');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it('should handle cursor movement', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 't' });
            await prompt.handleInput({ char: 'e' });
            await prompt.handleInput({ char: 's' });
            await prompt.handleInput({ char: 't' });
            await prompt.handleInput({ name: 'left' });
            await prompt.handleInput({ name: 'left' });
            let state = prompt.state.getState();
            expect(prompt.cursor).toBe(2);
            await prompt.handleInput({ char: 'x' });
            state = prompt.state.getState();
            expect(state.value).toBe('texst');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it.skip('should toggle visibility on tab', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            let state = prompt.state.getState();
            expect(state.showPassword).toBe(false);
            await prompt.handleInput({ name: 'tab' });
            state = prompt.state.getState();
            expect(state.showPassword).toBe(true);
            await prompt.handleInput({ name: 'tab' });
            state = prompt.state.getState();
            expect(state.showPassword).toBe(false);
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
        it.skip('should submit on enter', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 'p' });
            await prompt.handleInput({ char: 'a' });
            await prompt.handleInput({ char: 's' });
            await prompt.handleInput({ char: 's' });
            await prompt.handleInput({ name: 'return' });
            const result = await resultPromise;
            expect(result).toBe('pass');
        });
        it.skip('should cancel on escape', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'escape' });
            const result = await resultPromise;
            expect(result).toBe(cancelSymbol);
        });
    });
    describe('validation', () => {
        it.skip('should validate password', async () => {
            const validate = vi.fn((value) => {
                if (value.length < 8)
                    return 'Password must be at least 8 characters';
                return undefined;
            });
            const prompt = new PasswordPrompt({
                message: 'Password:',
                validate
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 's' });
            await prompt.handleInput({ char: 'h' });
            await prompt.handleInput({ char: 'o' });
            await prompt.handleInput({ char: 'r' });
            await prompt.handleInput({ char: 't' });
            expect(validate).toHaveBeenCalledWith('short');
            const state = prompt.state.getState();
            expect(state.error).toBe('Password must be at least 8 characters');
            await prompt.handleInput({ char: '1' });
            await prompt.handleInput({ char: '2' });
            await prompt.handleInput({ char: '3' });
            const state2 = prompt.state.getState();
            expect(state2.error).toBeUndefined();
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
        it.skip('should not submit with validation error', async () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                validate: () => 'Invalid password'
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 'a' });
            await prompt.handleInput({ name: 'return' });
            const state = prompt.state.getState();
            expect(state.error).toBe('Invalid password');
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
    });
    describe('rendering', () => {
        it.skip('should mask password by default', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:'
            });
            prompt.state.setState({
                value: 'secret',
                cursorPosition: 6,
                showPassword: false,
                error: undefined
            });
            const output = prompt.render();
            expect(output).toContain('Password:');
            expect(output).toContain('••••••');
            expect(output).not.toContain('secret');
        });
        it.skip('should use custom mask character', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                mask: '*'
            });
            prompt.state.setState({
                value: 'test',
                cursorPosition: 4,
                showPassword: false,
                error: undefined
            });
            const output = prompt.render();
            expect(output).toContain('****');
        });
        it('should show password when toggled', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:'
            });
            prompt.state.setState({
                value: 'visible',
                cursorPosition: 7,
                showPassword: true,
                error: undefined
            });
            const output = prompt.render();
            expect(output).toContain('visible');
            expect(output).not.toContain('•••••••');
        });
        it.skip('should show validation error', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:'
            });
            prompt.state.setState({
                value: 'short',
                cursorPosition: 5,
                showPassword: false,
                error: 'Password too short'
            });
            const output = prompt.render();
            expect(output).toContain('Password too short');
        });
        it.skip('should show cursor position', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:'
            });
            prompt.state.setState({
                value: 'test',
                cursorPosition: 2,
                showPassword: false,
                error: undefined
            });
            const output = prompt.render();
            expect(output).toContain('\x1b[7m');
        });
        it.skip('should show hint about tab to toggle', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:'
            });
            const output = prompt.render();
            expect(output.toLowerCase()).toMatch(/tab|toggle|show/);
        });
    });
    describe('password strength', () => {
        it('should calculate password strength', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                showStrength: true
            });
            const testCases = [
                { password: '', strength: 0 },
                { password: 'abc', strength: 0 },
                { password: 'abcdefgh', strength: 1 },
                { password: 'Abcdefgh1', strength: 2 },
                { password: 'Abcdefgh1!', strength: 3 },
                { password: 'MyP@ssw0rd2023!', strength: 4 },
                { password: 'MyVeryL0ngP@ssw0rd!', strength: 5 }
            ];
            testCases.forEach(({ password, strength }) => {
                const calculated = prompt.calculateStrength(password);
                expect(calculated).toBeGreaterThanOrEqual(strength - 1);
                expect(calculated).toBeLessThanOrEqual(strength + 1);
            });
        });
        it('should render password strength indicator', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                showStrength: true
            });
            prompt.state.setState({ status: 'active' });
            const strengths = [0, 1, 2, 3, 4, 5];
            strengths.forEach(strength => {
                const rendered = prompt.renderStrength(strength);
                expect(rendered).toContain('Strength:');
                expect(rendered).toMatch(/[█░]/);
            });
        });
        it('should show strength indicator when enabled', async () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                showStrength: true
            });
            prompt.value = 'MyStr0ngP@ss!';
            prompt.state.setState({ status: 'active' });
            const output = prompt.render();
            expect(output).toContain('Strength:');
        });
        it('should not show strength indicator when disabled', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                showStrength: false
            });
            prompt.value = 'MyStr0ngP@ss!';
            prompt.state.setState({ status: 'active' });
            const output = prompt.render();
            expect(output).not.toContain('Strength:');
        });
        it('should detect common patterns', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                showStrength: true
            });
            const weak1 = prompt.calculateStrength('aaaaaaaaaa');
            const weak2 = prompt.calculateStrength('12345678');
            expect(weak1).toBeLessThanOrEqual(2);
            expect(weak2).toBeLessThanOrEqual(2);
        });
        it('should render strength with appropriate colors', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                showStrength: true
            });
            prompt.state.setState({ status: 'active' });
            let rendered = prompt.renderStrength(0);
            expect(rendered).toContain('Very Weak');
            rendered = prompt.renderStrength(5);
            expect(rendered).toContain('Strong');
        });
        it('should handle edge case strength values', () => {
            const prompt = new PasswordPrompt({
                message: 'Password:',
                showStrength: true
            });
            const rendered1 = prompt.renderStrength(0);
            expect(rendered1).toContain('Very Weak');
            const rendered2 = prompt.renderStrength(5);
            expect(rendered2).toContain('Strong');
            const veryStrongPassword = 'MyVeryL0ngP@ssw0rd!WithM@nyCharacters123';
            const strength = prompt.calculateStrength(veryStrongPassword);
            expect(strength).toBeLessThanOrEqual(5);
            expect(strength).toBeGreaterThanOrEqual(0);
        });
    });
    describe('edge cases', () => {
        it.skip('should handle empty password submission', async () => {
            const prompt = new PasswordPrompt({
                message: 'Password:'
            });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ name: 'return' });
            const result = await resultPromise;
            expect(result).toBe('');
        });
        it('should handle very long passwords', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            const longPassword = 'a'.repeat(100);
            for (const char of longPassword) {
                await prompt.handleInput({ char });
            }
            const state = prompt.state.getState();
            expect(state.value).toBe(longPassword);
            await prompt.handleInput({ name: 'escape' });
            await resultPromise;
        });
        it('should ignore non-printable characters', async () => {
            const prompt = new PasswordPrompt({ message: 'Password:' });
            const resultPromise = prompt.prompt();
            await prompt.handleInput({ char: 'a' });
            await prompt.handleInput({ name: 'f1' });
            await prompt.handleInput({ char: 'b' });
            const state = prompt.state.getState();
            expect(state.value).toBe('ab');
            await prompt.handleInput({ name: 'return' });
            await resultPromise;
        });
    });
});
//# sourceMappingURL=password.test.js.map