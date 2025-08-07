import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { TextPrompt } from '../../../src/components/primitives/text.js';
import { PromptLifecycle } from '../../../src/core/types.js';
import { StreamHandler } from '../../../src/core/stream-handler.js';
import { mockProcessStreams } from '../../helpers/mock-tty.js';

describe('Prompt Lifecycle', () => {
  let streams: ReturnType<typeof mockProcessStreams>;
  
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
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Created);
    });

    it('should transition to Initialized on first render', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Created);
      
      await prompt.renderOnly();
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Initialized);
    });

    it('should transition to Active during prompt', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const promptPromise = prompt.prompt();
      
      // Allow prompt to start
      await vi.runOnlyPendingTimersAsync();
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Active);
      
      // Cancel the prompt
      streams.sendKey({ ctrl: true, name: 'c' });
      await vi.runAllTimersAsync();
      
      try {
        await promptPromise;
      } catch {
        // Expected cancellation
      }
    });

    it('should transition to Completed after successful completion', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const promptPromise = prompt.prompt();
      
      await vi.runOnlyPendingTimersAsync();
      
      // Type and submit
      streams.sendKey('test');
      await vi.runOnlyPendingTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      await promptPromise;
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Completed);
    });

    it('should not re-initialize if already initialized', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const initializeSpy = vi.spyOn(prompt as any, 'initialize');
      
      // First render - should initialize
      await prompt.renderOnly();
      expect(initializeSpy).toHaveBeenCalledTimes(1);
      
      // Second render - should not re-initialize
      await prompt.renderOnly();
      expect(initializeSpy).toHaveBeenCalledTimes(1);
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Initialized);
    });
  });

  describe('Stream Ownership', () => {
    it('should create own stream if not provided', () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      expect((prompt as any).ownStream).toBe(true);
      expect((prompt as any).stream).toBeInstanceOf(StreamHandler);
    });

    it('should use provided stream', () => {
      const sharedStream = new StreamHandler();
      
      const prompt = new TextPrompt({
        message: 'Test prompt',
        stream: sharedStream
      });
      
      expect((prompt as any).ownStream).toBe(false);
      expect((prompt as any).stream).toBe(sharedStream);
    });

    it('should only stop own stream on cleanup', async () => {
      const sharedStream = new StreamHandler();
      const stopSpy = vi.spyOn(sharedStream, 'stop');
      
      const prompt = new TextPrompt({
        message: 'Test prompt',
        stream: sharedStream
      });
      
      // Run and complete prompt
      const promptPromise = prompt.prompt();
      await vi.runOnlyPendingTimersAsync();
      
      streams.sendKey('test');
      await vi.runOnlyPendingTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      await promptPromise;
      
      // Shared stream should not be stopped
      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('should stop own stream on cleanup', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const stopSpy = vi.spyOn((prompt as any).stream, 'stop');
      
      // Run and complete prompt
      const promptPromise = prompt.prompt();
      await vi.runOnlyPendingTimersAsync();
      
      streams.sendKey('test');
      await vi.runOnlyPendingTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      await promptPromise;
      
      // Own stream should be stopped
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('Shared Stream Mode', () => {
    it('should create shared stream when specified', () => {
      const prompt = new TextPrompt({
        message: 'Test prompt',
        sharedStream: true
      });
      
      const stream = (prompt as any).stream as StreamHandler;
      expect((stream as any).isShared).toBe(true);
    });

    it('should handle reference counting with shared streams', () => {
      const sharedStream = new StreamHandler({ shared: true });
      
      expect((sharedStream as any).refCount).toBe(0);
      
      sharedStream.acquire();
      expect((sharedStream as any).refCount).toBe(1);
      
      sharedStream.acquire();
      expect((sharedStream as any).refCount).toBe(2);
      
      sharedStream.release();
      expect((sharedStream as any).refCount).toBe(1);
      
      sharedStream.release();
      expect((sharedStream as any).refCount).toBe(0);
    });
  });

  describe('RenderOnly and HandleInputOnly', () => {
    it('should render without starting full prompt lifecycle', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const startSpy = vi.spyOn((prompt as any).stream, 'start');
      
      const output = await prompt.renderOnly();
      
      expect(output).toContain('Test prompt');
      expect(startSpy).not.toHaveBeenCalled();
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Initialized);
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
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Initialized);
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
      expect((prompt as any).lifecycle).not.toBe(PromptLifecycle.Completed);
    });
  });

  describe('State Transitions', () => {
    it('should handle Created -> Initialized -> Active -> Completed', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const states: PromptLifecycle[] = [];
      
      // Track state changes
      const originalSetState = (prompt as any).lifecycle;
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
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Created);
      
      const promptPromise = prompt.prompt();
      await vi.runOnlyPendingTimersAsync();
      
      streams.sendKey('test');
      await vi.runOnlyPendingTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      await promptPromise;
      
      // Check state transitions occurred in order
      expect(states).toContain(PromptLifecycle.Initialized);
      expect(states).toContain(PromptLifecycle.Active);
      expect(states.indexOf(PromptLifecycle.Initialized)).toBeLessThan(
        states.indexOf(PromptLifecycle.Active)
      );
    });

    it('should handle cancellation state transition', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const promptPromise = prompt.prompt();
      await vi.runOnlyPendingTimersAsync();
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Active);
      
      // Cancel with Ctrl+C
      streams.sendKey({ ctrl: true, name: 'c' });
      await vi.runAllTimersAsync();
      
      try {
        await promptPromise;
      } catch {
        // Expected
      }
      
      expect((prompt as any).lifecycle).toBe(PromptLifecycle.Completed);
    });
  });

  describe('Multiple Initialization Protection', () => {
    it('should not initialize multiple times in concurrent calls', async () => {
      const prompt = new TextPrompt({
        message: 'Test prompt'
      });
      
      const initializeSpy = vi.spyOn(prompt as any, 'initialize');
      
      // Call renderOnly and handleInputOnly concurrently
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
      
      // Should only initialize once
      expect(initializeSpy).toHaveBeenCalledTimes(1);
    });
  });
});