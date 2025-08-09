import { it, expect, describe, afterEach, beforeEach } from 'vitest';
import { mockProcessStreams } from '../../helpers/mock-tty.js';
import { cancelSymbol } from '../../../src/core/types.js';
import { createDefaultTheme } from '../../../src/themes/default.js';
import { Prompt } from '../../../src/core/prompt.js';
class TestPrompt extends Prompt {
    render() {
        return `Test: ${this.config.message}`;
    }
    async handleInput(key) {
        if (key.name === 'return') {
            this.resolve('test-value');
        }
    }
    get testTheme() {
        return this.theme;
    }
}
describe('Prompt', () => {
    let mockStreams;
    beforeEach(() => {
        mockStreams = mockProcessStreams();
    });
    afterEach(() => {
        mockStreams.restore();
    });
    describe('initialization', () => {
        it('should create prompt with config', () => {
            const theme = createDefaultTheme();
            const config = {
                message: 'Test prompt',
                theme
            };
            const prompt = new TestPrompt(config);
            expect(prompt.config).toBe(config);
            expect(prompt.testTheme).toStrictEqual(theme);
        });
        it('should use default theme if not provided', () => {
            const config = {
                message: 'Test prompt'
            };
            const prompt = new TestPrompt(config);
            expect(prompt.testTheme).toBeDefined();
        });
    });
    describe('lifecycle', () => {
        it('should return cancel symbol in non-TTY mode', async () => {
            mockStreams.stdin.isTTY = false;
            mockStreams.stdout.isTTY = false;
            const prompt = new TestPrompt({
                message: 'Test prompt'
            });
            const result = await prompt.prompt();
            expect(result).toBe(cancelSymbol);
        });
        it.skip('should simulate interactive mode', async () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const prompt = new TestPrompt({
                message: 'Test prompt'
            });
            const resultPromise = prompt.prompt();
            process.nextTick(() => {
                mockStreams.stdin.emit('data', '\r');
            });
            const result = await resultPromise;
            expect(result).toBe('test-value');
        });
        it('should handle initial value in non-TTY', async () => {
            mockStreams.stdin.isTTY = false;
            mockStreams.stdout.isTTY = false;
            const prompt = new TestPrompt({
                message: 'Test prompt',
                initialValue: 'default'
            });
            const result = await prompt.prompt();
            expect(result).toBe('default');
        });
    });
    describe('rendering', () => {
        it.skip('should write final state in non-TTY', async () => {
            mockStreams.stdin.isTTY = false;
            mockStreams.stdout.isTTY = false;
            const prompt = new TestPrompt({
                message: 'Test prompt',
                initialValue: 'test'
            });
            await prompt.prompt();
            expect(mockStreams.stdout.write).toHaveBeenCalled();
        });
        it('should render method return correct output', () => {
            const prompt = new TestPrompt({
                message: 'Test prompt'
            });
            const output = prompt.render();
            expect(output).toBe('Test: Test prompt');
        });
    });
    describe('protected methods', () => {
        it('should have resolve method', () => {
            const prompt = new TestPrompt({
                message: 'Test prompt'
            });
            expect(typeof prompt.resolve).toBe('function');
        });
        it('should have cancel method', () => {
            const prompt = new TestPrompt({
                message: 'Test prompt'
            });
            expect(typeof prompt.cancel).toBe('function');
        });
        it('should return initial value in non-TTY', async () => {
            mockStreams.stdin.isTTY = false;
            mockStreams.stdout.isTTY = false;
            const prompt = new TestPrompt({
                message: 'Test prompt',
                initialValue: 'test-value'
            });
            const result = await prompt.prompt();
            expect(result).toBe('test-value');
        });
    });
    describe('error handling', () => {
        it('should handle errors in handleInput', async () => {
            mockStreams.stdin.isTTY = false;
            mockStreams.stdout.isTTY = false;
            class ErrorPrompt extends Prompt {
                render() {
                    return 'Error test';
                }
                async handleInput(key) {
                    if (key.char === 'e') {
                        throw new Error('Test error');
                    }
                    if (key.name === 'return') {
                        this.resolve('done');
                    }
                }
            }
            const prompt = new ErrorPrompt({
                message: 'Error test',
                initialValue: 'safe'
            });
            const result = await prompt.prompt();
            expect(result).toBe('safe');
        });
        it('should handle errors in render', async () => {
            mockStreams.stdin.isTTY = false;
            mockStreams.stdout.isTTY = false;
            class RenderErrorPrompt extends Prompt {
                constructor() {
                    super(...arguments);
                    this.shouldError = true;
                }
                render() {
                    if (this.shouldError) {
                        this.shouldError = false;
                        throw new Error('Render error');
                    }
                    return 'Fixed';
                }
                async handleInput(key) {
                    if (key.name === 'return') {
                        this.resolve('done');
                    }
                }
            }
            const prompt = new RenderErrorPrompt({
                message: 'Render error test'
            });
            const result = await prompt.prompt();
            expect(result).toBe(cancelSymbol);
        });
    });
});
//# sourceMappingURL=prompt.test.js.map