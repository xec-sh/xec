import * as fs from 'fs/promises';
import { Command } from 'commander';
import * as clack from '@clack/prompts';
import { SecretManager, getSecretManager } from '@xec/core';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';

interface SecretsOptions {
  namespace?: string;
  interactive?: boolean;
  metadata?: string;
  filter?: string;
  showMetadata?: boolean;
}

export class SecretsCommand extends SubcommandBase {
  private secretManager: SecretManager;

  constructor() {
    super({
      name: 'secrets',
      description: 'Manage secrets and sensitive data',
      examples: [
        {
          command: 'xec data secrets get db.password',
          description: 'Get secret value',
        },
        {
          command: 'xec data secrets set db.password --interactive',
          description: 'Set secret interactively',
        },
        {
          command: 'xec data secrets rotate api.key',
          description: 'Rotate secret value',
        },
        {
          command: 'xec data secrets list --namespace production',
          description: 'List secrets in namespace',
        },
      ],
    });
    
    this.secretManager = getSecretManager();
  }

  protected setupSubcommands(command: Command): void {
    // xec data secrets get
    command
      .command('get')
      .description('Get secret value')
      .argument('<key>', 'Secret key')
      .option('--show', 'Show secret value in output')
      .action(async (key: string, options: { show?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.getSecret(key, options);
      });

    // xec data secrets set
    command
      .command('set')
      .description('Set secret value')
      .argument('<key>', 'Secret key')
      .argument('[value]', 'Secret value (prompt if not provided)')
      .option('--interactive', 'Interactive input')
      .option('--metadata <json>', 'Metadata in JSON format')
      .action(async (key: string, value: string, options: SecretsOptions) => {
        this.options = { ...this.options, ...options };
        await this.setSecret(key, value, options);
      });

    // xec data secrets delete
    command
      .command('delete')
      .description('Delete secret')
      .argument('<key>', 'Secret key')
      .option('--force', 'Skip confirmation prompt')
      .action(async (key: string, options: { force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.deleteSecret(key, options);
      });

    // xec data secrets list
    command
      .command('list')
      .description('List secret keys')
      .option('--namespace <namespace>', 'Filter by namespace')
      .option('--filter <pattern>', 'Filter keys by pattern')
      .option('--show-info', 'Show secret info without values')
      .action(async (options: SecretsOptions & { filter?: string; showInfo?: boolean; namespace?: string }) => {
        this.options = { ...this.options, ...options };
        await this.listSecrets(options);
      });

    // xec data secrets rotate
    command
      .command('rotate')
      .description('Rotate secret value')
      .argument('<key>', 'Secret key')
      .option('--value <value>', 'New secret value (generate if not provided)')
      .action(async (key: string, options: { value?: string }) => {
        this.options = { ...this.options, ...options };
        await this.rotateSecret(key, options);
      });

    // xec data secrets search
    command
      .command('search')
      .description('Search secrets by pattern')
      .argument('<pattern>', 'Search pattern (regex)')
      .action(async (pattern: string, options: {}) => {
        this.options = { ...this.options, ...options };
        await this.searchSecrets(pattern);
      });

    // xec data secrets rename
    command
      .command('rename')
      .description('Rename a secret')
      .argument('<oldName>', 'Current secret name')
      .argument('<newName>', 'New secret name')
      .action(async (oldName: string, newName: string, options: {}) => {
        this.options = { ...this.options, ...options };
        await this.renameSecret(oldName, newName);
      });

    // xec data secrets export
    command
      .command('export')
      .description('Export secrets (encrypted)')
      .argument('<file>', 'Export file path')
      .option('--password <password>', 'Encryption password (prompt if not provided)')
      .action(async (file: string, options: { password?: string }) => {
        this.options = { ...this.options, ...options };
        await this.exportSecrets(file, options);
      });

    // xec data secrets import
    command
      .command('import')
      .description('Import secrets from encrypted file')
      .argument('<file>', 'Import file path')
      .option('--password <password>', 'Decryption password (prompt if not provided)')
      .option('--force', 'Skip confirmation prompt')
      .action(async (file: string, options: { password?: string; force?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.importSecrets(file, options);
      });

    // xec data secrets namespaces
    command
      .command('namespaces')
      .description('List all namespaces')
      .action(async (options: {}) => {
        this.options = { ...this.options, ...options };
        await this.listNamespaces();
      });
  }

  private async getSecret(key: string, options: { show?: boolean }): Promise<void> {
    try {
      await this.secretManager.initialize();
      const value = await this.secretManager.get(key);
      
      if (value === undefined) {
        throw errorMessages.configurationInvalid('key', `Secret '${key}' not found`);
      }
      
      if (options.show) {
        this.output(value, `Secret: ${key}`);
      } else {
        // Get secret info without value
        const info = await this.secretManager.getInfo(key);
        if (info) {
          this.formatter.keyValue({
            Key: key,
            'Created At': new Date(info.createdAt).toISOString(),
            'Updated At': new Date(info.updatedAt).toISOString(),
            'Encrypted': info.encrypted ? 'Yes' : 'No',
            'Has Metadata': info.metadata ? 'Yes' : 'No',
            'Value': '[HIDDEN - use --show to display]',
          }, `Secret: ${key}`);
        }
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to get secret: ${error.message}`);
    }
  }

  private async setSecret(key: string, value: string, options: SecretsOptions): Promise<void> {
    try {
      await this.secretManager.initialize();
      
      let secretValue = value;
      
      if (!secretValue || options.interactive) {
        secretValue = await clack.password({
          message: `Enter secret value for '${key}':`,
          validate: (input) => {
            if (!input || input.length === 0) {
              return 'Secret value cannot be empty';
            }
            return undefined;
          },
        }) as string;
      }
      
      const metadata = options.metadata ? JSON.parse(options.metadata) : undefined;
      
      await this.secretManager.set(key, secretValue, metadata);
      
      this.log(`Secret '${key}' set successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to set secret: ${error.message}`);
    }
  }

  private async deleteSecret(key: string, options: { force?: boolean }): Promise<void> {
    if (!options.force) {
      const confirm = await this.confirm(`Are you sure you want to delete secret '${key}'?`);
      if (!confirm) {
        this.log('Secret deletion cancelled', 'info');
        return;
      }
    }
    
    try {
      await this.secretManager.initialize();
      const deleted = await this.secretManager.delete(key);
      
      if (deleted) {
        this.log(`Secret '${key}' deleted successfully`, 'success');
      } else {
        this.log(`Secret '${key}' not found`, 'warn');
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to delete secret: ${error.message}`);
    }
  }

  private async listSecrets(options: SecretsOptions & { filter?: string; showInfo?: boolean; namespace?: string }): Promise<void> {
    try {
      await this.secretManager.initialize();
      
      let secretNames: string[];
      
      if (options.namespace) {
        secretNames = await this.secretManager.listByNamespace(options.namespace);
      } else if (options.filter) {
        secretNames = await this.secretManager.search(options.filter);
      } else {
        secretNames = await this.secretManager.list();
      }
      
      if (secretNames.length === 0) {
        this.log('No secrets found', 'info');
        return;
      }
      
      if (options.showInfo) {
        // Show detailed info for each secret
        const tableData = {
          columns: [
            { header: 'Key', width: 30 },
            { header: 'Created', width: 20 },
            { header: 'Updated', width: 20 },
            { header: 'Encrypted', width: 10 },
            { header: 'Metadata', width: 10 },
          ],
          rows: await Promise.all(
            secretNames.map(async (name) => {
              const info = await this.secretManager.getInfo(name);
              if (info) {
                return [
                  name,
                  new Date(info.createdAt).toLocaleDateString(),
                  new Date(info.updatedAt).toLocaleDateString(),
                  info.encrypted ? 'Yes' : 'No',
                  info.metadata ? 'Yes' : 'No',
                ];
              }
              return [name, 'Unknown', 'Unknown', 'Unknown', 'Unknown'];
            })
          ),
        };
        this.formatter.table(tableData);
      } else {
        // Simple list
        this.formatter.list(secretNames, `Secrets (${secretNames.length} found)`);
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to list secrets: ${error.message}`);
    }
  }

  private async rotateSecret(key: string, options: { value?: string }): Promise<void> {
    try {
      await this.secretManager.initialize();
      
      const newValue = await this.secretManager.rotate(key, options.value);
      
      this.log(`Secret '${key}' rotated successfully`, 'success');
      
      if (this.isVerbose() && options.value === undefined) {
        this.log(`Generated new value (length: ${newValue.length})`, 'info');
      }
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to rotate secret: ${error.message}`);
    }
  }

  private async searchSecrets(pattern: string): Promise<void> {
    try {
      await this.secretManager.initialize();
      
      const matches = await this.secretManager.search(pattern);
      
      if (matches.length === 0) {
        this.log(`No secrets matching pattern '${pattern}'`, 'info');
        return;
      }
      
      this.formatter.list(matches, `Secrets matching '${pattern}' (${matches.length} found)`);
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to search secrets: ${error.message}`);
    }
  }

  private async renameSecret(oldName: string, newName: string): Promise<void> {
    try {
      await this.secretManager.initialize();
      
      await this.secretManager.rename(oldName, newName);
      
      this.log(`Secret renamed from '${oldName}' to '${newName}'`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to rename secret: ${error.message}`);
    }
  }

  private async exportSecrets(file: string, options: { password?: string }): Promise<void> {
    try {
      await this.secretManager.initialize();
      
      let password = options.password;
      if (!password) {
        password = await clack.password({
          message: 'Enter password for export encryption:',
          validate: (input) => {
            if (!input || input.length < 8) {
              return 'Password must be at least 8 characters';
            }
            return undefined;
          },
        }) as string;
      }
      
      const encryptedData = await this.secretManager.export(password);
      
      await fs.writeFile(file, encryptedData, 'utf8');
      this.log(`Secrets exported to: ${file}`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to export secrets: ${error.message}`);
    }
  }

  private async importSecrets(file: string, options: { password?: string; force?: boolean }): Promise<void> {
    if (!options.force) {
      const confirm = await this.confirm('Are you sure you want to import secrets? This may overwrite existing secrets.');
      if (!confirm) {
        this.log('Secrets import cancelled', 'info');
        return;
      }
    }
    
    try {
      await this.secretManager.initialize();
      
      const encryptedData = await fs.readFile(file, 'utf8');
      
      let password = options.password;
      if (!password) {
        password = await clack.password({
          message: 'Enter password for import decryption:',
        }) as string;
      }
      
      const count = await this.secretManager.import(encryptedData, password);
      
      this.log(`Imported ${count} secrets successfully`, 'success');
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to import secrets: ${error.message}`);
    }
  }

  private async listNamespaces(): Promise<void> {
    try {
      await this.secretManager.initialize();
      
      const namespaces = await this.secretManager.listNamespaces();
      
      if (namespaces.length === 0) {
        this.log('No namespaces found', 'info');
        return;
      }
      
      this.formatter.list(namespaces, `Namespaces (${namespaces.length} found)`);
    } catch (error: any) {
      throw errorMessages.configurationInvalid('secret', `Failed to list namespaces: ${error.message}`);
    }
  }
}
