import { it, vi, expect, describe } from 'vitest';

import { cancelSymbol } from '../../../../src/core/types.js';
import { TextPrompt } from '../../../../src/components/primitives/text.js';
import { group, GroupPrompt } from '../../../../src/components/layout/group.js';
import { ConfirmPrompt } from '../../../../src/components/primitives/confirm.js';

describe('GroupPrompt', () => {
  describe('initialization', () => {
    it('should create with prompts', () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: [
          { name: 'name', prompt: new TextPrompt({ message: 'Name?' }) },
          { name: 'confirm', prompt: new ConfirmPrompt({ message: 'Continue?' }) }
        ]
      });
      
      expect(prompt.config.prompts).toHaveLength(2);
    });

    it('should accept group options', () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        title: 'User Info',
        border: true,
        padding: 2,
        prompts: []
      });
      
      expect(prompt.config.title).toBe('User Info');
      expect(prompt.config.border).toBe(true);
      expect(prompt.config.padding).toBe(2);
    });
  });

  describe('rendering', () => {
    it('should display title when provided', async () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        title: 'Configuration',
        prompts: []
      });
      
      const rendered = prompt.render();
      expect(rendered).toContain('Configuration');
    });

    it('should show progress indicator', async () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: [
          { name: 'field1', prompt: new TextPrompt({ message: 'Field 1?' }) },
          { name: 'field2', prompt: new TextPrompt({ message: 'Field 2?' }) }
        ]
      });
      
      const rendered = prompt.render();
      expect(rendered).toContain('[0/2]');
    });

    it('should apply border when enabled', async () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        border: true,
        prompts: []
      });
      
      const rendered = prompt.render();
      expect(rendered).toContain('┌');
      expect(rendered).toContain('│');
      expect(rendered).toContain('└');
    });
  });

  describe('sequential execution', () => {
    it('should run prompts in order', async () => {
      const order: string[] = [];
      
      const mockTextPrompt1 = {
        prompt: vi.fn().mockResolvedValue('value1'),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const mockTextPrompt2 = {
        prompt: vi.fn().mockResolvedValue('value2'),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      mockTextPrompt1.prompt.mockImplementation(async () => {
        order.push('prompt1');
        return 'value1';
      });
      
      mockTextPrompt2.prompt.mockImplementation(async () => {
        order.push('prompt2');
        return 'value2';
      });
      
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: [
          { name: 'field1', prompt: mockTextPrompt1 as any },
          { name: 'field2', prompt: mockTextPrompt2 as any }
        ]
      });
      
      const result = await prompt.prompt();
      
      expect(order).toEqual(['prompt1', 'prompt2']);
      expect(result).toEqual({
        field1: 'value1',
        field2: 'value2'
      });
    });

    it('should handle cancellation', async () => {
      const mockPrompt = {
        prompt: vi.fn().mockResolvedValue(cancelSymbol),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: [
          { name: 'field1', prompt: mockPrompt as any }
        ]
      });
      
      const result = await prompt.prompt();
      expect(result).toBe(cancelSymbol);
    });
  });

  describe('conditional prompts', () => {
    it('should skip prompts based on condition', async () => {
      const mockPrompt1 = {
        prompt: vi.fn().mockResolvedValue(false),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const mockPrompt2 = {
        prompt: vi.fn().mockResolvedValue('skipped'),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: [
          { name: 'skipNext', prompt: mockPrompt1 as any },
          { 
            name: 'conditional', 
            prompt: mockPrompt2 as any,
            condition: (results) => results.skipNext === true
          }
        ]
      });
      
      const result = await prompt.prompt();
      
      expect(mockPrompt2.prompt).not.toHaveBeenCalled();
      expect(result).toEqual({ skipNext: false });
    });

    it('should include prompts when condition is met', async () => {
      const mockPrompt1 = {
        prompt: vi.fn().mockResolvedValue(true),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const mockPrompt2 = {
        prompt: vi.fn().mockResolvedValue('included'),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: [
          { name: 'includeNext', prompt: mockPrompt1 as any },
          { 
            name: 'conditional', 
            prompt: mockPrompt2 as any,
            condition: (results) => results.includeNext === true
          }
        ]
      });
      
      const result = await prompt.prompt();
      
      expect(mockPrompt2.prompt).toHaveBeenCalled();
      expect(result).toEqual({ 
        includeNext: true,
        conditional: 'included'
      });
    });
  });

  describe('helper function', () => {
    it('should create group from prompt map', () => {
      const prompts = {
        name: new TextPrompt({ message: 'Name?' }),
        age: new TextPrompt({ message: 'Age?' })
      };
      
      const groupPrompt = group(prompts, { title: 'User Info' });
      
      expect(groupPrompt).toBeInstanceOf(GroupPrompt);
      expect(groupPrompt.config.title).toBe('User Info');
      expect(groupPrompt.config.prompts).toHaveLength(2);
    });

    it('should support conditional functions', () => {
      const prompts = {
        hasEmail: new ConfirmPrompt({ message: 'Do you have email?' }),
        email: (results: any) => results.hasEmail ? 
          new TextPrompt({ message: 'Email?' }) : 
          false
      };
      
      const groupPrompt = group(prompts);
      
      expect(groupPrompt).toBeInstanceOf(GroupPrompt);
      expect(groupPrompt.config.prompts).toHaveLength(2);
    });
  });

  describe('result formatting', () => {
    it('should format boolean values', () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: []
      });
      
      const formatted = (prompt as any).formatResult('test', true);
      expect(formatted).toBe('Yes');
      
      const formattedFalse = (prompt as any).formatResult('test', false);
      expect(formattedFalse).toBe('No');
    });

    it('should format array values', () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: []
      });
      
      const formatted = (prompt as any).formatResult('test', ['a', 'b', 'c']);
      expect(formatted).toBe('a, b, c');
    });

    it('should format other values as strings', () => {
      const prompt = new GroupPrompt({
        message: 'Test Group',
        prompts: []
      });
      
      const formatted = (prompt as any).formatResult('test', 42);
      expect(formatted).toBe('42');
    });
  });

  describe('final render', () => {
    it('should show summary of results', async () => {
      const mockPrompt1 = {
        prompt: vi.fn().mockResolvedValue('John'),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const mockPrompt2 = {
        prompt: vi.fn().mockResolvedValue(true),
        render: vi.fn().mockReturnValue(''),
        handleInput: vi.fn()
      };
      
      const prompt = new GroupPrompt({
        message: 'Test Group',
        title: 'User Registration',
        prompts: [
          { name: 'name', prompt: mockPrompt1 as any },
          { name: 'newsletter', prompt: mockPrompt2 as any }
        ]
      });
      
      await prompt.prompt();
      
      const finalRender = (prompt as any).renderFinal();
      expect(finalRender).toContain('User Registration');
      expect(finalRender).toContain('name: John');
      expect(finalRender).toContain('newsletter: Yes');
    });
  });
});