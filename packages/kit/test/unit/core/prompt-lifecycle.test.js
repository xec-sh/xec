import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { PromptLifecycle } from '../../../src/core/types.js';
import { mockProcessStreams } from '../../helpers/mock-tty.js';
import { StreamHandler } from '../../../src/core/stream-handler.js';
import { TextPrompt } from '../../../src/components/primitives/text.js';
describe('Prompt Lifecycle', () => {
    let streams;
    beforeEach(() => {
        streams = mockProcessStreams({ isTTY: true });
        vi.useFakeTimers();
    });
    afterEach(() => {
        streams.restore();
        vi.useRealTimers();
    });
    describe('Lifecycle States', () => {
        it('should start in Created state', () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            expect(prompt.lifecycle).toBe(PromptLifecycle.Created);
        });
        it('should transition to Initialized on first render', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            expect(prompt.lifecycle).toBe(PromptLifecycle.Created);
            await prompt.renderOnly();
            expect(prompt.lifecycle).toBe(PromptLifecycle.Initialized);
        });
        it('should transition to Active during prompt', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const promptPromise = prompt.prompt();
            await vi.runOnlyPendingTimersAsync();
            expect(prompt.lifecycle).toBe(PromptLifecycle.Active);
            streams.sendKey({ ctrl: true, name: 'c' });
            await vi.runAllTimersAsync();
            try {
                await promptPromise;
            }
            catch {
            }
        });
        it('should transition to Completed after successful completion', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const promptPromise = prompt.prompt();
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('test');
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('enter');
            await vi.runAllTimersAsync();
            await promptPromise;
            expect(prompt.lifecycle).toBe(PromptLifecycle.Completed);
        });
        it('should not re-initialize if already initialized', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const initializeSpy = vi.spyOn(prompt, 'initialize');
            await prompt.renderOnly();
            expect(initializeSpy).toHaveBeenCalledTimes(1);
            await prompt.renderOnly();
            expect(initializeSpy).toHaveBeenCalledTimes(1);
            expect(prompt.lifecycle).toBe(PromptLifecycle.Initialized);
        });
    });
    describe('Stream Ownership', () => {
        it('should create own stream if not provided', () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            expect(prompt.ownStream).toBe(true);
            expect(prompt.stream).toBeInstanceOf(StreamHandler);
        });
        it('should use provided stream', () => {
            const sharedStream = new StreamHandler();
            const prompt = new TextPrompt({
                message: 'Test prompt',
                stream: sharedStream
            });
            expect(prompt.ownStream).toBe(false);
            expect(prompt.stream).toBe(sharedStream);
        });
        it('should only stop own stream on cleanup', async () => {
            const sharedStream = new StreamHandler();
            const stopSpy = vi.spyOn(sharedStream, 'stop');
            const prompt = new TextPrompt({
                message: 'Test prompt',
                stream: sharedStream
            });
            const promptPromise = prompt.prompt();
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('test');
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('enter');
            await vi.runAllTimersAsync();
            await promptPromise;
            expect(stopSpy).not.toHaveBeenCalled();
        });
        it('should stop own stream on cleanup', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const stopSpy = vi.spyOn(prompt.stream, 'stop');
            const promptPromise = prompt.prompt();
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('test');
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('enter');
            await vi.runAllTimersAsync();
            await promptPromise;
            expect(stopSpy).toHaveBeenCalled();
        });
    });
    describe('Shared Stream Mode', () => {
        it('should create shared stream when specified', () => {
            const prompt = new TextPrompt({
                message: 'Test prompt',
                sharedStream: true
            });
            const stream = prompt.stream;
            expect(stream.isShared).toBe(true);
        });
        it('should handle reference counting with shared streams', () => {
            const sharedStream = new StreamHandler({ shared: true });
            expect(sharedStream.refCount).toBe(0);
            sharedStream.acquire();
            expect(sharedStream.refCount).toBe(1);
            sharedStream.acquire();
            expect(sharedStream.refCount).toBe(2);
            sharedStream.release();
            expect(sharedStream.refCount).toBe(1);
            sharedStream.release();
            expect(sharedStream.refCount).toBe(0);
        });
    });
    describe('RenderOnly and HandleInputOnly', () => {
        it('should render without starting full prompt lifecycle', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const startSpy = vi.spyOn(prompt.stream, 'start');
            const output = await prompt.renderOnly();
            expect(output).toContain('Test prompt');
            expect(startSpy).not.toHaveBeenCalled();
            expect(prompt.lifecycle).toBe(PromptLifecycle.Initialized);
        });
        it('should handle input without full lifecycle', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            await prompt.renderOnly();
            await prompt.handleInputOnly({
                sequence: 'a',
                name: 'a',
                ctrl: false,
                meta: false,
                shift: false
            });
            const value = prompt.getValue();
            expect(value).toBe('a');
            expect(prompt.lifecycle).toBe(PromptLifecycle.Initialized);
        });
        it('should get current value without completing', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt',
                initialValue: 'initial'
            });
            expect(prompt.getValue()).toBe('initial');
            await prompt.handleInputOnly({
                sequence: 'b',
                name: 'b',
                ctrl: false,
                meta: false,
                shift: false
            });
            expect(prompt.getValue()).toBe('initialb');
            expect(prompt.lifecycle).not.toBe(PromptLifecycle.Completed);
        });
    });
    describe('State Transitions', () => {
        it('should handle Created -> Initialized -> Active -> Completed', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const states = [];
            const originalSetState = prompt.lifecycle;
            Object.defineProperty(prompt, 'lifecycle', {
                get() {
                    return originalSetState;
                },
                set(value) {
                    states.push(value);
                    Object.defineProperty(prompt, '_lifecycle', {
                        value,
                        writable: true
                    });
                }
            });
            expect(prompt.lifecycle).toBe(PromptLifecycle.Created);
            const promptPromise = prompt.prompt();
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('test');
            await vi.runOnlyPendingTimersAsync();
            streams.sendKey('enter');
            await vi.runAllTimersAsync();
            await promptPromise;
            expect(states).toContain(PromptLifecycle.Initialized);
            expect(states).toContain(PromptLifecycle.Active);
            expect(states.indexOf(PromptLifecycle.Initialized)).toBeLessThan(states.indexOf(PromptLifecycle.Active));
        });
        it('should handle cancellation state transition', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const promptPromise = prompt.prompt();
            await vi.runOnlyPendingTimersAsync();
            expect(prompt.lifecycle).toBe(PromptLifecycle.Active);
            streams.sendKey({ ctrl: true, name: 'c' });
            await vi.runAllTimersAsync();
            try {
                await promptPromise;
            }
            catch {
            }
            expect(prompt.lifecycle).toBe(PromptLifecycle.Completed);
        });
    });
    describe('Multiple Initialization Protection', () => {
        it('should not initialize multiple times in concurrent calls', async () => {
            const prompt = new TextPrompt({
                message: 'Test prompt'
            });
            const initializeSpy = vi.spyOn(prompt, 'initialize');
            const promises = [
                prompt.renderOnly(),
                prompt.handleInputOnly({
                    sequence: 'a',
                    name: 'a',
                    ctrl: false,
                    meta: false,
                    shift: false
                })
            ];
            await Promise.all(promises);
            expect(initializeSpy).toHaveBeenCalledTimes(1);
        });
    });
});
//# sourceMappingURL=prompt-lifecycle.test.js.map