import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { REPLCommands } from '../../../src/repl/repl-commands.js';
import { REPLServer, createREPLServer } from '../../../src/repl/repl-server.js';

// Mock Node.js repl module
vi.mock('node:repl', () => ({
  start: vi.fn((options) => ({
    context: {},
    defineCommand: vi.fn(),
    displayPrompt: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    ...options,
  })),
}));

describe('REPLServer', () => {
  let server: REPLServer;
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (server && server.isRunning()) {
      server.stop();
    }
    consoleLogSpy.mockRestore();
  });

  describe('createREPLServer', () => {
    it('should create a new REPLServer instance', () => {
      const srv = createREPLServer();
      expect(srv).toBeInstanceOf(REPLServer);
    });

    it('should accept options', () => {
      const srv = createREPLServer({ prompt: 'test> ' });
      expect(srv).toBeInstanceOf(REPLServer);
    });
  });

  describe('constructor', () => {
    it('should use default options', () => {
      server = new REPLServer();
      expect(server).toBeInstanceOf(REPLServer);
    });

    it('should accept custom options', () => {
      server = new REPLServer({
        prompt: 'custom> ',
        useGlobal: true,
        useColors: false,
      });
      expect(server).toBeInstanceOf(REPLServer);
    });

    it('should include builtin commands by default', () => {
      server = new REPLServer();
      const commands = server.getCommands();
      expect(commands.size).toBeGreaterThan(0);
    });

    it('should not include builtins when disabled', () => {
      server = new REPLServer({ includeBuiltins: false });
      const commands = server.getCommands();
      expect(commands.size).toBe(0);
    });

    it('should merge custom commands with builtins', () => {
      const customCommands = new REPLCommands();
      customCommands.register('custom', 'Custom command', vi.fn());

      server = new REPLServer({
        commands: customCommands,
        includeBuiltins: true,
      });

      const commands = server.getCommands();
      expect(commands.has('custom')).toBe(true);
      expect(commands.has('clear')).toBe(true);
    });
  });

  describe('start', () => {
    it('should start the REPL server', () => {
      server = new REPLServer({ showWelcome: false });
      const nodeServer = server.start();

      expect(nodeServer).toBeDefined();
      expect(server.isRunning()).toBe(true);
    });

    it('should show welcome message by default', () => {
      server = new REPLServer();
      server.start();

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not show welcome when disabled', () => {
      server = new REPLServer({ showWelcome: false });
      server.start();

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should show custom title', () => {
      server = new REPLServer({ title: 'Custom REPL' });
      server.start();

      expect(consoleLogSpy).toHaveBeenCalledWith('Custom REPL');
    });

    it('should show custom welcome message', () => {
      server = new REPLServer({ welcomeMessage: 'Welcome!' });
      server.start();

      expect(consoleLogSpy).toHaveBeenCalledWith('Welcome!');
    });

    it('should apply context to REPL', () => {
      const context = { foo: 'bar', num: 42 };
      server = new REPLServer({ context, showWelcome: false });
      const nodeServer = server.start();

      expect(nodeServer.context.foo).toBe('bar');
      expect(nodeServer.context.num).toBe(42);
    });

    it('should apply commands to REPL', () => {
      server = new REPLServer({ showWelcome: false });
      const nodeServer = server.start();

      expect(nodeServer.defineCommand).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the REPL server', () => {
      server = new REPLServer({ showWelcome: false });
      server.start();
      expect(server.isRunning()).toBe(true);

      server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should not throw when stopping non-running server', () => {
      server = new REPLServer();
      expect(() => server.stop()).not.toThrow();
    });
  });

  describe('getServer', () => {
    it('should return undefined before start', () => {
      server = new REPLServer();
      expect(server.getServer()).toBeUndefined();
    });

    it('should return server after start', () => {
      server = new REPLServer({ showWelcome: false });
      server.start();
      expect(server.getServer()).toBeDefined();
    });

    it('should return undefined after stop', () => {
      server = new REPLServer({ showWelcome: false });
      server.start();
      server.stop();
      expect(server.getServer()).toBeUndefined();
    });
  });

  describe('context management', () => {
    it('should add context', () => {
      server = new REPLServer({ showWelcome: false });
      server.addContext('test', 'value');

      const context = server.getContext();
      expect(context.test).toBe('value');
    });

    it('should add context to running server', () => {
      server = new REPLServer({ showWelcome: false });
      const nodeServer = server.start();

      server.addContext('test', 'value');
      expect(nodeServer.context.test).toBe('value');
    });

    it('should remove context', () => {
      server = new REPLServer({ context: { test: 'value' }, showWelcome: false });
      server.removeContext('test');

      const context = server.getContext();
      expect(context.test).toBeUndefined();
    });

    it('should remove context from running server', () => {
      server = new REPLServer({ context: { test: 'value' }, showWelcome: false });
      const nodeServer = server.start();

      server.removeContext('test');
      expect(nodeServer.context.test).toBeUndefined();
    });

    it('should get all context', () => {
      const initialContext = { foo: 'bar', num: 42 };
      server = new REPLServer({ context: initialContext });

      const context = server.getContext();
      expect(context).toEqual(initialContext);
    });
  });

  describe('command management', () => {
    it('should register command', () => {
      server = new REPLServer({ includeBuiltins: false });
      server.registerCommand('test', 'Test command', vi.fn());

      const commands = server.getCommands();
      expect(commands.has('test')).toBe(true);
    });

    it('should register command on running server', () => {
      server = new REPLServer({ includeBuiltins: false, showWelcome: false });
      const nodeServer = server.start();

      server.registerCommand('test', 'Test command', vi.fn());
      expect(nodeServer.defineCommand).toHaveBeenCalledWith('test', expect.objectContaining({
        help: 'Test command',
      }));
    });

    it('should unregister command', () => {
      server = new REPLServer({ includeBuiltins: false });
      server.registerCommand('test', 'Test', vi.fn());

      const result = server.unregisterCommand('test');
      expect(result).toBe(true);
      expect(server.getCommands().has('test')).toBe(false);
    });

    it('should get all commands', () => {
      server = new REPLServer({ includeBuiltins: true });
      const commands = server.getCommands();

      expect(commands).toBeInstanceOf(REPLCommands);
      expect(commands.size).toBeGreaterThan(0);
    });
  });

  describe('displayPrompt', () => {
    it('should call displayPrompt on server', () => {
      server = new REPLServer({ showWelcome: false });
      const nodeServer = server.start();

      server.displayPrompt();
      expect(nodeServer.displayPrompt).toHaveBeenCalled();
    });

    it('should not throw when server not running', () => {
      server = new REPLServer();
      expect(() => server.displayPrompt()).not.toThrow();
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      server = new REPLServer();
      expect(server.isRunning()).toBe(false);
    });

    it('should return true after start', () => {
      server = new REPLServer({ showWelcome: false });
      server.start();
      expect(server.isRunning()).toBe(true);
    });

    it('should return false after stop', () => {
      server = new REPLServer({ showWelcome: false });
      server.start();
      server.stop();
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('setupSignalHandlers', () => {
    it('should throw when server not started', () => {
      server = new REPLServer();
      expect(() => server.setupSignalHandlers()).toThrow('REPL server not started');
    });

    it('should setup handlers for running server', () => {
      server = new REPLServer({ showWelcome: false });
      const nodeServer = server.start();

      expect(() => server.setupSignalHandlers()).not.toThrow();
      expect(nodeServer.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });
  });
});
