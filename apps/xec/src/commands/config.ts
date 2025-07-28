import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { BaseCommand } from '../utils/command-base.js';
import { getConfig, ConfigMigrator } from '../utils/config.js';

interface ConfigGetOptions {
  format?: 'text' | 'json' | 'yaml';
  global?: boolean;
}

interface ConfigSetOptions {
  global?: boolean;
  type?: string;
}

interface ConfigListOptions {
  format?: 'table' | 'json' | 'yaml';
  showValues?: boolean;
}

class ConfigCommand extends BaseCommand {
  constructor() {
    super({
      name: 'config',
      description: 'Manage Xec configuration'
    });
  }

  override create(): Command {
    const config = super.create();

    // Subcommands
    this.addGetCommand(config);
    this.addSetCommand(config);
    this.addUnsetCommand(config);
    this.addListCommand(config);
    this.addEditCommand(config);
    this.addValidateCommand(config);
    this.addProfileCommand(config);
    this.addInitCommand(config);
    this.addMigrateCommand(config);

    return config;
  }

  private addGetCommand(config: Command): void {
    config
      .command('get <key>')
      .description('Get configuration value')
      .option('-f, --format <format>', 'Output format (text|json|yaml)', 'text')
      .option('-g, --global', 'Get from global config')
      .action(async (key: string, options: ConfigGetOptions) => {
        try {
          const configManager = getConfig();
          await configManager.load();

          const value = configManager.getValue(key);

          if (value === undefined) {
            this.log(`Configuration key '${key}' not found`, 'warn');
            process.exit(1);
          }

          switch (options.format) {
            case 'json':
              console.log(JSON.stringify(value, null, 2));
              break;
            
            case 'yaml':
              console.log(yaml.dump(value));
              break;
            
            default:
              if (typeof value === 'object') {
                console.log(JSON.stringify(value, null, 2));
              } else {
                console.log(value);
              }
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addSetCommand(config: Command): void {
    config
      .command('set <key> <value>')
      .description('Set configuration value')
      .option('-g, --global', 'Set in global config')
      .option('-t, --type <type>', 'Value type (string|number|boolean|json)')
      .action(async (key: string, value: string, options: ConfigSetOptions) => {
        try {
          const configManager = getConfig();
          await configManager.load();

          // Parse value based on type
          let parsedValue: any = value;
          if (options.type) {
            switch (options.type) {
              case 'number':
                parsedValue = parseFloat(value);
                if (isNaN(parsedValue)) {
                  throw new Error('Invalid number value');
                }
                break;
              
              case 'boolean':
                parsedValue = value.toLowerCase() === 'true';
                break;
              
              case 'json':
                try {
                  parsedValue = JSON.parse(value);
                } catch {
                  throw new Error('Invalid JSON value');
                }
                break;
            }
          } else {
            // Auto-detect type
            if (value === 'true' || value === 'false') {
              parsedValue = value === 'true';
            } else if (!isNaN(Number(value))) {
              parsedValue = Number(value);
            }
          }

          configManager.setValue(key, parsedValue);
          await configManager.save();

          this.log(`${chalk.green('✓')} Set ${key} = ${JSON.stringify(parsedValue)}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addUnsetCommand(config: Command): void {
    config
      .command('unset <key>')
      .description('Remove configuration value')
      .option('-g, --global', 'Remove from global config')
      .action(async (key: string, options) => {
        try {
          const configManager = getConfig();
          await configManager.load();

          configManager.setValue(key, undefined);
          await configManager.save();

          this.log(`${chalk.green('✓')} Removed ${key}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addListCommand(config: Command): void {
    config
      .command('list')
      .alias('ls')
      .description('List all configuration values')
      .option('-f, --format <format>', 'Output format (table|json|yaml)', 'table')
      .option('--show-values', 'Show all values (including sensitive)')
      .action(async (options: ConfigListOptions) => {
        try {
          const configManager = getConfig();
          await configManager.load();
          const configData = configManager.get();

          switch (options.format) {
            case 'json':
              console.log(JSON.stringify(configData, null, 2));
              break;
            
            case 'yaml':
              console.log(yaml.dump(configData));
              break;
            
            default:
              this.displayConfigTable(configData, '', options.showValues);
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addEditCommand(config: Command): void {
    config
      .command('edit')
      .description('Edit configuration file in editor')
      .option('-g, --global', 'Edit global config')
      .action(async (options) => {
        try {
          const configManager = getConfig();
          const configPaths = configManager.getConfigPaths();
          const configPath = options.global ? configPaths[0] : (configPaths[1] || configPaths[0]);

          if (!configPath || !await fs.pathExists(configPath)) {
            throw new Error(`Configuration file not found: ${configPath || 'none'}`);
          }

          const editor = process.env['EDITOR'] || 'vi';
          this.log(`Opening ${configPath} in ${editor}...`, 'info');

          await $`${editor} ${configPath}`.interactive();

          // Validate after editing
          try {
            await configManager.load();
            this.log(`${chalk.green('✓')} Configuration updated`, 'success');
          } catch (error) {
            this.log('Warning: Configuration may have errors', 'warn');
            throw error;
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addValidateCommand(config: Command): void {
    config
      .command('validate [file]')
      .description('Validate configuration file')
      .action(async (file: string | undefined) => {
        try {
          const configManager = getConfig();
          
          if (file) {
            configManager.addConfigPath(path.resolve(file));
          }

          this.startSpinner('Validating configuration...');

          try {
            await configManager.load();
            this.stopSpinner();
            this.log(`${chalk.green('✓')} Configuration is valid`, 'success');
          } catch (error) {
            this.stopSpinner();
            this.log(`${chalk.red('✗')} Configuration validation failed:`, 'error');
            this.log(`  ${error instanceof Error ? error.message : String(error)}`, 'error');
            process.exit(1);
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addProfileCommand(config: Command): void {
    const profile = config
      .command('profile')
      .description('Manage configuration profiles');

    // List profiles
    profile
      .command('list')
      .description('List available profiles')
      .action(async () => {
        try {
          const configManager = getConfig();
          await configManager.load();

          const profiles = configManager.listProfiles();
          const activeProfile = configManager.getActiveProfile();

          if (profiles.length === 0) {
            this.log('No profiles configured', 'warn');
            return;
          }

          console.log(chalk.bold('Available Profiles:'));
          profiles.forEach(name => {
            const marker = name === activeProfile ? chalk.green(' (active)') : '';
            console.log(`  ${chalk.cyan(name)}${marker}`);
          });
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Activate profile
    profile
      .command('use <name>')
      .description('Activate a profile')
      .action(async (name: string) => {
        try {
          const configManager = getConfig();
          await configManager.load();

          configManager.applyProfile(name);
          
          this.log(`${chalk.green('✓')} Activated profile: ${name}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Create profile
    profile
      .command('create <name>')
      .description('Create a new profile')
      .action(async (name: string) => {
        try {
          const configManager = getConfig();
          await configManager.load();

          const config = configManager.get();
          if (!config.profiles) {
            config.profiles = {};
          }

          if (config.profiles[name]) {
            const shouldOverwrite = await clack.confirm({
              message: `Profile '${name}' already exists. Overwrite?`,
              initialValue: false
            });

            if (!shouldOverwrite) {
              this.log('Profile creation cancelled', 'info');
              return;
            }
          }

          // Gather profile configuration
          const profile: any = {};

          const adapter = await clack.select({
            message: 'Default adapter:',
            options: [
              { value: 'local', label: 'Local' },
              { value: 'ssh', label: 'SSH' },
              { value: 'docker', label: 'Docker' },
              { value: 'kubernetes', label: 'Kubernetes' }
            ]
          });

          if (adapter) {
            profile.adapter = adapter;
          }

          const addEnv = await clack.confirm({
            message: 'Add environment variables?',
            initialValue: false
          });

          if (addEnv) {
            profile.env = {};
            let addMore = true;
            while (addMore) {
              const envName = await clack.text({
                message: 'Environment variable name:',
                validate: (value) => {
                  if (!value) return 'Name is required';
                  if (!/^[A-Z_][A-Z0-9_]*$/i.test(value)) {
                    return 'Invalid variable name';
                  }
                  return undefined;
                }
              }) as string;

              const envValue = await clack.text({
                message: `Value for ${envName}:`
              }) as string;

              profile.env[envName] = envValue;

              addMore = await clack.confirm({
                message: 'Add another environment variable?',
                initialValue: false
              }) as boolean;
            }
          }

          if (config.profiles) {
          config.profiles[name] = profile;
        }
          await configManager.save(config);

          this.log(`${chalk.green('✓')} Created profile: ${name}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Delete profile
    profile
      .command('delete <name>')
      .description('Delete a profile')
      .action(async (name: string) => {
        try {
          const configManager = getConfig();
          await configManager.load();

          const config = configManager.get();
          if (!config.profiles || !config.profiles[name]) {
            throw new Error(`Profile '${name}' not found`);
          }

          const shouldDelete = await clack.confirm({
            message: `Delete profile '${name}'?`,
            initialValue: false
          });

          if (!shouldDelete) {
            this.log('Deletion cancelled', 'info');
            return;
          }

          delete config.profiles[name];
          await configManager.save(config);

          this.log(`${chalk.green('✓')} Deleted profile: ${name}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addInitCommand(config: Command): void {
    config
      .command('init')
      .description('Initialize configuration file')
      .option('-g, --global', 'Initialize global config')
      .option('-f, --force', 'Overwrite existing config')
      .action(async (options) => {
        try {
          const configManager = getConfig();
          const configPaths = configManager.getConfigPaths();
          const configPath = options.global ? configPaths[0] : (configPaths[1] || configPaths[0]);

          if (configPath && await fs.pathExists(configPath) && !options.force) {
            const shouldOverwrite = await clack.confirm({
              message: 'Configuration file already exists. Overwrite?',
              initialValue: false
            });

            if (!shouldOverwrite) {
              this.log('Initialization cancelled', 'info');
              return;
            }
          }

          // Create default configuration
          const defaultConfig = {
            name: path.basename(process.cwd()),
            description: 'Xec project configuration',
            defaults: {
              adapter: 'local',
              shell: '/bin/bash',
              timeout: 30000
            },
            adapters: {
              ssh: {
                defaults: {
                  port: 22,
                  keepAlive: true
                },
                hosts: {}
              },
              docker: {
                defaults: {
                  network: 'bridge'
                }
              },
              kubernetes: {
                defaults: {
                  namespace: 'default'
                }
              }
            },
            profiles: {},
            aliases: {}
          };

          if (configPath) {
            await fs.ensureDir(path.dirname(configPath));
            await fs.writeFile(
              configPath,
              yaml.dump(defaultConfig, { indent: 2 })
            );
          } else {
            throw new Error('Configuration path not found');
          }

          this.log(`${chalk.green('✓')} Initialized configuration at ${configPath}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private displayConfigTable(config: any, prefix: string = '', showValues: boolean = false): void {
    if (!config) return;
    const sensitiveKeys = ['password', 'key', 'secret', 'token'];
    
    Object.entries(config || {}).forEach(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        console.log(`${chalk.cyan(fullKey)}:`);
        this.displayConfigTable(value, fullKey, showValues);
      } else {
        let displayValue = '';
        
        if (showValues || !sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
          if (Array.isArray(value)) {
            displayValue = `[${value.length} items]`;
          } else if (typeof value === 'string' && value.length > 50) {
            displayValue = value.substring(0, 47) + '...';
          } else {
            displayValue = String(value);
          }
        } else {
          displayValue = '********';
        }
        
        console.log(`  ${chalk.cyan(fullKey)} = ${chalk.gray(displayValue)}`);
      }
    });
  }

  override async execute(): Promise<void> {
    // This is called when 'config' is run without subcommands
    const program = this.create();
    program.outputHelp();
  }

  private addMigrateCommand(config: Command): void {
    config
      .command('migrate')
      .description('Migrate old configuration format to new unified format')
      .option('--dry-run', 'Preview migration without making changes')
      .option('--force', 'Force migration even if config appears up to date')
      .action(async (options) => {
        try {
          clack.intro(chalk.blue('🔄 Configuration Migration'));

          // Check if migration is needed
          const needsMigration = await ConfigMigrator.needsMigration();
          
          if (!needsMigration && !options.force) {
            this.log('Configuration is already in the latest format', 'success');
            return;
          }

          if (options.dryRun) {
            this.log('Running migration in dry-run mode...', 'info');
            const migratedConfig = await ConfigMigrator.migrate(true);
            if (migratedConfig) {
              console.log('\nMigrated configuration preview:');
              console.log(chalk.gray('─'.repeat(50)));
              console.log(yaml.dump(migratedConfig, { indent: 2 }));
              console.log(chalk.gray('─'.repeat(50)));
              this.log('\nThis is a preview. Run without --dry-run to apply changes.', 'info');
            }
          } else {
            const confirm = await clack.confirm({
              message: 'This will migrate your configuration to the new format. Continue?',
              initialValue: true
            });

            if (!confirm) {
              this.log('Migration cancelled', 'warn');
              return;
            }

            await ConfigMigrator.migrate(false);
            
            // Reload config after migration
            const configManager = getConfig();
            await configManager.load();
            
            this.log('\nConfiguration migrated successfully!', 'success');
            this.log('\nYour configuration now uses the unified format:', 'info');
            this.log('  • Hosts are defined at the root level', 'info');
            this.log('  • Containers and pods follow the same pattern', 'info');
            this.log('  • Profiles can extend and override settings', 'info');
            this.log('\nOld configuration files have been backed up.', 'info');
          }

          clack.outro(chalk.green('✨ Migration complete'));
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }
}

export default function configCommand(program: Command): void {
  const cmd = new ConfigCommand();
  program.addCommand(cmd.create());
}