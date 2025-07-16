import * as os from 'os';
import chalk from 'chalk';
import * as path from 'path';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { text, confirm } from '@clack/prompts';

import { getProjectRoot } from '../utils/project.js';

interface XecConfig {
  version: string;
  defaults?: {
    verbose?: boolean;
    color?: boolean;
    parallel?: number;
    timeout?: number;
  };
  ssh?: {
    defaultUser?: string;
    defaultPort?: number;
    connectTimeout?: number;
    keepAlive?: boolean;
  };
  docker?: {
    defaultRegistry?: string;
    socketPath?: string;
  };
  paths?: {
    modules?: string;
    recipes?: string;
    scripts?: string;
    state?: string;
  };
  registry?: {
    url?: string;
    token?: string;
  };
  [key: string]: any;
}

export default function configCommand(program: Command) {
  const config = program
    .command('config')
    .description('Manage Xec configuration');

  config
    .command('show')
    .description('Display current configuration')
    .option('--global', 'Show global configuration')
    .option('--local', 'Show local project configuration')
    .option('--merged', 'Show merged configuration (default)', true)
    .option('--json', 'Output as JSON')
    .action(async (options?: any) => {
      try {
        let configData: XecConfig | null = null;

        if (options?.global) {
          configData = await loadGlobalConfig();
        } else if (options?.local) {
          configData = await loadLocalConfig();
        } else {
          // Show merged config (local overrides global)
          const global = await loadGlobalConfig();
          const local = await loadLocalConfig();
          configData = mergeConfigs(global, local);
        }

        if (!configData || Object.keys(configData).length === 0) {
          console.log(chalk.yellow('No configuration found'));
          return;
        }

        if (options?.json) {
          console.log(JSON.stringify(configData, null, 2));
        } else {
          console.log(chalk.bold('\nXec Configuration:\n'));
          displayConfig(configData);
        }
      } catch (error) {
        console.error(chalk.red(`Failed to show config: ${error}`));
        process.exit(1);
      }
    });

  config
    .command('set <key> <value>')
    .description('Set configuration value')
    .option('--global', 'Set in global configuration')
    .option('--local', 'Set in local project configuration')
    .action(async (key: string, value: string, options?: any) => {
      try {
        const isGlobal = options?.global || !options?.local;
        const configPath = isGlobal ? getGlobalConfigPath() : await getLocalConfigPath();
        
        const config = isGlobal ? await loadGlobalConfig() : await loadLocalConfig();
        
        // Parse value
        let parsedValue: any = value;
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
          if (value === 'true') parsedValue = true;
          else if (value === 'false') parsedValue = false;
          else if (/^\d+$/.test(value)) parsedValue = parseInt(value);
          else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value);
        }

        // Set nested key
        setNestedValue(config, key, parsedValue);
        
        // Save config
        await saveConfig(configPath, config);
        
        console.log(chalk.green(`✓ Set ${key} = ${JSON.stringify(parsedValue)} in ${isGlobal ? 'global' : 'local'} config`));
      } catch (error) {
        console.error(chalk.red(`Failed to set config: ${error}`));
        process.exit(1);
      }
    });

  config
    .command('get <key>')
    .description('Get configuration value')
    .option('--global', 'Get from global configuration')
    .option('--local', 'Get from local project configuration')
    .action(async (key: string, options?: any) => {
      try {
        let configData: XecConfig;
        
        if (options?.global) {
          configData = await loadGlobalConfig();
        } else if (options?.local) {
          configData = await loadLocalConfig();
        } else {
          // Get from merged config
          const global = await loadGlobalConfig();
          const local = await loadLocalConfig();
          configData = mergeConfigs(global, local);
        }

        const value = getNestedValue(configData, key);
        
        if (value === undefined) {
          console.log(chalk.yellow(`Key '${key}' not found`));
          process.exit(1);
        }

        console.log(JSON.stringify(value, null, 2));
      } catch (error) {
        console.error(chalk.red(`Failed to get config: ${error}`));
        process.exit(1);
      }
    });

  config
    .command('unset <key>')
    .description('Remove configuration value')
    .option('--global', 'Remove from global configuration')
    .option('--local', 'Remove from local project configuration')
    .action(async (key: string, options?: any) => {
      try {
        const isGlobal = options?.global || !options?.local;
        const configPath = isGlobal ? getGlobalConfigPath() : await getLocalConfigPath();
        
        const config = isGlobal ? await loadGlobalConfig() : await loadLocalConfig();
        
        // Remove nested key
        unsetNestedValue(config, key);
        
        // Save config
        await saveConfig(configPath, config);
        
        console.log(chalk.green(`✓ Removed ${key} from ${isGlobal ? 'global' : 'local'} config`));
      } catch (error) {
        console.error(chalk.red(`Failed to unset config: ${error}`));
        process.exit(1);
      }
    });

  config
    .command('reset')
    .description('Reset configuration to defaults')
    .option('--global', 'Reset global configuration')
    .option('--local', 'Reset local project configuration')
    .option('--force', 'Skip confirmation')
    .action(async (options?: any) => {
      try {
        const isGlobal = options?.global || !options?.local;
        
        if (!options?.force) {
          const confirmed = await confirm({
            message: `Reset ${isGlobal ? 'global' : 'local'} configuration to defaults?`,
            initialValue: false,
          });
          
          if (!confirmed) {
            console.log(chalk.yellow('Reset cancelled'));
            return;
          }
        }

        const configPath = isGlobal ? getGlobalConfigPath() : await getLocalConfigPath();
        const defaultConfig = getDefaultConfig();
        
        await saveConfig(configPath, defaultConfig);
        
        console.log(chalk.green(`✓ ${isGlobal ? 'Global' : 'Local'} configuration reset to defaults`));
      } catch (error) {
        console.error(chalk.red(`Failed to reset config: ${error}`));
        process.exit(1);
      }
    });

  config
    .command('init')
    .description('Initialize configuration file')
    .option('--global', 'Initialize global configuration')
    .option('--local', 'Initialize local project configuration')
    .action(async (options?: any) => {
      try {
        const isGlobal = options?.global;
        const configPath = isGlobal ? getGlobalConfigPath() : await getLocalConfigPath();
        
        // Check if config already exists
        try {
          await fs.access(configPath);
          const overwrite = await confirm({
            message: `Configuration file already exists. Overwrite?`,
            initialValue: false,
          });
          
          if (!overwrite) {
            console.log(chalk.yellow('Initialization cancelled'));
            return;
          }
        } catch {
          // Config doesn't exist, good
        }

        // Create config with defaults
        const defaultConfig = getDefaultConfig();
        
        // Interactive setup
        const setupInteractive = await confirm({
          message: 'Would you like to configure settings interactively?',
          initialValue: true,
        });

        if (setupInteractive) {
          // Verbose output
          const verbose = await confirm({
            message: 'Enable verbose output by default?',
            initialValue: false,
          });
          if (typeof verbose === 'boolean') {
            defaultConfig.defaults!.verbose = verbose;
          }

          // Color output
          const color = await confirm({
            message: 'Enable colored output?',
            initialValue: true,
          });
          if (typeof color === 'boolean') {
            defaultConfig.defaults!.color = color;
          }

          // Parallel execution
          const parallel = await text({
            message: 'Default parallel execution limit:',
            placeholder: '5',
            initialValue: '5',
          }) as string;
          if (parallel) {
            defaultConfig.defaults!.parallel = parseInt(parallel);
          }

          // SSH settings
          const configureSsh = await confirm({
            message: 'Configure SSH defaults?',
            initialValue: false,
          });

          if (configureSsh) {
            const sshUser = await text({
              message: 'Default SSH user:',
              placeholder: 'root',
            }) as string;
            if (sshUser) {
              defaultConfig.ssh!.defaultUser = sshUser;
            }

            const sshPort = await text({
              message: 'Default SSH port:',
              placeholder: '22',
              initialValue: '22',
            }) as string;
            if (sshPort) {
              defaultConfig.ssh!.defaultPort = parseInt(sshPort);
            }
          }
        }

        await saveConfig(configPath, defaultConfig);
        
        console.log(chalk.green(`✓ ${isGlobal ? 'Global' : 'Local'} configuration initialized at ${configPath}`));
      } catch (error) {
        console.error(chalk.red(`Failed to initialize config: ${error}`));
        process.exit(1);
      }
    });
}

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), '.xec', 'config.json');
}

async function getLocalConfigPath(): Promise<string> {
  const projectRoot = await getProjectRoot();
  return path.join(projectRoot, '.xec', 'config.json');
}

async function loadGlobalConfig(): Promise<XecConfig> {
  try {
    const configPath = getGlobalConfigPath();
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return getDefaultConfig();
  }
}

async function loadLocalConfig(): Promise<XecConfig> {
  try {
    const configPath = await getLocalConfigPath();
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return getDefaultConfig();
  }
}

async function saveConfig(configPath: string, config: XecConfig): Promise<void> {
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

function getDefaultConfig(): XecConfig {
  return {
    version: '1.0.0',
    defaults: {
      verbose: false,
      color: true,
      parallel: 5,
      timeout: 300000, // 5 minutes
    },
    ssh: {
      defaultUser: 'root',
      defaultPort: 22,
      connectTimeout: 10000,
      keepAlive: true,
    },
    docker: {
      socketPath: '/var/run/docker.sock',
    },
    paths: {
      modules: '.xec/modules',
      recipes: '.xec/recipes',
      scripts: '.xec/scripts',
      state: '.xec/state',
    },
  };
}

function mergeConfigs(...configs: XecConfig[]): XecConfig {
  return configs.reduce((merged, config) => deepMerge(merged, config), {}) as XecConfig;
}

function deepMerge(target: any, source: any): any {
  if (!source) return target;
  
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

function displayConfig(config: XecConfig, indent: number = 0): void {
  const prefix = ' '.repeat(indent);
  
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      console.log(`${prefix}${chalk.cyan(key)}:`);
      displayConfig(value, indent + 2);
    } else {
      console.log(`${prefix}${chalk.cyan(key)}: ${chalk.white(JSON.stringify(value))}`);
    }
  }
}

function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) continue;
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  
  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

function unsetNestedValue(obj: any, path: string): void {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) return;
    if (!(key in current) || typeof current[key] !== 'object') {
      return;
    }
    current = current[key];
  }
  
  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    delete current[lastKey];
  }
}