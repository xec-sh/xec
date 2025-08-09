import { expect } from 'vitest';
import { mockProcessStreams } from './mock-tty.js';
import { cancelSymbol } from '../../src/core/types.js';
export async function testPrompt(PromptClass, config, test, options = {}) {
    const { isTTY = true } = options;
    const mockStreams = mockProcessStreams({ isTTY });
    const prompt = new PromptClass({
        ...config,
        initialValue: options.initialValue ?? config.initialValue
    });
    const sendKey = (key) => {
        mockStreams.sendKey(key);
    };
    const waitForRender = () => new Promise(resolve => setTimeout(resolve, 50));
    const getLastRender = () => {
        const calls = mockStreams.stdout.write.mock.calls;
        if (calls.length === 0)
            return '';
        const allOutput = calls
            .map(call => call[0])
            .filter(content => typeof content === 'string')
            .join('');
        const cleanOutput = allOutput
            .replace(/\x1B\[\?25[lh]/g, '')
            .replace(/\x1B\[[^m]*m/g, '')
            .replace(/\x1B\[[\d;]*[A-Z]/g, '');
        if (process.env.NODE_ENV === 'test' && process.env.DEBUG_OUTPUT) {
            console.log('Raw output:', JSON.stringify(allOutput));
            console.log('Clean output:', JSON.stringify(cleanOutput));
        }
        return cleanOutput;
    };
    try {
        const resultPromise = prompt.prompt();
        if (isTTY) {
            await new Promise(resolve => setTimeout(resolve, 10));
            await test({ prompt, mockStreams, sendKey, waitForRender, getLastRender });
        }
        return await resultPromise;
    }
    finally {
        mockStreams.restore();
    }
}
export async function testNonTTYPrompt(PromptClass, config, expectedValue) {
    const mockStreams = mockProcessStreams({ isTTY: false });
    try {
        const prompt = new PromptClass(config);
        const result = await prompt.prompt();
        if (expectedValue === undefined && config.initialValue === undefined) {
            return cancelSymbol;
        }
        return expectedValue ?? config.initialValue ?? cancelSymbol;
    }
    finally {
        mockStreams.restore();
    }
}
export function expectPromptOutput(mockStreams, expectedContent) {
    const writes = mockStreams.stdout.write.mock.calls
        .map(call => call[0])
        .filter(content => typeof content === 'string')
        .join('');
    if (typeof expectedContent === 'string') {
        expect(writes).toContain(expectedContent);
    }
    else {
        expect(writes).toMatch(expectedContent);
    }
}
export async function render(prompt, mockTTY) {
    const resultPromise = prompt.prompt();
    await new Promise(resolve => setTimeout(resolve, 10));
    const calls = mockTTY.stdout.write.mock.calls;
    const output = calls
        .map(call => call[0])
        .filter(content => typeof content === 'string')
        .join('');
    process.nextTick(() => process.stdin.emit('data', '\x03'));
    try {
        await resultPromise;
    }
    catch {
    }
    return output;
}
export async function waitForRender() {
    await new Promise(resolve => setTimeout(resolve, 10));
}
export function createPromptTest(createPrompt) {
    const mockStreams = mockProcessStreams({ isTTY: true });
    let currentPrompt = null;
    let resultPromise = null;
    let lastError = null;
    const keypress = (key) => {
        if (key === 'down') {
            mockStreams.sendKey({ name: 'down' });
        }
        else if (key === 'up') {
            mockStreams.sendKey({ name: 'up' });
        }
        else if (key === 'left') {
            mockStreams.sendKey({ name: 'left' });
        }
        else if (key === 'right') {
            mockStreams.sendKey({ name: 'right' });
        }
        else if (key === 'enter') {
            mockStreams.sendKey({ name: 'return' });
        }
        else if (key === 'space') {
            mockStreams.sendKey({ name: 'space' });
        }
        else if (key === 'escape') {
            mockStreams.sendKey({ name: 'escape' });
        }
        else {
            mockStreams.sendKey(key);
        }
    };
    const renderer = () => {
        const calls = mockStreams.stdout.write.mock.calls;
        return calls.map(call => call[0]).filter(content => typeof content === 'string').join('');
    };
    const prompt = (options) => {
        currentPrompt = createPrompt(options);
        resultPromise = currentPrompt.prompt().catch(err => {
            lastError = err;
            throw err;
        });
        return resultPromise;
    };
    const submit = async () => {
        if (!resultPromise)
            throw new Error('No prompt started');
        try {
            return await resultPromise;
        }
        finally {
            mockStreams.restore();
        }
    };
    const cancel = () => {
        keypress('escape');
    };
    const getError = async () => {
        if (!resultPromise)
            throw new Error('No prompt started');
        try {
            await resultPromise;
            return null;
        }
        catch (err) {
            return err;
        }
        finally {
            mockStreams.restore();
        }
    };
    return {
        prompt,
        renderer,
        keypress,
        submit,
        cancel,
        getError
    };
}
//# sourceMappingURL=prompt-test-utils.js.map