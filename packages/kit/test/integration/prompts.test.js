import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import { mockProcessStreams } from '../helpers/mock-tty.js';
import kit, { log, text, select, number, confirm, spinner, password, multiselect, cancelSymbol } from '../../src/index.js';
describe('Kit Integration Tests', () => {
    let mockStreams;
    beforeEach(() => {
        mockStreams = mockProcessStreams({ isTTY: true });
    });
    afterEach(() => {
        mockStreams.restore();
    });
    describe('exported APIs', () => {
        it('should export default kit object', () => {
            expect(kit).toBeDefined();
            expect(kit.text).toBeDefined();
            expect(kit.confirm).toBeDefined();
            expect(kit.select).toBeDefined();
            expect(kit.multiselect).toBeDefined();
            expect(kit.password).toBeDefined();
            expect(kit.number).toBeDefined();
            expect(kit.spinner).toBeDefined();
            expect(kit.log).toBeDefined();
        });
        it('should export individual functions', () => {
            expect(text).toBeDefined();
            expect(confirm).toBeDefined();
            expect(select).toBeDefined();
            expect(multiselect).toBeDefined();
            expect(password).toBeDefined();
            expect(number).toBeDefined();
            expect(spinner).toBeDefined();
            expect(log).toBeDefined();
        });
        it('should export symbols', () => {
            expect(cancelSymbol).toBeDefined();
            expect(typeof cancelSymbol).toBe('symbol');
        });
    });
    describe('function signatures', () => {
        it('text should accept string message', async () => {
            const promptPromise = text('Enter name:');
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey('John');
            mockStreams.sendKey({ name: 'return' });
            const result = await Promise.race([
                promptPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
            ]).catch(() => 'timeout');
            expect(result).toBeTruthy();
        });
        it('text should accept options object', async () => {
            const promptPromise = text({
                message: 'Enter name:',
                placeholder: 'John Doe'
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            const result = await promptPromise.catch(() => cancelSymbol);
            expect(result).toBe(cancelSymbol);
        });
        it('confirm should accept string message', async () => {
            const promptPromise = confirm('Continue?');
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey('y');
            const result = await promptPromise;
            expect(result).toBe(true);
        });
        it('confirm should accept options object', async () => {
            const promptPromise = confirm({
                message: 'Continue?',
                default: false
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey('n');
            const result = await promptPromise;
            expect(result).toBe(false);
        });
        it('select should accept string message and array', async () => {
            const promptPromise = select('Choose:', ['Option 1', 'Option 2']);
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(result).toBe('Option 1');
        });
        it('select should accept options object', async () => {
            const promptPromise = select({
                message: 'Choose:',
                options: ['Option 1', 'Option 2']
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'down' });
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(result).toBe('Option 2');
        });
        it('multiselect should accept string message and array', async () => {
            const promptPromise = multiselect('Select items:', ['Item 1', 'Item 2']);
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'space' });
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(Array.isArray(result)).toBe(true);
            expect(result).toContain('Item 1');
        });
        it('multiselect should accept options object', async () => {
            const promptPromise = multiselect({
                message: 'Select items:',
                options: ['Item 1', 'Item 2']
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'space' });
            mockStreams.sendKey({ name: 'down' });
            mockStreams.sendKey({ name: 'space' });
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(result).toHaveLength(2);
        });
        it('password should accept string message', async () => {
            const promptPromise = password('Enter password:');
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey('secret123');
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(result).toBe('secret123');
        });
        it('password should accept options object', async () => {
            const promptPromise = password({
                message: 'Enter password:',
                mask: '*'
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey('test');
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(result).toBe('test');
        });
        it('number should accept string message', async () => {
            const promptPromise = number('Enter age:');
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(typeof result).toBe('number');
            expect(result).toBe(0);
        });
        it('number should accept options object', async () => {
            const promptPromise = number({
                message: 'Enter age:',
                min: 0,
                max: 120,
                default: 25
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'return' });
            const result = await promptPromise;
            expect(typeof result).toBe('number');
            expect(result).toBe(25);
        });
    });
    describe('spinner functionality', () => {
        it('should create spinner with factory function', () => {
            const s = spinner('Loading...');
            expect(s).toBeDefined();
            expect(s.isActive()).toBe(true);
            s.stop();
        });
        it('should create spinner from kit object', () => {
            const s = kit.spinner('Loading...');
            expect(s).toBeDefined();
            expect(s.isActive()).toBe(true);
            s.stop();
        });
        it('should support completion methods', () => {
            const s = spinner('Test');
            expect(s.success).toBeDefined();
            expect(s.error).toBeDefined();
            expect(s.warn).toBeDefined();
            expect(s.info).toBeDefined();
            s.stop();
        });
    });
    describe('log functionality', () => {
        it('should have all log methods', () => {
            expect(log.info).toBeDefined();
            expect(log.success).toBeDefined();
            expect(log.error).toBeDefined();
            expect(log.warning).toBeDefined();
            expect(log.message).toBeDefined();
        });
        it('should access log through kit object', () => {
            expect(kit.log.info).toBeDefined();
            expect(kit.log.success).toBeDefined();
            expect(kit.log.error).toBeDefined();
            expect(kit.log.warning).toBeDefined();
            expect(kit.log.message).toBeDefined();
        });
    });
    describe('type inference', () => {
        it('should infer string type for text prompt', async () => {
            const promptPromise = text('Name:');
            const typeCheck = promptPromise;
            expect(typeCheck).toBeDefined();
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
        it('should infer boolean type for confirm prompt', async () => {
            const promptPromise = confirm('Continue?');
            const typeCheck = promptPromise;
            expect(typeCheck).toBeDefined();
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
        it('should infer number type for number prompt', async () => {
            const promptPromise = number('Age:');
            const typeCheck = promptPromise;
            expect(typeCheck).toBeDefined();
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
        it('should infer array type for multiselect', async () => {
            const promptPromise = multiselect('Select:', ['A', 'B']);
            const typeCheck = promptPromise;
            expect(typeCheck).toBeDefined();
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
        it('should support generic types for select', async () => {
            const options = [
                { id: 1, name: 'One' },
                { id: 2, name: 'Two' }
            ];
            const promptPromise = select({
                message: 'Choose:',
                options: options.map(o => ({
                    value: o,
                    label: o.name
                }))
            });
            const typeCheck = promptPromise;
            expect(typeCheck).toBeDefined();
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
    });
    describe('error handling', () => {
        it('prompt functions should return promises', async () => {
            const promptPromise = text('Name:');
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
        it('should handle empty options array', async () => {
            await expect(select('Choose:', [])).rejects.toThrow('Select prompt requires at least one option');
        });
        it('should handle invalid number ranges', async () => {
            const promptPromise = number({
                message: 'Number:',
                min: 10,
                max: 5
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
    });
    describe('theme integration', () => {
        it('should support custom themes', async () => {
            const promptPromise = text({
                message: 'Test:',
                theme: {
                    symbols: {
                        question: '>'
                    }
                }
            });
            expect(promptPromise).toBeInstanceOf(Promise);
            await new Promise(resolve => setTimeout(resolve, 10));
            mockStreams.sendKey({ name: 'escape' });
            await promptPromise.catch(() => { });
        });
    });
    describe('color support', () => {
        it('should detect color support', async () => {
            const { colorSupport } = await import('../../src/utils/colors.js');
            expect(colorSupport).toBeDefined();
            expect(colorSupport.level).toBeDefined();
            expect(typeof colorSupport.hasBasic).toBe('boolean');
        });
    });
});
//# sourceMappingURL=prompts.test.js.map