import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { BaseCommand } from '../utils/command-base.js';

interface EnvOptions {
  file?: string;
  format?: 'shell' | 'json' | 'dotenv';
  export?: boolean;
  prefix?: string;
}

interface EnvSetOptions {
  file?: string;
  force?: boolean;
}

interface EnvGetOptions {
  file?: string;
  default?: string;
}

interface EnvListOptions {
  file?: string;
  filter?: string;
  format?: 'table' | 'json' | 'shell';
  showValues?: boolean;
}

class EnvCommand extends BaseCommand {
  constructor() {
    super({
      name: 'env',
      description: 'Manage environment variables'
    });
  }

  override create(): Command {
    const env = super.create();

    // Subcommands
    this.addGetCommand(env);
    this.addSetCommand(env);
    this.addUnsetCommand(env);
    this.addListCommand(env);
    this.addLoadCommand(env);
    this.addExportCommand(env);
    this.addImportCommand(env);
    this.addValidateCommand(env);

    return env;
  }

  private addGetCommand(env: Command): void {
    env
      .command('get <name>')
      .description('Get environment variable value')
      .option('-f, --file <path>', 'Environment file', '.xec/.env')
      .option('-d, --default <value>', 'Default value if not found')
      .action(async (name: string, options: EnvGetOptions) => {
        try {
          const envFile = path.resolve(options.file || '.xec/.env');
          let value: string | undefined;

          // Try to get from process env first
          value = process.env[name];

          // If not found, try from file
          if (!value && await fs.pathExists(envFile)) {
            const envConfig = dotenv.parse(await fs.readFile(envFile, 'utf-8'));
            value = envConfig[name];
          }

          if (value) {
            console.log(value);
          } else if (options.default) {
            console.log(options.default);
          } else {
            this.log(`Environment variable '${name}' not found`, 'warn');
            process.exit(1);
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addSetCommand(env: Command): void {
    env
      .command('set <name> <value>')
      .description('Set environment variable')
      .option('-f, --file <path>', 'Environment file', '.xec/.env')
      .option('--force', 'Overwrite existing value')
      .action(async (name: string, value: string, options: EnvSetOptions) => {
        try {
          const envFile = path.resolve(options.file || '.xec/.env');
          
          // Ensure directory exists
          await fs.ensureDir(path.dirname(envFile));

          // Load existing env vars
          let envVars: Record<string, string> = {};
          if (await fs.pathExists(envFile)) {
            const content = await fs.readFile(envFile, 'utf-8');
            envVars = dotenv.parse(content);
          }

          // Check if already exists
          if (envVars[name] && !options.force) {
            const shouldOverwrite = await clack.confirm({
              message: `Variable '${name}' already exists. Overwrite?`,
              initialValue: false
            });

            if (!shouldOverwrite) {
              this.log('Operation cancelled', 'info');
              return;
            }
          }

          // Set the value
          envVars[name] = value;

          // Write back to file
          const content = Object.entries(envVars)
            .map(([k, v]) => `${k}=${this.escapeValue(v)}`)
            .join('\n');

          await fs.writeFile(envFile, content + '\n');

          this.log(`${chalk.green('✓')} Set ${name}=${value}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addUnsetCommand(env: Command): void {
    env
      .command('unset <names...>')
      .description('Remove environment variables')
      .option('-f, --file <path>', 'Environment file', '.xec/.env')
      .action(async (names: string[], options) => {
        try {
          const envFile = path.resolve(options.file || '.xec/.env');

          if (!await fs.pathExists(envFile)) {
            this.log('Environment file not found', 'warn');
            return;
          }

          // Load existing env vars
          const content = await fs.readFile(envFile, 'utf-8');
          const envVars = dotenv.parse(content);

          // Remove specified variables
          let removed = 0;
          for (const name of names) {
            if (envVars[name]) {
              delete envVars[name];
              removed++;
            }
          }

          if (removed === 0) {
            this.log('No variables were removed', 'warn');
            return;
          }

          // Write back to file
          const newContent = Object.entries(envVars)
            .map(([k, v]) => `${k}=${this.escapeValue(v)}`)
            .join('\n');

          await fs.writeFile(envFile, newContent ? newContent + '\n' : '');

          this.log(`${chalk.green('✓')} Removed ${removed} variable(s)`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addListCommand(env: Command): void {
    env
      .command('list')
      .alias('ls')
      .description('List environment variables')
      .option('-f, --file <path>', 'Environment file', '.xec/.env')
      .option('--filter <pattern>', 'Filter by pattern')
      .option('--format <format>', 'Output format (table|json|shell)', 'table')
      .option('--show-values', 'Show variable values (be careful!)')
      .action(async (options: EnvListOptions) => {
        try {
          const envFile = path.resolve(options.file || '.xec/.env');
          let envVars: Record<string, string> = {};

          // Load from file if exists
          if (await fs.pathExists(envFile)) {
            const content = await fs.readFile(envFile, 'utf-8');
            envVars = dotenv.parse(content);
          }

          // Merge with process env if showing all
          if (!options.file) {
            for (const [key, value] of Object.entries(process.env)) {
              if (value !== undefined) {
                envVars[key] = value;
              }
            }
          }

          // Filter if needed
          let entries = Object.entries(envVars);
          if (options.filter) {
            const pattern = new RegExp(options.filter, 'i');
            entries = entries.filter(([key]) => pattern.test(key));
          }

          // Sort by key
          entries.sort(([a], [b]) => a.localeCompare(b));

          if (entries.length === 0) {
            this.log('No environment variables found', 'warn');
            return;
          }

          // Display based on format
          switch (options.format) {
            case 'json':
              if (options.showValues) {
                console.log(JSON.stringify(Object.fromEntries(entries), null, 2));
              } else {
                console.log(JSON.stringify(entries.map(([k]) => k), null, 2));
              }
              break;

            case 'shell':
              entries.forEach(([key, value]) => {
                if (options.showValues) {
                  console.log(`export ${key}="${this.escapeShellValue(value)}"`);
                } else {
                  console.log(`export ${key}`);
                }
              });
              break;

            default: // table
              console.log(chalk.bold('Environment Variables:'));
              entries.forEach(([key, value]) => {
                if (options.showValues) {
                  const displayValue = value.length > 50 
                    ? value.substring(0, 47) + '...' 
                    : value;
                  console.log(`  ${chalk.cyan(key)} = ${chalk.gray(displayValue)}`);
                } else {
                  console.log(`  ${chalk.cyan(key)}`);
                }
              });
              console.log(`\n${chalk.gray(`Total: ${entries.length} variables`)}`);
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addLoadCommand(env: Command): void {
    env
      .command('load [files...]')
      .description('Load environment files')
      .option('--override', 'Override existing variables')
      .action(async (files: string[], options) => {
        try {
          const envFiles = files.length > 0 ? files : ['.xec/.env'];
          let totalLoaded = 0;

          for (const file of envFiles) {
            const resolvedPath = path.resolve(file);
            
            if (!await fs.pathExists(resolvedPath)) {
              this.log(`File not found: ${file}`, 'warn');
              continue;
            }

            this.startSpinner(`Loading ${file}...`);
            
            const result = dotenv.config({
              path: resolvedPath,
              override: options.override
            });

            this.stopSpinner();

            if (result.error) {
              this.log(`Failed to load ${file}: ${result.error.message}`, 'error');
            } else {
              const count = Object.keys(result.parsed || {}).length;
              totalLoaded += count;
              this.log(`${chalk.green('✓')} Loaded ${count} variables from ${file}`, 'success');
            }
          }

          if (totalLoaded > 0) {
            this.log(`\nTotal variables loaded: ${totalLoaded}`, 'info');
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addExportCommand(env: Command): void {
    env
      .command('export [file]')
      .description('Export environment variables')
      .option('-f, --format <format>', 'Export format (shell|json|dotenv)', 'dotenv')
      .option('--prefix <prefix>', 'Filter by prefix')
      .option('-o, --output <file>', 'Output file (default: stdout)')
      .action(async (file: string | undefined, options: any) => {
        try {
          let envVars: Record<string, string> = {};

          if (file) {
            // Export from specific file
            const resolvedPath = path.resolve(file);
            if (!await fs.pathExists(resolvedPath)) {
              throw new Error(`File not found: ${file}`);
            }
            const content = await fs.readFile(resolvedPath, 'utf-8');
            envVars = dotenv.parse(content);
          } else {
            // Export from current environment
            envVars = {};
            for (const [key, value] of Object.entries(process.env)) {
              if (value !== undefined) {
                envVars[key] = value;
              }
            }
          }

          // Filter by prefix if specified
          if (options.prefix) {
            const filtered: Record<string, string> = {};
            Object.entries(envVars).forEach(([key, value]) => {
              if (key.startsWith(options.prefix!)) {
                filtered[key] = value;
              }
            });
            envVars = filtered;
          }

          // Format output
          let output: string;
          switch (options.format) {
            case 'json':
              output = JSON.stringify(envVars, null, 2);
              break;
            
            case 'shell':
              output = Object.entries(envVars)
                .map(([k, v]) => `export ${k}="${this.escapeShellValue(v)}"`)
                .join('\n');
              break;
            
            default: // dotenv
              output = Object.entries(envVars)
                .map(([k, v]) => `${k}=${this.escapeValue(v)}`)
                .join('\n');
          }

          // Write output
          if (options.output) {
            await fs.writeFile(options.output, output + '\n');
            this.log(`${chalk.green('✓')} Exported to ${options.output}`, 'success');
          } else {
            console.log(output);
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addImportCommand(env: Command): void {
    env
      .command('import <file>')
      .description('Import environment variables from file')
      .option('--format <format>', 'Import format (auto|json|dotenv)', 'auto')
      .option('--prefix <prefix>', 'Add prefix to all variables')
      .option('-o, --output <file>', 'Output file', '.xec/.env')
      .option('--merge', 'Merge with existing variables')
      .action(async (file: string, options) => {
        try {
          const inputPath = path.resolve(file);
          if (!await fs.pathExists(inputPath)) {
            throw new Error(`File not found: ${file}`);
          }

          const content = await fs.readFile(inputPath, 'utf-8');
          let envVars: Record<string, string> = {};

          // Detect format
          let format = options.format;
          if (format === 'auto') {
            if (file.endsWith('.json')) {
              format = 'json';
            } else {
              format = 'dotenv';
            }
          }

          // Parse based on format
          if (format === 'json') {
            const data = JSON.parse(content);
            if (typeof data !== 'object') {
              throw new Error('Invalid JSON format: expected object');
            }
            envVars = data;
          } else {
            envVars = dotenv.parse(content);
          }

          // Add prefix if specified
          if (options.prefix) {
            const prefixed: Record<string, string> = {};
            Object.entries(envVars).forEach(([key, value]) => {
              prefixed[`${options.prefix}${key}`] = value;
            });
            envVars = prefixed;
          }

          // Load existing vars if merging
          const outputPath = path.resolve(options.output);
          if (options.merge && await fs.pathExists(outputPath)) {
            const existing = await fs.readFile(outputPath, 'utf-8');
            const existingVars = dotenv.parse(existing);
            envVars = { ...existingVars, ...envVars };
          }

          // Write output
          await fs.ensureDir(path.dirname(outputPath));
          const output = Object.entries(envVars)
            .map(([k, v]) => `${k}=${this.escapeValue(v)}`)
            .join('\n');

          await fs.writeFile(outputPath, output + '\n');

          this.log(`${chalk.green('✓')} Imported ${Object.keys(envVars).length} variables to ${options.output}`, 'success');
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addValidateCommand(env: Command): void {
    env
      .command('validate [file]')
      .description('Validate environment file')
      .option('--schema <file>', 'Schema file for validation')
      .option('--required <vars>', 'Comma-separated list of required variables')
      .action(async (file: string | undefined, options) => {
        try {
          const envFile = path.resolve(file || '.xec/.env');
          
          if (!await fs.pathExists(envFile)) {
            throw new Error(`File not found: ${envFile}`);
          }

          this.startSpinner('Validating environment file...');

          const content = await fs.readFile(envFile, 'utf-8');
          const envVars = dotenv.parse(content);
          const issues: string[] = [];

          // Check for empty values
          Object.entries(envVars).forEach(([key, value]) => {
            if (!value || value.trim() === '') {
              issues.push(`Empty value for ${key}`);
            }
          });

          // Check required variables
          if (options.required) {
            const required = options.required.split(',').map((v: string) => v.trim());
            for (const varName of required) {
              if (!envVars[varName]) {
                issues.push(`Missing required variable: ${varName}`);
              }
            }
          }

          // Validate against schema if provided
          if (options.schema) {
            const schemaPath = path.resolve(options.schema);
            if (await fs.pathExists(schemaPath)) {
              const schemaContent = await fs.readFile(schemaPath, 'utf-8');
              const schema = JSON.parse(schemaContent);
              
              // Simple schema validation (can be extended)
              if (schema.required) {
                for (const varName of schema.required) {
                  if (!envVars[varName]) {
                    issues.push(`Missing required variable: ${varName}`);
                  }
                }
              }

              if (schema.patterns) {
                Object.entries(schema.patterns).forEach(([varName, pattern]: [string, any]) => {
                  if (envVars[varName] && !new RegExp(pattern).test(envVars[varName])) {
                    issues.push(`Invalid format for ${varName}`);
                  }
                });
              }
            }
          }

          this.stopSpinner();

          if (issues.length === 0) {
            this.log(chalk.green('✓ Environment file is valid'), 'success');
          } else {
            this.log(chalk.red('✗ Validation failed:'), 'error');
            issues.forEach(issue => {
              this.log(`  - ${issue}`, 'error');
            });
            process.exit(1);
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private escapeValue(value: string): string {
    // Escape special characters for .env format
    if (value.includes('\n') || value.includes('"') || value.includes("'")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  private escapeShellValue(value: string): string {
    // Escape for shell export
    return value.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  }

  override async execute(): Promise<void> {
    // This is called when 'env' is run without subcommands
    const program = this.create();
    program.outputHelp();
  }
}

export default function envCommand(program: Command): void {
  const cmd = new EnvCommand();
  program.addCommand(cmd.create());
}