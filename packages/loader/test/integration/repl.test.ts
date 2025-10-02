import { it, expect, describe, afterEach } from 'vitest';

import { REPLServer, REPLCommands } from '../../src/index.js';

describe('Integration: REPL System', () => {
  let replServer: REPLServer | undefined;

  afterEach(() => {
    if (replServer) {
      replServer.stop();
      replServer = undefined;
    }
  });

  describe('Basic REPL Functionality', () => {
    it('should start and stop REPL server', () => {
      replServer = new REPLServer({
        showWelcome: false,
      });

      expect(replServer.isRunning()).toBe(false);

      const server = replServer.start();
      expect(replServer.isRunning()).toBe(true);
      expect(server).toBeDefined();

      replServer.stop();
      expect(replServer.isRunning()).toBe(false);
    });

    it('should add context variables to REPL', () => {
      replServer = new REPLServer({
        showWelcome: false,
        context: {
          testVar: 'test-value',
          testFunc: () => 'test-result',
        },
      });

      const server = replServer.start();

      expect(server.context.testVar).toBe('test-value');
      expect(typeof server.context.testFunc).toBe('function');
      expect(server.context.testFunc()).toBe('test-result');
    });

    it('should add context variables dynamically', () => {
      replServer = new REPLServer({
        showWelcome: false,
      });

      const server = replServer.start();

      replServer.addContext('dynamicVar', 'dynamic-value');
      expect(server.context.dynamicVar).toBe('dynamic-value');

      replServer.removeContext('dynamicVar');
      expect(server.context.dynamicVar).toBeUndefined();
    });

    it('should get context value', () => {
      replServer = new REPLServer({
        showWelcome: false,
        context: {
          existingVar: 'existing-value',
        },
      });

      replServer.start();

      expect(replServer.getContext('existingVar')).toBe('existing-value');
      expect(replServer.getContext('nonExistent')).toBeUndefined();
    });
  });

  describe('REPL Commands', () => {
    it('should register and execute custom commands', () => {
      const commands = new REPLCommands();
      let executed = false;

      commands.register('test', 'Test command', function () {
        executed = true;
        this.displayPrompt();
      });

      replServer = new REPLServer({
        showWelcome: false,
        commands,
      });

      const server = replServer.start();

      // Verify command is registered
      expect(server.commands.test).toBeDefined();
      expect(typeof server.commands.test.action).toBe('function');
    });

    it('should include builtin commands when requested', () => {
      replServer = new REPLServer({
        showWelcome: false,
        includeBuiltins: true,
      });

      const server = replServer.start();

      // Check for builtin commands
      expect(server.commands.clear).toBeDefined();
      expect(server.commands.runtime).toBeDefined();
      expect(server.commands.help).toBeDefined();
    });

    it('should register commands dynamically', () => {
      replServer = new REPLServer({
        showWelcome: false,
      });

      const server = replServer.start();

      replServer.registerCommand('dynamic', 'Dynamic command', function () {
        this.displayPrompt();
      });

      expect(server.commands.dynamic).toBeDefined();
    });

    it('should unregister commands', () => {
      const commands = new REPLCommands();
      commands.register('temp', 'Temporary command', function () {
        this.displayPrompt();
      });

      replServer = new REPLServer({
        showWelcome: false,
        commands,
      });

      const server = replServer.start();

      expect(server.commands.temp).toBeDefined();

      replServer.unregisterCommand('temp');
      expect(server.commands.temp).toBeUndefined();
    });
  });

  describe('REPL Configuration', () => {
    it('should use custom prompt', () => {
      replServer = new REPLServer({
        showWelcome: false,
        prompt: 'custom> ',
      });

      const server = replServer.start();
      expect(server.getPrompt()).toBe('custom> ');
    });

    it('should support useGlobal option', () => {
      replServer = new REPLServer({
        showWelcome: false,
        useGlobal: true,
      });

      const server = replServer.start();
      expect(server.useGlobal).toBe(true);
    });

    it('should support breakEvalOnSigint option', () => {
      replServer = new REPLServer({
        showWelcome: false,
        breakEvalOnSigint: true,
      });

      const server = replServer.start();
      expect(server.breakEvalOnSigint).toBe(true);
    });

    it('should support useColors option', () => {
      replServer = new REPLServer({
        showWelcome: false,
        useColors: false,
      });

      const server = replServer.start();
      expect(server.useColors).toBe(false);
    });
  });

  describe('REPL Lifecycle', () => {
    it('should handle multiple start/stop cycles', () => {
      replServer = new REPLServer({
        showWelcome: false,
      });

      // First cycle
      replServer.start();
      expect(replServer.isRunning()).toBe(true);
      replServer.stop();
      expect(replServer.isRunning()).toBe(false);

      // Second cycle
      replServer.start();
      expect(replServer.isRunning()).toBe(true);
      replServer.stop();
      expect(replServer.isRunning()).toBe(false);
    });

    it('should not allow double start', () => {
      replServer = new REPLServer({
        showWelcome: false,
      });

      replServer.start();
      expect(() => replServer!.start()).toThrow('REPL server is already running');
    });

    it('should handle stop when not running', () => {
      replServer = new REPLServer({
        showWelcome: false,
      });

      expect(() => replServer.stop()).not.toThrow();
    });
  });

  describe('REPL Integration with Context', () => {
    it('should inject runtime utilities into REPL context', () => {
      const runtime = {
        echo: (msg: string) => console.log(msg),
        sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
        env: (key: string) => process.env[key],
      };

      replServer = new REPLServer({
        showWelcome: false,
        context: runtime,
      });

      const server = replServer.start();

      expect(typeof server.context.echo).toBe('function');
      expect(typeof server.context.sleep).toBe('function');
      expect(typeof server.context.env).toBe('function');
    });

    it('should allow dynamic context updates during session', () => {
      replServer = new REPLServer({
        showWelcome: false,
        context: {
          version: '1.0.0',
        },
      });

      const server = replServer.start();

      expect(server.context.version).toBe('1.0.0');

      // Update context
      replServer.addContext('version', '2.0.0');
      expect(server.context.version).toBe('2.0.0');

      replServer.addContext('newFeature', true);
      expect(server.context.newFeature).toBe(true);
    });
  });

  describe('Command Execution in REPL', () => {
    it('should execute commands with REPL server context', () => {
      const results: string[] = [];

      const commands = new REPLCommands();
      commands.register('log', 'Log a message', function (message: string) {
        results.push(message);
        this.displayPrompt();
      });

      replServer = new REPLServer({
        showWelcome: false,
        commands,
      });

      const server = replServer.start();

      // Execute command
      if (server.commands.log) {
        server.commands.log.action.call(server, 'test-message');
        expect(results).toContain('test-message');
      }
    });

    it('should handle command errors gracefully', () => {
      const commands = new REPLCommands();
      commands.register('error', 'Throw an error', function () {
        throw new Error('Command error');
      });

      replServer = new REPLServer({
        showWelcome: false,
        commands,
      });

      const server = replServer.start();

      // Executing error command should throw
      expect(() => {
        if (server.commands.error) {
          server.commands.error.action.call(server);
        }
      }).toThrow('Command error');
    });
  });

  describe('REPL Welcome Message', () => {
    it('should show welcome message when enabled', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(' '));

      try {
        replServer = new REPLServer({
          showWelcome: true,
          title: 'Test REPL',
          welcomeMessage: 'Welcome to Test REPL!',
        });

        replServer.start();

        expect(logs.some((log) => log.includes('Test REPL'))).toBe(true);
        expect(logs.some((log) => log.includes('Welcome to Test REPL!'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it('should not show welcome message when disabled', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => logs.push(args.join(' '));

      try {
        replServer = new REPLServer({
          showWelcome: false,
        });

        replServer.start();

        // Should not have any welcome logs
        expect(logs.length).toBe(0);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
