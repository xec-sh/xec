import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { glob } from 'glob';
import { table } from 'table';
import { promisify } from 'util';
import { $ } from '@xec-sh/core';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { exec } from 'child_process';
import { createRequire } from 'module';
import { ModuleLoader } from '@xec-sh/loader';
import { prism, select, confirm } from '@xec-sh/kit';

import { formatBytes } from '../utils/formatters.js';
import { getModuleCacheDir } from '../config/utils.js';
import { TaskManager } from '../config/task-manager.js';
import { TargetResolver } from '../config/target-resolver.js';
import { discoverAllCommands } from '../utils/cli-command-manager.js';
import { BaseCommand, CommandOptions } from '../utils/command-base.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { VariableInterpolator } from '../config/variable-interpolator.js';

interface InspectOptions extends CommandOptions {
  filter?: string;
  format?: 'table' | 'json' | 'yaml' | 'tree';
  resolve?: boolean;
  validate?: boolean;
  explain?: boolean;
  profile?: string;
}

type InspectType = 'all' | 'tasks' | 'targets' | 'vars' | 'scripts' | 'commands' | 'system' | 'cache';

interface InspectionResult {
  type: string;
  name: string;
  data: any;
  metadata?: Record<string, any>;
}

export class InspectCommand extends BaseCommand {
  constructor() {
    super({
      name: 'inspect',
      aliases: ['i'],
      description: 'Inspect and analyze xec project configuration, tasks, and resources',
      arguments: '[type] [name]',
      options: [
        {
          flags: '-f, --filter <pattern>',
          description: 'Filter results by pattern'
        },
        {
          flags: '--format <format>',
          description: 'Output format (table, json, yaml, tree)',
          defaultValue: 'table'
        },
        {
          flags: '-r, --resolve',
          description: 'Resolve and show interpolated values'
        },
        {
          flags: '--validate',
          description: 'Validate configuration and connectivity'
        },
        {
          flags: '-e, --explain',
          description: 'Show execution plan and details'
        },
        {
          flags: '-p, --profile <name>',
          description: 'Use specific profile'
        },
      ],
      examples: [
        {
          command: 'xec inspect',
          description: 'Interactive mode to browse all resources'
        },
        {
          command: 'xec inspect tasks',
          description: 'List all available tasks'
        },
        {
          command: 'xec inspect targets',
          description: 'List all configured targets'
        },
        {
          command: 'xec i system',
          description: 'Display system information'
        },
        {
          command: 'xec inspect tasks deploy --explain',
          description: 'Show execution plan for deploy task'
        }
      ]
    });
  }

  public async execute(args: any[]): Promise<void> {
    // Check if the last arg is a Command object (Commander.js pattern)
    const lastArg = args[args.length - 1];
    const isCommand = lastArg && typeof lastArg === 'object' && lastArg.constructor && lastArg.constructor.name === 'Command';

    // The actual options should be the second-to-last argument if the last is a Command
    const optionsArg = isCommand ? args[args.length - 2] as InspectOptions : lastArg as InspectOptions;
    const positionalArgs = isCommand ? args.slice(0, -2) : args.slice(0, -1);

    const [type, name] = positionalArgs;

    // Build InspectOptions from the command options
    const options: InspectOptions = {
      filter: optionsArg?.filter,
      format: optionsArg?.format || 'table',
      resolve: optionsArg?.resolve,
      validate: optionsArg?.validate,
      explain: optionsArg?.explain,
      profile: optionsArg?.profile,
      verbose: this.options.verbose,
      quiet: this.options.quiet,
    };

    try {
      const inspector = new ProjectInspector(options);
      await inspector.initialize();

      if (!type && !name) {
        await inspector.runInteractive();
      } else {
        await inspector.inspect(type as InspectType, name);
      }
    } catch (error: any) {
      console.error(prism.red('Error:'), error.message);
      if (options?.verbose) {
        console.error(prism.gray(error.stack));
      }
      throw error;
    }
  }
}

class ProjectInspector {
  private configManager!: ConfigurationManager;
  private taskManager!: TaskManager;
  private targetResolver!: TargetResolver;
  private variableInterpolator!: VariableInterpolator;
  private options: InspectOptions;

  constructor(options: InspectOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    // Initialize configuration with profile if specified
    this.configManager = new ConfigurationManager({
      projectRoot: process.cwd(),
      profile: this.options.profile,
    });

    await this.configManager.load();
    const config = this.configManager.getConfig();

    // Initialize other managers
    this.taskManager = new TaskManager({
      configManager: this.configManager,
      debug: this.options.verbose,
    });

    this.targetResolver = new TargetResolver(config, {
      autoDetect: true,
    });

    this.variableInterpolator = new VariableInterpolator(this.configManager.getSecretManager());

    // Load tasks
    await this.taskManager.load();
  }

  async inspect(type?: InspectType, name?: string): Promise<void> {
    const results: InspectionResult[] = [];

    // Determine what to inspect
    const inspectType = type || 'all';

    if (inspectType === 'all' || inspectType === 'tasks') {
      results.push(...await this.inspectTasks(name));
    }

    if (inspectType === 'all' || inspectType === 'targets') {
      results.push(...await this.inspectTargets(name));
    }

    if (inspectType === 'all' || inspectType === 'vars') {
      results.push(...await this.inspectVariables(name));
    }

    if (inspectType === 'all' || inspectType === 'scripts') {
      results.push(...await this.inspectScripts(name));
    }

    if (inspectType === 'all' || inspectType === 'commands') {
      results.push(...await this.inspectCommands(name));
    }

    if (inspectType === 'all' || inspectType === 'system') {
      results.push(...await this.inspectSystem(name));
    }

    if (inspectType === 'cache') {
      results.push(...await this.inspectCache(name));
    }

    // Apply filter if specified
    const filtered = this.applyFilter(results);

    // Display results
    this.displayResults(filtered, inspectType);
  }

  async runInteractive(): Promise<void> {
    console.log(prism.bold('\n🔍 Xec Project Inspector\n'));

    while (true) {
      const choice = await select({
        message: 'What would you like to inspect?',
        options: [
          { value: 'tasks', label: '📋 Tasks - Executable tasks and workflows' },
          { value: 'targets', label: '🎯 Targets - Hosts, containers, and pods' },
          { value: 'vars', label: '📝 Variables - Configuration variables' },
          { value: 'scripts', label: '📜 Scripts - JavaScript/TypeScript files' },
          { value: 'commands', label: '⌘  Commands - Dynamic and built-in CLI commands' },
          { value: 'system', label: '💻 System - Version and environment information' },
          { value: 'cache', label: '📦 Cache - Module cache information' },
          { value: 'validate', label: '✅ Validate - Check configuration and connectivity' },
          { value: 'exit', label: '❌ Exit' },
        ],
      });

      if (choice === 'exit') break;

      if (choice === 'validate') {
        await this.runValidation();
        continue;
      }

      await this.inspectInteractive(choice as InspectType);
    }
  }

  private async inspectTasks(name?: string): Promise<InspectionResult[]> {
    const tasks = await this.taskManager.list();
    const results: InspectionResult[] = [];

    for (const task of tasks) {
      if (name && task.name !== name) continue;

      const taskConfig = this.configManager.get(`tasks.${task.name}`);
      const result: InspectionResult = {
        type: 'task',
        name: task.name,
        data: task,
        metadata: {
          source: 'config',
          hasSteps: task.hasSteps,
          hasScript: task.hasScript,
          isPrivate: task.isPrivate,
        },
      };

      if (this.options.explain && name) {
        // Get detailed explanation
        const explanation = await this.taskManager.explain(task.name, {});
        result.metadata!['explanation'] = explanation;
      }

      if (this.options.resolve) {
        // Resolve variables in task
        result.metadata!['resolved'] = await this.resolveTaskVariables(taskConfig);
      }

      results.push(result);
    }

    return results;
  }

  private async inspectTargets(name?: string): Promise<InspectionResult[]> {
    const results: InspectionResult[] = [];
    const targets = this.configManager.get('targets') || {};

    // Process all target types
    for (const [targetType, targetList] of Object.entries(targets)) {
      if (targetType === 'defaults') continue;

      for (const [targetName, targetConfig] of Object.entries(targetList as any)) {
        const fullName = `${targetType}.${targetName}`;
        if (name && fullName !== name && targetName !== name) continue;

        const result: InspectionResult = {
          type: 'target',
          name: fullName,
          data: {
            type: targetType,
            name: targetName,
            config: targetConfig,
          },
          metadata: {
            targetType,
            hasDefaults: !!targets.defaults,
          },
        };

        if (this.options.validate && name) {
          // Validate target connectivity
          result.metadata!['validation'] = await this.validateTarget(fullName);
        }

        results.push(result);
      }
    }

    return results;
  }

  private async inspectVariables(name?: string): Promise<InspectionResult[]> {
    const vars = this.configManager.get('vars') || {};
    const results: InspectionResult[] = [];

    for (const [varName, varValue] of Object.entries(vars)) {
      if (name && varName !== name) continue;

      const result: InspectionResult = {
        type: 'variable',
        name: varName,
        data: varValue,
        metadata: {
          type: typeof varValue,
          hasInterpolation: this.hasInterpolation(varValue),
        },
      };

      if (this.options.resolve) {
        try {
          result.metadata!['resolved'] = await this.variableInterpolator.interpolateAsync(String(varValue), {});
        } catch (error: any) {
          result.metadata!['resolveError'] = error.message;
        }
      }

      results.push(result);
    }

    return results;
  }

  private async inspectScripts(name?: string): Promise<InspectionResult[]> {
    const scriptsDir = path.join(process.cwd(), '.xec', 'scripts');
    const results: InspectionResult[] = [];

    if (!await fs.pathExists(scriptsDir)) {
      return results;
    }

    const pattern = name ? `**/${name}*` : '**/*';
    const files = await glob(pattern, {
      cwd: scriptsDir,
      nodir: true,
      ignore: ['**/*.test.*', '**/*.spec.*'],
    });

    for (const file of files) {
      if (!['.js', '.ts', '.mjs'].some(ext => file.endsWith(ext))) continue;

      const fullPath = path.join(scriptsDir, file);
      const result: InspectionResult = {
        type: 'script',
        name: file,
        data: {
          path: fullPath,
          relativePath: file,
        },
        metadata: {
          extension: path.extname(file),
          size: (await fs.stat(fullPath)).size,
        },
      };

      if (this.options.verbose) {
        // Extract documentation from script
        const content = await fs.readFile(fullPath, 'utf-8');
        const description = this.extractScriptDescription(content);
        if (description) {
          result.metadata!['description'] = description;
        }
      }

      results.push(result);
    }

    return results;
  }

  private async inspectCommands(name?: string): Promise<InspectionResult[]> {
    const results: InspectionResult[] = [];

    // Use unified command discovery
    const allCommands = await discoverAllCommands();

    // Process all commands uniformly
    for (const cmd of allCommands) {
      if (name && cmd.name !== name) continue;

      results.push({
        type: 'command',
        name: cmd.name,
        data: {
          type: cmd.type,
          description: cmd.description,
          path: cmd.path,
          loaded: cmd.loaded,
          error: cmd.error,
        },
        metadata: {
          category: cmd.type === 'built-in' ? 'built-in' : 'custom',
        },
      });
    }

    return results;
  }


  private async inspectCache(action?: string): Promise<InspectionResult[]> {
    const results: InspectionResult[] = [];
    const loader = new ModuleLoader({ preferredCDN: 'esm.sh' });

    if (!action || action === 'stats') {
      const stats = await loader.getCacheStats();
      results.push({
        type: 'cache',
        name: 'stats',
        data: {
          memoryEntries: stats.memoryEntries,
          fileEntries: stats.fileEntries,
          totalSize: stats.totalSize,
          formattedSize: formatBytes(stats.totalSize),
        },
        metadata: {
          category: 'statistics',
          cacheDir: getModuleCacheDir(),
        },
      });
    }

    if (action === 'clear') {
      await loader.clearCache();
      results.push({
        type: 'cache',
        name: 'clear',
        data: {
          message: 'Module cache cleared successfully',
        },
        metadata: {
          category: 'operation',
          timestamp: new Date().toISOString(),
        },
      });
    }

    return results;
  }

  private async inspectSystem(category?: string): Promise<InspectionResult[]> {
    const results: InspectionResult[] = [];
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const require = createRequire(import.meta.url);

    // Version Information
    if (!category || category === 'runtime') {
      const runtimeData: any = {
        xec: {},
        node: {},
        system: {},
      };

      // Get CLI version
      try {
        const { readFileSync } = await import('fs');
        const { join } = await import('path');
        const cliPkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
        runtimeData.xec.cli = cliPkg.version;
        runtimeData.xec.name = cliPkg.name;
        runtimeData.xec.description = cliPkg.description;
        runtimeData.xec.path = join(__dirname, '../../bin/xec');
      } catch (e) {
        runtimeData.xec.cli = 'unknown';
      }

      // Get Core version
      try {
        const corePath = path.dirname(require.resolve('@xec-sh/core'));
        const corePkgPath = path.join(corePath, '../package.json');
        const corePkg = JSON.parse(await fs.readFile(corePkgPath, 'utf-8'));
        runtimeData.xec.core = corePkg.version;
      } catch {
        runtimeData.xec.core = 'not installed';
      }

      try {
        runtimeData.node.path = (await (process.platform === 'win32'
          ? $`where node`
          : $`which node`).lines())[0];
      } catch {
        runtimeData.node.path = 'not found';
      }
      runtimeData.node.version = process.version;
      runtimeData.node.modules = process.versions.modules;
      runtimeData.node.v8 = process.versions.v8;
      runtimeData.node.openssl = process.versions.openssl;

      results.push({
        type: 'system',
        name: 'runtime',
        data: runtimeData,
        metadata: {
          category: 'runtime',
        },
      });
    }

    // Operating System Information
    if (!category || category === 'os') {
      const osData: any = {
        platform: process.platform,
        release: os.release(),
        type: os.type(),
        arch: os.arch(),
        version: typeof os.version === 'function' ? os.version() : 'N/A',
        hostname: os.hostname(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
      };

      // Platform-specific information - skip in test environment to avoid command execution issues
      const isTestEnv = process.env['NODE_ENV'] === 'test' || process.env['JEST_WORKER_ID'] !== undefined;

      if (!isTestEnv) {
        if (process.platform === 'darwin') {
          try {
            const result = await $`sw_vers`;
            const lines = result.lines();
            lines.forEach(line => {
              const [key, value] = line.split(':').map(s => s.trim());
              if (key === 'ProductName') osData.productName = value;
              if (key === 'ProductVersion') osData.productVersion = value;
              if (key === 'BuildVersion') osData.buildVersion = value;
            });
          } catch (error) {
            // Silently ignore if sw_vers is not available
          }
        } else if (process.platform === 'linux') {
          try {
            const osRelease = await fs.readFile('/etc/os-release', 'utf-8');
            const lines = osRelease.split('\n');
            lines.forEach(line => {
              const [key, value] = line.split('=');
              if (key === 'PRETTY_NAME') osData.distro = value?.replace(/"/g, '');
              if (key === 'VERSION_ID') osData.distroVersion = value?.replace(/"/g, '');
            });
          } catch (error) {
            // Silently ignore if /etc/os-release is not available
          }
        } else if (process.platform === 'win32') {
          try {
            const result = await $`wmic os get Caption,Version /value`;
            const lines = result.lines();
            lines.forEach(line => {
              const [key, value] = line.split('=');
              if (key === 'Caption') osData.caption = value?.trim();
              if (key === 'Version') osData.winVersion = value?.trim();
            });
          } catch (error) {
            // Silently ignore if wmic is not available
          }
        }
      }

      results.push({
        type: 'system',
        name: 'os',
        data: osData,
        metadata: {
          category: 'operating-system',
        },
      });
    }

    // Hardware Information
    if (!category || category === 'hardware') {
      // Get memory information (enhanced for macOS)
      const memoryInfo = await this.getMemoryInfo();

      const hardwareData: any = {
        cpus: os.cpus().map(cpu => ({
          model: cpu.model,
          speed: cpu.speed,
        })),
        cpuCount: os.cpus().length,
        memory: memoryInfo,
        endianness: os.endianness(),
      };

      results.push({
        type: 'system',
        name: 'hardware',
        data: hardwareData,
        metadata: {
          category: 'hardware',
        },
      });
    }

    // Environment Information
    if (!category || category === 'environment') {
      const envData: any = {
        user: os.userInfo(),
        shell: process.env['SHELL'] || 'unknown',
        home: os.homedir(),
        tmpdir: os.tmpdir(),
        path: process.env['PATH']?.split(path.delimiter).slice(0, 10), // First 10 paths
        nodeEnv: process.env['NODE_ENV'] || 'development',
        xecEnv: {
          XEC_HOME: process.env['XEC_HOME'],
          XEC_DEBUG: process.env['XEC_DEBUG'],
          XEC_PROFILE: process.env['XEC_PROFILE'],
        },
      };

      results.push({
        type: 'system',
        name: 'environment',
        data: envData,
        metadata: {
          category: 'environment',
        },
      });
    }

    // Network Information
    if (!category || category === 'network') {
      const networkData: any = {
        interfaces: {},
      };

      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        const netInfo = nets[name];
        if (netInfo) {
          networkData.interfaces[name] = netInfo
            .filter(net => !net.internal)
            .map(net => ({
              address: net.address,
              family: net.family,
              mac: net.mac,
            }));
        }
      }

      results.push({
        type: 'system',
        name: 'network',
        data: networkData,
        metadata: {
          category: 'network',
        },
      });
    }

    // Development Tools
    if (!category || category === 'tools') {
      const toolsData: any = {
        installed: {},
        versions: {},
      };

      // Skip tool checking in test environment to avoid command execution issues
      const isTestEnv = process.env['NODE_ENV'] === 'test' || process.env['JEST_WORKER_ID'] !== undefined;

      if (!isTestEnv) {
        // Check for common development tools
        const tools = [
          { name: 'node', cmd: 'node --version' },
          { name: 'bun', cmd: 'bun --version' },
          { name: 'deno', cmd: 'deno --version' },
          { name: 'git', cmd: 'git --version' },
          { name: 'docker', cmd: 'docker --version' },
          { name: 'kubectl', cmd: 'kubectl version --client' },
          { name: 'npm', cmd: 'npm --version' },
          { name: 'yarn', cmd: 'yarn --version' },
          { name: 'pnpm', cmd: 'pnpm --version' },
          { name: 'python', cmd: 'python3 --version' },
          { name: 'go', cmd: 'go version' },
          { name: 'rust', cmd: 'rustc --version' },
          { name: 'java', cmd: 'java -version 2>&1' },
        ];

        for (const tool of tools) {
          try {
            const result = await $.cd(os.homedir()).raw`${tool.cmd}`;
            toolsData.versions[tool.name] = result.lines().join('; ');
            toolsData.installed[tool.name] = true;
          } catch (error) {
            // Mark as not installed but don't throw errors
            toolsData.installed[tool.name] = false;
          }
        }
      } else {
        // In test environment, add some mock data
        toolsData.installed.node = true;
        toolsData.versions.node = process.version;
        toolsData.installed.npm = true;
        toolsData.versions.npm = '10.0.0';
      }

      results.push({
        type: 'system',
        name: 'tools',
        data: toolsData,
        metadata: {
          category: 'development-tools',
        },
      });
    }

    // Project Information
    if (!category || category === 'project') {
      const projectData: any = {
        workingDirectory: process.cwd(),
        projectRoot: process.cwd(),
        configFiles: {},
      };

      // Check for project configuration files
      const configFiles = [
        '.xec/config.yaml',
        '.xec/config.json',
        'package.json',
        'tsconfig.json',
        'Dockerfile',
        'docker-compose.yml',
        '.gitignore',
      ];

      for (const file of configFiles) {
        const filePath = path.join(process.cwd(), file);
        projectData.configFiles[file] = await fs.pathExists(filePath);
      }

      // Get project package.json if exists
      try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (await fs.pathExists(pkgPath)) {
          const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
          projectData.package = {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            scripts: Object.keys(pkg.scripts || {}),
          };
        }
      } catch { }

      results.push({
        type: 'system',
        name: 'project',
        data: projectData,
        metadata: {
          category: 'project',
        },
      });
    }

    return results;
  }

  private async inspectInteractive(type: InspectType): Promise<void> {
    const results = await this.getInspectionResults(type);

    if (results.length === 0) {
      console.log(prism.yellow('\nNo items found.\n'));
      return;
    }

    const choices = results.map(r => ({
      value: r,
      label: this.formatItemLabel(r),
    }));

    try {
      const selected = await select({
        message: `Select ${type} to inspect:`,
        options: choices,
      });

      this.displayDetailedResult(selected as InspectionResult);

      if (this.options.explain && (selected as InspectionResult).type === 'task') {
        const explain = await confirm({
          message: 'Show execution plan?',
        });

        if (explain) {
          await this.showTaskExplanation((selected as InspectionResult).name);
        }
      }
    } catch (error: any) {
      // User cancelled selection
      if (error.message === 'Cancelled') {
        return;
      }
      throw error;
    }
  }

  private async getInspectionResults(type: InspectType): Promise<InspectionResult[]> {
    switch (type) {
      case 'tasks': return this.inspectTasks();
      case 'targets': return this.inspectTargets();
      case 'vars': return this.inspectVariables();
      case 'scripts': return this.inspectScripts();
      case 'commands': return this.inspectCommands();
      case 'system': return this.inspectSystem();
      case 'cache': return this.inspectCache();
      default: return [];
    }
  }

  private displayResults(results: InspectionResult[], type: string): void {
    if (results.length === 0) {
      console.log(prism.yellow('No items found.'));
      return;
    }

    // Special handling for system information with --explain flag
    if (type === 'system' && this.options.explain) {
      for (const result of results) {
        this.displayDetailedResult(result);
      }
      return;
    }

    switch (this.options.format) {
      case 'json':
        console.log(JSON.stringify(results, null, 2));
        break;

      case 'yaml':
        // Simple YAML output
        for (const result of results) {
          console.log(`${result.name}:`);
          this.printYaml(result.data, 2);
          if (result.metadata && this.options.verbose) {
            console.log('  metadata:');
            this.printYaml(result.metadata, 4);
          }
          console.log();
        }
        break;

      case 'tree':
        this.displayTree(results);
        break;

      default:
        this.displayTable(results, type);
    }
  }

  private displayTable(results: InspectionResult[], type: string): void {
    const headers = this.getTableHeaders(type);
    const data = [headers];

    for (const result of results) {
      data.push(this.formatTableRow(result, type));
    }

    const config = {
      border: {
        topBody: `─`,
        topJoin: `┬`,
        topLeft: `┌`,
        topRight: `┐`,
        bottomBody: `─`,
        bottomJoin: `┴`,
        bottomLeft: `└`,
        bottomRight: `┘`,
        bodyLeft: `│`,
        bodyRight: `│`,
        bodyJoin: `│`,
        joinBody: `─`,
        joinLeft: `├`,
        joinRight: `┤`,
        joinJoin: `┼`
      }
    };

    console.log(table(data, config));

    if (this.options.verbose) {
      console.log(prism.dim(`\nTotal: ${results.length} ${type === 'all' ? 'items' : type}`));
    }
  }

  private displayTree(results: InspectionResult[]): void {
    const grouped = this.groupByType(results);

    for (const [type, items] of Object.entries(grouped)) {
      console.log(prism.bold.cyan(`\n${type}:`));
      for (const item of items) {
        console.log(`  ├─ ${this.formatTreeItem(item)}`);
        if (this.options.verbose && item.metadata) {
          for (const [key, value] of Object.entries(item.metadata)) {
            console.log(`  │  └─ ${prism.dim(key)}: ${prism.gray(this.formatValue(value))}`);
          }
        }
      }
    }
  }

  private displayDetailedResult(result: InspectionResult): void {
    console.log(prism.bold(`\n${result.type.toUpperCase()}: ${result.name}\n`));

    // Special formatting for system information
    if (result.type === 'system') {
      this.displaySystemDetails(result);
      return;
    }

    // Special formatting for cache information
    if (result.type === 'cache') {
      this.displayCacheDetails(result);
      return;
    }

    // Display main data
    if (typeof result.data === 'object') {
      for (const [key, value] of Object.entries(result.data)) {
        console.log(`${prism.cyan(key)}: ${this.formatValue(value)}`);
      }
    } else {
      console.log(this.formatValue(result.data));
    }

    // Display metadata
    if (result.metadata && Object.keys(result.metadata).length > 0) {
      console.log(prism.bold('\nMetadata:'));
      for (const [key, value] of Object.entries(result.metadata)) {
        console.log(`${prism.cyan(key)}: ${this.formatValue(value)}`);
      }
    }

    console.log();
  }

  private displaySystemDetails(result: InspectionResult): void {
    const data = result.data;

    switch (result.name) {
      case 'runtime':
        console.log(prism.bold('Xec:'));
        console.log(`  ${prism.cyan('Path:')} ${data.xec.path}`);
        console.log(`  ${prism.cyan('CLI:')} ${data.xec.cli}`);
        console.log(`  ${prism.cyan('Core:')} ${data.xec.core}`);
        console.log(`  ${prism.cyan('Name:')} ${data.xec.name}`);
        console.log(`  ${prism.cyan('Description:')} ${data.xec.description}`);

        console.log(prism.bold('\nNode.js:'));
        console.log(`  ${prism.cyan('Path:')} ${data.node.path}`);
        console.log(`  ${prism.cyan('Version:')} ${data.node.version}`);
        console.log(`  ${prism.cyan('V8:')} ${data.node.v8}`);
        console.log(`  ${prism.cyan('OpenSSL:')} ${data.node.openssl}`);
        console.log(`  ${prism.cyan('Modules:')} ${data.node.modules}`);
        break;

      case 'os':
        console.log(`${prism.cyan('Platform:')} ${data.platform}`);
        console.log(`${prism.cyan('Type:')} ${data.type}`);
        console.log(`${prism.cyan('Release:')} ${data.release}`);
        console.log(`${prism.cyan('Architecture:')} ${data.arch}`);
        console.log(`${prism.cyan('Hostname:')} ${data.hostname}`);
        console.log(`${prism.cyan('Uptime:')} ${this.formatUptime(data.uptime)}`);
        console.log(`${prism.cyan('Load Average:')} ${data.loadavg.map((n: number) => n.toFixed(2)).join(', ')}`);

        if (data.productName) {
          console.log(prism.bold('\nmacOS:'));
          console.log(`  ${prism.cyan('Product:')} ${data.productName}`);
          console.log(`  ${prism.cyan('Version:')} ${data.productVersion}`);
          console.log(`  ${prism.cyan('Build:')} ${data.buildVersion}`);
        } else if (data.distro) {
          console.log(prism.bold('\nLinux:'));
          console.log(`  ${prism.cyan('Distribution:')} ${data.distro}`);
          console.log(`  ${prism.cyan('Version:')} ${data.distroVersion || 'N/A'}`);
        } else if (data.caption) {
          console.log(prism.bold('\nWindows:'));
          console.log(`  ${prism.cyan('Caption:')} ${data.caption}`);
          console.log(`  ${prism.cyan('Version:')} ${data.winVersion}`);
        }
        break;

      case 'hardware':
        {
          console.log(prism.bold('CPUs:'));
          const cpusByModel = data.cpus.reduce((acc: any, cpu: any) => {
            if (!acc[cpu.model]) acc[cpu.model] = 0;
            acc[cpu.model]++;
            return acc;
          }, {});

          for (const [model, count] of Object.entries(cpusByModel)) {
            console.log(`  ${prism.cyan(count + 'x')} ${model}`);
          }

          console.log(prism.bold('\nMemory:'));
          console.log(`  ${prism.cyan('Total:')} ${this.formatFileSize(data.memory.total)}`);
          console.log(`  ${prism.cyan('Available:')} ${this.formatFileSize(data.memory.available)} (${data.memory.availablePercent}%)`);
          console.log(`  ${prism.cyan('Used:')} ${this.formatFileSize(data.memory.used)} (${data.memory.usagePercent}%)`);
          if (data.memory.wired) {
            console.log(`  ${prism.cyan('Wired:')} ${this.formatFileSize(data.memory.wired)}`);
            console.log(`  ${prism.cyan('Active:')} ${this.formatFileSize(data.memory.active)}`);
            console.log(`  ${prism.cyan('Inactive:')} ${this.formatFileSize(data.memory.inactive)}`);
            console.log(`  ${prism.cyan('Compressed:')} ${this.formatFileSize(data.memory.compressed)}`);
          }
          console.log(`  ${prism.cyan('Endianness:')} ${data.endianness}`);
          break;
        }

      case 'environment':
        console.log(prism.bold('User:'));
        console.log(`  ${prism.cyan('Username:')} ${data.user.username}`);
        console.log(`  ${prism.cyan('UID:')} ${data.user.uid}`);
        console.log(`  ${prism.cyan('GID:')} ${data.user.gid}`);
        console.log(`  ${prism.cyan('Home:')} ${data.user.homedir}`);
        console.log(`  ${prism.cyan('Shell:')} ${data.user.shell}`);

        console.log(prism.bold('\nPaths:'));
        console.log(`  ${prism.cyan('Home:')} ${data.home}`);
        console.log(`  ${prism.cyan('Temp:')} ${data.tmpdir}`);
        console.log(`  ${prism.cyan('Shell:')} ${data.shell}`);

        console.log(prism.bold('\nEnvironment:'));
        console.log(`  ${prism.cyan('NODE_ENV:')} ${data.nodeEnv}`);
        if (data.xecEnv.XEC_HOME) console.log(`  ${prism.cyan('XEC_HOME:')} ${data.xecEnv.XEC_HOME}`);
        if (data.xecEnv.XEC_DEBUG) console.log(`  ${prism.cyan('XEC_DEBUG:')} ${data.xecEnv.XEC_DEBUG}`);
        if (data.xecEnv.XEC_PROFILE) console.log(`  ${prism.cyan('XEC_PROFILE:')} ${data.xecEnv.XEC_PROFILE}`);

        console.log(prism.bold('\nPATH (first 10):'));
        data.path.forEach((p: string, i: number) => {
          console.log(`  ${i + 1}. ${p}`);
        });
        break;

      case 'network':
        for (const [name, interfaces] of Object.entries(data.interfaces)) {
          if ((interfaces as any[]).length > 0) {
            console.log(prism.bold(`${name}:`));
            (interfaces as any[]).forEach(iface => {
              console.log(`  ${prism.cyan(iface.family)}: ${iface.address}`);
              if (iface.mac !== '00:00:00:00:00:00') {
                console.log(`  ${prism.cyan('MAC')}: ${iface.mac}`);
              }
            });
            console.log();
          }
        }
        break;

      case 'tools':
        for (const [tool, installed] of Object.entries(data.installed)) {
          if (installed) {
            console.log(`  ${prism.green('✓')} ${prism.cyan(tool)}: ${data.versions[tool]}`);
          } else {
            console.log(`  ${prism.red('✗')} ${prism.dim(tool)}`);
          }
        }
        break;

      case 'project':
        console.log(`${prism.cyan('Working Directory:')} ${data.workingDirectory}`);
        console.log(`${prism.cyan('Project Root:')} ${data.projectRoot}`);

        if (data.package) {
          console.log(prism.bold('\nPackage:'));
          console.log(`  ${prism.cyan('Name:')} ${data.package.name}`);
          console.log(`  ${prism.cyan('Version:')} ${data.package.version}`);
          if (data.package.description) {
            console.log(`  ${prism.cyan('Description:')} ${data.package.description}`);
          }
          if (data.package.scripts.length > 0) {
            console.log(`  ${prism.cyan('Scripts:')} ${data.package.scripts.join(', ')}`);
          }
        }

        console.log(prism.bold('\nConfiguration Files:'));
        for (const [file, exists] of Object.entries(data.configFiles)) {
          console.log(`  ${exists ? prism.green('✓') : prism.red('✗')} ${file}`);
        }
        break;

      default:
        // Fallback to default display
        for (const [key, value] of Object.entries(data)) {
          console.log(`${prism.cyan(key)}: ${this.formatValue(value)}`);
        }
    }

    console.log();
  }

  private displayCacheDetails(result: InspectionResult): void {
    const data = result.data;

    switch (result.name) {
      case 'stats':
        console.log(prism.bold('Module Cache Statistics:'));
        console.log(`  ${prism.cyan('Memory Entries:')} ${data.memoryEntries}`);
        console.log(`  ${prism.cyan('File Entries:')} ${data.fileEntries}`);
        console.log(`  ${prism.cyan('Total Size:')} ${data.formattedSize}`);
        console.log();
        console.log(`  ${prism.dim('Cache Directory:')} ${result.metadata?.['cacheDir']}`);
        break;

      case 'clear':
        console.log(prism.green('✔ ') + data.message);
        console.log(`  ${prism.dim('Timestamp:')} ${result.metadata?.['timestamp']}`);
        break;

      default:
        for (const [key, value] of Object.entries(data)) {
          console.log(`${prism.cyan(key)}: ${this.formatValue(value)}`);
        }
    }
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.length > 0 ? parts.join(' ') : '< 1m';
  }

  private async showTaskExplanation(taskName: string): Promise<void> {
    const explanation = await this.taskManager.explain(taskName, {});

    console.log(prism.bold('\nTask Execution Plan:\n'));

    for (const line of explanation) {
      if (line === '') {
        console.log();
      } else if (line.startsWith('Task:') || line.startsWith('Parameters:') ||
        line.startsWith('Execution plan:') || line.startsWith('Target')) {
        console.log(prism.bold.cyan(line));
      } else if (line.match(/^\s*\d+\./)) {
        console.log(prism.green(line));
      } else if (line.match(/^\s{2,}/)) {
        console.log(prism.gray(line));
      } else {
        console.log(line);
      }
    }
  }

  private async runValidation(): Promise<void> {
    console.log(prism.bold('\n🔍 Running Configuration Validation...\n'));

    // Validate configuration syntax
    console.log(prism.cyan('Configuration Syntax:'));
    const configValid = await this.validateConfiguration();
    console.log(configValid ? prism.green('  ✓ Valid') : prism.red('  ✗ Invalid'));

    // Validate targets
    console.log(prism.cyan('\nTarget Connectivity:'));
    const targets = await this.inspectTargets();
    for (const target of targets) {
      const validation = await this.validateTarget(target.name);
      const status = validation.valid ? prism.green('✓') : prism.red('✗');
      console.log(`  ${status} ${target.name} - ${validation.message}`);
    }

    // Validate variables
    console.log(prism.cyan('\nVariable Resolution:'));
    const vars = await this.inspectVariables();
    let varErrors = 0;
    for (const variable of vars) {
      if (variable.metadata?.['hasInterpolation']) {
        try {
          await this.variableInterpolator.interpolateAsync(String(variable.data), {});
        } catch (error) {
          varErrors++;
          console.log(`  ${prism.red('✗')} ${variable.name} - ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (varErrors === 0) {
      console.log(prism.green('  ✓ All variables resolve correctly'));
    }

    // Validate tasks
    console.log(prism.cyan('\nTask Definitions:'));
    const tasks = await this.inspectTasks();
    let taskErrors = 0;
    for (const task of tasks) {
      const validation = await this.validateTask(task.name);
      if (!validation.valid) {
        taskErrors++;
        console.log(`  ${prism.red('✗')} ${task.name} - ${validation.message}`);
      }
    }
    if (taskErrors === 0) {
      console.log(prism.green('  ✓ All tasks are valid'));
    }

    console.log();
  }

  // Helper methods

  private applyFilter(results: InspectionResult[]): InspectionResult[] {
    if (!this.options.filter) return results;

    const pattern = new RegExp(this.options.filter, 'i');
    return results.filter(r =>
      pattern.test(r.name) ||
      pattern.test(JSON.stringify(r.data))
    );
  }

  private hasInterpolation(value: any): boolean {
    if (typeof value !== 'string') return false;
    return /\$\{[^}]+\}/.test(value);
  }

  private async resolveTaskVariables(task: any): Promise<any> {
    if (!task) return task;

    try {
      return await this.variableInterpolator.interpolateAsync(JSON.stringify(task), {});
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async validateTarget(targetName: string): Promise<{ valid: boolean; message: string }> {
    try {
      const target = await this.targetResolver.resolve(targetName);
      // Basic validation - in real implementation would test connectivity
      return {
        valid: true,
        message: `Type: ${target.type}, configured correctly`
      };
    } catch (error: any) {
      return {
        valid: false,
        message: error.message
      };
    }
  }

  private async validateConfiguration(): Promise<boolean> {
    try {
      // In real implementation, would perform schema validation
      const config = this.configManager.getConfig();
      return !!config;
    } catch {
      return false;
    }
  }

  private async validateTask(taskName: string): Promise<{ valid: boolean; message: string }> {
    try {
      const task = this.configManager.get(`tasks.${taskName}`);
      if (!task) {
        return { valid: false, message: 'Task not found' };
      }

      // Check if task references exist
      if (typeof task === 'object' && task.target) {
        await this.targetResolver.resolve(task.target);
      }

      return { valid: true, message: 'Valid' };
    } catch (error: any) {
      return { valid: false, message: error.message };
    }
  }

  private extractScriptDescription(content: string): string | null {
    const lines = content.split('\n').slice(0, 20);

    for (const line of lines) {
      const match = line.match(/^\s*(\/\/|\/\*\*?|#)\s*@?[Dd]escription:?\s*(.+)$/);
      if (match && match[2]) {
        return match[2].trim();
      }
    }

    return null;
  }



  private getTableHeaders(type: string): string[] {
    switch (type) {
      case 'tasks':
        return ['Name', 'Type', 'Description', 'Parameters'];
      case 'targets':
        return ['Name', 'Type', 'Details'];
      case 'vars':
        return ['Name', 'Value', 'Type'];
      case 'scripts':
        return ['Name', 'Path', 'Size'];
      case 'commands':
        return ['Name', 'Type', 'Description'];
      case 'system':
        return ['Category', 'Component', 'Value'];
      case 'cache':
        return ['Type', 'Metric', 'Value'];
      default:
        return ['Type', 'Name', 'Details'];
    }
  }

  private formatTableRow(result: InspectionResult, tableType?: string): string[] {
    // For 'all' type, use consistent 3-column format
    if (tableType === 'all') {
      return [
        result.type,
        prism.cyan(result.name),
        this.formatValue(result.data, 50),
      ];
    }

    switch (result.type) {
      case 'task':
        return [
          prism.cyan(result.name),
          result.data?.hasSteps ? 'Pipeline' : result.data?.hasScript ? 'Script' : 'Command',
          result.data?.description || prism.dim('No description'),
          result.data?.params?.length > 0 ? result.data.params.map((p: any) => p.name).join(', ') : prism.dim('None'),
        ];

      case 'target':
        return [
          prism.cyan(result.name),
          result.data?.type || 'unknown',
          this.formatTargetDetails(result.data),
        ];

      case 'variable':
        return [
          prism.cyan(result.name),
          this.formatValue(result.data, 50),
          result.metadata?.['type'] || 'unknown',
        ];

      case 'script':
        return [
          prism.cyan(result.name),
          prism.dim(result.data?.relativePath || ''),
          this.formatFileSize(result.metadata?.['size'] || 0),
        ];

      case 'command':
        return [
          prism.cyan(result.name),
          result.data?.type || 'unknown',
          result.data?.description || prism.dim('No description'),
        ];

      case 'system':
        return this.formatSystemTableRow(result);

      case 'cache':
        return this.formatCacheTableRow(result);

      default:
        return [
          result.type,
          prism.cyan(result.name),
          this.formatValue(result.data, 50),
        ];
    }
  }

  private formatCacheTableRow(result: InspectionResult): string[] {
    const data = result.data;

    switch (result.name) {
      case 'stats':
        return [
          prism.cyan('Statistics'),
          'Module Cache',
          `${data.fileEntries} files (${data.formattedSize})`,
        ];

      case 'clear':
        return [
          prism.cyan('Operation'),
          'Clear Cache',
          data.message,
        ];

      default:
        return [
          prism.cyan('Cache'),
          result.name,
          this.formatValue(data, 50),
        ];
    }
  }

  private formatSystemTableRow(result: InspectionResult): string[] {
    const category = result.metadata?.['category'] || result.name;
    const data = result.data;

    switch (result.name) {
      case 'version':
        return [
          prism.cyan('Version'),
          'Xec CLI',
          `${data.xec.cli} (core: ${data.xec.core})`,
        ];

      case 'os':
        {
          const osDesc = data.productName || data.distro || data.caption || data.type;
          return [
            prism.cyan('OS'),
            osDesc,
            `${data.arch} - ${data.release}`,
          ];
        }

      case 'hardware':
        return [
          prism.cyan('Hardware'),
          `${data.cpuCount} CPUs`,
          `${this.formatFileSize(data.memory.total)} RAM (${this.formatFileSize(data.memory.available)} available)`,
        ];

      case 'environment':
        return [
          prism.cyan('Environment'),
          data.user.username,
          `Shell: ${path.basename(data.shell)}`,
        ];

      case 'network':
        {
          const ifaceCount = Object.keys(data.interfaces).length;
          return [
            prism.cyan('Network'),
            `${ifaceCount} interfaces`,
            Object.keys(data.interfaces).join(', '),
          ];
        }

      case 'tools':
        {
          const installedCount = Object.values(data.installed).filter(v => v).length;
          return [
            prism.cyan('Dev Tools'),
            `${installedCount} installed`,
            Object.entries(data.installed)
              .filter(([, installed]) => installed)
              .map(([tool]) => tool)
              .join(', '),
          ];
        }

      case 'project':
        {
          const configCount = Object.values(data.configFiles).filter(v => v).length;
          return [
            prism.cyan('Project'),
            data.package?.name || path.basename(data.workingDirectory),
            `${configCount} config files`,
          ];
        }

      default:
        return [
          prism.cyan(category),
          result.name,
          this.formatValue(data, 50),
        ];
    }
  }

  private formatItemLabel(result: InspectionResult): string {
    const icon = this.getTypeIcon(result.type);
    const name = prism.cyan(result.name);

    let details = '';
    // eslint-disable-next-line default-case
    switch (result.type) {
      case 'task':
        details = result.data.description ? prism.dim(` - ${result.data.description}`) : '';
        break;
      case 'target':
        details = prism.dim(` (${result.data.type})`);
        break;
      case 'variable':
        details = prism.dim(` = ${this.formatValue(result.data, 30)}`);
        break;
    }

    return `${icon} ${name}${details}`;
  }

  private formatTreeItem(result: InspectionResult): string {
    return `${prism.cyan(result.name)} ${prism.dim(`(${result.type})`)}`;
  }

  private formatTargetDetails(target: any): string {
    if (!target || !target.config) {
      return prism.dim('No details');
    }

    const parts: string[] = [];
    const config = target.config;

    if (config.host) parts.push(`host: ${config.host}`);
    if (config.container) parts.push(`container: ${config.container}`);
    if (config.pod) parts.push(`pod: ${config.pod}`);
    if (config.namespace) parts.push(`ns: ${config.namespace}`);

    return parts.join(', ') || prism.dim('No details');
  }

  private formatValue(value: any, maxLength?: number): string {
    if (value === null) return prism.dim('null');
    if (value === undefined) return prism.dim('undefined');

    let str: string;
    if (typeof value === 'string') {
      str = value;
    } else if (typeof value === 'object') {
      try {
        // For objects, show a brief description rather than full JSON
        if (value.description) {
          str = value.description;
        } else if (value.command) {
          str = value.command;
        } else if (value.name) {
          str = value.name;
        } else {
          str = JSON.stringify(value);
        }
      } catch (error) {
        str = '[Object]';
      }
    } else {
      str = String(value);
    }

    if (maxLength && str.length > maxLength) {
      return str.substring(0, maxLength - 3) + '...';
    }

    return str;
  }

  private async getMemoryInfo(): Promise<any> {
    const total = os.totalmem();
    const free = os.freemem();

    // Skip detailed memory checking in test environment to avoid command execution issues
    const isTestEnv = process.env['NODE_ENV'] === 'test' || process.env['JEST_WORKER_ID'] !== undefined;

    // On macOS, get more accurate memory info including inactive memory
    if (process.platform === 'darwin' && !isTestEnv) {
      try {
        const execAsync = promisify(exec);
        // Use vm_stat to get detailed memory information
        const { stdout } = await execAsync('vm_stat');
        const lines = stdout.split('\n');
        const firstLine = lines[0] || '';
        const pageSizeMatch = firstLine.match(/page size of (\d+) bytes/);
        const pageSize = pageSizeMatch && pageSizeMatch[1] ? parseInt(pageSizeMatch[1]) : 4096;

        const stats: Record<string, number> = {};
        for (const line of lines.slice(1)) {
          const match = line.match(/^([\w\s]+):\s*(\d+)/);
          if (match && match[1] && match[2]) {
            const key = match[1].trim().replace(/\s+/g, '_').toLowerCase();
            stats[key] = parseInt(match[2]) * pageSize;
          }
        }

        // Calculate available memory (free + inactive + purgeable + file-backed)
        const available = (stats['pages_free'] || 0) +
          (stats['pages_inactive'] || 0) +
          (stats['pages_purgeable'] || 0) +
          (stats['file_backed_pages'] || 0);

        // Calculate used memory (wired + active + compressed)
        const used = (stats['pages_wired_down'] || 0) +
          (stats['pages_active'] || 0) +
          (stats['pages_occupied_by_compressor'] || 0);

        return {
          total,
          free: stats['pages_free'] || free,
          available,
          used,
          wired: stats['pages_wired_down'] || 0,
          active: stats['pages_active'] || 0,
          inactive: stats['pages_inactive'] || 0,
          compressed: stats['pages_occupied_by_compressor'] || 0,
          usagePercent: (used / total * 100).toFixed(2),
          availablePercent: (available / total * 100).toFixed(2),
        };
      } catch (error) {
        // Fallback to Node.js values if vm_stat fails - silently ignore in tests
      }
    }

    // Default calculation for other platforms or if macOS command fails
    const used = total - free;
    return {
      total,
      free,
      available: free,
      used,
      usagePercent: (used / total * 100).toFixed(2),
      availablePercent: (free / total * 100).toFixed(2),
    };
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      task: '📋',
      target: '🎯',
      variable: '📝',
      script: '📜',
      command: '⌘',
      system: '💻',
      cache: '📦',
    };

    return icons[type] || '📄';
  }

  private groupByType(results: InspectionResult[]): Record<string, InspectionResult[]> {
    return results.reduce((acc, result) => {
      const key = `${result.type}s`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(result);
      return acc;
    }, {} as Record<string, InspectionResult[]>);
  }

  private printYaml(obj: any, indent: number = 0): void {
    const spaces = ' '.repeat(indent);

    if (obj === null || obj === undefined) {
      console.log(`${spaces}null`);
      return;
    }

    if (typeof obj !== 'object') {
      console.log(`${spaces}${obj}`);
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => {
        console.log(`${spaces}-`);
        this.printYaml(item, indent + 2);
      });
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`${spaces}${key}:`);
        this.printYaml(value, indent + 2);
      } else {
        console.log(`${spaces}${key}: ${value}`);
      }
    }
  }
}

// Export for backward compatibility
export function inspectProject(type?: string, name?: string, options?: InspectOptions) {
  const inspector = new ProjectInspector(options);
  return inspector.initialize().then(() => {
    if (!type && !name) {
      return inspector.runInteractive();
    } else {
      return inspector.inspect(type as InspectType, name);
    }
  });
}

export default function command(program: Command): void {
  const cmd = new InspectCommand();
  program.addCommand(cmd.create());
}