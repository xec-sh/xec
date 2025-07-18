import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { Command } from 'commander';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';

interface ConfigOptions {
  global?: boolean;
  format?: 'yaml' | 'json';
  interactive?: boolean;
  merge?: boolean;
}

export class ConfigCommand extends SubcommandBase {
  constructor() {
    super({
      name: 'config',
      description: 'Manage project configuration',
      examples: [
        {
          command: 'xec project config get defaults.verbose',
          description: 'Get configuration value',
        },
        {
          command: 'xec project config set defaults.verbose true',
          description: 'Set configuration value',
        },
        {
          command: 'xec project config init --interactive',
          description: 'Initialize configuration interactively',
        },
        {
          command: 'xec project config list',
          description: 'List all configuration values',
        },
        {
          command: 'xec project config edit',
          description: 'Edit configuration file',
        },
      ],
    });
  }

  protected setupSubcommands(command: Command): void {
    // xec project config init
    command
      .command('init')
      .description('Initialize project configuration')
      .option('--interactive', 'Interactive configuration setup')
      .option('--format <format>', 'Configuration format (yaml|json)', 'yaml')
      .option('--global', 'Initialize global configuration')
      .action(async (options: ConfigOptions) => {
        this.options = { ...this.options, ...options };
        await this.initConfig(options);
      });

    // xec project config get
    command
      .command('get')
      .description('Get configuration value')
      .argument('<key>', 'Configuration key (dot notation supported)')
      .option('--global', 'Get from global configuration')
      .action(async (key: string, options: ConfigOptions) => {
        this.options = { ...this.options, ...options };
        await this.getConfig(key, options);
      });

    // xec project config set
    command
      .command('set')
      .description('Set configuration value')
      .argument('<key>', 'Configuration key (dot notation supported)')
      .argument('<value>', 'Configuration value')
      .option('--global', 'Set in global configuration')
      .option('--format <format>', 'Value format (string|number|boolean|json)', 'string')
      .action(async (key: string, value: string, options: ConfigOptions & { format?: string }) => {
        this.options = { ...this.options, ...options };
        await this.setConfig(key, value, options);
      });

    // xec project config list
    command
      .command('list')
      .description('List all configuration values')
      .option('--global', 'List global configuration')
      .option('--keys-only', 'Show only keys')
      .action(async (options: ConfigOptions & { keysOnly?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.listConfig(options);
      });

    // xec project config edit
    command
      .command('edit')
      .description('Edit configuration file')
      .option('--global', 'Edit global configuration')
      .option('--editor <editor>', 'Editor to use (defaults to $EDITOR or vim)')
      .action(async (options: ConfigOptions & { editor?: string }) => {
        this.options = { ...this.options, ...options };
        await this.editConfig(options);
      });

    // xec project config validate
    command
      .command('validate')
      .description('Validate configuration file')
      .option('--global', 'Validate global configuration')
      .action(async (options: ConfigOptions) => {
        this.options = { ...this.options, ...options };
        await this.validateConfig(options);
      });

    // xec project config reset
    command
      .command('reset')
      .description('Reset configuration to defaults')
      .option('--global', 'Reset global configuration')
      .option('--force', 'Skip confirmation prompt')
      .action(async (options: ConfigOptions & { force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.resetConfig(options);
      });
  }

  private async initConfig(options: ConfigOptions): Promise<void> {
    const configPath = await this.getConfigPath(options.global);
    const exists = await this.fileExists(configPath);

    if (exists && !options.interactive) {
      const overwrite = await this.confirm('Configuration file already exists. Overwrite?');
      if (!overwrite) {
        this.log('Configuration initialization cancelled', 'info');
        return;
      }
    }

    let config: any = {};

    if (options.interactive) {
      this.intro('Configuration Setup');
      
      config = await this.interactiveConfigSetup();
    } else {
      config = this.getDefaultConfig();
    }

    await this.writeConfig(configPath, config, options.format || 'yaml');
    this.log(`Configuration initialized at ${configPath}`, 'success');
  }

  private async getConfig(key: string, options: ConfigOptions): Promise<void> {
    const config = await this.loadConfig(options.global);
    const value = this.getNestedValue(config, key);

    if (value === undefined) {
      throw errorMessages.configurationInvalid(key, 'Key not found');
    }

    this.output(value, `Configuration: ${key}`);
  }

  private async setConfig(key: string, value: string, options: ConfigOptions & { format?: string }): Promise<void> {
    const config = await this.loadConfig(options.global);
    const parsedValue = this.parseValue(value, options.format);
    
    this.setNestedValue(config, key, parsedValue);
    
    const configPath = await this.getConfigPath(options.global);
    const format = path.extname(configPath).includes('json') ? 'json' : 'yaml';
    
    await this.writeConfig(configPath, config, format);
    this.log(`Configuration updated: ${key} = ${value}`, 'success');
  }

  private async listConfig(options: ConfigOptions & { keysOnly?: boolean }): Promise<void> {
    const config = await this.loadConfig(options.global);
    
    if (options.keysOnly) {
      const keys = this.getAllKeys(config);
      this.formatter.list(keys, 'Configuration Keys');
    } else {
      this.formatter.keyValue(config, 'Configuration');
    }
  }

  private async editConfig(options: ConfigOptions & { editor?: string }): Promise<void> {
    const configPath = await this.getConfigPath(options.global);
    const editor = options.editor || process.env['EDITOR'] || 'vim';
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync(`${editor} ${configPath}`);
      this.log('Configuration file edited', 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('editor', `Failed to open editor: ${error.message}`);
    }
  }

  private async validateConfig(options: ConfigOptions): Promise<void> {
    try {
      await this.loadConfig(options.global);
      this.log('Configuration is valid', 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('file', `Invalid configuration: ${error.message}`);
    }
  }

  private async resetConfig(options: ConfigOptions & { force?: boolean }): Promise<void> {
    if (!options.force) {
      const confirm = await this.confirm('Are you sure you want to reset configuration to defaults?');
      if (!confirm) {
        this.log('Configuration reset cancelled', 'info');
        return;
      }
    }

    const configPath = await this.getConfigPath(options.global);
    const defaultConfig = this.getDefaultConfig();
    const format = path.extname(configPath).includes('json') ? 'json' : 'yaml';
    
    await this.writeConfig(configPath, defaultConfig, format);
    this.log('Configuration reset to defaults', 'success');
  }

  private async interactiveConfigSetup(): Promise<any> {
    const config: any = {};

    config.name = await this.prompt('Project name', path.basename(process.cwd()));
    config.description = await this.prompt('Project description');
    config.author = await this.prompt('Author name');
    config.version = await this.prompt('Version', '1.0.0');

    const environments = await this.confirm('Configure environments?', true);
    if (environments) {
      config.environments = {
        development: { description: 'Development environment' },
        staging: { description: 'Staging environment' },
        production: { description: 'Production environment' },
      };
    }

    const defaults = await this.confirm('Configure defaults?', true);
    if (defaults) {
      config.defaults = {
        verbose: await this.confirm('Enable verbose output by default?', false),
        dryRun: await this.confirm('Enable dry run by default?', false),
        parallel: await this.confirm('Enable parallel execution by default?', false),
      };
    }

    return config;
  }

  private getDefaultConfig(): any {
    return {
      name: path.basename(process.cwd()),
      version: '1.0.0',
      defaults: {
        verbose: false,
        dryRun: false,
        parallel: false,
        timeout: '30m',
      },
      environments: {
        development: { description: 'Development environment' },
        production: { description: 'Production environment' },
      },
    };
  }

  private async getConfigPath(global?: boolean): Promise<string> {
    if (global) {
      const os = require('os');
      return path.join(os.homedir(), '.xec', 'config.yaml');
    }
    
    // Look for existing config files
    const possiblePaths = [
      './xec.config.yaml',
      './xec.config.yml',
      './xec.config.json',
      './.xec/config.yaml',
      './.xec/config.yml',
      './.xec/config.json',
    ];

    for (const configPath of possiblePaths) {
      try {
        await fs.access(configPath);
        return configPath;
      } catch {
        // Continue to next path
      }
    }

    return './xec.config.yaml';
  }

  private async loadConfig(global?: boolean): Promise<any> {
    const configPath = await this.getConfigPath(global);
    
    try {
      const content = await fs.readFile(configPath, 'utf8');
      
      if (configPath.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        return yaml.load(content) || {};
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async writeConfig(configPath: string, config: any, format: string): Promise<void> {
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
    
    let content: string;
    if (format === 'json') {
      content = JSON.stringify(config, null, 2);
    } else {
      content = yaml.dump(config, { lineWidth: -1, noRefs: true });
    }
    
    await fs.writeFile(configPath, content);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getNestedValue(obj: any, key: string): any {
    return key.split('.').reduce((current, part) => current?.[part], obj);
  }

  private setNestedValue(obj: any, key: string, value: any): void {
    const parts = key.split('.');
    const last = parts.pop()!;
    const target = parts.reduce((current, part) => {
      if (current[part] === undefined) {
        current[part] = {};
      }
      return current[part];
    }, obj);
    target[last] = value;
  }

  private parseValue(value: string, format?: string): any {
    switch (format) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'json':
        return JSON.parse(value);
      default:
        return value;
    }
  }

  private getAllKeys(obj: any, prefix = ''): string[] {
    const keys: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        keys.push(...this.getAllKeys(value, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    
    return keys;
  }
}
