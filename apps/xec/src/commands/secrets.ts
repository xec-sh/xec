import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { SecretManager } from '../secrets/index.js';
import { ConfigAwareCommand } from '../utils/command-base.js';
import { InteractiveHelpers } from '../utils/interactive-helpers.js';

/**
 * Secrets management command
 */
export class SecretsCommand extends ConfigAwareCommand {
  constructor() {
    super({
      name: 'secrets',
      description: 'Manage secrets securely',
      aliases: ['secret', 's']
    });
  }

  protected override getCommandConfigKey(): string {
    return 'secrets';
  }

  /**
   * Create command with subcommands
   */
  override create(): Command {
    const command = new Command(this.config.name)
      .description(this.config.description);

    // Add aliases
    if (this.config.aliases) {
      this.config.aliases.forEach(alias => command.alias(alias));
    }

    // Set up action for when no subcommand is provided
    command.action(async () => {
      await this.execute([]);
    });

    // Set up subcommands
    this.setupSubcommands(command);

    return command;
  }

  private setupSubcommands(command: Command): void {
    // Set a secret
    command
      .command('set <key>')
      .description('Set a secret value')
      .option('-v, --value <value>', 'Secret value (prompt if not provided)')
      .action(async (key: string, options: any) => {
        await this.handleSubcommand(async () => {
          await this.setSecret(key, options);
        });
      });

    // Get a secret
    command
      .command('get <key>')
      .description('Get a secret value')
      .action(async (key: string) => {
        await this.handleSubcommand(async () => {
          await this.getSecret(key);
        });
      });

    // List secrets
    command
      .command('list')
      .alias('ls')
      .description('List all secret keys')
      .action(async () => {
        await this.handleSubcommand(async () => {
          await this.listSecrets();
        });
      });

    // Delete a secret
    command
      .command('delete <key>')
      .alias('rm')
      .description('Delete a secret')
      .option('-f, --force', 'Skip confirmation')
      .action(async (key: string, options: any) => {
        await this.handleSubcommand(async () => {
          await this.deleteSecret(key, options);
        });
      });

    // Generate a secret
    command
      .command('generate <key>')
      .description('Generate a random secret')
      .option('-l, --length <length>', 'Secret length', '32')
      .option('-f, --force', 'Overwrite existing secret without confirmation')
      .action(async (key: string, options: any) => {
        await this.handleSubcommand(async () => {
          await this.generateSecret(key, options);
        });
      });

    // Export secrets (dangerous!)
    command
      .command('export')
      .description('Export all secrets (WARNING: outputs plain text)')
      .option('-f, --format <format>', 'Output format (json, env)', 'json')
      .option('--force', 'Skip confirmation (use with caution)')
      .action(async (options: any) => {
        await this.handleSubcommand(async () => {
          await this.exportSecrets(options);
        });
      });

    // Import secrets
    command
      .command('import')
      .description('Import secrets from JSON or env format')
      .option('-f, --file <file>', 'Input file (or stdin if not provided)')
      .option('--format <format>', 'Input format (json, env)', 'json')
      .action(async (options: any) => {
        await this.handleSubcommand(async () => {
          await this.importSecrets(options);
        });
      });
  }

  /**
   * Execute method - enters interactive mode when no subcommand is provided
   */
  override async execute(args: any[]): Promise<void> {
    // If no subcommand is provided, enter interactive mode
    await this.runInteractiveMode();
  }

  /**
   * Run interactive mode for secrets management
   */
  private async runInteractiveMode(): Promise<void> {
    InteractiveHelpers.startInteractiveMode('🔐 Secrets Manager');

    try {
      while (true) {
        const action = await clack.select({
          message: 'What would you like to do?',
          options: [
            { value: 'set', label: '🔒 Set a secret' },
            { value: 'get', label: '🔓 Get a secret' },
            { value: 'list', label: '📋 List all secrets' },
            { value: 'delete', label: '🗑️  Delete a secret' },
            { value: 'generate', label: '🎲 Generate a random secret' },
            { value: 'export', label: '📤 Export secrets (dangerous!)' },
            { value: 'import', label: '📥 Import secrets' },
            { value: 'exit', label: chalk.gray('Exit') },
          ],
        });

        if (clack.isCancel(action) || action === 'exit') {
          break;
        }

        await this.handleInteractiveAction(action);

        // Ask if user wants to continue
        const continueAction = await clack.confirm({
          message: 'Would you like to perform another action?',
          initialValue: true,
        });

        if (clack.isCancel(continueAction) || !continueAction) {
          break;
        }
      }

      InteractiveHelpers.endInteractiveMode('✓ Secrets management complete');
    } catch (error) {
      InteractiveHelpers.showError(error instanceof Error ? error.message : 'An unknown error occurred');
      process.exit(1);
    }
  }

  /**
   * Handle interactive mode actions
   */
  private async handleInteractiveAction(action: string): Promise<void> {
    // eslint-disable-next-line default-case
    switch (action) {
      case 'set':
        await this.interactiveSetSecret();
        break;
      case 'get':
        await this.interactiveGetSecret();
        break;
      case 'list':
        await this.listSecrets();
        break;
      case 'delete':
        await this.interactiveDeleteSecret();
        break;
      case 'generate':
        await this.interactiveGenerateSecret();
        break;
      case 'export':
        await this.interactiveExportSecrets();
        break;
      case 'import':
        await this.interactiveImportSecrets();
        break;
    }
  }

  /**
   * Interactive set secret
   */
  private async interactiveSetSecret(): Promise<void> {
    const key = await clack.text({
      message: 'Enter secret key:',
      validate: (input) => {
        if (!input || input.length === 0) {
          return 'Secret key cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(input)) {
          return 'Secret key must start with a letter and contain only letters, numbers, hyphens, dots, and underscores';
        }
        return undefined;
      }
    });

    if (clack.isCancel(key)) return;

    await this.setSecret(key, {});
  }

  /**
   * Interactive get secret
   */
  private async interactiveGetSecret(): Promise<void> {
    const manager = await this.getSecretManager();
    const keys = await manager.list();

    if (keys.length === 0) {
      InteractiveHelpers.showInfo('No secrets found');
      return;
    }

    const key = await clack.select({
      message: 'Select secret to retrieve:',
      options: keys.sort().map(k => ({ value: k, label: k })),
    });

    if (clack.isCancel(key)) return;

    await this.getSecret(key);
  }

  /**
   * Interactive delete secret
   */
  private async interactiveDeleteSecret(): Promise<void> {
    const manager = await this.getSecretManager();
    const keys = await manager.list();

    if (keys.length === 0) {
      InteractiveHelpers.showInfo('No secrets found');
      return;
    }

    const key = await clack.select({
      message: 'Select secret to delete:',
      options: keys.sort().map(k => ({ value: k, label: k })),
    });

    if (clack.isCancel(key)) return;

    await this.deleteSecret(key, { force: false });
  }

  /**
   * Interactive generate secret
   */
  private async interactiveGenerateSecret(): Promise<void> {
    const key = await clack.text({
      message: 'Enter secret key:',
      validate: (input) => {
        if (!input || input.length === 0) {
          return 'Secret key cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(input)) {
          return 'Secret key must start with a letter and contain only letters, numbers, hyphens, dots, and underscores';
        }
        return undefined;
      }
    });

    if (clack.isCancel(key)) return;

    const lengthInput = await clack.text({
      message: 'Enter secret length:',
      initialValue: '32',
      validate: (input) => {
        const length = parseInt(input, 10);
        if (isNaN(length) || length < 1 || length > 256) {
          return 'Length must be a number between 1 and 256';
        }
        return undefined;
      }
    });

    if (clack.isCancel(lengthInput)) return;

    await this.generateSecret(key, { length: lengthInput, force: false });
  }

  /**
   * Interactive export secrets
   */
  private async interactiveExportSecrets(): Promise<void> {
    const format = await clack.select({
      message: 'Select export format:',
      options: [
        { value: 'json', label: 'JSON format' },
        { value: 'env', label: 'Environment variables' },
      ],
    });

    if (clack.isCancel(format)) return;

    await this.exportSecrets({ format, force: false });
  }

  /**
   * Interactive import secrets
   */
  private async interactiveImportSecrets(): Promise<void> {
    const source = await clack.select({
      message: 'Import from:',
      options: [
        { value: 'file', label: 'File' },
        { value: 'stdin', label: 'Standard input (paste/pipe)' },
      ],
    });

    if (clack.isCancel(source)) return;

    const format = await clack.select({
      message: 'Select input format:',
      options: [
        { value: 'json', label: 'JSON format' },
        { value: 'env', label: 'Environment variables' },
      ],
    });

    if (clack.isCancel(format)) return;

    let file: string | undefined;

    if (source === 'file') {
      const filePath = await clack.text({
        message: 'Enter file path:',
        validate: (input) => {
          if (!input || input.length === 0) {
            return 'File path cannot be empty';
          }
          return undefined;
        }
      });

      if (clack.isCancel(filePath)) return;
      file = filePath;
    }

    await this.importSecrets({ file, format });
  }

  /**
   * Handle subcommand execution with error handling
   */
  private async handleSubcommand(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (error instanceof Error) {
        clack.log.error(error.message);
      } else {
        clack.log.error('An unknown error occurred');
      }
      process.exit(1);
    }
  }

  private async getSecretManager(): Promise<SecretManager> {
    // Load configuration to get secret provider settings
    await this.initializeConfig({});
    return this.configManager.getSecretManager();
  }

  private async setSecret(key: string, options: any): Promise<void> {
    const manager = await this.getSecretManager();

    let value = options.value;

    if (value === undefined) {
      // Prompt for value if not provided
      const input = await clack.password({
        message: `Enter value for secret '${key}':`,
        validate: (input) => {
          if (!input || input.length === 0) {
            return 'Secret value cannot be empty';
          }
          return undefined;
        }
      });

      if (clack.isCancel(input)) {
        clack.cancel('Operation cancelled');
        process.exit(1);
      }

      value = input;
    }

    const spinner = clack.spinner();
    spinner.start(`Setting secret '${key}'`);

    try {
      await manager.set(key, value);
      spinner.stop(`Secret '${key}' set successfully`);
      clack.outro(chalk.green('✓') + ' Secret stored securely');
    } catch (error) {
      spinner.stop('Failed to set secret');
      throw error;
    }
  }

  private async getSecret(key: string): Promise<void> {
    const manager = await this.getSecretManager();

    const spinner = clack.spinner();
    spinner.start(`Retrieving secret '${key}'`);

    try {
      const value = await manager.get(key);
      spinner.stop();

      if (value === null) {
        clack.log.error(`Secret '${key}' not found`);
        process.exit(1);
      }

      // Output the value directly for scripting
      console.log(value);
    } catch (error) {
      spinner.stop('Failed to get secret');
      throw error;
    }
  }

  private async listSecrets(): Promise<void> {
    const manager = await this.getSecretManager();

    const spinner = clack.spinner();
    spinner.start('Loading secrets');

    try {
      const keys = await manager.list();
      spinner.stop();

      if (keys.length === 0) {
        clack.log.info('No secrets found');
        return;
      }

      clack.log.message(chalk.bold(`Found ${keys.length} secret${keys.length === 1 ? '' : 's'}:`));

      for (const key of keys.sort()) {
        console.log(`  ${chalk.cyan('•')} ${key}`);
      }
    } catch (error) {
      spinner.stop('Failed to list secrets');
      throw error;
    }
  }

  private async deleteSecret(key: string, options: any): Promise<void> {
    const manager = await this.getSecretManager();

    if (!options.force) {
      const confirm = await clack.confirm({
        message: `Are you sure you want to delete secret '${key}'?`
      });

      if (clack.isCancel(confirm) || !confirm) {
        clack.cancel('Operation cancelled');
        process.exit(1);
      }
    }

    const spinner = clack.spinner();
    spinner.start(`Deleting secret '${key}'`);

    try {
      await manager.delete(key);
      spinner.stop(`Secret '${key}' deleted`);
      clack.outro(chalk.green('✓') + ' Secret removed');
    } catch (error) {
      spinner.stop('Failed to delete secret');
      throw error;
    }
  }

  private async generateSecret(key: string, options: any): Promise<void> {
    const manager = await this.getSecretManager();
    const length = parseInt(options.length, 10);

    if (isNaN(length) || length < 1 || length > 256) {
      clack.log.error('Invalid length. Must be between 1 and 256.');
      process.exit(1);
    }

    // Check if secret already exists
    if (await manager.has(key) && !options.force) {
      const confirm = await clack.confirm({
        message: `Secret '${key}' already exists. Overwrite?`
      });

      if (clack.isCancel(confirm) || !confirm) {
        clack.cancel('Operation cancelled');
        process.exit(1);
      }
    }

    const spinner = clack.spinner();
    spinner.start(`Generating ${length}-character secret`);

    try {
      const { generateSecret } = await import('../secrets/crypto.js');
      const value = generateSecret(length);

      await manager.set(key, value);
      spinner.stop(`Secret '${key}' generated and stored`);

      // Show the generated value
      clack.log.message(`Generated value: ${chalk.gray(value)}`);
      clack.outro(chalk.green('✓') + ' Secret stored securely');
    } catch (error) {
      spinner.stop('Failed to generate secret');
      throw error;
    }
  }

  private async exportSecrets(options: any): Promise<void> {
    const manager = await this.getSecretManager();

    if (!options.force) {
      const confirm = await clack.confirm({
        message: chalk.yellow('WARNING: This will output all secrets in plain text. Continue?')
      });

      if (clack.isCancel(confirm) || !confirm) {
        clack.cancel('Export cancelled');
        process.exit(1);
      }
    }

    const spinner = clack.spinner();
    spinner.start('Exporting secrets');

    try {
      const keys = await manager.list();
      const secrets: Record<string, string> = {};

      for (const key of keys) {
        const value = await manager.get(key);
        if (value !== null) {
          secrets[key] = value;
        }
      }

      spinner.stop();

      if (options.format === 'env') {
        // Export as environment variables
        for (const [key, value] of Object.entries(secrets)) {
          const envKey = `SECRET_${key.toUpperCase().replace(/[.-]/g, '_')}`;
          console.log(`export ${envKey}="${value.replace(/"/g, '\\"')}"`);
        }
      } else {
        // Export as JSON
        console.log(JSON.stringify(secrets, null, 2));
      }
    } catch (error) {
      spinner.stop('Failed to export secrets');
      throw error;
    }
  }

  private async importSecrets(options: any): Promise<void> {
    const manager = await this.getSecretManager();

    let content: string;

    if (options.file) {
      const fs = await import('fs/promises');
      content = await fs.readFile(options.file, 'utf-8');
    } else {
      // Read from stdin
      content = await new Promise<string>((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => data += chunk);
        process.stdin.on('end', () => resolve(data));
      });
    }

    const spinner = clack.spinner();
    spinner.start('Importing secrets');

    try {
      let secrets: Record<string, string> = {};

      if (options.format === 'env') {
        // Parse environment variable format
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^(?:export\s+)?SECRET_([A-Z0-9_]+)=["']?(.+?)["']?$/);
          if (match) {
            const key = match[1]!.toLowerCase().replace(/_/g, '-');
            const value = match[2]!;
            secrets[key] = value;
          }
        }
      } else {
        // Parse JSON format
        secrets = JSON.parse(content);
      }

      const keys = Object.keys(secrets);
      let imported = 0;

      for (const [key, value] of Object.entries(secrets)) {
        await manager.set(key, value);
        imported++;
      }

      spinner.stop(`Imported ${imported} secret${imported === 1 ? '' : 's'}`);
      clack.outro(chalk.green('✓') + ' Secrets imported successfully');
    } catch (error) {
      spinner.stop('Failed to import secrets');
      throw error;
    }
  }
}

// Export command registration function
export default function command(program: Command): void {
  const command = new SecretsCommand();
  const secretsCmd = command.create();
  program.addCommand(secretsCmd);
}