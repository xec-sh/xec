import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { mockProcessStreams } from '../helpers/mock-tty.js';
import { TextPrompt } from '../../src/components/primitives/text.js';
import { SelectPrompt } from '../../src/components/primitives/select.js';
import { ConfirmPrompt } from '../../src/components/primitives/confirm.js';
import { ReactivePrompt } from '../../src/core/reactive/reactive-prompt.js';
import { createSharedStreamContext } from '../helpers/mock-shared-stream.js';

describe('Multi-Prompt Scenarios', () => {
  let streams: ReturnType<typeof mockProcessStreams>;
  
  beforeEach(() => {
    streams = mockProcessStreams({ isTTY: true });
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    streams.restore();
    vi.useRealTimers();
  });

  describe('Shared Stream Handler', () => {
    it('should share stream between multiple prompts', async () => {
      const context = createSharedStreamContext();
      
      // Create multiple prompts sharing the same stream
      const prompt1 = new TextPrompt({
        message: 'First prompt',
        stream: context.stream
      });
      
      const prompt2 = new SelectPrompt({
        message: 'Second prompt',
        options: ['A', 'B', 'C'],
        stream: context.stream
      });
      
      // Both prompts should be able to render without conflicts
      const render1 = await prompt1.renderOnly();
      expect(render1).toContain('First prompt');
      
      const render2 = await prompt2.renderOnly();
      expect(render2).toContain('Second prompt');
      
      // Stream should still be active
      expect(context.isActive()).toBe(false); // Not started yet
      
      // Simulate prompt lifecycle
      context.stream.acquire();
      expect(context.getRefCount()).toBe(1);
      
      context.stream.acquire();
      expect(context.getRefCount()).toBe(2);
      
      context.stream.release();
      expect(context.getRefCount()).toBe(1);
      
      context.stream.release();
      expect(context.getRefCount()).toBe(0);
    });

    it('should handle input correctly with shared stream', async () => {
      const context = createSharedStreamContext();
      
      const prompt = new TextPrompt({
        message: 'Enter text',
        stream: context.stream
      });
      
      // Initialize prompt
      await prompt.renderOnly();
      
      // Simulate typing
      await prompt.handleInputOnly({ 
        sequence: 'a', 
        name: 'a', 
        ctrl: false, 
        meta: false, 
        shift: false 
      });
      
      const value = prompt.getValue();
      expect(value).toBe('a');
    });

    it('should coordinate between prompts in sequence', async () => {
      const context = createSharedStreamContext();
      const results: any[] = [];
      
      // First prompt
      const namePrompt = new TextPrompt({
        message: 'Name?',
        stream: context.stream
      });
      
      await namePrompt.renderOnly();
      await namePrompt.handleInputOnly({ 
        sequence: 'John', 
        name: 'John', 
        ctrl: false, 
        meta: false, 
        shift: false 
      });
      results.push(namePrompt.getValue());
      
      // Second prompt
      const agePrompt = new TextPrompt({
        message: 'Age?',
        stream: context.stream
      });
      
      await agePrompt.renderOnly();
      await agePrompt.handleInputOnly({ 
        sequence: '25', 
        name: '25', 
        ctrl: false, 
        meta: false, 
        shift: false 
      });
      results.push(agePrompt.getValue());
      
      expect(results).toEqual(['John', '25']);
    });
  });

  describe('Reactive Prompt Integration', () => {
    it('should handle reactive form with multiple fields', async () => {
      const reactive = new ReactivePrompt({
        initialValues: { name: '', age: 0 },
        prompts: (state) => [
          {
            id: 'name',
            type: 'text',
            message: 'Your name?',
            value: state.get('name')
          },
          {
            id: 'age',
            type: 'number',
            message: 'Your age?',
            value: state.get('age')
          }
        ]
      });
      
      // Mock the render method to capture output
      const renderSpy = vi.spyOn(reactive as any, 'render');
      
      // Start the reactive prompt
      const promptPromise = reactive.prompt();
      
      // Wait for initial render
      await vi.runAllTimersAsync();
      
      // Simulate typing name
      streams.sendKey('J');
      streams.sendKey('o');
      streams.sendKey('h');
      streams.sendKey('n');
      await vi.runAllTimersAsync();
      
      // Submit first field
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      // Simulate typing age
      streams.sendKey('2');
      streams.sendKey('5');
      await vi.runAllTimersAsync();
      
      // Submit second field
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      // Get the result
      const result = await promptPromise;
      
      expect(result).toEqual({
        name: 'John',
        age: 25
      });
    });

    it('should handle conditional fields', async () => {
      const reactive = new ReactivePrompt({
        initialValues: { 
          hasAccount: false, 
          username: '', 
          password: '' 
        },
        prompts: (state) => {
          const prompts = [
            {
              id: 'hasAccount',
              type: 'confirm',
              message: 'Do you have an account?',
              value: state.get('hasAccount')
            }
          ];
          
          if (state.get('hasAccount')) {
            prompts.push(
              {
                id: 'username',
                type: 'text',
                message: 'Username:',
                value: state.get('username')
              },
              {
                id: 'password',
                type: 'password',
                message: 'Password:',
                value: state.get('password')
              }
            );
          }
          
          return prompts;
        }
      });
      
      const promptPromise = reactive.prompt();
      
      // Wait for initial render
      await vi.runAllTimersAsync();
      
      // Select 'Yes' for has account
      streams.sendKey('y');
      await vi.runAllTimersAsync();
      
      // Submit confirm
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      // Enter username
      streams.sendKey('user123');
      await vi.runAllTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      // Enter password
      streams.sendKey('pass456');
      await vi.runAllTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      const result = await promptPromise;
      
      expect(result).toEqual({
        hasAccount: true,
        username: 'user123',
        password: 'pass456'
      });
    });

    it('should handle validation in reactive forms', async () => {
      const reactive = new ReactivePrompt({
        initialValues: { email: '' },
        prompts: () => [
          {
            id: 'email',
            type: 'text',
            message: 'Email:',
            validate: (value: string) => {
              if (!value.includes('@')) {
                return 'Invalid email';
              }
              return undefined;
            }
          }
        ]
      });
      
      const promptPromise = reactive.prompt();
      
      await vi.runAllTimersAsync();
      
      // Try invalid email
      streams.sendKey('invalid');
      await vi.runAllTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      // Should still be on same prompt due to validation error
      const output = streams.stdout.getOutput!();
      expect(output).toContain('Invalid email');
      
      // Clear and enter valid email
      streams.sendKey({ ctrl: true, name: 'u' }); // Clear line
      await vi.runAllTimersAsync();
      
      streams.sendKey('test@example.com');
      await vi.runAllTimersAsync();
      streams.sendKey('enter');
      await vi.runAllTimersAsync();
      
      const result = await promptPromise;
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('Complex Multi-Step Flows', () => {
    it('should handle wizard-like flow with shared context', async () => {
      const sharedContext = createSharedStreamContext();
      const wizardData: Record<string, any> = {};
      
      // Step 1: Personal info
      const personalInfo = async () => {
        const namePrompt = new TextPrompt({
          message: 'Full name:',
          stream: sharedContext.stream
        });
        
        await namePrompt.renderOnly();
        await namePrompt.handleInputOnly({
          sequence: 'John Doe',
          name: 'John Doe',
          ctrl: false,
          meta: false,
          shift: false
        });
        
        wizardData.name = namePrompt.getValue();
        
        const emailPrompt = new TextPrompt({
          message: 'Email:',
          stream: sharedContext.stream
        });
        
        await emailPrompt.renderOnly();
        await emailPrompt.handleInputOnly({
          sequence: 'john@example.com',
          name: 'john@example.com',
          ctrl: false,
          meta: false,
          shift: false
        });
        
        wizardData.email = emailPrompt.getValue();
      };
      
      // Step 2: Preferences
      const preferences = async () => {
        const themePrompt = new SelectPrompt({
          message: 'Choose theme:',
          options: ['Light', 'Dark', 'Auto'],
          stream: sharedContext.stream
        });
        
        await themePrompt.renderOnly();
        await themePrompt.handleInputOnly({
          name: 'down',
          ctrl: false,
          meta: false,
          shift: false
        }); // Select 'Dark'
        
        wizardData.theme = themePrompt.getValue();
        
        const notificationsPrompt = new ConfirmPrompt({
          message: 'Enable notifications?',
          stream: sharedContext.stream
        });
        
        await notificationsPrompt.renderOnly();
        await notificationsPrompt.handleInputOnly({
          sequence: 'y',
          name: 'y',
          ctrl: false,
          meta: false,
          shift: false
        });
        
        wizardData.notifications = notificationsPrompt.getValue();
      };
      
      // Run wizard steps
      await personalInfo();
      await preferences();
      
      // Verify collected data
      expect(wizardData).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        theme: 'Dark',
        notifications: true
      });
      
      // Verify stream was properly shared
      expect(sharedContext.getRefCount()).toBe(0); // All released
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in shared stream scenarios', async () => {
      const context = createSharedStreamContext();
      
      const prompt = new TextPrompt({
        message: 'Test prompt',
        stream: context.stream,
        validate: (value) => {
          if (value === 'error') {
            throw new Error('Validation error');
          }
          return undefined;
        }
      });
      
      await prompt.renderOnly();
      
      // This should not throw, but handle the error gracefully
      await expect(prompt.handleInputOnly({
        sequence: 'error',
        name: 'error',
        ctrl: false,
        meta: false,
        shift: false
      })).resolves.not.toThrow();
    });

    it('should cleanup properly on cancellation', async () => {
      const context = createSharedStreamContext();
      
      const prompt1 = new TextPrompt({
        message: 'Prompt 1',
        stream: context.stream
      });
      
      const prompt2 = new TextPrompt({
        message: 'Prompt 2',
        stream: context.stream
      });
      
      // Start using prompts
      context.stream.acquire();
      context.stream.acquire();
      
      expect(context.getRefCount()).toBe(2);
      
      // Simulate cancellation
      context.stream.release();
      context.stream.release();
      
      expect(context.getRefCount()).toBe(0);
      expect(context.isActive()).toBe(false);
    });
  });
});