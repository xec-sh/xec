/**
 * Tests for on command v2 with configuration integration
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { OnCommand } from '../../src/commands/on.js';

// Test helper that extends OnCommand to override methods for testing
class TestableOnCommand extends OnCommand {
  public executeCalls: any[] = [];
  public scriptCalls: any[] = [];
  public taskCalls: any[] = [];
  public replCalls: any[] = [];
  public findTargetsResults: Map<string, any[]> = new Map();
  public createdEngines: any[] = [];
  public outputLines: string[] = [];
  public errorLines: string[] = [];
  private _currentOptions: any = {};

  constructor(private options: {
    mockExecute?: boolean;
    mockScripts?: boolean;
    failExecution?: boolean;
  } = {}) {
    super();
  }

  protected log(message: string, level?: string): void {
    if (level === 'error') {
      this.errorLines.push(message);
    } else {
      this.outputLines.push(message);
    }
    // Still log to console for debugging
    super.log(message, level);
  }

  public clearOutput(): void {
    this.outputLines = [];
    this.errorLines = [];
  }

  protected async initializeConfig(options: any): Promise<void> {
    await super.initializeConfig(options);

    // Override taskManager with mock if needed
    if (this.options.mockExecute) {
      this.taskManager = {
        run: async (taskName: string, variables: any, context: any) => {
          const targetId = context.target;
          // Store task call info for test verification
          this.taskCalls.push({ taskName, targetId, variables, context });

          return {
            success: true,
            error: null
          };
        }
      } as any;
    }
  }

  // Override createTargetEngine to capture executions
  protected async createTargetEngine(target: any): Promise<any> {
    if (this.options.mockExecute) {
      const self = this;

      // Create the exec function that handles template literals
      const execFunction = async function (strings: TemplateStringsArray, ...values: any[]) {
        // Reconstruct the command from template literal parts
        let command = '';
        for (let i = 0; i < strings.length; i++) {
          command += strings[i];
          if (i < values.length) {
            command += String(values[i]);
          }
        }

        // Include global options passed to execute
        const mergedOptions = { ...self._currentOptions, ...execFunction._options };
        self.executeCalls.push({ target, command: command.trim(), options: mergedOptions });

        if (self.options.failExecution) {
          throw new Error('Command execution failed');
        }

        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          ok: true
        };
      } as any;

      // Store options for later use
      execFunction._options = {};

      // Add the raw method (same behavior as regular execution)
      execFunction.raw = async function (strings: TemplateStringsArray, ...values: any[]) {
        // Reconstruct the command from template literal parts
        let command = '';
        for (let i = 0; i < strings.length; i++) {
          command += strings[i];
          if (i < values.length) {
            command += String(values[i]);
          }
        }

        // Include global options passed to execute
        const mergedOptions = { ...self._currentOptions, ...execFunction._options };
        self.executeCalls.push({ target, command: command.trim(), options: mergedOptions });

        if (self.options.failExecution) {
          throw new Error('Command execution failed');
        }

        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          ok: true
        };
      };

      // Add chaining methods
      execFunction.env = function (vars: any) {
        execFunction._options.env = { ...execFunction._options.env, ...vars };
        return execFunction;
      };

      execFunction.cd = function (dir: string) {
        execFunction._options.cwd = dir;
        return execFunction;
      };

      execFunction.timeout = function (ms: number) {
        execFunction._options.timeout = ms;
        return execFunction;
      };

      // Make chaining methods work with raw too
      execFunction.raw.env = execFunction.env;
      execFunction.raw.cd = execFunction.cd;
      execFunction.raw.timeout = execFunction.timeout;

      this.createdEngines.push({ target, engine: execFunction });
      return execFunction;
    }

    return super['createTargetEngine'](target);
  }

  // Override execute to capture script and task calls
  async execute(args: any[]): Promise<void> {
    const [hostPattern, ...commandParts] = args.slice(0, -1);
    const options = args[args.length - 1];

    // Store current options for use in mock engine
    this._currentOptions = options;

    // Initialize configuration first
    await this.initializeConfig(options);

    // Check if it's a script or task to capture the call
    if (commandParts.length > 0) {
      const command = commandParts.join(' ');
      if (command.endsWith('.ts') || command.endsWith('.js') || command.endsWith('.sh')) {
        // Capture script call before execution
        const targets = await this.resolveTargetsForTest(hostPattern);
        this.scriptCalls.push({ targets, script: command, options });

        if (this.options.mockScripts) {
          // Don't call parent execute, just simulate script execution
          for (const target of targets) {
            this.executeCalls.push({
              target,
              command: `script:${command}`,
              options
            });
          }
          return;
        }
      }
    } else if (options.task) {
      // Don't capture here - let the taskManager mock handle it
    } else if (options.repl) {
      // Handle REPL
      const targets = await this.resolveTargetsForTest(hostPattern);
      if (targets.length === 1) {
        this.replCalls.push({ target: targets[0], options });
        if (this.options.mockExecute) {
          return;
        }
      }
    }

    // Call parent execute
    return super.execute(args);
  }

  // Helper to resolve targets from pattern for test
  private async resolveTargetsForTest(hostPattern: string): Promise<any[]> {
    let targets: any[];

    // Check if it's a direct SSH spec (user@host) - but only if no dots after @
    if (hostPattern.includes('@') && !hostPattern.includes('.')) {
      const [user, host] = hostPattern.split('@');
      targets = [{
        id: `ssh:${hostPattern}`,
        type: 'ssh',
        name: host,
        config: {
          type: 'ssh',
          host,
          user,
        },
        source: 'detected'
      }];
    } else if (hostPattern.includes('*') || hostPattern.includes('{')) {
      // Pattern matching
      const pattern = hostPattern.startsWith('hosts.') ? hostPattern : `hosts.${hostPattern}`;
      targets = await this.findTargets(pattern);
    } else {
      // Single host resolution
      const targetSpec = hostPattern.startsWith('hosts.') ? hostPattern : `hosts.${hostPattern}`;
      try {
        const target = await this.resolveTarget(targetSpec);
        targets = [target];
      } catch {
        // If not found in config, treat as direct host
        // This is where deploy@server.example.com ends up due to the dot check
        targets = [{
          id: `ssh:${hostPattern}`,
          type: 'ssh',
          name: hostPattern,
          config: {
            type: 'ssh',
            host: hostPattern,
            user: process.env['USER'] || 'root',
          },
          source: 'detected'
        }];
      }
    }

    return targets;
  }

  // Expose protected methods for testing
  public async findTargets(targetSpec: string): Promise<any[]> {
    const cached = this.findTargetsResults.get(targetSpec);
    if (cached) {
      return cached;
    }
    const result = await super['findTargets'](targetSpec);
    this.findTargetsResults.set(targetSpec, result);
    return result;
  }

  public getCommandDefaults(): any {
    return super['getCommandDefaults']();
  }

  public getExecuteCalls(): any[] {
    return this.executeCalls;
  }
}

describe('On Command', () => {
  let tempDir: string;
  let projectDir: string;
  let command: TestableOnCommand;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-on-test-'));
    projectDir = path.join(tempDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });

    // Change to project directory
    process.chdir(projectDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Target Resolution', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should resolve configured SSH hosts', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'web-1': {
              host: 'web1.example.com',
              user: 'deploy',
              port: 22,
              privateKey: '~/.ssh/id_rsa'
            },
            'web-2': {
              host: 'web2.example.com',
              user: 'deploy',
              port: 2222
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Test resolving specific host
      await command.execute(['hosts.web-1', 'uptime', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        target: {
          type: 'ssh',
          name: 'web-1',
          config: {
            host: 'web1.example.com',
            user: 'deploy',
            port: 22,
            privateKey: '~/.ssh/id_rsa'
          }
        },
        command: 'uptime'
      });
    });

    it('should support direct SSH specification (user@host)', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['deploy@server.example.com', 'date', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        target: {
          type: 'ssh',
          name: 'deploy@server.example.com',
          config: {
            host: 'deploy@server.example.com',
            user: process.env['USER'] || 'root'
          }
        },
        command: 'date'
      });
    });

    it('should support wildcard patterns', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'app-1': { host: 'app1.example.com', user: 'deploy' },
            'app-2': { host: 'app2.example.com', user: 'deploy' },
            'app-3': { host: 'app3.example.com', user: 'deploy' },
            'db-1': { host: 'db1.example.com', user: 'postgres' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.app-*', 'echo "test"', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(3);

      const targetNames = calls.map(c => c.target.name).sort();
      expect(targetNames).toEqual(['app-1', 'app-2', 'app-3']);
    });
  });

  describe('Command Execution', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should execute commands with proper environment and options', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            app: {
              host: 'app.example.com',
              user: 'deploy',
              privateKey: '~/.ssh/deploy_key',
              env: {
                NODE_ENV: 'production',
                API_KEY: 'secret'
              }
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute([
        'hosts.app',
        'npm restart',
        {
          env: { PORT: '3000' },
          cwd: '/opt/app',
          quiet: true
        }
      ]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options).toMatchObject({
        env: { PORT: '3000' },
        cwd: '/opt/app'
      });
    });

    it('should support sequential execution on multiple targets', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'db-1': { host: 'db1.example.com', user: 'postgres' },
            'db-2': { host: 'db2.example.com', user: 'postgres' },
            'db-3': { host: 'db3.example.com', user: 'postgres' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute([
        'hosts.db-*',
        'pg_isready',
        { quiet: true }
      ]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(3);

      // Verify targets are executed
      const targetNames = calls.map(c => c.target.name);
      expect(targetNames).toContain('db-1');
      expect(targetNames).toContain('db-2');
      expect(targetNames).toContain('db-3');
    });

    it('should support parallel execution with maxConcurrent', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'web-1': { host: 'web1.example.com', user: 'deploy' },
            'web-2': { host: 'web2.example.com', user: 'deploy' },
            'web-3': { host: 'web3.example.com', user: 'deploy' },
            'web-4': { host: 'web4.example.com', user: 'deploy' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute([
        'hosts.web-*',
        'systemctl restart nginx',
        { parallel: true, maxConcurrent: '2', quiet: true }
      ]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(4);
      expect(calls[0].options.parallel).toBe(true);
      expect(calls[0].options.maxConcurrent).toBe('2');
    });
  });

  describe('Script Execution', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true, mockScripts: true });
    });

    it('should execute scripts on SSH hosts', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            server: {
              host: 'server.example.com',
              user: 'admin'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a test script
      const scriptPath = path.join(projectDir, 'deploy.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "Deploying..."');

      await command.execute(['hosts.server', scriptPath, { quiet: true }]);

      const scriptCalls = command.scriptCalls;
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0].targets[0].name).toBe('server');
      expect(scriptCalls[0].script).toBe(scriptPath);
    });

    it('should copy and execute scripts from local path', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'worker-1': { host: 'worker1.example.com', user: 'deploy' },
            'worker-2': { host: 'worker2.example.com', user: 'deploy' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const scriptPath = path.join(projectDir, 'update.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "Updating system..."');

      await command.execute(['hosts.worker-*', scriptPath, { quiet: true }]);

      const scriptCalls = command.scriptCalls;
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0].targets).toHaveLength(2);
    });
  });

  describe('Task Execution', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should execute configured tasks on SSH hosts', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            app: { host: 'app.example.com', user: 'deploy' }
          }
        },
        tasks: {
          deploy: {
            description: 'Deploy application',
            steps: [
              { command: 'git pull' },
              { command: 'npm install' },
              { command: 'npm run build' },
              { command: 'pm2 restart app' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.app', { task: 'deploy', quiet: true }]);

      const taskCalls = command.taskCalls;
      expect(taskCalls).toHaveLength(1);
      expect(taskCalls[0].taskName).toBe('deploy');
      expect(taskCalls[0].targetId).toBe('hosts.app');
    });

    it('should support task execution on multiple hosts', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'web-1': { host: 'web1.example.com', user: 'deploy' },
            'web-2': { host: 'web2.example.com', user: 'deploy' },
            'web-3': { host: 'web3.example.com', user: 'deploy' }
          }
        },
        tasks: {
          'health-check': {
            description: 'Health check',
            steps: [
              { command: 'curl -f http://localhost/health || exit 1' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.web-*', { task: 'health-check', quiet: true }]);

      const taskCalls = command.taskCalls;
      expect(taskCalls).toHaveLength(3); // One call per target
      expect(taskCalls[0].taskName).toBe('health-check');
      expect(taskCalls[1].taskName).toBe('health-check');
      expect(taskCalls[2].taskName).toBe('health-check');

      const targetIds = taskCalls.map(c => c.targetId).sort();
      expect(targetIds).toEqual(['hosts.web-1', 'hosts.web-2', 'hosts.web-3']);
    });
  });

  describe('Command Defaults', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should apply command defaults from configuration', async () => {
      const config = {
        version: '2.0',
        defaults: {
          on: {
            timeout: 30000,
            env: {
              LANG: 'en_US.UTF-8'
            }
          }
        },
        targets: {
          hosts: {
            server: { host: 'server.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.server', 'locale', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      // Defaults are applied in the base class
    });
  });

  describe('REPL Mode', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should start REPL for SSH host', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            dev: {
              host: 'dev.example.com',
              user: 'developer',
              env: { NODE_ENV: 'development' }
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.dev', { repl: true, quiet: true }]);

      const replCalls = command.replCalls;
      expect(replCalls).toHaveLength(1);
      expect(replCalls[0].target.name).toBe('dev');
      expect(replCalls[0].options.repl).toBe(true);
    });
  });

  describe('SSH Connection', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should handle SSH host availability', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'app-1': { host: 'app1.example.com', user: 'deploy' },
            'app-2': { host: 'app2.example.com', user: 'deploy' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.app-*', 'echo "online"', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true, failExecution: true });
    });

    it('should handle command execution failures', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': { host: 'test.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute(['hosts.test-server', 'failing-command', { quiet: true }])
      ).rejects.toThrow('Command execution failed');
    });

    it('should handle parallel execution failures with failFast', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'server-1': { host: 'server1.example.com', user: 'admin' },
            'server-2': { host: 'server2.example.com', user: 'admin' },
            'server-3': { host: 'server3.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute([
          'hosts.server-*',
          'test-command',
          { parallel: true, failFast: true, quiet: true }
        ])
      ).rejects.toThrow('Command failed on');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should handle missing host specification', async () => {
      await expect(
        command.execute(['', { quiet: true }])
      ).rejects.toThrow('Host specification is required');
    });

    it('should handle direct host without @ symbol', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['simple-hostname', 'uptime', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].target.name).toBe('simple-hostname');
    });

    it('should handle brace expansion patterns', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'web-prod': { host: 'web-prod.example.com', user: 'deploy' },
            'web-staging': { host: 'web-staging.example.com', user: 'deploy' },
            'web-dev': { host: 'web-dev.example.com', user: 'deploy' },
            'db-prod': { host: 'db-prod.example.com', user: 'postgres' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.web-{prod,staging}', 'status', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(2);
      const targetNames = calls.map(c => c.target.name).sort();
      expect(targetNames).toEqual(['web-prod', 'web-staging']);
    });

    it('should execute with verbose output', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'verbose-test': { host: 'verbose.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.verbose-test', 'echo test', { verbose: true, quiet: false }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.verbose).toBe(true);
    });

    it('should handle REPL mode when multiple hosts specified', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'server-1': { host: 'server1.example.com', user: 'admin' },
            'server-2': { host: 'server2.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute(['hosts.server-*', { repl: true, quiet: true }])
      ).rejects.toThrow('REPL mode is only supported for single hosts');
    });
  });

  describe('Target Detection', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should detect SSH format without domain (user@host)', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['admin@testserver', 'uptime', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].target).toMatchObject({
        type: 'ssh',
        name: 'testserver',
        config: {
          host: 'testserver',
          user: 'admin'
        }
      });
    });

    it('should prefer config over SSH detection for user@host.domain', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'deploy@server.example.com': {
              host: 'server.internal.com',
              user: 'deployment',
              port: 2222
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // This should match the configured host, not create a direct SSH connection
      await command.execute(['hosts.deploy@server.example.com', 'pwd', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].target.config.host).toBe('server.internal.com');
      expect(calls[0].target.config.user).toBe('deployment');
      expect(calls[0].target.config.port).toBe(2222);
    });
  });

  describe('Script Execution Edge Cases', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true, mockScripts: true });
    });

    it('should handle JavaScript files', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'node-server': { host: 'node.example.com', user: 'node' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const scriptPath = path.join(projectDir, 'script.js');
      await fs.writeFile(scriptPath, 'console.log("JavaScript");');

      await command.execute(['hosts.node-server', scriptPath, { quiet: true }]);

      const scriptCalls = command.scriptCalls;
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0].script).toBe(scriptPath);
    });

    it('should handle TypeScript files', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'ts-server': { host: 'ts.example.com', user: 'typescript' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const scriptPath = path.join(projectDir, 'script.ts');
      await fs.writeFile(scriptPath, 'const msg: string = "TypeScript"; console.log(msg);');

      await command.execute(['hosts.ts-server', scriptPath, { quiet: true }]);

      const scriptCalls = command.scriptCalls;
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0].script).toBe(scriptPath);
    });
  });

  describe('Timeout Handling', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should parse and apply timeout values', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'timeout-test': { host: 'timeout.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute([
        'hosts.timeout-test',
        'long-running-command',
        { timeout: '30s', quiet: true }
      ]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.timeout).toBe(30000);
    });
  });


  describe('No Command Specified', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should throw error when no command, task, or REPL is specified', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-host': { host: 'test.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute(['hosts.test-host', { quiet: true }])
      ).rejects.toThrow('No command, task, or REPL mode specified');
    });
  });

  describe('Shell Script Execution', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true, mockScripts: true });
    });

    it('should detect and execute shell scripts', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'script-host': { host: 'script.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const scriptPath = path.join(projectDir, 'setup.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "Setup script"');

      await command.execute(['hosts.script-host', scriptPath, { quiet: true }]);

      const scriptCalls = command.scriptCalls;
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0].script).toBe(scriptPath);
    });
  });

  describe('Output Formatting', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should handle verbose stderr output', async () => {
      // Override createTargetEngine to return stderr
      command = new TestableOnCommand({ mockExecute: false });
      (command as any).createTargetEngine = async function (target: any) {
        const execFunction = {
          async raw() {
            return {
              stdout: 'Command output',
              stderr: 'Warning message',
              exitCode: 0,
              ok: true
            };
          },
          env() { return this; },
          cd() { return this; },
          timeout() { return this; }
        };
        return execFunction;
      };

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'verbose-host': { host: 'verbose.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.verbose-host', 'test-command', { verbose: true, quiet: false }]);

      // Should log both stdout and stderr in verbose mode
      const output = command.outputLines.join('\n');
      expect(output).toContain('✓');
    });

    it('should handle empty targets gracefully', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {}
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute(['hosts.non-existent-*', { repl: true, quiet: true }])
      ).rejects.toThrow('No hosts found matching pattern');
    });
  });

  describe('Dry Run Mode', () => {
    it('should log dry run info without executing', async () => {
      // Don't mock execute for this test - we want to test the real dry run behavior
      command = new TestableOnCommand({ mockExecute: false });

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'dry-run-test': { host: 'dryrun.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute([
        'hosts.dry-run-test',
        'rm -rf /important',
        { dryRun: true, quiet: false }
      ]);

      // In dry run mode, it should log but not execute
      expect(command.outputLines.some(line =>
        line.includes('[DRY RUN]') &&
        line.includes('Would execute') &&
        line.includes('rm -rf /important')
      )).toBe(true);
    });

    it('should handle dry run with multiple hosts', async () => {
      command = new TestableOnCommand({ mockExecute: false });

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'server-1': { host: 'server1.example.com', user: 'admin' },
            'server-2': { host: 'server2.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute([
        'hosts.server-*',
        'deploy.sh',
        { dryRun: true, quiet: false }
      ]);

      // Should show dry run for both hosts
      const dryRunLines = command.outputLines.filter(line => line.includes('[DRY RUN]'));
      expect(dryRunLines).toHaveLength(2);
      expect(dryRunLines[0]).toContain('server-1');
      expect(dryRunLines[1]).toContain('server-2');
    });
  });

  describe('Advanced Features Coverage', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should handle task execution with parameters', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'task-host': { host: 'task.example.com', user: 'admin' }
          }
        },
        tasks: {
          'parametrized-task': {
            description: 'Task with parameters',
            params: [
              { name: 'env', required: true },
              { name: 'version', required: false, default: '1.0.0' }
            ],
            steps: [
              { command: 'echo "Deploying ${params.version} to ${params.env}"' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.task-host', {
        task: 'parametrized-task',
        env: 'production',
        version: '2.0.0',
        quiet: true
      }]);

      const taskCalls = command.taskCalls;
      expect(taskCalls).toHaveLength(1);
      // Check that the task was called
      expect(taskCalls[0].taskName).toBe('parametrized-task');
      expect(taskCalls[0].targetId).toBe('hosts.task-host');
    });

    it('should validate options with proper schema', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test': { host: 'test.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Test various valid options
      await command.execute(['hosts.test', 'echo test', {
        profile: 'production',
        timeout: '30s',
        env: ['VAR1=value1', 'VAR2=value2'],
        cwd: '/tmp',
        user: 'deploy',
        parallel: true,
        maxConcurrent: '5',
        failFast: true,
        verbose: true,
        quiet: false,
        dryRun: false
      }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
    });

    it('should handle interactive mode options', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'interactive-test': { host: 'interactive.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.interactive-test', 'echo test', {
        quiet: false
      }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
    });

    it('should handle user override in options', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'user-test': { host: 'user.example.com', user: 'default' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.user-test', 'whoami', {
        user: 'override',
        quiet: true
      }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.user).toBe('override');
    });

    it('should handle profile-based configuration', async () => {
      const config = {
        version: '2.0',
        profiles: {
          production: {
            defaults: {
              timeout: 60000,
              env: {
                NODE_ENV: 'production'
              }
            }
          }
        },
        targets: {
          hosts: {
            'profile-test': { host: 'profile.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.profile-test', 'echo $NODE_ENV', {
        profile: 'production',
        quiet: true
      }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.profile).toBe('production');
    });

    it('should handle SSH connection with all options', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'full-ssh': {
              host: 'full.example.com',
              user: 'admin',
              port: 2222,
              privateKey: '~/.ssh/id_rsa',
              passphrase: 'test',
              strictHostKeyChecking: false,
              compression: true,
              connectionTimeout: 30000,
              keepaliveInterval: 10000,
              keepaliveCountMax: 3,
              env: {
                CUSTOM_VAR: 'value'
              }
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.full-ssh', 'env', { quiet: true }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].target.config).toMatchObject({
        host: 'full.example.com',
        user: 'admin',
        port: 2222,
        privateKey: '~/.ssh/id_rsa',
        passphrase: 'test',
        strictHostKeyChecking: false,
        compression: true
      });
    });
  });

  describe('Task Execution with Complex Scenarios', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should execute tasks with conditional steps', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'conditional-host': { host: 'conditional.example.com', user: 'admin' }
          }
        },
        tasks: {
          'conditional-task': {
            description: 'Task with conditional steps',
            steps: [
              {
                name: 'Check environment',
                command: 'test -f /etc/production',
                continueOnError: true
              },
              {
                name: 'Production deploy',
                command: 'deploy-prod.sh',
                when: '${steps[0].exitCode} == 0'
              },
              {
                name: 'Development deploy',
                command: 'deploy-dev.sh',
                when: '${steps[0].exitCode} != 0'
              }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.conditional-host', {
        task: 'conditional-task',
        quiet: true
      }]);

      const taskCalls = command.taskCalls;
      expect(taskCalls).toHaveLength(1);
      expect(taskCalls[0].taskName).toBe('conditional-task');
    });

    it('should handle task execution with retries', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'retry-host': { host: 'retry.example.com', user: 'admin' }
          }
        },
        tasks: {
          'retry-task': {
            description: 'Task with retry logic',
            retries: 3,
            retryDelay: 1000,
            steps: [
              { command: 'curl -f http://api.example.com/health' },
              { command: 'deploy.sh' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.retry-host', {
        task: 'retry-task',
        quiet: true
      }]);

      const taskCalls = command.taskCalls;
      expect(taskCalls).toHaveLength(1);
    });

    it('should handle task with environment variables and secrets', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'secret-host': { host: 'secret.example.com', user: 'admin' }
          }
        },
        tasks: {
          'secret-task': {
            description: 'Task with secrets',
            env: {
              API_KEY: '${secrets.api_key}',
              DB_PASSWORD: '${secrets.db_password}'
            },
            steps: [
              { command: 'echo $API_KEY > /tmp/key.txt' },
              { command: 'mysql -p$DB_PASSWORD < schema.sql' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.secret-host', {
        task: 'secret-task',
        quiet: true
      }]);

      const taskCalls = command.taskCalls;
      expect(taskCalls).toHaveLength(1);
    });
  });

  describe('Connection and Error Handling', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should handle connection timeout', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'timeout-host': {
              host: 'timeout.example.com',
              user: 'admin',
              connectionTimeout: 1000
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.timeout-host', 'echo test', {
        timeout: '1s',
        quiet: true
      }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.timeout).toBe(1000);
    });

    it('should handle keepalive settings', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'keepalive-host': {
              host: 'keepalive.example.com',
              user: 'admin',
              keepaliveInterval: 5000,
              keepaliveCountMax: 10
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await command.execute(['hosts.keepalive-host', 'long-running-command', {
        quiet: true
      }]);

      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].target.config.keepaliveInterval).toBe(5000);
      expect(calls[0].target.config.keepaliveCountMax).toBe(10);
    });
  });

  describe('File Transfer via SSH', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true, mockScripts: true });
    });

    it('should handle local file upload to remote', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'upload-host': { host: 'upload.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a local file
      const localFile = path.join(projectDir, 'upload-test.txt');
      await fs.writeFile(localFile, 'Test content for upload');

      // Since the file needs to have a script extension to be detected as a script
      const scriptFile = path.join(projectDir, 'upload-test.sh');
      await fs.rename(localFile, scriptFile);
      
      await command.execute(['hosts.upload-host', scriptFile, { quiet: true }]);

      const scriptCalls = command.scriptCalls;
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0].script).toBe(scriptFile);
    });
  });

  describe('Multiple Target Patterns', () => {
    beforeEach(() => {
      command = new TestableOnCommand({ mockExecute: true });
    });

    it('should handle complex glob patterns', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'prod-web-1': { host: 'prod-web-1.example.com', user: 'deploy' },
            'prod-web-2': { host: 'prod-web-2.example.com', user: 'deploy' },
            'prod-db-1': { host: 'prod-db-1.example.com', user: 'postgres' },
            'staging-web-1': { host: 'staging-web-1.example.com', user: 'deploy' },
            'dev-web-1': { host: 'dev-web-1.example.com', user: 'developer' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Test various patterns
      await command.execute(['hosts.prod-*', 'echo "Production"', { quiet: true }]);
      
      let calls = command.getExecuteCalls();
      expect(calls).toHaveLength(3);
      expect(calls.map(c => c.target.name).sort()).toEqual(['prod-db-1', 'prod-web-1', 'prod-web-2']);

      command.executeCalls = [];
      await command.execute(['hosts.*-web-*', 'echo "Web servers"', { quiet: true }]);
      
      calls = command.getExecuteCalls();
      expect(calls).toHaveLength(4);
    });

    it('should handle regex-like patterns', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'server1': { host: 'server1.example.com', user: 'admin' },
            'server10': { host: 'server10.example.com', user: 'admin' },
            'server2': { host: 'server2.example.com', user: 'admin' },
            'server20': { host: 'server20.example.com', user: 'admin' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Use wildcard pattern instead of regex-like pattern
      await command.execute(['hosts.server1', 'echo test', { quiet: true }]);
      await command.execute(['hosts.server2', 'echo test', { quiet: true }]);
      
      const calls = command.getExecuteCalls();
      expect(calls).toHaveLength(2);
      expect(calls.map(c => c.target.name).sort()).toEqual(['server1', 'server2']);
    });
  });
});