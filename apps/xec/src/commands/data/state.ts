import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { Command } from 'commander';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';
import { namespaceKey, SimpleStateStore, createCLIStateManager } from '../../utils/state-helpers.js';

interface StateOptions {
  format?: 'json' | 'yaml';
  file?: string;
  merge?: boolean;
  backup?: boolean;
  namespace?: string;
}

export class StateCommand extends SubcommandBase {
  private stateStore: SimpleStateStore;

  constructor() {
    super({
      name: 'state',
      description: 'Manage application state',
      examples: [
        {
          command: 'xec data state get app.version',
          description: 'Get state value',
        },
        {
          command: 'xec data state set app.version 1.2.3',
          description: 'Set state value',
        },
        {
          command: 'xec data state list --namespace app',
          description: 'List state keys in namespace',
        },
        {
          command: 'xec data state export --format json',
          description: 'Export state as JSON',
        },
      ],
    });

    this.stateStore = createCLIStateManager();
  }

  protected setupSubcommands(command: Command): void {
    // xec data state get
    command
      .command('get')
      .description('Get state value')
      .argument('<key>', 'State key (dot notation supported)')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--default <value>', 'Default value if key not found')
      .action(async (key: string, options: StateOptions & { default?: string }) => {
        this.options = { ...this.options, ...options };
        await this.getState(key, options);
      });

    // xec data state set
    command
      .command('set')
      .description('Set state value')
      .argument('<key>', 'State key (dot notation supported)')
      .argument('<value>', 'State value')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--type <type>', 'Value type (string|number|boolean|json)', 'string')
      .option('--ttl <seconds>', 'Time to live in seconds')
      .action(async (key: string, value: string, options: StateOptions & { type?: string; ttl?: number }) => {
        this.options = { ...this.options, ...options };
        await this.setState(key, value, options);
      });

    // xec data state delete
    command
      .command('delete')
      .description('Delete state value')
      .argument('<key>', 'State key to delete')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--force', 'Skip confirmation prompt')
      .action(async (key: string, options: StateOptions & { force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.deleteState(key, options);
      });

    // xec data state list
    command
      .command('list')
      .description('List state keys')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--filter <pattern>', 'Filter keys by pattern')
      .option('--values', 'Include values in output')
      .action(async (options: StateOptions & { filter?: string; values?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.listState(options);
      });

    // xec data state clear
    command
      .command('clear')
      .description('Clear all state')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--force', 'Skip confirmation prompt')
      .option('--backup', 'Create backup before clearing')
      .action(async (options: StateOptions & { force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.clearState(options);
      });

    // xec data state export
    command
      .command('export')
      .description('Export state to file')
      .option('-f, --file <file>', 'Export file path')
      .option('--format <format>', 'Export format (json|yaml)', 'json')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--filter <pattern>', 'Filter keys by pattern')
      .action(async (options: StateOptions & { filter?: string }) => {
        this.options = { ...this.options, ...options };
        await this.exportState(options);
      });

    // xec data state import
    command
      .command('import')
      .description('Import state from file')
      .argument('<file>', 'Import file path')
      .option('--format <format>', 'Import format (json|yaml)', 'json')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--merge', 'Merge with existing state')
      .option('--backup', 'Create backup before import')
      .action(async (file: string, options: StateOptions) => {
        this.options = { ...this.options, ...options };
        await this.importState(file, options);
      });

    // Note: history command removed as SimpleStateStore doesn't track history
    // For event-sourced history, use the full StateManager from @xec-js/core

    // Note: watch command removed as SimpleStateStore doesn't support real-time watching
    // For real-time state watching, use the full StateManager from @xec-js/core

    // xec data state backup
    command
      .command('backup')
      .description('Create state backup')
      .option('-f, --file <file>', 'Backup file path')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--compress', 'Compress backup file')
      .action(async (options: StateOptions & { compress?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.backupState(options);
      });

    // xec data state restore
    command
      .command('restore')
      .description('Restore state from backup')
      .argument('<file>', 'Backup file path')
      .option('-n, --namespace <namespace>', 'State namespace')
      .option('--force', 'Skip confirmation prompt')
      .action(async (file: string, options: StateOptions & { force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.restoreState(file, options);
      });
  }

  private async getState(key: string, options: StateOptions & { default?: string }): Promise<void> {
    try {
      const namespace = options.namespace || 'default';
      const fullKey = namespaceKey(namespace, key);
      const value = await this.stateStore.get(fullKey);

      if (value === undefined) {
        if (options.default !== undefined) {
          this.output(options.default, `State: ${key} (default)`);
        } else {
          throw errorMessages.configurationInvalid('key', `State key '${key}' not found`);
        }
      } else {
        this.output(value, `State: ${key}`);
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to get state: ${error.message}`);
    }
  }

  private async setState(key: string, value: string, options: StateOptions & { type?: string; ttl?: number }): Promise<void> {
    try {
      let parsedValue: any;

      switch (options.type) {
        case 'number':
          parsedValue = Number(value);
          if (isNaN(parsedValue)) {
            throw new Error('Invalid number value');
          }
          break;
        case 'boolean':
          parsedValue = value.toLowerCase() === 'true';
          break;
        case 'json':
          parsedValue = JSON.parse(value);
          break;
        default:
          parsedValue = value;
      }

      const namespace = options.namespace || 'default';
      const fullKey = namespaceKey(namespace, key);
      await this.stateStore.set(fullKey, parsedValue, { ttl: options.ttl });
      this.log(`State '${key}' set successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to set state: ${error.message}`);
    }
  }

  private async deleteState(key: string, options: StateOptions & { force?: boolean }): Promise<void> {
    if (!options.force) {
      const confirm = await this.confirm(`Are you sure you want to delete state '${key}'?`);
      if (!confirm) {
        this.log('State deletion cancelled', 'info');
        return;
      }
    }

    try {
      const namespace = options.namespace || 'default';
      const fullKey = namespaceKey(namespace, key);
      await this.stateStore.delete(fullKey);
      this.log(`State '${key}' deleted successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to delete state: ${error.message}`);
    }
  }

  private async listState(options: StateOptions & { filter?: string; values?: boolean }): Promise<void> {
    try {
      const namespace = options.namespace || 'default';
      const keys = await this.stateStore.listKeys(namespace);

      // Filter keys
      let filteredKeys = keys;
      if (options.filter) {
        const pattern = new RegExp(options.filter, 'i');
        filteredKeys = keys.filter(key => pattern.test(key));
      }

      if (options.values) {
        // Show key-value pairs
        const stateData: Record<string, any> = {};
        for (const key of filteredKeys) {
          const fullKey = namespaceKey(namespace, key);
          const value = await this.stateStore.get(fullKey);
          if (value !== undefined) {
            stateData[key] = value;
          }
        }
        this.formatter.keyValue(stateData, 'State');
      } else {
        // Show only keys
        this.formatter.list(filteredKeys, 'State Keys');
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to list state: ${error.message}`);
    }
  }

  private async clearState(options: StateOptions & { force?: boolean }): Promise<void> {
    if (!options.force) {
      const confirm = await this.confirm('Are you sure you want to clear all state?');
      if (!confirm) {
        this.log('State clearing cancelled', 'info');
        return;
      }
    }

    try {
      // Create backup if requested
      if (options.backup) {
        await this.backupState({ ...options, file: `state-backup-${Date.now()}.json` });
      }

      const namespace = options.namespace || 'default';
      const keys = await this.stateStore.listKeys(namespace);

      // Delete all keys in namespace
      for (const key of keys) {
        const fullKey = namespaceKey(namespace, key);
        await this.stateStore.delete(fullKey);
      }

      this.log('State cleared successfully', 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to clear state: ${error.message}`);
    }
  }

  private async exportState(options: StateOptions & { filter?: string }): Promise<void> {
    try {
      const namespace = options.namespace || 'default';
      const state = await this.stateStore.getNamespace(namespace);
      let filteredState = state;

      // Filter state
      if (options.filter) {
        const pattern = new RegExp(options.filter, 'i');
        filteredState = Object.fromEntries(
          Object.entries(state).filter(([key]) => pattern.test(key))
        );
      }

      const exportData = {
        timestamp: new Date().toISOString(),
        namespace,
        state: filteredState,
      };

      if (options.file) {
        let content: string;
        if (options.format === 'yaml') {
          content = yaml.dump(exportData, { lineWidth: -1, noRefs: true });
        } else {
          content = JSON.stringify(exportData, null, 2);
        }

        await fs.writeFile(options.file, content);
        this.log(`State exported to ${options.file}`, 'success');
      } else {
        this.output(exportData, 'Exported State');
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to export state: ${error.message}`);
    }
  }

  private async importState(file: string, options: StateOptions): Promise<void> {
    try {
      const filePath = path.resolve(file);
      const content = await fs.readFile(filePath, 'utf8');

      let importData: any;
      if (options.format === 'yaml') {
        importData = yaml.load(content);
      } else {
        importData = JSON.parse(content);
      }

      // Create backup if requested
      if (options.backup) {
        await this.backupState({ ...options, file: `state-backup-${Date.now()}.json` });
      }

      const stateData = importData.state || importData;

      if (options.merge) {
        // Merge with existing state
        const namespace = options.namespace || 'default';
        for (const [key, value] of Object.entries(stateData)) {
          const fullKey = namespaceKey(namespace, key);
          await this.stateStore.set(fullKey, value);
        }
      } else {
        // Replace all state
        const namespace = options.namespace || 'default';
        const existingKeys = await this.stateStore.listKeys(namespace);

        // Delete all existing keys
        for (const key of existingKeys) {
          const fullKey = namespaceKey(namespace, key);
          await this.stateStore.delete(fullKey);
        }

        // Set new state
        for (const [key, value] of Object.entries(stateData)) {
          const fullKey = namespaceKey(namespace, key);
          await this.stateStore.set(fullKey, value);
        }
      }

      this.log(`State imported from ${file}`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to import state: ${error.message}`);
    }
  }

  // History functionality removed - SimpleStateStore doesn't track history
  // For event-sourced history, use the full StateManager from @xec-js/core

  // Watch functionality removed - SimpleStateStore doesn't support real-time watching
  // For real-time state watching, use the full StateManager from @xec-js/core

  private async backupState(options: StateOptions & { compress?: boolean }): Promise<void> {
    try {
      const namespace = options.namespace || 'default';
      const state = await this.stateStore.getNamespace(namespace);
      const backupData = {
        timestamp: new Date().toISOString(),
        namespace,
        state,
      };

      const backupFile = options.file || `state-backup-${Date.now()}.json`;
      const content = JSON.stringify(backupData, null, 2);

      if (options.compress) {
        const zlib = await import('zlib');
        const compressed = zlib.gzipSync(content);
        await fs.writeFile(backupFile + '.gz', compressed);
        this.log(`State backup created: ${backupFile}.gz`, 'success');
      } else {
        await fs.writeFile(backupFile, content);
        this.log(`State backup created: ${backupFile}`, 'success');
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to create backup: ${error.message}`);
    }
  }

  private async restoreState(file: string, options: StateOptions & { force?: boolean }): Promise<void> {
    if (!options.force) {
      const confirm = await this.confirm('Are you sure you want to restore state from backup?');
      if (!confirm) {
        this.log('State restore cancelled', 'info');
        return;
      }
    }

    try {
      const filePath = path.resolve(file);
      let content: string;

      if (file.endsWith('.gz')) {
        const zlib = await import('zlib');
        const compressed = await fs.readFile(filePath);
        content = zlib.gunzipSync(compressed).toString();
      } else {
        content = await fs.readFile(filePath, 'utf8');
      }

      const backupData = JSON.parse(content);
      const stateData = backupData.state || backupData;

      // Clear existing state
      const namespace = options.namespace || 'default';
      const existingKeys = await this.stateStore.listKeys(namespace);

      // Delete all existing keys
      for (const key of existingKeys) {
        const fullKey = namespaceKey(namespace, key);
        await this.stateStore.delete(fullKey);
      }

      // Restore state
      for (const [key, value] of Object.entries(stateData)) {
        const fullKey = namespaceKey(namespace, key);
        await this.stateStore.set(fullKey, value);
      }

      this.log(`State restored from ${file}`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('state', `Failed to restore state: ${error.message}`);
    }
  }

  private truncateValue(value: string): string {
    if (value.length > 30) {
      return value.substring(0, 27) + '...';
    }
    return value;
  }
}