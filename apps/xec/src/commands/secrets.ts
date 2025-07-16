import chalk from 'chalk';
import * as path from 'path';
import { Command } from 'commander';
import { promises as fs } from 'fs';
import { getSecretManager } from '@xec/core';
import { confirm, password } from '@clack/prompts';

import { getProjectRoot } from '../utils/project.js';

interface SecretsStore {
  encrypted: boolean;
  version: string;
  secrets: Record<string, string>;
}

export default function secretsCommand(program: Command) {
  const secrets = program
    .command('secrets')
    .alias('secret')
    .description('Manage secrets and sensitive data')
    .option('-k, --encryption-key <key>', 'Master encryption key for secrets');

  secrets
    .command('set <key> [value]')
    .description('Set a secret value')
    .option('--force', 'Overwrite existing secret without confirmation')
    .action(async (key: string, value?: string, options?: { force?: boolean }) => {
      try {
        const secretsPath = await getSecretsPath();
        const store = await loadSecretsStore(secretsPath);
        
        if (store.secrets[key] && !options?.force) {
          const overwrite = await confirm({
            message: `Secret '${key}' already exists. Overwrite?`,
            initialValue: false,
          });
          
          if (!overwrite) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        if (!value) {
          value = await password({
            message: `Enter value for secret '${key}':`,
            mask: '*',
          }) as string;
          
          if (!value) {
            console.log(chalk.red('No value provided'));
            return;
          }
        }

        // Use secretManager instead of direct encryption
        const parentOpts = secrets.opts();
        const secretManager = getSecretManager({
          encryptionKey: parentOpts['encryptionKey']
        });
        await secretManager.set(key, value);
        // Update local store tracking
        store.secrets[key] = 'encrypted';
        
        await saveSecretsStore(secretsPath, store);
        console.log(chalk.green(`✓ Secret '${key}' saved successfully`));
      } catch (error) {
        console.error(chalk.red(`Failed to set secret: ${error}`));
        process.exit(1);
      }
    });

  secrets
    .command('get <key>')
    .description('Retrieve a secret value')
    .option('--show', 'Display the secret value (default: copy to clipboard)')
    .action(async (key: string, options?: { show?: boolean }) => {
      try {
        const secretsPath = await getSecretsPath();
        const store = await loadSecretsStore(secretsPath);
        
        if (!store.secrets[key]) {
          console.log(chalk.red(`Secret '${key}' not found`));
          process.exit(1);
        }

        const parentOpts = secrets.opts();
        const secretManager = getSecretManager({
          encryptionKey: parentOpts['encryptionKey']
        });
        const decrypted = await secretManager.get(key);
        
        if (options?.show) {
          console.log(chalk.green(`Secret '${key}':`), decrypted);
        } else {
          // In a real implementation, we would copy to clipboard
          console.log(chalk.green(`✓ Secret '${key}' retrieved`));
          console.log(chalk.gray('Use --show to display the value'));
        }
      } catch (error) {
        console.error(chalk.red(`Failed to get secret: ${error}`));
        process.exit(1);
      }
    });

  secrets
    .command('list')
    .alias('ls')
    .description('List all secret keys')
    .option('--json', 'Output as JSON')
    .action(async (options?: { json?: boolean }) => {
      try {
        const secretsPath = await getSecretsPath();
        const store = await loadSecretsStore(secretsPath);
        
        const keys = Object.keys(store.secrets);
        
        if (options?.json) {
          console.log(JSON.stringify({ secrets: keys }, null, 2));
        } else {
          if (keys.length === 0) {
            console.log(chalk.yellow('No secrets found'));
            return;
          }
          
          console.log(chalk.bold('Secrets:'));
          keys.forEach(key => {
            console.log(`  - ${key}`);
          });
          console.log(chalk.gray(`\nTotal: ${keys.length} secret(s)`));
        }
      } catch (error) {
        console.error(chalk.red(`Failed to list secrets: ${error}`));
        process.exit(1);
      }
    });

  secrets
    .command('delete <key>')
    .alias('rm')
    .description('Delete a secret')
    .option('--force', 'Skip confirmation')
    .action(async (key: string, options?: { force?: boolean }) => {
      try {
        const secretsPath = await getSecretsPath();
        const store = await loadSecretsStore(secretsPath);
        
        if (!store.secrets[key]) {
          console.log(chalk.red(`Secret '${key}' not found`));
          process.exit(1);
        }

        if (!options?.force) {
          const confirmed = await confirm({
            message: `Are you sure you want to delete secret '${key}'?`,
            initialValue: false,
          });
          
          if (!confirmed) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        delete store.secrets[key];
        await saveSecretsStore(secretsPath, store);
        console.log(chalk.green(`✓ Secret '${key}' deleted successfully`));
      } catch (error) {
        console.error(chalk.red(`Failed to delete secret: ${error}`));
        process.exit(1);
      }
    });

  secrets
    .command('rotate <key>')
    .description('Rotate a secret value')
    .action(async (key: string) => {
      try {
        const secretsPath = await getSecretsPath();
        const store = await loadSecretsStore(secretsPath);
        
        if (!store.secrets[key]) {
          console.log(chalk.red(`Secret '${key}' not found`));
          process.exit(1);
        }

        console.log(chalk.yellow(`Rotating secret '${key}'...`));
        
        const newValue = await password({
          message: `Enter new value for secret '${key}':`,
          mask: '*',
        }) as string;
        
        if (!newValue) {
          console.log(chalk.red('No value provided'));
          return;
        }

        const parentOpts = secrets.opts();
        const secretManager = getSecretManager({
          encryptionKey: parentOpts['encryptionKey']
        });
        await secretManager.set(key, newValue);
        
        // In a real implementation, we might keep history of rotations
        store.secrets[key] = 'encrypted';
        
        await saveSecretsStore(secretsPath, store);
        console.log(chalk.green(`✓ Secret '${key}' rotated successfully`));
      } catch (error) {
        console.error(chalk.red(`Failed to rotate secret: ${error}`));
        process.exit(1);
      }
    });

  secrets
    .command('import <file>')
    .description('Import secrets from a file')
    .option('--format <format>', 'File format (json|env)', 'json')
    .option('--merge', 'Merge with existing secrets')
    .action(async (file: string, options?: { format?: string; merge?: boolean }) => {
      try {
        const secretsPath = await getSecretsPath();
        const store = await loadSecretsStore(secretsPath);
        
        const content = await fs.readFile(file, 'utf-8');
        let importedSecrets: Record<string, string> = {};
        
        if (options?.format === 'env') {
          // Parse .env format
          content.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match && match[1] && match[2]) {
              importedSecrets[match[1].trim()] = match[2].trim();
            }
          });
        } else {
          // Parse JSON format
          importedSecrets = JSON.parse(content);
        }

        const parentOpts = secrets.opts();
        const secretManager = getSecretManager({
          encryptionKey: parentOpts['encryptionKey']
        });
        const encryptedSecrets: Record<string, string> = {};
        
        for (const [key, value] of Object.entries(importedSecrets)) {
          await secretManager.set(key, value);
          encryptedSecrets[key] = 'encrypted';
        }

        if (options?.merge) {
          store.secrets = { ...store.secrets, ...encryptedSecrets };
        } else {
          store.secrets = encryptedSecrets;
        }

        await saveSecretsStore(secretsPath, store);
        const count = Object.keys(importedSecrets).length;
        console.log(chalk.green(`✓ Imported ${count} secret(s) successfully`));
      } catch (error) {
        console.error(chalk.red(`Failed to import secrets: ${error}`));
        process.exit(1);
      }
    });

  secrets
    .command('export [file]')
    .description('Export secrets to a file (encrypted)')
    .option('--format <format>', 'Output format (json|env)', 'json')
    .option('--decrypt', 'Export decrypted values (WARNING: insecure)')
    .action(async (file?: string, options?: { format?: string; decrypt?: boolean }) => {
      try {
        if (options?.decrypt && !file) {
          console.log(chalk.red('Cannot export decrypted secrets to stdout'));
          process.exit(1);
        }

        if (options?.decrypt) {
          const confirmed = await confirm({
            message: chalk.yellow('WARNING: Exporting decrypted secrets is insecure. Continue?'),
            initialValue: false,
          });
          
          if (!confirmed) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }

        const secretsPath = await getSecretsPath();
        const store = await loadSecretsStore(secretsPath);
        
        let output: string;
        
        if (options?.decrypt) {
          const parentOpts = secrets.opts();
          const secretManager = getSecretManager({
            encryptionKey: parentOpts['encryptionKey']
          });
          const decrypted: Record<string, string> = {};
          
          for (const [key] of Object.entries(store.secrets)) {
            const value = await secretManager.get(key);
            if (value) {
              decrypted[key] = value;
            }
          }
          
          if (options?.format === 'env') {
            output = Object.entries(decrypted)
              .map(([key, value]) => `${key}=${value}`)
              .join('\n');
          } else {
            output = JSON.stringify(decrypted, null, 2);
          }
        } else {
          if (options?.format === 'env') {
            console.log(chalk.red('Cannot export encrypted secrets in env format'));
            process.exit(1);
          }
          output = JSON.stringify(store, null, 2);
        }

        if (file) {
          await fs.writeFile(file, output);
          console.log(chalk.green(`✓ Exported secrets to ${file}`));
        } else {
          console.log(output);
        }
      } catch (error) {
        console.error(chalk.red(`Failed to export secrets: ${error}`));
        process.exit(1);
      }
    });
}

async function getSecretsPath(): Promise<string> {
  const projectRoot = await getProjectRoot();
  const secretsDir = path.join(projectRoot, '.xec', 'secrets');
  
  await fs.mkdir(secretsDir, { recursive: true });
  return path.join(secretsDir, 'secrets.json');
}

async function loadSecretsStore(secretsPath: string): Promise<SecretsStore> {
  try {
    const content = await fs.readFile(secretsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // Initialize empty store if file doesn't exist
    return {
      encrypted: true,
      version: '1.0.0',
      secrets: {},
    };
  }
}

async function saveSecretsStore(secretsPath: string, store: SecretsStore): Promise<void> {
  await fs.writeFile(secretsPath, JSON.stringify(store, null, 2));
}