import type { REPLServer } from 'node:repl';

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { REPLCommands, createCommands, createBuiltinCommands } from '../../../src/repl/repl-commands.js';

describe('REPLCommands', () => {
  let commands: REPLCommands;

  beforeEach(() => {
    commands = new REPLCommands();
  });

  describe('createCommands', () => {
    it('should create a new REPLCommands instance', () => {
      const cmds = createCommands();
      expect(cmds).toBeInstanceOf(REPLCommands);
      expect(cmds.size).toBe(0);
    });
  });

  describe('register', () => {
    it('should register a new command', () => {
      const action = vi.fn();
      commands.register('test', 'Test command', action);

      expect(commands.has('test')).toBe(true);
      expect(commands.size).toBe(1);
    });

    it('should override existing command', () => {
      const action1 = vi.fn();
      const action2 = vi.fn();

      commands.register('test', 'Test 1', action1);
      commands.register('test', 'Test 2', action2);

      expect(commands.size).toBe(1);
      const cmd = commands.get('test');
      expect(cmd?.help).toBe('Test 2');
      expect(cmd?.action).toBe(action2);
    });
  });

  describe('unregister', () => {
    it('should unregister a command', () => {
      commands.register('test', 'Test', vi.fn());
      expect(commands.has('test')).toBe(true);

      const result = commands.unregister('test');
      expect(result).toBe(true);
      expect(commands.has('test')).toBe(false);
    });

    it('should return false for non-existent command', () => {
      const result = commands.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should get a registered command', () => {
      const action = vi.fn();
      commands.register('test', 'Test command', action);

      const cmd = commands.get('test');
      expect(cmd).toBeDefined();
      expect(cmd?.help).toBe('Test command');
      expect(cmd?.action).toBe(action);
    });

    it('should return undefined for non-existent command', () => {
      const cmd = commands.get('nonexistent');
      expect(cmd).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all commands', () => {
      commands.register('cmd1', 'Command 1', vi.fn());
      commands.register('cmd2', 'Command 2', vi.fn());

      const all = commands.getAll();
      expect(all.size).toBe(2);
      expect(all.has('cmd1')).toBe(true);
      expect(all.has('cmd2')).toBe(true);
    });

    it('should return a copy of commands map', () => {
      commands.register('test', 'Test', vi.fn());

      const all = commands.getAll();
      all.clear();

      // Original should not be affected
      expect(commands.size).toBe(1);
    });
  });

  describe('has', () => {
    it('should return true for existing command', () => {
      commands.register('test', 'Test', vi.fn());
      expect(commands.has('test')).toBe(true);
    });

    it('should return false for non-existent command', () => {
      expect(commands.has('test')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all commands', () => {
      commands.register('cmd1', 'Command 1', vi.fn());
      commands.register('cmd2', 'Command 2', vi.fn());
      expect(commands.size).toBe(2);

      commands.clear();
      expect(commands.size).toBe(0);
      expect(commands.has('cmd1')).toBe(false);
      expect(commands.has('cmd2')).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all command names', () => {
      commands.register('cmd1', 'Command 1', vi.fn());
      commands.register('cmd2', 'Command 2', vi.fn());
      commands.register('cmd3', 'Command 3', vi.fn());

      const list = commands.list();
      expect(list).toEqual(['cmd1', 'cmd2', 'cmd3']);
    });

    it('should return empty array for no commands', () => {
      const list = commands.list();
      expect(list).toEqual([]);
    });
  });

  describe('applyTo', () => {
    it('should apply all commands to REPL server', () => {
      const mockServer = {
        defineCommand: vi.fn(),
      } as unknown as REPLServer;

      commands.register('cmd1', 'Command 1', vi.fn());
      commands.register('cmd2', 'Command 2', vi.fn());

      commands.applyTo(mockServer);

      expect(mockServer.defineCommand).toHaveBeenCalledTimes(2);
      expect(mockServer.defineCommand).toHaveBeenCalledWith('cmd1', expect.objectContaining({
        help: 'Command 1',
      }));
      expect(mockServer.defineCommand).toHaveBeenCalledWith('cmd2', expect.objectContaining({
        help: 'Command 2',
      }));
    });
  });

  describe('size', () => {
    it('should return correct count', () => {
      expect(commands.size).toBe(0);

      commands.register('cmd1', 'Command 1', vi.fn());
      expect(commands.size).toBe(1);

      commands.register('cmd2', 'Command 2', vi.fn());
      expect(commands.size).toBe(2);

      commands.unregister('cmd1');
      expect(commands.size).toBe(1);
    });
  });

  describe('createBuiltinCommands', () => {
    it('should create commands with builtin commands', () => {
      const builtins = createBuiltinCommands();

      expect(builtins.size).toBeGreaterThan(0);
      expect(builtins.has('clear')).toBe(true);
      expect(builtins.has('runtime')).toBe(true);
      expect(builtins.has('help')).toBe(true);
    });

    it('should have working clear command', () => {
      const builtins = createBuiltinCommands();
      const clearCmd = builtins.get('clear');

      expect(clearCmd).toBeDefined();
      expect(clearCmd?.help).toBe('Clear the console');
      expect(typeof clearCmd?.action).toBe('function');
    });

    it('should have working runtime command', () => {
      const builtins = createBuiltinCommands();
      const runtimeCmd = builtins.get('runtime');

      expect(runtimeCmd).toBeDefined();
      expect(runtimeCmd?.help).toBe('Show current runtime information');
      expect(typeof runtimeCmd?.action).toBe('function');
    });

    it('should have working help command', () => {
      const builtins = createBuiltinCommands();
      const helpCmd = builtins.get('help');

      expect(helpCmd).toBeDefined();
      expect(helpCmd?.help).toBe('Show available commands');
      expect(typeof helpCmd?.action).toBe('function');
    });
  });

  describe('command execution', () => {
    it('should execute command action with correct context', () => {
      const action = vi.fn();
      commands.register('test', 'Test', action);

      const mockServer = {
        displayPrompt: vi.fn(),
      } as unknown as REPLServer;

      const cmd = commands.get('test');
      if (cmd) {
        cmd.action.call(mockServer, 'arg1', 'arg2');
      }

      expect(action).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });
});
