import * as yaml from 'js-yaml';
import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { log, box, text, note, prism, intro, outro, cancel, select, confirm, spinner, isCancel, password } from '@xec-sh/kit';

import { BaseCommand } from '../utils/command-base.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { sortConfigKeys, getDefaultConfig, mergeWithDefaults } from '../config/defaults.js';


/**
 * Config command implementation
 */
export class ConfigCommand extends BaseCommand {
  protected override configManager!: ConfigurationManager;

  constructor() {
    super({
      name: 'config',
      description: 'Manage Xec configuration',
      aliases: ['conf', 'cfg']
    });
  }

  /**
   * Create command with subcommands
   */
  override create(): Command {
    const cmd = new Command(this.config.name)
      .description(this.config.description);

    // Add aliases
    if (this.config.aliases) {
      this.config.aliases.forEach(alias => cmd.alias(alias));
    }

    // Set up action for when no subcommand is provided
    cmd.action(async () => {
      await this.execute([]);
    });

    // Set up subcommands
    this.setupSubcommands(cmd);

    return cmd;
  }

  override async execute(args: string[]): Promise<void> {
    await this.ensureInitialized();

    // If no subcommand specified, show interactive mode
    if (process.stdin.isTTY) {
      await this.interactiveMode();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.configManager) {
      this.configManager = new ConfigurationManager({
        projectRoot: process.cwd(),
        profile: undefined
      });
    }
  }

  private setupSubcommands(cmd: Command): void {
    // Get command - get configuration value by key
    cmd
      .command('get <key>')
      .description('Get configuration value by key (use dot notation for nested values)')
      .action(async (key) => {
        await this.ensureInitialized();
        await this.getConfigValue(key);
      });

    // Set command - set configuration value
    cmd
      .command('set <key> <value>')
      .description('Set configuration value (use dot notation for nested values)')
      .option('--json', 'Parse value as JSON')
      .action(async (key, value, options) => {
        await this.ensureInitialized();
        await this.setConfigValue(key, value, options);
      });

    // Unset command - remove configuration value
    cmd
      .command('unset <key>')
      .description('Remove configuration value')
      .action(async (key) => {
        await this.ensureInitialized();
        await this.unsetConfigValue(key);
      });

    // List command - list all configuration
    cmd
      .command('list')
      .description('List all configuration values')
      .option('--json', 'Output as JSON')
      .option('--path <path>', 'List values under specific path')
      .action(async (options) => {
        await this.ensureInitialized();
        await this.listConfig(options);
      });

    // View command (alias for list)
    cmd
      .command('view')
      .description('View current configuration (alias for list)')
      .option('--defaults', 'Show default values in dimmer color')
      .action(async (options) => {
        await this.ensureInitialized();
        await this.viewConfig(options);
      });

    // Doctor command
    cmd
      .command('doctor')
      .description('Check and fix configuration issues')
      .option('--defaults', 'Show all possible configuration options with default values')
      .action(async (options) => {
        await this.ensureInitialized();
        await this.runDoctor(options);
      });

    // Validate command
    cmd
      .command('validate')
      .description('Validate configuration')
      .action(async () => {
        await this.ensureInitialized();
        await this.validateConfig();
      });

    // Set up target subcommands
    this.setupTargetCommands(cmd);

    // Set up variable subcommands
    this.setupVarCommands(cmd);

    // Set up task subcommands
    this.setupTaskCommands(cmd);

    // Set up defaults subcommands
    this.setupDefaultsCommands(cmd);
  }

  private setupTargetCommands(parent: Command): void {
    const targets = parent
      .command('targets')
      .description('Manage targets');

    targets
      .command('list')
      .description('List all targets')
      .action(async () => {
        await this.ensureInitialized();
        await this.listTargets();
      });

    targets
      .command('add')
      .description('Add new target')
      .action(async () => {
        await this.ensureInitialized();
        await this.addTarget();
      });

    targets
      .command('edit <name>')
      .description('Edit target')
      .action(async (name) => {
        await this.ensureInitialized();
        await this.editTargetWithName(name);
      });

    targets
      .command('delete <name>')
      .description('Delete target')
      .action(async (name) => {
        await this.ensureInitialized();
        await this.deleteTargetWithName(name);
      });
  }

  private setupVarCommands(parent: Command): void {
    const vars = parent
      .command('vars')
      .description('Manage variables');

    vars
      .command('list')
      .description('List all variables')
      .action(async () => {
        await this.ensureInitialized();
        await this.listVars();
      });

    vars
      .command('set <key> [value]')
      .description('Set variable')
      .action(async (key, value) => {
        await this.ensureInitialized();
        await this.setVarWithKeyValue(key, value);
      });

    vars
      .command('delete <key>')
      .description('Delete variable')
      .action(async (key) => {
        await this.ensureInitialized();
        await this.deleteVarWithKey(key);
      });

    vars
      .command('import <file>')
      .description('Import variables from file')
      .action(async (file) => {
        await this.ensureInitialized();
        await this.importVarsFromFile(file);
      });

    vars
      .command('export <file>')
      .description('Export variables to file')
      .action(async (file) => {
        await this.ensureInitialized();
        await this.exportVarsToFile(file);
      });
  }

  private setupTaskCommands(parent: Command): void {
    const tasks = parent
      .command('tasks')
      .description('Manage tasks');

    tasks
      .command('list')
      .description('List all tasks')
      .action(async () => {
        await this.ensureInitialized();
        await this.listTasks();
      });

    tasks
      .command('view <name>')
      .description('View task details')
      .action(async (name) => {
        await this.ensureInitialized();
        await this.viewTaskWithName(name);
      });

    tasks
      .command('create')
      .description('Create new task')
      .action(async () => {
        await this.ensureInitialized();
        await this.createTask();
      });

    tasks
      .command('delete <name>')
      .description('Delete task')
      .action(async (name) => {
        await this.ensureInitialized();
        await this.deleteTaskWithName(name);
      });

    tasks
      .command('validate')
      .description('Validate all tasks')
      .action(async () => {
        await this.ensureInitialized();
        await this.validateTasks();
      });
  }

  private setupDefaultsCommands(parent: Command): void {
    const defaults = parent
      .command('defaults')
      .description('Manage default configurations');

    defaults
      .command('view')
      .description('View current defaults')
      .action(async () => {
        await this.ensureInitialized();
        await this.viewDefaults();
      });

    defaults
      .command('ssh')
      .description('Set SSH defaults')
      .action(async () => {
        await this.ensureInitialized();
        await this.setSSHDefaults();
      });

    defaults
      .command('docker')
      .description('Set Docker defaults')
      .action(async () => {
        await this.ensureInitialized();
        await this.setDockerDefaults();
      });

    defaults
      .command('k8s')
      .description('Set Kubernetes defaults')
      .action(async () => {
        await this.ensureInitialized();
        await this.setK8sDefaults();
      });

    defaults
      .command('commands')
      .description('Set command defaults')
      .action(async () => {
        await this.ensureInitialized();
        await this.setCommandDefaults();
      });

    defaults
      .command('reset')
      .description('Reset to system defaults')
      .action(async () => {
        await this.ensureInitialized();
        await this.resetDefaults();
      });
  }

  private async interactiveMode(): Promise<void> {
    intro('🔧 Xec Configuration Manager');

    while (true) {
      const action = await select({
        message: 'What would you like to do?',
        options: [
          { value: 'view', label: '📖 View configuration' },
          { value: 'targets', label: '🎯 Manage targets' },
          { value: 'vars', label: '📝 Manage variables' },
          { value: 'tasks', label: '⚡ Manage tasks' },
          { value: 'defaults', label: '⚙️  Manage defaults' },
          { value: 'custom', label: '🔧 Manage custom parameters' },
          { value: 'doctor', label: '🏥 Run doctor (add all defaults)' },
          { value: 'validate', label: '✅ Validate configuration' },
          { value: 'exit', label: '❌ Exit' },
        ],
      });

      if (isCancel(action)) {
        cancel('Configuration management cancelled');
        break;
      }

      if (action === 'exit') {
        outro('✨ Configuration management completed');
        break;
      }

      // eslint-disable-next-line default-case
      switch (action) {
        case 'view':
          await this.viewConfig({ defaults: true });
          break;
        case 'targets':
          await this.manageTargets();
          break;
        case 'vars':
          await this.manageVars();
          break;
        case 'tasks':
          await this.manageTasks();
          break;
        case 'defaults':
          await this.manageDefaults();
          break;
        case 'custom':
          await this.manageCustomParameters();
          break;
        case 'doctor': {
          const showDefaults = await confirm({
            message: 'Show all possible configuration options with default values?',
            initialValue: false
          });
          if (!isCancel(showDefaults)) {
            await this.runDoctor({ defaults: showDefaults });
          }
          break;
        }
        case 'validate':
          await this.validateConfig();
          break;
      }
    }
  }

  private async viewConfig(options?: { defaults?: boolean }): Promise<void> {
    const config = await this.configManager.load();

    if (options?.defaults) {
      // Merge with defaults and show default values in dimmer color
      const defaults = getDefaultConfig();
      const merged = mergeWithDefaults(config, defaults);
      const sorted = sortConfigKeys(merged);

      // Custom YAML formatter to dim default values
      const formattedYaml = this.formatYamlWithDefaults(sorted, config, '');
      box(formattedYaml, '📖 Configuration (with defaults)', {
        width: 'auto',
        contentAlign: 'left',
        contentPadding: 1,
        rounded: true,
        formatBorder: (text_) => prism.dim(text_)
      });
    } else {
      // Sort config keys according to defined order
      const sorted = sortConfigKeys(config);
      box(yaml.dump(sorted, { indent: 2 }), '📖 Current Configuration', {
        width: 'auto',
        contentAlign: 'left',
        contentPadding: 1,
        rounded: true,
        formatBorder: (text_) => prism.green(text_)
      });
    }
  }

  private formatYamlWithDefaults(obj: any, userConfig: any, path: string, indent: number = 0): string {
    const defaults = getDefaultConfig();
    let result = '';
    const indentStr = '  '.repeat(indent);

    for (const key in obj) {
      const fullPath = path ? `${path}.${key}` : key;
      const value = obj[key];
      const userValue = userConfig?.[key];
      const isUserDefined = userValue !== undefined;

      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        result += `${indentStr}${key}:\n`;
        result += this.formatYamlWithDefaults(value, userValue || {}, fullPath, indent + 1);
      } else {
        const valueStr = yaml.dump({ [key]: value }, { indent: 2 })
          .replace(/^\{\s*/, '')
          .replace(/\s*\}$/, '')
          .trim();

        if (isUserDefined) {
          result += `${indentStr}${valueStr}\n`;
        } else {
          // Dim default values
          result += prism.dim(`${indentStr}${valueStr}`) + '\n';
        }
      }
    }

    return result;
  }

  private async getConfigValue(key: string): Promise<void> {
    const config = await this.configManager.load();

    // Navigate through nested properties using dot notation
    const keys = key.split('.');
    let value: any = config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        log.error(`Configuration key '${key}' not found`);
        return;
      }
    }

    // Format output based on value type
    const content = typeof value === 'object'
      ? yaml.dump(value, { indent: 2 })
      : String(value);

    note(content, `Value for '${key}'`, {
      format: (line) => prism.cyan(line)
    });
  }

  private async setConfigValue(key: string, value: string, options: { json?: boolean }): Promise<void> {
    const config = await this.configManager.load();

    // Parse value if JSON flag is set
    let parsedValue: any = value;
    if (options.json) {
      try {
        parsedValue = JSON.parse(value);
      } catch (error) {
        log.error(`Invalid JSON value: ${error}`);
        return;
      }
    } else {
      // Try to parse as number or boolean
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value)) && value !== '') parsedValue = Number(value);
    }

    // Navigate through nested properties using dot notation
    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let target: any = config;

    // Create nested structure if needed
    for (const k of keys) {
      if (!target[k] || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    // Set the value
    target[lastKey] = parsedValue;

    await this.saveConfig(config);
    log.success(`Configuration value '${key}' set successfully`);
  }

  private async unsetConfigValue(key: string): Promise<void> {
    const config = await this.configManager.load();

    // Navigate through nested properties using dot notation
    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let target: any = config;

    for (const k of keys) {
      if (target && typeof target === 'object' && k in target) {
        target = target[k];
      } else {
        log.error(`Configuration key '${key}' not found`);
        return;
      }
    }

    if (target && typeof target === 'object' && lastKey in target) {
      delete target[lastKey];
      await this.saveConfig(config);
      log.success(`Configuration value '${key}' removed successfully`);
    } else {
      log.error(`Configuration key '${key}' not found`);
    }
  }

  private async listConfig(options: { json?: boolean; path?: string }): Promise<void> {
    const config = await this.configManager.load();

    // Get the subset of config to display
    let displayConfig: any = config;
    if (options.path) {
      const keys = options.path.split('.');
      for (const k of keys) {
        if (displayConfig && typeof displayConfig === 'object' && k in displayConfig) {
          displayConfig = displayConfig[k];
        } else {
          log.error(`Configuration path '${options.path}' not found`);
          return;
        }
      }
    }

    // Format output
    const content = options.json
      ? JSON.stringify(displayConfig, null, 2)
      : yaml.dump(displayConfig, { indent: 2, sortKeys: false });

    const title = options.path
      ? `📋 Configuration at '${options.path}'`
      : '📋 All Configuration';

    box(content, title, {
      contentAlign: 'left',
      contentPadding: 1,
      rounded: true,
      formatBorder: (text_) => prism.blue(text_)
    });
  }

  private async manageTargets(): Promise<void> {
    while (true) {
      const action = await select({
        message: 'Target management',
        options: [
          { value: 'list', label: 'List all targets' },
          { value: 'add', label: 'Add new target' },
          { value: 'edit', label: 'Edit existing target' },
          { value: 'delete', label: 'Delete target' },
          { value: 'back', label: '← Back to main menu' },
        ],
      });

      if (isCancel(action)) return;
      if (action === 'back') return;

      // eslint-disable-next-line default-case
      switch (action) {
        case 'list':
          await this.listTargets();
          break;
        case 'add':
          await this.addTarget();
          break;
        case 'edit':
          await this.editTarget();
          break;
        case 'delete':
          await this.deleteTarget();
          break;
      }
    }
  }

  private async listTargets(): Promise<void> {
    const config = await this.configManager.load();
    const targets = config.targets || {};

    let content = '';

    // Local target
    if (targets.local) {
      content += prism.bold('Local Target:\n');
      content += `  📍 local (type: local)\n`;
    }

    // SSH hosts
    if (targets.hosts && Object.keys(targets.hosts).length > 0) {
      content += '\n' + prism.bold('SSH Hosts:\n');
      for (const [name, host] of Object.entries(targets.hosts)) {
        content += prism.cyan(`  🖥️  ${name}`) + prism.dim(` (${(host as any).host}:${(host as any).port || 22})`) + '\n';
      }
    }

    // Docker containers
    if (targets.containers && Object.keys(targets.containers).length > 0) {
      content += '\n' + prism.bold('Docker Containers:\n');
      for (const [name, container] of Object.entries(targets.containers)) {
        content += prism.blue(`  🐳 ${name}`) + prism.dim(` (${(container as any).container || (container as any).image})`) + '\n';
      }
    }

    // Kubernetes pods
    if (targets.pods && Object.keys(targets.pods).length > 0) {
      content += '\n' + prism.bold('Kubernetes Pods:\n');
      for (const [name, pod] of Object.entries(targets.pods)) {
        content += prism.yellow(`  ☸️  ${name}`) + prism.dim(` (${(pod as any).namespace || 'default'}/${(pod as any).pod})`) + '\n';
      }
    }

    if (!content.trim()) {
      note('No targets configured yet. Use "xec config" to add targets.', '🎯 Targets', {
        format: (line) => prism.dim(line)
      });
    } else {
      box(content.trim(), '🎯 Configured Targets', {
        width: 'auto',
        contentAlign: 'left',
        contentPadding: 1,
        rounded: true,
        formatBorder: (text_) => prism.magenta(text_)
      });
    }
  }

  private async addTarget(): Promise<void> {
    const targetType = await select({
      message: 'Select target type',
      options: [
        { value: 'ssh', label: '🖥️  SSH Host' },
        { value: 'docker', label: '🐳 Docker Container' },
        { value: 'kubernetes', label: '☸️  Kubernetes Pod' },
      ],
    }) as string;

    if (isCancel(targetType)) return;

    const name = await text({
      message: 'Target name',
      placeholder: 'my-target',
      validate: (value) => {
        if (!value) return 'Name is required';
        if (!/^[a-z0-9-]+$/.test(value)) return 'Name must contain only lowercase letters, numbers, and hyphens';
        return undefined;
      },
    }) as string;

    if (isCancel(name)) return;

    let targetConfig: any = { type: targetType };

    // eslint-disable-next-line default-case
    switch (targetType) {
      case 'ssh':
        targetConfig = await this.promptSSHConfig();
        break;
      case 'docker':
        targetConfig = await this.promptDockerConfig();
        break;
      case 'kubernetes':
        targetConfig = await this.promptK8sConfig();
        break;
    }

    if (!targetConfig) return;

    // Load current config
    const config = await this.configManager.load();

    // Ensure targets structure exists
    if (!config.targets) config.targets = {};

    // Add target to appropriate section
    // eslint-disable-next-line default-case
    switch (targetType) {
      case 'ssh':
        if (!config.targets.hosts) config.targets.hosts = {};
        config.targets.hosts[name] = targetConfig;
        break;
      case 'docker':
        if (!config.targets.containers) config.targets.containers = {};
        config.targets.containers[name] = targetConfig;
        break;
      case 'kubernetes':
        if (!config.targets.pods) config.targets.pods = {};
        config.targets.pods[name] = targetConfig;
        break;
    }

    // Save config
    await this.saveConfig(config);
    log.success(`Target '${name}' added successfully`);
  }

  private async promptSSHConfig(currentConfig?: any): Promise<any> {
    const host = await text({
      message: 'SSH host',
      placeholder: 'example.com',
      initialValue: currentConfig?.host || '',
      validate: (value) => value ? undefined : 'Host is required',
    }) as string;

    if (isCancel(host)) return null;

    const port = await text({
      message: 'SSH port',
      placeholder: '22',
      initialValue: currentConfig?.port?.toString() || '',
      defaultValue: '22',
    }) as string;

    if (isCancel(port)) return null;

    const username = await text({
      message: 'SSH username',
      placeholder: 'user',
      initialValue: currentConfig?.username || '',
      validate: (value) => value ? undefined : 'Username is required',
    }) as string;

    if (isCancel(username)) return null;

    // Determine default auth method based on current config
    const defaultAuthMethod = currentConfig?.privateKey ? 'key' :
      currentConfig?.password ? 'password' : 'key';

    const authMethod = await select({
      message: 'Authentication method',
      options: [
        { value: 'key', label: '🔑 SSH Key' },
        { value: 'password', label: '🔒 Password (not recommended)' },
      ],
      initialValue: defaultAuthMethod,
    }) as string;

    if (isCancel(authMethod)) return null;

    const config: any = {
      type: 'ssh',
      host,
      port: parseInt(port),
      username,
    };

    if (authMethod === 'key') {
      const privateKey = await text({
        message: 'Path to SSH private key',
        placeholder: '~/.ssh/id_rsa',
        initialValue: currentConfig?.privateKey || '',
        defaultValue: '~/.ssh/id_rsa',
      }) as string;

      if (isCancel(privateKey)) return null;
      config.privateKey = privateKey;

      const passphrase = await password({
        message: 'SSH key passphrase (optional)',
      }) as string;

      if (passphrase && !isCancel(passphrase)) {
        log.warn('⚠️  Passphrase will be stored in plain text. Consider using the secrets command instead.');
        config.passphrase = passphrase;
      }
    } else {
      log.error('❌ Password authentication is not supported in config. Use the secrets command to manage passwords securely.');
      return null;
    }

    return config;
  }

  private async promptDockerConfig(currentConfig?: any): Promise<any> {
    const useContainer = await confirm({
      message: 'Use existing container?',
      initialValue: !!currentConfig?.container,
    });

    const config: any = { type: 'docker' };

    if (useContainer) {
      const container = await text({
        message: 'Container name or ID',
        placeholder: 'my-container',
        initialValue: currentConfig?.container || '',
        validate: (value) => value ? undefined : 'Container is required',
      }) as string;

      if (isCancel(container)) return null;
      config.container = container;
    } else {
      const image = await text({
        message: 'Docker image',
        placeholder: 'ubuntu:latest',
        initialValue: currentConfig?.image || '',
        validate: (value) => value ? undefined : 'Image is required',
      }) as string;

      if (isCancel(image)) return null;
      config.image = image;

      const workdir = await text({
        message: 'Working directory (optional)',
        placeholder: '/app',
        initialValue: currentConfig?.workdir || '',
      }) as string;

      if (workdir && !isCancel(workdir)) {
        config.workdir = workdir;
      }
    }

    return config;
  }

  private async promptK8sConfig(currentConfig?: any): Promise<any> {
    const pod = await text({
      message: 'Pod name',
      placeholder: 'my-pod',
      initialValue: currentConfig?.pod || '',
      validate: (value) => value ? undefined : 'Pod name is required',
    }) as string;

    if (isCancel(pod)) return null;

    const namespace = await text({
      message: 'Namespace',
      placeholder: 'default',
      initialValue: currentConfig?.namespace || '',
      defaultValue: 'default',
    }) as string;

    if (isCancel(namespace)) return null;

    const container = await text({
      message: 'Container name (for multi-container pods)',
      placeholder: 'main',
      initialValue: currentConfig?.container || '',
    }) as string;

    const config: any = {
      type: 'kubernetes',
      pod,
      namespace,
    };

    if (container && !isCancel(container)) {
      config.container = container;
    }

    const context = await text({
      message: 'Kubernetes context (optional)',
      placeholder: 'default',
    }) as string;

    if (context && !isCancel(context)) {
      config.context = context;
    }

    return config;
  }

  private async editTarget(): Promise<void> {
    const config = await this.configManager.load();
    const allTargets: string[] = [];

    // Collect all targets
    if (config.targets?.hosts) {
      for (const name of Object.keys(config.targets.hosts)) {
        allTargets.push(`hosts.${name}`);
      }
    }
    if (config.targets?.containers) {
      for (const name of Object.keys(config.targets.containers)) {
        allTargets.push(`containers.${name}`);
      }
    }
    if (config.targets?.pods) {
      for (const name of Object.keys(config.targets.pods)) {
        allTargets.push(`pods.${name}`);
      }
    }

    if (allTargets.length === 0) {
      log.warn('No targets configured');
      return;
    }

    const target = await select({
      message: 'Select target to edit',
      options: allTargets.map(t => ({ value: t, label: t })),
    }) as string;

    if (isCancel(target)) return;

    const [type, name] = target.split('.');

    if (!name) {
      log.error('Invalid target format');
      return;
    }

    // Get current config
    let currentConfig: any;
    // eslint-disable-next-line default-case
    switch (type) {
      case 'hosts':
        currentConfig = config.targets!.hosts![name];
        break;
      case 'containers':
        currentConfig = config.targets!.containers![name];
        break;
      case 'pods':
        currentConfig = config.targets!.pods![name];
        break;
    }

    note(yaml.dump(currentConfig, { indent: 2 }), 'Current configuration', {
      format: (line) => prism.cyan(line)
    });

    const edit = await confirm({
      message: 'Edit this target?',
    });

    if (!edit || isCancel(edit)) return;

    // Re-prompt for new configuration with current values as defaults
    let newConfig: any;
    // eslint-disable-next-line default-case
    switch (type) {
      case 'hosts':
        newConfig = await this.promptSSHConfig(currentConfig);
        break;
      case 'containers':
        newConfig = await this.promptDockerConfig(currentConfig);
        break;
      case 'pods':
        newConfig = await this.promptK8sConfig(currentConfig);
        break;
    }

    if (!newConfig) return;

    // Update config
    if (name) {
      // eslint-disable-next-line default-case
      switch (type) {
        case 'hosts':
          config.targets!.hosts![name] = newConfig;
          break;
        case 'containers':
          config.targets!.containers![name] = newConfig;
          break;
        case 'pods':
          config.targets!.pods![name] = newConfig;
          break;
      }
    }

    await this.saveConfig(config);
    log.success(`Target '${target}' updated successfully`);
  }

  private async deleteTarget(): Promise<void> {
    const config = await this.configManager.load();
    const allTargets: string[] = [];

    // Collect all targets
    if (config.targets?.hosts) {
      for (const name of Object.keys(config.targets.hosts)) {
        allTargets.push(`hosts.${name}`);
      }
    }
    if (config.targets?.containers) {
      for (const name of Object.keys(config.targets.containers)) {
        allTargets.push(`containers.${name}`);
      }
    }
    if (config.targets?.pods) {
      for (const name of Object.keys(config.targets.pods)) {
        allTargets.push(`pods.${name}`);
      }
    }

    if (allTargets.length === 0) {
      log.warn('No targets configured');
      return;
    }

    const target = await select({
      message: 'Select target to delete',
      options: allTargets.map(t => ({ value: t, label: t })),
    }) as string;

    if (isCancel(target)) return;

    const confirmResult = await confirm({
      message: `Are you sure you want to delete '${target}'?`,
    });

    if (!confirmResult || isCancel(confirmResult)) return;

    const [type, name] = target.split('.');

    if (!name) {
      log.error('Invalid target format');
      return;
    }

    // Delete from config
    switch (type) {
      case 'hosts':
        delete config.targets!.hosts![name];
        break;
      case 'containers':
        delete config.targets!.containers![name];
        break;
      case 'pods':
        delete config.targets!.pods![name];
        break;
      default:
    }

    await this.saveConfig(config);
    log.success(`Target '${target}' deleted successfully`);
  }

  private async manageVars(): Promise<void> {
    while (true) {
      const action = await select({
        message: 'Variable management',
        options: [
          { value: 'list', label: 'List all variables' },
          { value: 'set', label: 'Set variable' },
          { value: 'delete', label: 'Delete variable' },
          { value: 'import', label: 'Import from .env file' },
          { value: 'export', label: 'Export to .env file' },
          { value: 'back', label: '← Back to main menu' },
        ],
      });

      if (isCancel(action)) return;
      if (action === 'back') return;

      // eslint-disable-next-line default-case
      switch (action) {
        case 'list':
          await this.listVars();
          break;
        case 'set':
          await this.setVar();
          break;
        case 'delete':
          await this.deleteVar();
          break;
        case 'import':
          await this.importVars();
          break;
        case 'export':
          await this.exportVars();
          break;
      }
    }
  }

  private async listVars(): Promise<void> {
    const config = await this.configManager.load();
    const vars = config.vars || {};

    if (Object.keys(vars).length === 0) {
      note('No variables configured. Use "xec config vars set" to add variables.', '📝 Variables', {
        format: (line) => prism.dim(line)
      });
      return;
    }

    let content = '';
    for (const [key, value] of Object.entries(vars)) {
      // Check if it's a secret reference
      if (typeof value === 'string' && value.startsWith('$secret:')) {
        content += prism.green(key) + ': ' + prism.red('🔒 [secret]') + '\n';
      } else {
        content += prism.green(key) + ': ' + prism.cyan(String(value)) + '\n';
      }
    }

    box(content.trim(), '📝 Variables', {
      contentAlign: 'left',
      contentPadding: 1,
      rounded: true,
      formatBorder: (text_) => prism.blue(text_)
    });
  }

  private async setVar(): Promise<void> {
    const name = await text({
      message: 'Variable name',
      placeholder: 'MY_VAR',
      validate: (value) => {
        if (!value) return 'Name is required';
        if (!/^[A-Z][A-Z0-9_]*$/.test(value)) return 'Variable names should be UPPER_SNAKE_CASE';
        return undefined;
      },
    }) as string;

    if (isCancel(name)) return;

    const isSecret = await confirm({
      message: 'Is this a secret value?',
    });

    if (isCancel(isSecret)) return;

    if (isSecret) {
      log.error('❌ Secrets cannot be managed through the config command. Use the secrets command instead.');
      log.info('Run: xec secrets set ' + name);
      return;
    }

    const value = await text({
      message: 'Variable value',
      placeholder: 'value',
      validate: (v) => v ? undefined : 'Value is required',
    }) as string;

    if (isCancel(value)) return;

    const config = await this.configManager.load();
    if (!config.vars) config.vars = {};
    config.vars[name] = value;

    await this.saveConfig(config);
    log.success(`Variable '${name}' set successfully`);
  }

  private async deleteVar(): Promise<void> {
    const config = await this.configManager.load();
    const vars = config.vars || {};

    if (Object.keys(vars).length === 0) {
      log.info('No variables configured');
      return;
    }

    const name = await select({
      message: 'Select variable to delete',
      options: Object.keys(vars).map(v => ({ value: v, label: v })),
    }) as string;

    if (isCancel(name)) return;

    const confirmResult = await confirm({
      message: `Delete variable '${name}'?`,
    });

    if (!confirmResult || isCancel(confirmResult)) return;

    delete config.vars![name];
    await this.saveConfig(config);
    log.success(`Variable '${name}' deleted successfully`);
  }

  private async importVars(): Promise<void> {
    const envFile = await text({
      message: 'Path to .env file',
      placeholder: '.env',
      defaultValue: '.env',
    }) as string;

    if (isCancel(envFile)) return;

    if (!existsSync(envFile)) {
      log.error(`File not found: ${envFile}`);
      return;
    }

    const content = readFileSync(envFile, 'utf-8');
    const lines = content.split('\n');
    const vars: Record<string, string> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        vars[key] = value;
      }
    }

    if (Object.keys(vars).length === 0) {
      log.warn('No variables found in .env file');
      return;
    }

    const config = await this.configManager.load();
    if (!config.vars) config.vars = {};

    for (const [key, value] of Object.entries(vars)) {
      config.vars[key] = value;
    }

    await this.saveConfig(config);
    log.success(`Imported ${Object.keys(vars).length} variables from ${envFile}`);
  }

  private async exportVars(): Promise<void> {
    const config = await this.configManager.load();
    const vars = config.vars || {};

    if (Object.keys(vars).length === 0) {
      log.info('No variables to export');
      return;
    }

    const envFile = await text({
      message: 'Output .env file',
      placeholder: '.env',
      defaultValue: '.env',
    }) as string;

    if (isCancel(envFile)) return;

    const lines: string[] = ['# Exported from Xec configuration'];
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === 'string' && value.startsWith('$secret:')) {
        lines.push(`# ${key}=[secret - use 'xec secrets get ${key}']`);
      } else {
        lines.push(`${key}="${value}"`);
      }
    }

    writeFileSync(envFile, lines.join('\n'));
    log.success(`Exported ${Object.keys(vars).length} variables to ${envFile}`);
  }

  private async manageTasks(): Promise<void> {
    while (true) {
      const action = await select({
        message: 'Task management',
        options: [
          { value: 'list', label: 'List all tasks' },
          { value: 'view', label: 'View task details' },
          { value: 'create', label: 'Create new task' },
          { value: 'edit', label: 'Edit task' },
          { value: 'delete', label: 'Delete task' },
          { value: 'validate', label: 'Validate tasks' },
          { value: 'back', label: '← Back to main menu' },
        ],
      });

      if (isCancel(action)) return;
      if (action === 'back') return;

      // eslint-disable-next-line default-case
      switch (action) {
        case 'list':
          await this.listTasks();
          break;
        case 'view':
          await this.viewTask();
          break;
        case 'create':
          await this.createTask();
          break;
        case 'edit':
          await this.editTask();
          break;
        case 'delete':
          await this.deleteTask();
          break;
        case 'validate':
          await this.validateTasks();
          break;
      }
    }
  }

  private async listTasks(): Promise<void> {
    const config = await this.configManager.load();
    const taskList = config.tasks || {};

    if (Object.keys(taskList).length === 0) {
      note('No tasks configured. Use "xec config tasks create" to add tasks.', '⚡ Tasks', {
        format: (line) => prism.dim(line)
      });
      return;
    }

    let content = '';
    for (const [name, task] of Object.entries(taskList)) {
      const description = (task as any).description || 'No description';
      content += prism.bold(prism.yellow('⚡ ' + name)) + '\n';
      content += prism.dim('   ' + description) + '\n';
    }

    box(content.trim(), '⚡ Tasks', {
      contentAlign: 'left',
      contentPadding: 1,
      rounded: true,
      formatBorder: (text_) => prism.yellow(text_)
    });
  }

  private async viewTask(): Promise<void> {
    const config = await this.configManager.load();
    const tasks = config.tasks || {};

    if (Object.keys(tasks).length === 0) {
      log.info('No tasks configured');
      return;
    }

    const name = await select({
      message: 'Select task to view',
      options: Object.keys(tasks).map(t => ({ value: t, label: t })),
    }) as string;

    if (isCancel(name)) return;

    const taskConfig = yaml.dump(tasks[name], { indent: 2 });
    box(taskConfig, `⚡ Task: ${name}`, {
      contentAlign: 'left',
      contentPadding: 1,
      rounded: true,
      formatBorder: (text_) => prism.yellow(text_)
    });
  }

  private async createTask(): Promise<void> {
    const name = await text({
      message: 'Task name',
      placeholder: 'my-task',
      validate: (value) => {
        if (!value) return 'Name is required';
        if (!/^[a-z][a-z0-9-]*$/.test(value)) return 'Task names should be lowercase with hyphens';
        return undefined;
      },
    }) as string;

    if (isCancel(name)) return;

    const description = await text({
      message: 'Task description',
      placeholder: 'Describe what this task does',
    }) as string;

    if (isCancel(description)) return;

    const taskType = await select({
      message: 'Task type',
      options: [
        { value: 'command', label: 'Shell command' },
        { value: 'script', label: 'Script file' },
        { value: 'composite', label: 'Multiple steps' },
      ],
    }) as string;

    if (isCancel(taskType)) return;

    const config = await this.configManager.load();
    if (!config.tasks) config.tasks = {};

    const task: any = {
      description,
    };

    // eslint-disable-next-line default-case
    switch (taskType) {
      case 'command':
        {
          const cmd = await text({
            message: 'Command to run',
            placeholder: 'echo "Hello, World!"',
            validate: (value) => value ? undefined : 'Command is required',
          }) as string;
          if (isCancel(cmd)) return;
          task.steps = [{ command: cmd }];
          break;
        }

      case 'script':
        {
          const script = await text({
            message: 'Script file path',
            placeholder: './scripts/my-script.sh',
            validate: (value) => value ? undefined : 'Script path is required',
          }) as string;
          if (isCancel(script)) return;
          task.steps = [{ script }];
          break;
        }

      case 'composite':
        log.info('Multi-step tasks can be edited manually in the config file');
        task.steps = [
          { name: 'Step 1', command: 'echo "Step 1"' },
          { name: 'Step 2', command: 'echo "Step 2"' },
        ];
        break;
    }

    config.tasks[name] = task;
    await this.saveConfig(config);
    log.success(`Task '${name}' created successfully`);
  }

  private async editTask(): Promise<void> {
    log.info('Task editing can be done manually in the config file');
    const configPath = await this.configManager.getConfigPath();
    log.info(`Edit tasks in: ${configPath}`);
  }

  private async deleteTask(): Promise<void> {
    const config = await this.configManager.load();
    const tasks = config.tasks || {};

    if (Object.keys(tasks).length === 0) {
      log.info('No tasks configured');
      return;
    }

    const name = await select({
      message: 'Select task to delete',
      options: Object.keys(tasks).map(t => ({ value: t, label: t })),
    }) as string;

    if (isCancel(name)) return;

    const confirmResult = await confirm({
      message: `Delete task '${name}'?`,
    });

    if (!confirmResult || isCancel(confirmResult)) return;

    delete config.tasks![name];
    await this.saveConfig(config);
    log.success(`Task '${name}' deleted successfully`);
  }

  private async validateTasks(): Promise<void> {
    const config = await this.configManager.load();
    const tasks = config.tasks || {};

    if (Object.keys(tasks).length === 0) {
      log.info('No tasks to validate');
      return;
    }

    log.info('Validating tasks...');

    let hasErrors = false;
    for (const [name, task] of Object.entries(tasks)) {
      const taskConfig = task as any;

      // Check for required fields
      if (!taskConfig.steps || !Array.isArray(taskConfig.steps)) {
        log.error(`Task '${name}': Missing or invalid 'steps' field`);
        hasErrors = true;
        continue;
      }

      // Validate each step
      for (let i = 0; i < taskConfig.steps.length; i++) {
        const step = taskConfig.steps[i];
        if (!step.command && !step.script && !step.task) {
          log.error(`Task '${name}', step ${i + 1}: Must have either 'command', 'script', or 'task'`);
          hasErrors = true;
        }
      }
    }

    if (!hasErrors) {
      log.success('All tasks are valid');
    }
  }

  private async manageDefaults(): Promise<void> {
    while (true) {
      const action = await select({
        message: 'Defaults management',
        options: [
          { value: 'view', label: 'View current defaults' },
          { value: 'ssh', label: 'Set SSH defaults' },
          { value: 'docker', label: 'Set Docker defaults' },
          { value: 'k8s', label: 'Set Kubernetes defaults' },
          { value: 'commands', label: 'Set command defaults' },
          { value: 'reset', label: 'Reset to system defaults' },
          { value: 'back', label: '← Back to main menu' },
        ],
      });

      if (isCancel(action)) return;
      if (action === 'back') return;

      // eslint-disable-next-line default-case
      switch (action) {
        case 'view':
          await this.viewDefaults();
          break;
        case 'ssh':
          await this.setSSHDefaults();
          break;
        case 'docker':
          await this.setDockerDefaults();
          break;
        case 'k8s':
          await this.setK8sDefaults();
          break;
        case 'commands':
          await this.setCommandDefaults();
          break;
        case 'reset':
          await this.resetDefaults();
          break;
      }
    }
  }

  private async manageCustomParameters(): Promise<void> {
    while (true) {
      const action = await select({
        message: 'Custom parameter management',
        options: [
          { value: 'list', label: '📋 List custom parameters' },
          { value: 'set', label: '➕ Set custom parameter' },
          { value: 'get', label: '🔍 Get custom parameter' },
          { value: 'delete', label: '❌ Delete custom parameter' },
          { value: 'export', label: '📤 Export custom parameters' },
          { value: 'back', label: '← Back to main menu' },
        ],
      });

      if (isCancel(action)) return;
      if (action === 'back') return;

      // eslint-disable-next-line default-case
      switch (action) {
        case 'list':
          await this.listCustomParameters();
          break;
        case 'set':
          await this.setCustomParameter();
          break;
        case 'get':
          await this.getCustomParameter();
          break;
        case 'delete':
          await this.deleteCustomParameter();
          break;
        case 'export':
          await this.exportCustomParameters();
          break;
      }
    }
  }

  private readonly MANAGED_KEYS = ['version', 'targets', 'vars', 'tasks', 'defaults', 'commands', 'name', 'description'];

  private isCustomParameter(key: string): boolean {
    const topLevelKey = key.split('.')[0];
    return topLevelKey ? !this.MANAGED_KEYS.includes(topLevelKey) : false;
  }

  private async listCustomParameters(): Promise<void> {
    const config = await this.configManager.load();
    const customParams: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      if (this.isCustomParameter(key)) {
        customParams[key] = value;
      }
    }

    if (Object.keys(customParams).length === 0) {
      note('No custom parameters configured. You can add custom parameters using "xec config"', '🔧 Custom Parameters', {
        format: (line) => prism.dim(line)
      });
      return;
    }

    const content = yaml.dump(customParams, { indent: 2, sortKeys: true });
    box(content, '🔧 Custom Parameters', {
      contentAlign: 'left',
      contentPadding: 1,
      rounded: true,
      formatBorder: (text_) => prism.magenta(text_)
    });
  }

  private async setCustomParameter(): Promise<void> {
    const key = await text({
      message: 'Parameter key (use dot notation for nested values)',
      placeholder: 'myapp.config.port',
      validate: (value) => {
        if (!value) return 'Key is required';
        const topLevelKey = value.split('.')[0];
        if (topLevelKey && this.MANAGED_KEYS.includes(topLevelKey)) {
          return `Cannot set '${topLevelKey}' - this is a managed parameter. Use the appropriate manager instead.`;
        }
        return undefined;
      },
    }) as string;

    if (isCancel(key)) return;

    const valueType = await select({
      message: 'Value type',
      options: [
        { value: 'string', label: 'String' },
        { value: 'number', label: 'Number' },
        { value: 'boolean', label: 'Boolean' },
        { value: 'json', label: 'JSON (for objects/arrays)' },
      ],
    }) as string;

    if (isCancel(valueType)) return;

    let parsedValue: any;

    // eslint-disable-next-line default-case
    switch (valueType) {
      case 'string':
        {
          const stringValue = await text({
            message: 'Value',
            placeholder: 'my-value',
          }) as string;
          if (isCancel(stringValue)) return;
          parsedValue = stringValue;
          break;
        }

      case 'number':
        {
          const numberValue = await text({
            message: 'Value',
            placeholder: '8080',
            validate: (value) => {
              if (!value || isNaN(Number(value))) return 'Must be a valid number';
              return undefined;
            },
          }) as string;
          if (isCancel(numberValue)) return;
          parsedValue = Number(numberValue);
          break;
        }

      case 'boolean':
        {
          const boolValue = await confirm({
            message: 'Value',
          });
          if (isCancel(boolValue)) return;
          parsedValue = boolValue;
          break;
        }

      case 'json':
        {
          const jsonValue = await text({
            message: 'JSON value',
            placeholder: '{"key": "value"}',
            validate: (value) => {
              if (!value) return 'Value is required';
              try {
                JSON.parse(value);
                return undefined;
              } catch (error) {
                return 'Invalid JSON';
              }
            },
          }) as string;
          if (isCancel(jsonValue)) return;
          parsedValue = JSON.parse(jsonValue);
          break;
        }
    }

    const config = await this.configManager.load();

    // Navigate through nested properties using dot notation
    const keys = key.split('.');
    const lastKey = keys.pop()!;
    let target: any = config;

    // Create nested structure if needed
    for (const k of keys) {
      if (!target[k] || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    // Set the value
    target[lastKey] = parsedValue;

    await this.saveConfig(config);
    log.success(`Custom parameter '${key}' set successfully`);
  }

  private async getCustomParameter(): Promise<void> {
    const config = await this.configManager.load();
    const customKeys: string[] = [];

    const collectKeys = (obj: any, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (this.isCustomParameter(fullKey)) {
          customKeys.push(fullKey);
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            collectKeys(value, fullKey);
          }
        }
      }
    };

    collectKeys(config);

    if (customKeys.length === 0) {
      log.info('No custom parameters configured');
      return;
    }

    const key = await select({
      message: 'Select parameter to view',
      options: customKeys.map(k => ({ value: k, label: k })),
    });

    if (isCancel(key) || !key) return;

    await this.getConfigValue(key as string);
  }

  private async deleteCustomParameter(): Promise<void> {
    const config = await this.configManager.load();
    const customKeys: string[] = [];

    const collectKeys = (obj: any, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (this.isCustomParameter(fullKey)) {
          customKeys.push(fullKey);
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            collectKeys(value, fullKey);
          }
        }
      }
    };

    collectKeys(config);

    if (customKeys.length === 0) {
      log.info('No custom parameters to delete');
      return;
    }

    const key = await select({
      message: 'Select parameter to delete',
      options: customKeys.map(k => ({ value: k, label: k })),
    });

    if (isCancel(key) || !key) return;

    const confirmResult = await confirm({
      message: `Delete parameter '${key}'?`,
    });

    if (!confirmResult || isCancel(confirmResult)) return;

    await this.unsetConfigValue(key as string);
  }

  private async exportCustomParameters(): Promise<void> {
    const config = await this.configManager.load();
    const customParams: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      if (this.isCustomParameter(key)) {
        customParams[key] = value;
      }
    }

    if (Object.keys(customParams).length === 0) {
      log.info('No custom parameters to export');
      return;
    }

    const format = await select({
      message: 'Export format',
      options: [
        { value: 'yaml', label: 'YAML' },
        { value: 'json', label: 'JSON' },
      ],
    }) as string;

    if (isCancel(format)) return;

    const filename = await text({
      message: 'Output filename',
      placeholder: format === 'json' ? 'custom-params.json' : 'custom-params.yaml',
      defaultValue: format === 'json' ? 'custom-params.json' : 'custom-params.yaml',
    }) as string;

    if (isCancel(filename)) return;

    const content = format === 'json'
      ? JSON.stringify(customParams, null, 2)
      : yaml.dump(customParams, { indent: 2, sortKeys: false });

    writeFileSync(filename, content);
    log.success(`Custom parameters exported to ${filename}`);
  }

  private async viewDefaults(): Promise<void> {
    const config = await this.configManager.load();
    const defaults = config.targets?.defaults || {};

    if (Object.keys(defaults).length === 0) {
      note('No custom defaults configured. The system defaults are being used.', '⚙️ Defaults', {
        format: (line) => prism.dim(line)
      });
      return;
    }

    const content = yaml.dump(defaults, { indent: 2 });
    box(content, '⚙️ Current Defaults', {
      width: 'auto',
      titleAlign: 'left',
      contentAlign: 'left',
      contentPadding: 1,
      rounded: true,
      formatBorder: (text_) => prism.cyan(text_)
    });
  }

  private async setSSHDefaults(): Promise<void> {
    const config = await this.configManager.load();
    if (!config.targets) config.targets = {};
    if (!config.targets.defaults) config.targets.defaults = {};
    if (!config.targets.defaults.ssh) config.targets.defaults.ssh = {};

    const port = await text({
      message: 'Default SSH port',
      placeholder: '22',
      defaultValue: '22',
    }) as string;

    if (!isCancel(port)) {
      config.targets.defaults.ssh.port = parseInt(port);
    }

    // Note: SSH username and private key are configured per target, not as defaults
    // Only connection-related settings are part of SSH defaults

    const keepAlive = await confirm({
      message: 'Enable SSH keep alive?',
    });

    if (!isCancel(keepAlive)) {
      config.targets.defaults.ssh.keepAlive = keepAlive;
    }

    const keepAliveInterval = await text({
      message: 'Keep alive interval (ms)',
      placeholder: '30000',
      defaultValue: '30000',
    }) as string;

    if (!isCancel(keepAliveInterval)) {
      config.targets.defaults.ssh.keepAliveInterval = parseInt(keepAliveInterval);
    }

    await this.saveConfig(config);
    log.success('SSH defaults updated');
  }

  private async setDockerDefaults(): Promise<void> {
    const config = await this.configManager.load();
    if (!config.targets) config.targets = {};
    if (!config.targets.defaults) config.targets.defaults = {};
    if (!config.targets.defaults.docker) config.targets.defaults.docker = {};

    const workdir = await text({
      message: 'Default working directory',
      placeholder: '/app',
    }) as string;

    if (workdir && !isCancel(workdir)) {
      config.targets.defaults.docker.workdir = workdir;
    }

    const user = await text({
      message: 'Default user',
      placeholder: 'root',
    }) as string;

    if (user && !isCancel(user)) {
      config.targets.defaults.docker.user = user;
    }

    await this.saveConfig(config);
    log.success('Docker defaults updated');
  }

  private async setK8sDefaults(): Promise<void> {
    const config = await this.configManager.load();
    if (!config.targets) config.targets = {};
    if (!config.targets.defaults) config.targets.defaults = {};
    if (!config.targets.defaults.kubernetes) config.targets.defaults.kubernetes = {};

    const namespace = await text({
      message: 'Default namespace',
      placeholder: 'default',
      defaultValue: 'default',
    }) as string;

    if (!isCancel(namespace)) {
      config.targets.defaults.kubernetes.namespace = namespace;
    }

    const context = await text({
      message: 'Default context',
      placeholder: 'Current context',
    }) as string;

    if (context && !isCancel(context)) {
      // Note: context is not part of KubernetesDefaults
    }

    await this.saveConfig(config);
    log.success('Kubernetes defaults updated');
  }

  private async setCommandDefaults(): Promise<void> {
    const config = await this.configManager.load();
    if (!config.commands) config.commands = {};

    const cmd = await select({
      message: 'Select command to configure defaults for',
      options: [
        { value: 'exec', label: 'exec' },
        { value: 'logs', label: 'logs' },
        { value: 'cp', label: 'cp' },
        { value: 'sync', label: 'sync' },
      ],
    }) as string;

    if (isCancel(cmd)) return;

    if (!config.commands[cmd]) config.commands[cmd] = {};

    log.info(`Setting defaults for '${cmd}' command`);

    // Command-specific defaults
    // eslint-disable-next-line default-case
    switch (cmd) {
      case 'logs':
        {
          const tail = await text({
            message: 'Default number of lines to tail',
            placeholder: '50',
            defaultValue: '50',
          }) as string;
          if (!isCancel(tail)) {
            if (!config.commands['logs']) config.commands['logs'] = {};
            config.commands['logs']['tail'] = tail;
          }

          const timestamps = await confirm({
            message: 'Show timestamps by default?',
          });
          if (!isCancel(timestamps)) {
            if (!config.commands['logs']) config.commands['logs'] = {};
            config.commands['logs']['timestamps'] = timestamps;
          }
          break;
        }

      case 'exec':
        {
          const shell = await text({
            message: 'Default shell',
            placeholder: '/bin/sh',
            defaultValue: '/bin/sh',
          }) as string;
          if (!isCancel(shell)) {
            if (!config.commands['exec']) config.commands['exec'] = {};
            config.commands['exec']['shell'] = shell;
          }
          break;
        }

      case 'cp':
      case 'sync':
        {
          const recursive = await confirm({
            message: 'Recursive by default?',
          });
          if (!isCancel(recursive)) {
            if (!config.commands[cmd]) config.commands[cmd] = {};
            config.commands[cmd]['recursive'] = recursive;
          }
          break;
        }
    }

    await this.saveConfig(config);
    log.success(`Defaults for '${cmd}' command updated`);
  }

  private async resetDefaults(): Promise<void> {
    const confirmResult = await confirm({
      message: 'Reset all defaults to system values?',
    });

    if (!confirmResult || isCancel(confirmResult)) return;

    const config = await this.configManager.load();
    if (config.targets?.defaults) {
      delete config.targets.defaults;
    }
    if (config.commands) {
      delete config.commands;
    }

    await this.saveConfig(config);
    log.success('Defaults reset to system values');
  }

  private async runDoctor(options?: { defaults?: boolean }): Promise<void> {
    const s = spinner();
    s.start('🏥 Running configuration doctor...');

    let config = await this.configManager.load();
    const recommendations: string[] = [];
    const defaultConfig = getDefaultConfig();

    // Check for basic configuration
    if (!config.name) {
      recommendations.push('Set project name');
      config.name = await text({
        message: 'Project name',
        placeholder: defaultConfig.name || 'my-project',
      }) as string;
      if (isCancel(config.name)) return;
    }

    if (!config.description) {
      recommendations.push('Add project description');
      config.description = await text({
        message: 'Project description',
        placeholder: defaultConfig.description || 'Describe your project',
      }) as string;
      if (isCancel(config.description)) delete config.description;
    }

    // Ensure all default sections exist
    if (!config.targets) config.targets = {};
    if (!config.targets.defaults) config.targets.defaults = {};

    // Add SSH defaults from defaultConfig
    if (!config.targets.defaults.ssh) {
      config.targets.defaults.ssh = defaultConfig.targets?.defaults?.ssh;
      recommendations.push('Added SSH defaults');
    }

    // Add Docker defaults from defaultConfig
    if (!config.targets.defaults.docker) {
      config.targets.defaults.docker = defaultConfig.targets?.defaults?.docker;
      recommendations.push('Added Docker defaults');
    }

    // Add K8s defaults from defaultConfig
    if (!config.targets.defaults.kubernetes) {
      config.targets.defaults.kubernetes = defaultConfig.targets?.defaults?.kubernetes;
      recommendations.push('Added Kubernetes defaults');
    }

    // Add command defaults from defaultConfig
    if (!config.commands) config.commands = {};

    if (!config.commands['exec']) {
      config.commands['exec'] = defaultConfig.commands?.exec || {};
      recommendations.push('Added exec command defaults');
    }

    if (!config.commands['logs']) {
      config.commands['logs'] = defaultConfig.commands?.logs || {};
      recommendations.push('Added logs command defaults');
    }

    if (!config.commands['cp']) {
      config.commands['cp'] = defaultConfig.commands?.cp || {};
      recommendations.push('Added cp command defaults');
    }

    if (!config.commands['sync']) {
      config.commands['sync'] = defaultConfig.commands?.sync || {};
      recommendations.push('Added sync command defaults');
    }

    // Add secrets configuration if missing
    if (!config.secrets && defaultConfig.secrets) {
      config.secrets = {
        provider: defaultConfig.secrets.provider as 'local' | 'vault' | '1password' | 'aws-secrets' | 'env' | 'dotenv',
        config: defaultConfig.secrets.path ? { path: defaultConfig.secrets.path } : undefined
      };
      recommendations.push('Added secrets configuration');
    }

    if (options?.defaults) {
      // Write all default values to the configuration file
      log.info('📋 Adding all default values to configuration...');
      config = mergeWithDefaults(config, defaultConfig);
    }

    // Sort configuration keys before saving
    config = sortConfigKeys(config);

    // Save updated configuration
    await this.saveConfig(config);

    // Stop spinner
    s.stop('Configuration check complete');

    // Report results
    if (recommendations.length > 0) {
      const content = recommendations.map(rec => `✅ ${rec}`).join('\n');
      box(content, '🏥 Doctor Improvements', {
        width: 'auto',
        contentAlign: 'left',
        contentPadding: 1,
        rounded: true,
        formatBorder: (text_) => prism.green(text_)
      });
    } else {
      note('Configuration is healthy! No changes needed.', '🏥 Doctor', {
        format: (line) => prism.green(line)
      });
    }

    // Validate configuration
    await this.validateConfig();
  }

  private async validateConfig(): Promise<void> {
    const s = spinner();
    s.start('Validating configuration...');

    try {
      const config = await this.configManager.load();

      // Basic validation
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check project name
      if (!config.name) {
        errors.push('Project name is missing');
      }

      // Check targets
      if (config.targets) {
        // Validate SSH hosts
        if (config.targets.hosts) {
          for (const [name, host] of Object.entries(config.targets.hosts)) {
            const h = host as any;
            if (!h.host) {
              errors.push(`SSH host '${name}': missing 'host' field`);
            }
            if (!h.username && !h.user) {
              warnings.push(`SSH host '${name}': no username specified`);
            }
            if (!h.privateKey && !h.password) {
              warnings.push(`SSH host '${name}': no authentication method specified`);
            }
          }
        }

        // Validate Docker containers
        if (config.targets.containers) {
          for (const [name, container] of Object.entries(config.targets.containers)) {
            const c = container as any;
            if (!c.container && !c.image) {
              errors.push(`Docker container '${name}': must specify either 'container' or 'image'`);
            }
          }
        }

        // Validate K8s pods
        if (config.targets.pods) {
          for (const [name, pod] of Object.entries(config.targets.pods)) {
            const p = pod as any;
            if (!p.pod) {
              errors.push(`Kubernetes pod '${name}': missing 'pod' field`);
            }
          }
        }
      }

      // Validate tasks
      if (config.tasks) {
        for (const [name, task] of Object.entries(config.tasks)) {
          const t = task as any;
          if (!t.steps || !Array.isArray(t.steps)) {
            errors.push(`Task '${name}': missing or invalid 'steps' field`);
          } else {
            for (let i = 0; i < t.steps.length; i++) {
              const step = t.steps[i];
              if (!step.command && !step.script && !step.task) {
                errors.push(`Task '${name}', step ${i + 1}: must have either 'command', 'script', or 'task'`);
              }
            }
          }
        }
      }

      // Stop spinner
      s.stop('Validation complete');

      // Report results
      if (errors.length > 0) {
        const content = errors.map(error => `❌ ${error}`).join('\n');
        box(content, '⚠️ Configuration Errors', {
          contentAlign: 'left',
          contentPadding: 1,
          rounded: true,
          formatBorder: (text_) => prism.red(text_)
        });
      }

      if (warnings.length > 0) {
        const content = warnings.map(warning => `⚠️  ${warning}`).join('\n');
        box(content, '⚠️ Configuration Warnings', {
          contentAlign: 'left',
          contentPadding: 1,
          rounded: true,
          formatBorder: (text_) => prism.yellow(text_)
        });
      }

      if (errors.length === 0 && warnings.length === 0) {
        note('Configuration is valid!', '✅ Validation', {
          format: (line) => prism.green(line)
        });
      }
    } catch (error) {
      s.stop('Validation failed');
      log.error(`Failed to validate configuration: ${error}`);
    }
  }


  private async saveConfig(config: any): Promise<void> {
    // Use ConfigurationManager's save method which properly finds the root
    // First, we need to update the configuration in the manager
    // We do this by setting the merged config directly
    (this.configManager as any).merged = config;

    // Now save using the ConfigurationManager which will find the proper location
    await this.configManager.save();

    // Log where config was saved
    const configPath = await this.configManager.getConfigPath();
    if (process.env['XEC_DEBUG']) {
      log.info(`Configuration saved to: ${configPath}`);
    }
  }
  // Wrapper methods for CLI commands with parameters
  private async editTargetWithName(name: string): Promise<void> {
    // Set the target name for editing
    const config = await this.configManager.load();
    const allTargets = [
      ...Object.keys(config.targets?.hosts || {}),
      ...Object.keys(config.targets?.containers || {}),
      ...Object.keys(config.targets?.pods || {})
    ];
    if (!allTargets.includes(name)) {
      console.error(prism.red(`Target '${name}' not found`));
      process.exit(1);
    }
    await this.editTarget();
  }

  private async deleteTargetWithName(name: string): Promise<void> {
    const config = await this.configManager.load();
    const allTargets = [
      ...Object.keys(config.targets?.hosts || {}),
      ...Object.keys(config.targets?.containers || {}),
      ...Object.keys(config.targets?.pods || {})
    ];
    if (!allTargets.includes(name)) {
      console.error(prism.red(`Target '${name}' not found`));
      process.exit(1);
    }
    await this.deleteTarget();
  }

  private async setVarWithKeyValue(key: string, value?: string): Promise<void> {
    await this.setVar();
  }

  private async deleteVarWithKey(key: string): Promise<void> {
    await this.deleteVar();
  }

  private async importVarsFromFile(file: string): Promise<void> {
    await this.importVars();
  }

  private async exportVarsToFile(file: string): Promise<void> {
    await this.exportVars();
  }

  private async viewTaskWithName(name: string): Promise<void> {
    await this.viewTask();
  }

  private async deleteTaskWithName(name: string): Promise<void> {
    await this.deleteTask();
  }
}

/**
 * Export command registration function
 */
export default function command(program: Command): void {
  const cmd = new ConfigCommand();
  program.addCommand(cmd.create());
}