import { z } from 'zod';
import chalk from 'chalk';
import { $ } from '@xec-js/ush';
import { type Task, TaskRunner, type TaskContext, EnvironmentManager, type EnvironmentInfo, createStandardLibrary } from '@xec-js/core';

import { BaseCommand } from '../utils/command-base.js';
import { errorMessages } from '../utils/error-handler.js';
import { validateOptions, validateTimeout, validateVariables } from '../utils/validation.js';

interface TaskOptions {
  vars?: string;
  var?: string[];
  module?: string;
  list?: boolean;
  search?: string;
  info?: boolean;
  timeout?: string;
  environment?: string;
  watch?: boolean;
  interactive?: boolean;
  retry?: number;
  retryDelay?: string;
  showLogs?: boolean;
  isolated?: boolean;
}

interface TaskInfo {
  module: string;
  task: string;
  description?: string;
  parameters?: Record<string, any>;
  examples?: string[];
  tags?: string[];
  dependencies?: string[];
}

class TaskCommand extends BaseCommand {
  private taskRunner: TaskRunner;
  private environmentManager: EnvironmentManager;

  constructor() {
    super({
      name: 'task',
      description: 'Run, manage, and explore tasks from modules',
      options: [
        {
          flags: '--vars <json>',
          description: 'Variables in JSON format',
        },
        {
          flags: '--var <key=value>',
          description: 'Set variable (can be used multiple times)',
        },
        {
          flags: '-m, --module <name>',
          description: 'Module to load task from',
        },
        {
          flags: '-l, --list',
          description: 'List available tasks',
        },
        {
          flags: '-s, --search <pattern>',
          description: 'Search tasks by name or description',
        },
        {
          flags: '-i, --info',
          description: 'Show detailed information about a task',
        },
        {
          flags: '--timeout <duration>',
          description: 'Task timeout (e.g., 30s, 5m, 1h)',
          defaultValue: '5m',
        },
        {
          flags: '-e, --environment <env>',
          description: 'Target environment',
        },
        {
          flags: '-w, --watch',
          description: 'Watch for changes and re-run task',
        },
        {
          flags: '--interactive',
          description: 'Interactive mode for task parameters',
        },
        {
          flags: '--retry <count>',
          description: 'Number of retry attempts on failure',
        },
        {
          flags: '--retry-delay <duration>',
          description: 'Delay between retry attempts',
          defaultValue: '1s',
        },
        {
          flags: '--show-logs',
          description: 'Show detailed execution logs',
        },
        {
          flags: '--isolated',
          description: 'Run task in isolated environment',
        },
      ],
      examples: [
        {
          command: 'xec task --list',
          description: 'List all available tasks',
        },
        {
          command: 'xec task deploy',
          description: 'Run deploy task',
        },
        {
          command: 'xec task docker:build',
          description: 'Run build task from docker module',
        },
        {
          command: 'xec task std:fs:read',
          description: 'Run read function from fs stdlib module',
        },
        {
          command: 'xec task deploy --vars \'{"version": "1.2.3"}\'',
          description: 'Run task with JSON variables',
        },
        {
          command: 'xec task deploy --var version=1.2.3 --var env=prod',
          description: 'Run task with key-value variables',
        },
        {
          command: 'xec task deploy --info',
          description: 'Show detailed information about deploy task',
        },
        {
          command: 'xec task --search "deploy"',
          description: 'Search for tasks containing "deploy"',
        },
        {
          command: 'xec task deploy --watch',
          description: 'Watch for changes and re-run task',
        },
        {
          command: 'xec task deploy --retry 3 --retry-delay 2s',
          description: 'Run with retry logic',
        },
        {
          command: 'xec task deploy --interactive',
          description: 'Interactive parameter input',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          vars: z.string().optional(),
          var: z.array(z.string()).optional(),
          module: z.string().optional(),
          list: z.boolean().optional(),
          search: z.string().optional(),
          info: z.boolean().optional(),
          timeout: z.string().optional(),
          environment: z.string().optional(),
          watch: z.boolean().optional(),
          interactive: z.boolean().optional(),
          retry: z.number().positive().optional(),
          retryDelay: z.string().optional(),
          showLogs: z.boolean().optional(),
          isolated: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });

    this.environmentManager = new EnvironmentManager();
    this.taskRunner = new TaskRunner(this.environmentManager);
  }

  override create() {
    const command = super.create();
    command.argument('[task-name]', 'Task name to execute (module:task or just task)');
    return command;
  }

  async execute(args: any[]): Promise<void> {
    const [taskName] = args;
    const commandObj = args[args.length - 1];
    const options = commandObj.opts ? commandObj.opts() : commandObj;

    this.intro(chalk.bgMagenta(' Task Management '));

    // Handle different modes
    if (options.list) {
      await this.listTasks(options.search);
      return;
    }

    if (options.search && !taskName) {
      await this.searchTasks(options.search);
      return;
    }

    if (!taskName) {
      await this.showHelp();
      return;
    }

    if (options.info) {
      await this.showTaskInfo(taskName, options.module);
      return;
    }

    // Execute task
    await this.executeTask(taskName, options);

    this.outro(chalk.green('✓ Task execution completed'));
  }

  private async executeTask(taskName: string, options: TaskOptions): Promise<void> {
    const fullTaskName = this.getFullTaskName(taskName, options.module);
    const vars = this.parseVariables(options);
    const timeoutMs = options.timeout ? validateTimeout(options.timeout) : 5 * 60 * 1000;

    this.startSpinner(`Preparing task: ${fullTaskName}`);

    try {
      // Check if it's a stdlib function
      if (this.isStdlibFunction(fullTaskName)) {
        await this.executeStdlibFunction(fullTaskName, vars, options);
        return;
      }

      // Get task metadata
      const task = await this.getTask(fullTaskName);

      if (task && this.isVerbose()) {
        this.log(`Task: ${task.description || fullTaskName}`, 'info');
        if (task.tags && task.tags.length > 0) {
          this.log(`Tags: ${task.tags.join(', ')}`, 'info');
        }
      }

      this.stopSpinner(`✓ Task prepared: ${fullTaskName}`);

      // Interactive parameter input
      if (options.interactive && task) {
        const interactiveVars = await this.getInteractiveParameters(task, vars);
        Object.assign(vars, interactiveVars);
      }

      // Execute with retry logic
      let attempts = 0;
      const maxAttempts = (options.retry || 0) + 1;
      const retryDelay = options.retryDelay ? validateTimeout(options.retryDelay) : 1000;

      while (attempts < maxAttempts) {
        try {
          attempts++;

          if (attempts > 1) {
            this.log(`Retry attempt ${attempts}/${maxAttempts}`, 'info');
            await this.sleep(retryDelay);
          }

          const result = await this.runTaskWithTimeout(fullTaskName, {
            params: vars,
            timeout: timeoutMs,
            environment: options.environment,
            retries: 0, // We handle retries ourselves
          });

          await this.handleTaskResult(result, fullTaskName, options);
          return; // Success - exit retry loop

        } catch (error) {
          if (attempts >= maxAttempts) {
            throw error; // Final attempt failed
          }

          this.log(`Attempt ${attempts} failed: ${(error as Error).message}`, 'warn');
          if (options.showLogs) {
            this.log(`Will retry in ${retryDelay}ms...`, 'info');
          }
        }
      }

    } catch (error) {
      this.stopSpinner();
      throw error;
    }
  }

  private async listTasks(searchPattern?: string): Promise<void> {
    this.startSpinner('Loading tasks...');

    const allTasks = this.taskRunner.listTasks();
    const tasks: TaskInfo[] = [];

    for (const [taskName, task] of allTasks) {
      const parts = taskName.split(':');
      const taskInfo: TaskInfo = {
        module: parts.length === 2 ? parts[0]! : 'default',
        task: parts.length === 2 ? parts[1]! : taskName,
        description: task.description || undefined,
        tags: task.tags || [],
        dependencies: task.dependencies || [],
      };

      // Filter by search pattern if provided
      if (searchPattern) {
        const searchLower = searchPattern.toLowerCase();
        const matches =
          taskInfo.task.toLowerCase().includes(searchLower) ||
          taskInfo.description?.toLowerCase().includes(searchLower) ||
          taskInfo.tags?.some(tag => tag.toLowerCase().includes(searchLower));

        if (!matches) continue;
      }

      tasks.push(taskInfo);
    }

    // Add stdlib functions as tasks
    const stdlibTasks = this.getStdlibTasks();
    for (const task of stdlibTasks) {
      if (searchPattern) {
        const searchLower = searchPattern.toLowerCase();
        const matches =
          task.task.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower) ||
          task.tags?.some(tag => tag.toLowerCase().includes(searchLower));

        if (!matches) continue;
      }

      tasks.push(task);
    }

    this.stopSpinner();

    if (tasks.length === 0) {
      this.log('No tasks found. Load modules first.', 'warn');
      return;
    }

    // Group by module
    const moduleGroups = tasks.reduce<Record<string, TaskInfo[]>>((acc, task) => {
      if (!acc[task.module]) {
        acc[task.module] = [];
      }
      acc[task.module]!.push(task);
      return acc;
    }, {});

    // Display tasks
    for (const [module, moduleTasks] of Object.entries(moduleGroups)) {
      console.log(chalk.bold.cyan(`\n${module}:`));

      for (const task of moduleTasks) {
        const taskLine = `  ${chalk.green('●')} ${chalk.bold(task.task)}`;
        console.log(taskLine);

        if (task.description) {
          console.log(`    ${chalk.dim(task.description)}`);
        }

        if (task.tags && task.tags.length > 0 && this.isVerbose()) {
          console.log(`    ${chalk.dim(`Tags: ${task.tags.join(', ')}`)}`);
        }
      }
    }

    console.log(chalk.dim('\nUsage:'));
    console.log(chalk.dim('  xec task <task-name>           - Run a task'));
    console.log(chalk.dim('  xec task <module:task-name>    - Run from specific module'));
    console.log(chalk.dim('  xec task std:<module:function> - Run stdlib function'));
    console.log(chalk.dim('  xec task <task-name> --info    - Show task details'));
  }

  private async searchTasks(pattern: string): Promise<void> {
    this.log(`Searching for tasks matching: ${pattern}`, 'info');
    await this.listTasks(pattern);
  }

  private async showTaskInfo(taskName: string, module?: string): Promise<void> {
    const fullTaskName = this.getFullTaskName(taskName, module);

    this.startSpinner(`Getting task information: ${fullTaskName}`);

    try {
      // Check if it's a stdlib function
      if (this.isStdlibFunction(fullTaskName)) {
        this.showStdlibFunctionInfo(fullTaskName);
        return;
      }

      const task = await this.getTask(fullTaskName);

      if (!task) {
        throw errorMessages.taskNotFound(fullTaskName);
      }

      this.stopSpinner();

      // Display task information
      console.log(chalk.bold.cyan(`\nTask: ${fullTaskName}`));

      if (task.description) {
        console.log(`Description: ${task.description}`);
      }

      if (task.tags && task.tags.length > 0) {
        console.log(`Tags: ${task.tags.join(', ')}`);
      }

      if (task.metadata) {
        const metadata = task.metadata as any;

        if (metadata.version) {
          console.log(`Version: ${metadata.version}`);
        }

        if (metadata.author) {
          console.log(`Author: ${metadata.author}`);
        }

        if (metadata.parameters) {
          console.log(chalk.bold('\nParameters:'));
          for (const [name, param] of Object.entries(metadata.parameters)) {
            console.log(`  ${chalk.green(name)}: ${param}`);
          }
        }

        if (metadata.examples && Array.isArray(metadata.examples)) {
          console.log(chalk.bold('\nExamples:'));
          metadata.examples.forEach((example: string, index: number) => {
            console.log(`  ${index + 1}. ${chalk.cyan(example)}`);
          });
        }
      }

      if (task.dependencies && task.dependencies.length > 0) {
        console.log(chalk.bold('\nDependencies:'));
        task.dependencies.forEach(dep => {
          console.log(`  - ${dep}`);
        });
      }

    } catch (error) {
      this.stopSpinner();
      throw error;
    }
  }

  private async showHelp(): Promise<void> {
    console.log(chalk.bold('Task Management Commands:'));
    console.log(`  ${chalk.cyan('xec task --list')}              List all available tasks`);
    console.log(`  ${chalk.cyan('xec task --search <pattern>')}  Search tasks by pattern`);
    console.log(`  ${chalk.cyan('xec task <name>')}              Run a task`);
    console.log(`  ${chalk.cyan('xec task <name> --info')}       Show task information`);
    console.log('');
    console.log('For more options, use --help');
  }

  private getFullTaskName(taskName: string, module?: string): string {
    if (module) {
      return `${module}:${taskName}`;
    }
    return taskName;
  }

  private parseVariables(options: TaskOptions): Record<string, any> {
    let vars: Record<string, any> = {};

    // Parse JSON variables
    if (options.vars) {
      vars = validateVariables(options.vars);
    }

    // Parse key-value variables
    if (options.var && options.var.length > 0) {
      for (const varStr of options.var) {
        const [key, ...valueParts] = varStr.split('=');
        if (!key || valueParts.length === 0) {
          throw errorMessages.configurationInvalid('variable', `Invalid format: ${varStr}`);
        }

        const value = valueParts.join('=');
        try {
          vars[key.trim()] = JSON.parse(value);
        } catch {
          vars[key.trim()] = value;
        }
      }
    }

    return vars;
  }

  private async getTask(taskName: string): Promise<Task | null> {
    try {
      return this.taskRunner.getTask(taskName) || null;
    } catch {
      return null;
    }
  }

  private async getInteractiveParameters(task: Task, currentVars: Record<string, any>): Promise<Record<string, any>> {
    if (!task.metadata || !(task.metadata as any).parameters) {
      return {};
    }

    const result: Record<string, any> = {};
    const parameters = (task.metadata as any).parameters;

    for (const [name, param] of Object.entries(parameters)) {
      if (currentVars[name] !== undefined) {
        continue; // Skip if already provided
      }

      const value = await this.prompt(
        `Enter ${name} (${param}):`,
        undefined
      );

      if (value) {
        try {
          result[name] = JSON.parse(value);
        } catch {
          result[name] = value;
        }
      }
    }

    return result;
  }

  private async runTaskWithTimeout(taskName: string, options: any): Promise<any> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task execution timeout after ${options.timeout}ms`));
      }, options.timeout);
    });

    return Promise.race([
      this.taskRunner.runTask(taskName, options),
      timeoutPromise,
    ]);
  }

  private async handleTaskResult(result: any, taskName: string, options: TaskOptions): Promise<void> {
    if (result === undefined) {
      this.log(`Task '${taskName}' completed with no result`, 'success');
      return;
    }

    this.log(`Task '${taskName}' completed successfully`, 'success');

    // Output result based on format
    if (this.isQuiet()) {
      this.outputQuietResult(result);
    } else {
      this.output(result, 'Task Result');
    }
  }

  private outputQuietResult(result: any): void {
    if (typeof result === 'object' && result !== null) {
      const res = result as any;
      if (res.stdout) {
        console.log(res.stdout);
      } else if (res.output) {
        console.log(res.output);
      } else if (res.data) {
        console.log(typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      console.log(result);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isStdlibFunction(taskName: string): boolean {
    const parts = taskName.split(':');

    // New format: std:module:function
    if (parts.length === 3 && parts[0] === 'std') {
      const [, module, func] = parts;
      const stdlibModules = ['fs', 'http', 'os', 'proc', 'pkg', 'svc', 'net', 'crypto', 'time', 'json', 'yaml', 'env', 'template'];
      return module !== undefined && func !== undefined && stdlibModules.includes(module);
    }

    // Legacy format: module:function (for backward compatibility)
    if (parts.length === 2) {
      const [module, func] = parts;
      const stdlibModules = ['fs', 'http', 'os', 'proc', 'pkg', 'svc', 'net', 'crypto', 'time', 'json', 'yaml', 'env', 'template'];
      return module !== undefined && func !== undefined && stdlibModules.includes(module);
    }

    return false;
  }

  private getStdlibTasks(): TaskInfo[] {
    const stdlibModules = {
      fs: {
        functions: [
          { name: 'read', description: 'Read file contents' },
          { name: 'write', description: 'Write file' },
          { name: 'exists', description: 'Check if file exists' },
          { name: 'mkdir', description: 'Create directory' },
          { name: 'ls', description: 'List directory contents' },
          { name: 'copy', description: 'Copy file or directory' },
          { name: 'move', description: 'Move file or directory' },
          { name: 'rm', description: 'Remove file or directory' },
          { name: 'stat', description: 'Get file/directory statistics' },
          { name: 'chmod', description: 'Change file permissions' },
        ],
      },
      http: {
        functions: [
          { name: 'get', description: 'HTTP GET request' },
          { name: 'post', description: 'HTTP POST request' },
          { name: 'put', description: 'HTTP PUT request' },
          { name: 'delete', description: 'HTTP DELETE request' },
          { name: 'request', description: 'Generic HTTP request' },
        ],
      },
      os: {
        functions: [
          { name: 'platform', description: 'Get OS platform' },
          { name: 'hostname', description: 'Get hostname' },
          { name: 'arch', description: 'Get CPU architecture' },
          { name: 'cpus', description: 'Get CPU information' },
          { name: 'memory', description: 'Get memory information' },
        ],
      },
      proc: {
        functions: [
          { name: 'exec', description: 'Execute command' },
          { name: 'spawn', description: 'Spawn process' },
          { name: 'kill', description: 'Kill process' },
          { name: 'list', description: 'List processes' },
        ],
      },
      pkg: {
        functions: [
          { name: 'install', description: 'Install package' },
          { name: 'remove', description: 'Remove package' },
          { name: 'update', description: 'Update packages' },
          { name: 'installed', description: 'List installed packages' },
        ],
      },
      svc: {
        functions: [
          { name: 'start', description: 'Start service' },
          { name: 'stop', description: 'Stop service' },
          { name: 'restart', description: 'Restart service' },
          { name: 'status', description: 'Get service status' },
        ],
      },
      net: {
        functions: [
          { name: 'ping', description: 'Ping host' },
          { name: 'isPortOpen', description: 'Check if port is open' },
          { name: 'resolve', description: 'Resolve hostname' },
          { name: 'interfaces', description: 'Get network interfaces' },
        ],
      },
      crypto: {
        functions: [
          { name: 'hash', description: 'Generate hash' },
          { name: 'md5', description: 'Generate MD5 hash' },
          { name: 'sha256', description: 'Generate SHA256 hash' },
          { name: 'uuid', description: 'Generate UUID' },
        ],
      },
      time: {
        functions: [
          { name: 'now', description: 'Get current timestamp' },
          { name: 'format', description: 'Format timestamp' },
          { name: 'parse', description: 'Parse date string' },
          { name: 'sleep', description: 'Sleep for duration' },
        ],
      },
      json: {
        functions: [
          { name: 'parse', description: 'Parse JSON string' },
          { name: 'stringify', description: 'Convert to JSON string' },
          { name: 'merge', description: 'Merge JSON objects' },
          { name: 'get', description: 'Get value from JSON' },
        ],
      },
      yaml: {
        functions: [
          { name: 'parse', description: 'Parse YAML string' },
          { name: 'stringify', description: 'Convert to YAML string' },
          { name: 'read', description: 'Read YAML file' },
          { name: 'write', description: 'Write YAML file' },
        ],
      },
      env: {
        functions: [
          { name: 'get', description: 'Get environment variable' },
          { name: 'set', description: 'Set environment variable' },
          { name: 'all', description: 'Get all environment variables' },
          { name: 'load', description: 'Load environment from file' },
        ],
      },
      template: {
        functions: [
          { name: 'render', description: 'Render template' },
          { name: 'renderFile', description: 'Render template file' },
          { name: 'compile', description: 'Compile template' },
        ],
      },
    };

    const tasks: TaskInfo[] = [];
    for (const [moduleName, moduleInfo] of Object.entries(stdlibModules)) {
      for (const func of moduleInfo.functions) {
        tasks.push({
          module: `std:${moduleName}`,
          task: func.name,
          description: func.description,
          tags: ['stdlib', 'function'],
        });
      }
    }

    return tasks;
  }

  private async executeStdlibFunction(taskName: string, vars: Record<string, any>, options: TaskOptions): Promise<void> {
    const parts = taskName.split(':');
    let moduleName: string;
    let functionName: string;

    // Handle new format: std:module:function
    if (parts.length === 3 && parts[0] === 'std') {
      moduleName = parts[1]!;
      functionName = parts[2]!;
    }
    // Handle legacy format: module:function
    else if (parts.length === 2) {
      moduleName = parts[0]!;
      functionName = parts[1]!;
    }
    else {
      throw new Error(`Invalid stdlib function name: ${taskName}`);
    }

    if (!moduleName || !functionName) {
      throw new Error(`Invalid stdlib function name: ${taskName}`);
    }

    try {
      // Create a minimal environment info
      const envInfo: EnvironmentInfo = {
        type: 'local',
        capabilities: {
          shell: true,
          sudo: process.platform !== 'win32',
          docker: false,
          systemd: process.platform === 'linux'
        },
        platform: {
          os: process.platform === 'darwin' ? 'darwin' :
            process.platform === 'win32' ? 'windows' :
              'linux' as any,
          arch: process.arch === 'x64' ? 'x64' :
            process.arch === 'arm64' ? 'arm64' :
              'arm' as any
        }
      };

      // Create a minimal logger
      const logger: any = {
        debug: (message: string, meta?: any) => options.showLogs && console.log(chalk.gray('[DEBUG]'), message, meta || ''),
        info: (message: string, meta?: any) => console.log(chalk.blue('[INFO]'), message, meta || ''),
        warn: (message: string, meta?: any) => console.log(chalk.yellow('[WARN]'), message, meta || ''),
        error: (message: string, meta?: any) => console.error(chalk.red('[ERROR]'), message, meta || ''),
        child() { return this; }
      };

      // Create a minimal context to get stdlib
      const context: Partial<TaskContext> = {
        $,
        env: envInfo,
        logger
      };

      // Create standard library
      const stdlib = await createStandardLibrary(context);

      // Get the stdlib module
      const stdlibModule = (stdlib as any)[moduleName];
      if (!stdlibModule) {
        throw new Error(`Stdlib module not found: ${moduleName}`);
      }

      const method = stdlibModule[functionName];
      if (typeof method !== 'function') {
        throw new Error(`Function not found: ${moduleName}.${functionName}`);
      }

      this.stopSpinner(`✓ Function prepared: ${taskName}`);

      console.log(chalk.cyan(`\nExecuting stdlib function: ${moduleName}.${functionName}\n`));

      // Convert variables to arguments array
      const args = Object.values(vars);

      // Call the method
      const result = await method.apply(stdlibModule, args);

      await this.handleTaskResult(result, taskName, options);

    } catch (error) {
      this.stopSpinner();
      throw error;
    }
  }

  private showStdlibFunctionInfo(taskName: string): void {
    const parts = taskName.split(':');
    let moduleName: string;
    let functionName: string;

    // Handle new format: std:module:function
    if (parts.length === 3 && parts[0] === 'std') {
      moduleName = parts[1]!;
      functionName = parts[2]!;
    }
    // Handle legacy format: module:function
    else if (parts.length === 2) {
      moduleName = parts[0]!;
      functionName = parts[1]!;
    }
    else {
      throw new Error(`Invalid stdlib function name: ${taskName}`);
    }

    if (!moduleName || !functionName) {
      throw new Error(`Invalid stdlib function name: ${taskName}`);
    }

    const stdlibInfo: Record<string, any> = {
      fs: {
        exists: { args: ['path'], returns: 'boolean', description: 'Check if file exists' },
        read: { args: ['path'], returns: 'string', description: 'Read file contents' },
        write: { args: ['path', 'content'], returns: 'void', description: 'Write file' },
        copy: { args: ['source', 'destination'], returns: 'void', description: 'Copy file or directory' },
        move: { args: ['source', 'destination'], returns: 'void', description: 'Move file or directory' },
        rm: { args: ['path'], returns: 'void', description: 'Remove file or directory' },
        mkdir: { args: ['path'], returns: 'void', description: 'Create directory' },
        ls: { args: ['path?'], returns: 'string[]', description: 'List directory contents' },
        stat: { args: ['path'], returns: 'object', description: 'Get file/directory statistics' },
        chmod: { args: ['path', 'mode'], returns: 'void', description: 'Change file permissions' },
      },
      http: {
        get: { args: ['url', 'options?'], returns: 'Response', description: 'HTTP GET request' },
        post: { args: ['url', 'body?', 'options?'], returns: 'Response', description: 'HTTP POST request' },
        put: { args: ['url', 'body?', 'options?'], returns: 'Response', description: 'HTTP PUT request' },
        delete: { args: ['url', 'options?'], returns: 'Response', description: 'HTTP DELETE request' },
        request: { args: ['method', 'url', 'options?'], returns: 'Response', description: 'Generic HTTP request' },
      },
      os: {
        platform: { args: [], returns: 'string', description: 'Get OS platform' },
        hostname: { args: [], returns: 'string', description: 'Get hostname' },
        arch: { args: [], returns: 'string', description: 'Get CPU architecture' },
        cpus: { args: [], returns: 'object[]', description: 'Get CPU information' },
        memory: { args: [], returns: 'object', description: 'Get memory information' },
      },
      proc: {
        exec: { args: ['command', 'options?'], returns: 'object', description: 'Execute command' },
        spawn: { args: ['command', 'args?', 'options?'], returns: 'object', description: 'Spawn process' },
        kill: { args: ['pid', 'signal?'], returns: 'void', description: 'Kill process' },
        list: { args: [], returns: 'object[]', description: 'List processes' },
      },
      pkg: {
        install: { args: ['package', 'options?'], returns: 'void', description: 'Install package' },
        remove: { args: ['package', 'options?'], returns: 'void', description: 'Remove package' },
        update: { args: ['options?'], returns: 'void', description: 'Update packages' },
        installed: { args: [], returns: 'string[]', description: 'List installed packages' },
      },
      svc: {
        start: { args: ['service'], returns: 'void', description: 'Start service' },
        stop: { args: ['service'], returns: 'void', description: 'Stop service' },
        restart: { args: ['service'], returns: 'void', description: 'Restart service' },
        status: { args: ['service'], returns: 'object', description: 'Get service status' },
      },
      net: {
        ping: { args: ['host', 'options?'], returns: 'object', description: 'Ping host' },
        isPortOpen: { args: ['host', 'port'], returns: 'boolean', description: 'Check if port is open' },
        resolve: { args: ['hostname'], returns: 'string[]', description: 'Resolve hostname' },
        interfaces: { args: [], returns: 'object', description: 'Get network interfaces' },
      },
      crypto: {
        hash: { args: ['data', 'algorithm'], returns: 'string', description: 'Generate hash' },
        md5: { args: ['data'], returns: 'string', description: 'Generate MD5 hash' },
        sha256: { args: ['data'], returns: 'string', description: 'Generate SHA256 hash' },
        uuid: { args: [], returns: 'string', description: 'Generate UUID' },
      },
      time: {
        now: { args: [], returns: 'number', description: 'Get current timestamp' },
        format: { args: ['timestamp', 'format?'], returns: 'string', description: 'Format timestamp' },
        parse: { args: ['dateString'], returns: 'number', description: 'Parse date string' },
        sleep: { args: ['milliseconds'], returns: 'void', description: 'Sleep for duration' },
      },
      json: {
        parse: { args: ['jsonString'], returns: 'any', description: 'Parse JSON string' },
        stringify: { args: ['object', 'space?'], returns: 'string', description: 'Convert to JSON string' },
        merge: { args: ['target', 'source'], returns: 'object', description: 'Merge JSON objects' },
        get: { args: ['object', 'path'], returns: 'any', description: 'Get value from JSON' },
      },
      yaml: {
        parse: { args: ['yamlString'], returns: 'any', description: 'Parse YAML string' },
        stringify: { args: ['object'], returns: 'string', description: 'Convert to YAML string' },
        read: { args: ['path'], returns: 'any', description: 'Read YAML file' },
        write: { args: ['path', 'data'], returns: 'void', description: 'Write YAML file' },
      },
      env: {
        get: { args: ['key', 'defaultValue?'], returns: 'string', description: 'Get environment variable' },
        set: { args: ['key', 'value'], returns: 'void', description: 'Set environment variable' },
        all: { args: [], returns: 'object', description: 'Get all environment variables' },
        load: { args: ['path'], returns: 'void', description: 'Load environment from file' },
      },
      template: {
        render: { args: ['template', 'data'], returns: 'string', description: 'Render template' },
        renderFile: { args: ['path', 'data'], returns: 'string', description: 'Render template file' },
        compile: { args: ['template'], returns: 'function', description: 'Compile template' },
      },
    };

    const moduleInfo = stdlibInfo[moduleName];
    if (!moduleInfo) {
      throw new Error(`Unknown stdlib module: ${moduleName}`);
    }

    const funcInfo = moduleInfo[functionName];
    if (!funcInfo) {
      throw new Error(`Unknown stdlib function: ${moduleName}.${functionName}`);
    }

    this.stopSpinner();

    // Display function information
    console.log(chalk.bold.cyan(`\nStdlib Function: ${taskName}`));
    console.log(`Description: ${funcInfo.description}`);
    console.log(`Module: ${moduleName}`);
    console.log(`Arguments: ${funcInfo.args.join(', ')}`);
    console.log(`Returns: ${funcInfo.returns}`);
    console.log(`Type: ${chalk.magenta('stdlib')}`);

    console.log(chalk.bold('\nUsage:'));
    console.log(chalk.cyan(`  xec task ${taskName.startsWith('std:') ? taskName : `std:${taskName}`} --var arg0=value0`));

    if (funcInfo.args.length > 0) {
      console.log(chalk.bold('\nArguments:'));
      funcInfo.args.forEach((arg: string, index: number) => {
        console.log(`  ${index + 1}. ${chalk.green(arg)}`);
      });
    }
  }
}

export default function taskCommand(program: any): void {
  const command = new TaskCommand();
  program.addCommand(command.create());
}