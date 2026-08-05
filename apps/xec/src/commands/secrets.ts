import { Command } from 'commander';
import { SecretManager } from '@xec-sh/ops';
import { log, text, prism, outro, cancel, select, confirm, spinner, isCancel, password } from '@xec-sh/kit';

import { ConfigAwareCommand } from '../utils/command-base.js';
import { canPrompt, isPlainOutput } from '../utils/plain-mode.js';
import { InteractiveHelpers } from '../utils/interactive-helpers.js';
import { existsSync, readdirSync } from 'node:fs';
import { getSecretsDir } from '@xec-sh/ops';

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

  private setupSubcommands(cmd: Command): void {
    // Set a secret
    cmd
      .command('set <key>')
      .description('Set a secret value (prompts on a terminal, reads stdin when piped)')
      .option('--value <value>', 'Secret value (visible in the process list while running — prefer piping to stdin)')
      .action(async (key: string, options: any) => {
        await this.handleSubcommand(async () => {
          await this.setSecret(key, options);
        });
      });

    // Get a secret
    cmd
      .command('get <key>')
      .description('Get a secret value')
      .action(async (key: string) => {
        await this.handleSubcommand(async () => {
          await this.getSecret(key);
        });
      });

    // List secrets
    cmd
      .command('list')
      .alias('ls')
      .description('List all secret keys')
      .action(async () => {
        await this.handleSubcommand(async () => {
          await this.listSecrets();
        });
      });

    // Delete a secret
    cmd
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
    cmd
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
    cmd
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
    cmd
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
    if (!canPrompt()) {
      console.error('xec secrets without a subcommand is interactive and needs a terminal.');
      console.error('In scripts, use: secrets set/get/list/delete/generate/export/import.');
      process.exit(1);
    }

    InteractiveHelpers.startInteractiveMode('🔐 Secrets Manager');

    try {
      while (true) {
        const action = await select({
          message: 'What would you like to do?',
          options: [
            { value: 'set', label: '🔒 Set a secret' },
            { value: 'get', label: '🔓 Get a secret' },
            { value: 'list', label: '📋 List all secrets' },
            { value: 'delete', label: '🗑️  Delete a secret' },
            { value: 'generate', label: '🎲 Generate a random secret' },
            { value: 'export', label: '📤 Export secrets (dangerous!)' },
            { value: 'import', label: '📥 Import secrets' },
            { value: 'exit', label: prism.gray('Exit') },
          ],
        });

        if (isCancel(action) || action === 'exit') {
          break;
        }

        await this.handleInteractiveAction(action);

        // Ask if user wants to continue
        const continueAction = await confirm({
          message: 'Would you like to perform another action?',
          initialValue: true,
        });

        if (isCancel(continueAction) || !continueAction) {
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
    const key = await text({
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

    if (isCancel(key)) return;

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

    const key = await select({
      message: 'Select secret to retrieve:',
      options: keys.sort().map(k => ({ value: k, label: k })),
    });

    if (isCancel(key)) return;

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

    const key = await select({
      message: 'Select secret to delete:',
      options: keys.sort().map(k => ({ value: k, label: k })),
    });

    if (isCancel(key)) return;

    await this.deleteSecret(key, { force: false });
  }

  /**
   * Interactive generate secret
   */
  private async interactiveGenerateSecret(): Promise<void> {
    const key = await text({
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

    if (isCancel(key)) return;

    const lengthInput = await text({
      message: 'Enter secret length:',
      initialValue: '32',
      validate: (input) => {
        if (!input) return 'Length is required';
        const length = parseInt(input, 10);
        if (isNaN(length) || length < 1 || length > 256) {
          return 'Length must be a number between 1 and 256';
        }
        return undefined;
      }
    });

    if (isCancel(lengthInput)) return;

    await this.generateSecret(key, { length: lengthInput, force: false });
  }

  /**
   * Interactive export secrets
   */
  private async interactiveExportSecrets(): Promise<void> {
    const format = await select({
      message: 'Select export format:',
      options: [
        { value: 'json', label: 'JSON format' },
        { value: 'env', label: 'Environment variables' },
      ],
    });

    if (isCancel(format)) return;

    await this.exportSecrets({ format, force: false });
  }

  /**
   * Interactive import secrets
   */
  private async interactiveImportSecrets(): Promise<void> {
    const source = await select({
      message: 'Import from:',
      options: [
        { value: 'file', label: 'File' },
        { value: 'stdin', label: 'Standard input (paste/pipe)' },
      ],
    });

    if (isCancel(source)) return;

    const format = await select({
      message: 'Select input format:',
      options: [
        { value: 'json', label: 'JSON format' },
        { value: 'env', label: 'Environment variables' },
      ],
    });

    if (isCancel(format)) return;

    let file: string | undefined;

    if (source === 'file') {
      const filePath = await text({
        message: 'Enter file path:',
        validate: (input) => {
          if (!input || input.length === 0) {
            return 'File path cannot be empty';
          }
          return undefined;
        }
      });

      if (isCancel(filePath)) return;
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
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      if (isPlainOutput()) {
        console.error(message);
      } else {
        log.error(message);
      }
      process.exit(1);
    }
  }

  /**
   * Read all of stdin, for values piped in non-interactively.
   */
  private readStdin(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }

  private async getSecretManager(): Promise<SecretManager> {
    // Load configuration to get secret provider settings
    await this.initializeConfig({});

    // Non-strict config load only warns about an unsupported provider and
    // keeps the default one. Secrets operations must not silently fall back —
    // the user would believe values live in the provider they configured.
    const declared = (this.configManager.getConfig().secrets as { provider?: string } | undefined)?.provider;
    if (declared && !SecretManager.isSupported(declared)) {
      throw new Error(
        `Secrets provider '${declared}' is not supported. Supported providers: local, env, git`
      );
    }

    this.reportScopeOnce();
    return this.configManager.getSecretManager();
  }

  /**
   * Say where the secrets are, once, when the answer just changed.
   *
   * Secrets used to live in one machine-wide store, so a new project saw
   * every other project's keys. Scoping them to the project closes that,
   * and it also means an operator who had keys yesterday finds an empty
   * list today. Silence there would look like data loss; this says what
   * happened and how to bring the values across, and says it once.
   */
  private reportScopeOnce(): void {
    if (SecretsCommand.scopeReported) return;

    const projectStore = getSecretsDir('project');
    const globalStore = getSecretsDir('global');
    if (projectStore === globalStore) return;

    const hasGlobal = existsSync(globalStore) &&
      readdirSync(globalStore).some(name => name.endsWith('.secret'));
    if (!hasGlobal || existsSync(projectStore)) return;

    SecretsCommand.scopeReported = true;
    this.log(
      `Secrets are stored per project since 0.10.2: this project uses ${projectStore}.\n` +
      `  Earlier keys are still in ${globalStore} and are not read from here.\n` +
      `  To bring them across: cp -R ${globalStore}/. ${projectStore}/`,
      'warn'
    );
  }

  /** The notice is about the machine's state, not about one invocation. */
  private static scopeReported = false;

  private async setSecret(key: string, options: any): Promise<void> {
    const manager = await this.getSecretManager();

    let value = options.value;

    if (value === undefined) {
      if (process.stdin.isTTY) {
        // Prompt for value if not provided
        const input = await password({
          message: `Enter value for secret '${key}':`,
          validate: (input_) => {
            if (!input_ || input_.length === 0) {
              return 'Secret value cannot be empty';
            }
            return undefined;
          }
        });

        if (isCancel(input)) {
          cancel('Operation cancelled');
          process.exit(1);
        }

        value = input;
      } else {
        // Piped stdin is the scripted form: the value is the input itself,
        // minus the trailing newline `echo` adds. A masked prompt here would
        // consume the pipe and store nothing while still exiting 0 — for a
        // secret store the worst possible failure.
        value = (await this.readStdin()).replace(/\r?\n$/, '');

        if (value.length === 0) {
          throw new Error(`No value for secret '${key}': stdin was empty. Pipe the value or pass --value.`);
        }
      }
    }

    if (isPlainOutput()) {
      await manager.set(key, value);
      console.error(`Secret '${key}' set`);
      return;
    }

    const s = spinner();
    s.start(`Setting secret '${key}'`);

    try {
      await manager.set(key, value);
      s.stop(`Secret '${key}' set successfully`);
      outro(prism.green('✓') + ' Secret stored securely');
    } catch (error) {
      s.stop('Failed to set secret');
      throw error;
    }
  }

  private async getSecret(key: string): Promise<void> {
    const manager = await this.getSecretManager();

    // In a pipe the value must arrive alone: `VAL=$(xec secrets get key)`
    // captures every byte written to stdout, spinner frames included.
    const s = isPlainOutput() ? null : spinner();
    s?.start(`Retrieving secret '${key}'`);

    try {
      const value = await manager.get(key);
      s?.stop();

      if (value === null) {
        throw new Error(`Secret '${key}' not found`);
      }

      // Output the value directly for scripting
      console.log(value);
    } catch (error) {
      s?.stop('Failed to get secret');
      throw error;
    }
  }

  private async listSecrets(): Promise<void> {
    const manager = await this.getSecretManager();
    const plain = isPlainOutput();

    const s = plain ? null : spinner();
    s?.start('Loading secrets');

    try {
      const keys = await manager.list();
      s?.stop(keys.length === 0 ? 'No secrets found' : undefined);

      if (plain) {
        // Bare keys, one per line — the form loops and xargs can consume.
        for (const key of keys.sort()) {
          console.log(key);
        }
        return;
      }

      if (keys.length === 0) {
        return;
      }

      log.message(prism.bold(`Found ${keys.length} secret${keys.length === 1 ? '' : 's'}:`));

      for (const key of keys.sort()) {
        console.log(`  ${prism.cyan('•')} ${key}`);
      }
    } catch (error) {
      s?.stop('Failed to list secrets');
      throw error;
    }
  }

  private async deleteSecret(key: string, options: any): Promise<void> {
    const manager = await this.getSecretManager();

    if (!options.force) {
      if (!canPrompt()) {
        throw new Error(`Deleting '${key}' needs confirmation: pass --force when running non-interactively.`);
      }

      const confirmResult = await confirm({
        message: `Are you sure you want to delete secret '${key}'?`
      });

      if (isCancel(confirmResult) || !confirmResult) {
        cancel('Operation cancelled');
        process.exit(1);
      }
    }

    if (isPlainOutput()) {
      await manager.delete(key);
      console.error(`Secret '${key}' deleted`);
      return;
    }

    const s = spinner();
    s.start(`Deleting secret '${key}'`);

    try {
      await manager.delete(key);
      s.stop(`Secret '${key}' deleted`);
      outro(prism.green('✓') + ' Secret removed');
    } catch (error) {
      s.stop('Failed to delete secret');
      throw error;
    }
  }

  private async generateSecret(key: string, options: any): Promise<void> {
    const manager = await this.getSecretManager();
    const length = parseInt(options.length, 10);

    if (isNaN(length) || length < 1 || length > 256) {
      throw new Error('Invalid length. Must be between 1 and 256.');
    }

    // Check if secret already exists
    if (await manager.has(key) && !options.force) {
      if (!canPrompt()) {
        throw new Error(`Secret '${key}' already exists: pass --force to overwrite non-interactively.`);
      }

      const confirmResult = await confirm({
        message: `Secret '${key}' already exists. Overwrite?`
      });

      if (isCancel(confirmResult) || !confirmResult) {
        cancel('Operation cancelled');
        process.exit(1);
      }
    }

    if (isPlainOutput()) {
      const { generateSecret } = await import('@xec-sh/ops');
      const value = generateSecret(length);

      await manager.set(key, value);
      // The value alone on stdout, so `TOKEN=$(xec secrets generate t)` works.
      console.log(value);
      console.error(`Secret '${key}' generated (${length} characters)`);
      return;
    }

    const s = spinner();
    s.start(`Generating ${length}-character secret`);

    try {
      const { generateSecret } = await import('@xec-sh/ops');
      const value = generateSecret(length);

      await manager.set(key, value);
      s.stop(`Secret '${key}' generated and stored`);

      // Show the generated value
      log.message(`Generated value: ${prism.gray(value)}`);
      outro(prism.green('✓') + ' Secret stored securely');
    } catch (error) {
      s.stop('Failed to generate secret');
      throw error;
    }
  }

  private async exportSecrets(options: any): Promise<void> {
    const manager = await this.getSecretManager();

    if (!options.force) {
      if (!canPrompt()) {
        throw new Error('Export prints every secret in plain text: pass --force to confirm non-interactively.');
      }

      const confirmResult = await confirm({
        message: prism.yellow('WARNING: This will output all secrets in plain text. Continue?')
      });

      if (isCancel(confirmResult) || !confirmResult) {
        cancel('Export cancelled');
        process.exit(1);
      }
    }

    const s = isPlainOutput() ? null : spinner();
    s?.start('Exporting secrets');

    try {
      const keys = await manager.list();
      const secrets: Record<string, string> = {};

      for (const key of keys) {
        const value = await manager.get(key);
        if (value !== null) {
          secrets[key] = value;
        }
      }

      s?.stop();

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
      s?.stop('Failed to export secrets');
      throw error;
    }
  }

  private async importSecrets(options: any): Promise<void> {
    const manager = await this.getSecretManager();

    let content: string;

    if (options.file) {
      const fs = await import('node:fs/promises');
      content = await fs.readFile(options.file, 'utf-8');
    } else {
      content = await this.readStdin();
    }

    const s = isPlainOutput() ? null : spinner();
    s?.start('Importing secrets');

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

      let imported = 0;

      for (const [key, value] of Object.entries(secrets)) {
        await manager.set(key, value);
        imported++;
      }

      if (s) {
        s.stop(`Imported ${imported} secret${imported === 1 ? '' : 's'}`);
        outro(prism.green('✓') + ' Secrets imported successfully');
      } else {
        console.error(`Imported ${imported} secret${imported === 1 ? '' : 's'}`);
      }
    } catch (error) {
      s?.stop('Failed to import secrets');
      throw error;
    }
  }
}

// Export command registration function
export default function registerCommand(program: Command): void {
  const cmd = new SecretsCommand();
  const secretsCmd = cmd.create();
  program.addCommand(secretsCmd);
}