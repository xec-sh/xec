import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { mockProcessStreams } from '../../../helpers/mock-tty.js';
import { reactive } from '../../../../src/core/reactive/reactive-prompt.js';

describe('ReactivePrompt', () => {
  let streams: ReturnType<typeof mockProcessStreams>;

  beforeEach(() => {
    streams = mockProcessStreams({ isTTY: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    streams.restore();
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should create reactive prompt', () => {
      const prompt = reactive({
        initialValues: {
          name: '',
          age: 0,
        },
        prompts: (state) => [
          {
            id: 'name',
            type: 'text',
            message: 'Enter your name',
          },
          {
            id: 'age',
            type: 'number',
            message: 'Enter your age',
          },
        ],
      });

      expect(prompt).toBeDefined();
      expect(prompt.getState()).toEqual({
        name: '',
        age: 0,
      });
    });

    it('should update state', () => {
      const prompt = reactive({
        initialValues: {
          name: 'John',
        },
        prompts: () => [],
      });

      prompt.update('name', 'Jane');
      expect(prompt.getState().name).toBe('Jane');
    });
  });

  describe('dynamic prompts', () => {
    it('should handle conditional prompts', async () => {
      const prompt = reactive({
        initialValues: {
          hasAccount: false,
          username: '',
          email: '',
        },
        prompts: (state) => [
          {
            id: 'hasAccount',
            type: 'confirm',
            message: 'Do you have an account?',
          },
          {
            id: 'username',
            type: 'text',
            message: 'Username',
            when: () => state.get('hasAccount'),
          },
          {
            id: 'email',
            type: 'text',
            message: 'Email',
            when: () => !state.get('hasAccount'),
          },
        ],
      });

      const output = await prompt.render();
      expect(output).toContain('Do you have an account?');
      expect(output).not.toContain('Username');
      expect(output).not.toContain('Email');
    });

    it('should handle dynamic messages', async () => {
      const prompt = reactive({
        initialValues: {
          name: 'John',
          greeting: '',
        },
        prompts: (state) => [
          {
            id: 'name',
            type: 'text',
            message: 'Your name',
          },
          {
            id: 'greeting',
            type: 'text',
            message: () => `Hello ${state.get('name')}, enter a greeting`,
          },
        ],
      });

      // Set the name to complete the first prompt
      prompt.update('name', 'Jane');
      
      const output = await prompt.render();
      // The output shows the current prompt with the value
      expect(output).toContain('Your name');
      expect(output).toContain('Jane');
    });

    it('should handle dynamic options', async () => {
      const prompt = reactive({
        initialValues: {
          category: 'fruit',
          item: '',
        },
        prompts: (state) => [
          {
            id: 'category',
            type: 'select',
            message: 'Category',
            options: ['fruit', 'vegetable'],
          },
          {
            id: 'item',
            type: 'select',
            message: 'Item',
            options: () => {
              const category = state.get('category');
              return category === 'fruit' 
                ? ['apple', 'banana', 'orange']
                : ['carrot', 'lettuce', 'tomato'];
            },
          },
        ],
      });

      const output = await prompt.render();
      expect(output).toContain('Category');
    });
  });

  describe('validation', () => {
    it('should validate input', async () => {
      const validationError = vi.fn();
      const prompt = reactive({
        initialValues: {
          age: 15,  // Invalid age
        },
        prompts: () => [
          {
            id: 'age',
            type: 'number',
            message: 'Enter age',
            value: 15,  // Set current value
            validate: (value) => {
              if (value < 18) return 'Must be at least 18';
              return true;
            },
          },
        ],
      });

      prompt.on('validation-error', validationError);

      // Simulate entering the value
      await prompt.handleInput({ name: 'enter', ctrl: false, shift: false, meta: false });
      
      expect(validationError).toHaveBeenCalledWith({
        prompt: expect.objectContaining({ id: 'age' }),
        error: 'Must be at least 18',
      });
    });

    it('should handle async validation', async () => {
      const prompt = reactive({
        initialValues: {
          username: '',
        },
        prompts: () => [
          {
            id: 'username',
            type: 'text',
            message: 'Username',
            validate: async (value) => {
              await new Promise(resolve => setTimeout(resolve, 10));
              if (value === 'taken') return 'Username already taken';
              return true;
            },
          },
        ],
      });

      prompt.update('username', 'taken');

      const validationError = vi.fn();
      prompt.on('validation-error', validationError);

      await prompt.handleInput({ name: 'enter', ctrl: false, shift: false, meta: false });
      await vi.runAllTimers();

      expect(validationError).toHaveBeenCalledWith({
        prompt: expect.objectContaining({ id: 'username' }),
        error: 'Username already taken',
      });
    });
  });

  describe('navigation', () => {
    it('should navigate between prompts', async () => {
      const prompt = reactive({
        initialValues: {
          first: 'value1',
          second: 'value2',
          third: '',
        },
        prompts: () => [
          {
            id: 'first',
            type: 'text',
            message: 'First',
          },
          {
            id: 'second',
            type: 'text',
            message: 'Second',
          },
          {
            id: 'third',
            type: 'text',
            message: 'Third',
          },
        ],
      });

      // Start at first prompt
      let output = await prompt.render();
      expect(output).toContain('First');

      // Move to second prompt
      await prompt.handleInput({ name: 'enter', ctrl: false, shift: false, meta: false });
      output = await prompt.render();
      expect(output).toContain('Second');

      // Go back to first prompt
      await prompt.handleInput({ name: 'up', ctrl: false, shift: true, meta: false });
      output = await prompt.render();
      expect(output).toContain('First');
    });
  });

  describe('onChange handlers', () => {
    it('should trigger onChange when value changes', () => {
      const onChange = vi.fn();
      const prompt = reactive({
        initialValues: {
          value: '',
        },
        prompts: () => [
          {
            id: 'value',
            type: 'text',
            message: 'Enter value',
            onChange,
          },
        ],
      });

      prompt.update('value', 'new value');
      expect(onChange).toHaveBeenCalledWith('new value');
    });
  });

  describe('dependencies', () => {
    it('should re-render dependent prompts', async () => {
      let renderCount = 0;
      const prompt = reactive({
        initialValues: {
          independent: '',
          dependent: '',
        },
        prompts: () => {
          renderCount++;
          return [
            {
              id: 'independent',
              type: 'text',
              message: 'Independent',
              dependencies: [],
            },
            {
              id: 'dependent',
              type: 'text',
              message: 'Dependent',
              dependencies: ['independent'],
            },
          ];
        },
      });

      const initialCount = renderCount;
      
      // Update independent field
      prompt.update('independent', 'value');
      
      // Should trigger re-render due to dependency
      expect(renderCount).toBeGreaterThan(initialCount);
    });
  });

  describe('completion', () => {
    it('should emit complete when all prompts answered', async () => {
      const complete = vi.fn();
      const prompt = reactive({
        initialValues: {
          name: '',
          age: 0,
        },
        prompts: () => [
          {
            id: 'name',
            type: 'text',
            message: 'Name',
          },
          {
            id: 'age',
            type: 'number',
            message: 'Age',
          },
        ],
      });

      prompt.on('complete', complete);

      // Answer first prompt
      prompt.update('name', 'John');
      await prompt.handleInput({ name: 'enter', ctrl: false, shift: false, meta: false });

      // Answer second prompt
      prompt.update('age', 25);
      await prompt.handleInput({ name: 'enter', ctrl: false, shift: false, meta: false });

      expect(complete).toHaveBeenCalledWith({
        name: 'John',
        age: 25,
      });
    });

    it('should handle cancellation', async () => {
      const cancel = vi.fn();
      const prompt = reactive({
        initialValues: { value: '' },
        prompts: () => [
          {
            id: 'value',
            type: 'text',
            message: 'Value',
          },
        ],
      });

      prompt.on('cancel', cancel);
      await prompt.handleInput({ name: 'c', ctrl: true, shift: false, meta: false });

      expect(cancel).toHaveBeenCalled();
    });
  });

  describe('disposal', () => {
    it('should clean up resources', () => {
      const prompt = reactive({
        initialValues: { value: '' },
        prompts: () => [],
      });

      prompt.dispose();

      // Should not throw
      prompt.update('value', 'new');
      expect(() => prompt.getState()).not.toThrow();
    });
  });
});