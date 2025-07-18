import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import { Command } from 'commander';
import { EnvironmentManager } from '@xec/core';

import { SubcommandBase } from '../../utils/command-base.js';
import { errorMessages } from '../../utils/error-handler.js';

interface EnvOptions {
  global?: boolean;
  file?: string;
  export?: boolean;
  force?: boolean;
  scope?: 'local' | 'global' | 'system';
}

export class EnvCommand extends SubcommandBase {
  private envManager: EnvironmentManager;

  constructor() {
    super({
      name: 'env',
      description: 'Manage environment variables and configurations',
      examples: [
        {
          command: 'xec project env list',
          description: 'List all environment variables',
        },
        {
          command: 'xec project env set NODE_ENV production',
          description: 'Set environment variable',
        },
        {
          command: 'xec project env get NODE_ENV',
          description: 'Get environment variable value',
        },
        {
          command: 'xec project env load --file .env.production',
          description: 'Load environment from file',
        },
        {
          command: 'xec project env detect',
          description: 'Auto-detect environment configuration',
        },
      ],
    });
    
    this.envManager = new EnvironmentManager();
  }

  protected setupSubcommands(command: Command): void {
    // xec project env list
    command
      .command('list')
      .description('List environment variables')
      .option('--global', 'Show global environment variables')
      .option('--filter <pattern>', 'Filter variables by pattern')
      .option('--export', 'Show in export format')
      .action(async (options: EnvOptions & { filter?: string }) => {
        this.options = { ...this.options, ...options };
        await this.listEnv(options);
      });

    // xec project env get
    command
      .command('get')
      .description('Get environment variable value')
      .argument('<name>', 'Variable name')
      .option('--global', 'Get from global environment')
      .option('--default <value>', 'Default value if not found')
      .action(async (name: string, options: EnvOptions & { default?: string }) => {
        this.options = { ...this.options, ...options };
        await this.getEnv(name, options);
      });

    // xec project env set
    command
      .command('set')
      .description('Set environment variable')
      .argument('<name>', 'Variable name')
      .argument('<value>', 'Variable value')
      .option('--global', 'Set in global environment')
      .option('--scope <scope>', 'Variable scope (local|global|system)', 'local')
      .option('--export', 'Add to export list')
      .action(async (name: string, value: string, options: EnvOptions) => {
        this.options = { ...this.options, ...options };
        await this.setEnv(name, value, options);
      });

    // xec project env unset
    command
      .command('unset')
      .description('Unset environment variable')
      .argument('<name>', 'Variable name')
      .option('--global', 'Unset from global environment')
      .option('--force', 'Skip confirmation prompt')
      .action(async (name: string, options: EnvOptions) => {
        this.options = { ...this.options, ...options };
        await this.unsetEnv(name, options);
      });

    // xec project env load
    command
      .command('load')
      .description('Load environment from file')
      .option('-f, --file <file>', 'Environment file to load', '.env')
      .option('--merge', 'Merge with existing environment')
      .option('--override', 'Override existing variables')
      .action(async (options: EnvOptions & { merge?: boolean; override?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.loadEnv(options);
      });

    // xec project env save
    command
      .command('save')
      .description('Save environment to file')
      .option('-f, --file <file>', 'File to save to', '.env')
      .option('--filter <pattern>', 'Filter variables by pattern')
      .option('--format <format>', 'Output format (env|json|yaml)', 'env')
      .action(async (options: EnvOptions & { filter?: string; format?: string }) => {
        this.options = { ...this.options, ...options };
        await this.saveEnv(options);
      });

    // xec project env detect
    command
      .command('detect')
      .description('Auto-detect environment configuration')
      .option('--save', 'Save detected configuration')
      .option('--file <file>', 'File to save to', '.env.detected')
      .action(async (options: EnvOptions & { save?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.detectEnv(options);
      });

    // xec project env validate
    command
      .command('validate')
      .description('Validate environment configuration')
      .option('-f, --file <file>', 'Environment file to validate')
      .option('--schema <schema>', 'Schema file for validation')
      .action(async (options: EnvOptions & { schema?: string }) => {
        this.options = { ...this.options, ...options };
        await this.validateEnv(options);
      });

    // xec project env diff
    command
      .command('diff')
      .description('Compare environment configurations')
      .argument('<env1>', 'First environment or file')
      .argument('<env2>', 'Second environment or file')
      .option('--keys-only', 'Show only differing keys')
      .action(async (env1: string, env2: string, options: { keysOnly?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.diffEnv(env1, env2, options);
      });

    // xec project env template
    command
      .command('template')
      .description('Generate environment template')
      .option('-f, --file <file>', 'Template file to generate', '.env.template')
      .option('--from <file>', 'Generate from existing env file')
      .option('--include-comments', 'Include helpful comments')
      .action(async (options: EnvOptions & { from?: string; includeComments?: boolean }) => {
        this.options = { ...this.options, ...options };
        await this.generateTemplate(options);
      });
  }

  private async listEnv(options: EnvOptions & { filter?: string }): Promise<void> {
    const env = options.global ? process.env : await this.loadLocalEnv();
    let variables = Object.entries(env);

    // Filter variables
    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      variables = variables.filter(([key]) => pattern.test(key));
    }

    if (options.export) {
      // Show in export format
      const exportLines = variables.map(([key, value]) => `export ${key}="${value}"`);
      exportLines.forEach(line => console.log(line));
    } else {
      // Show in table format
      const tableData = {
        columns: [
          { header: 'Name', width: 30 },
          { header: 'Value', width: 50 },
          { header: 'Source', width: 15 },
        ],
        rows: variables.map(([key, value]) => [
          key,
          this.truncateValue(value || ''),
          this.getVariableSource(key, options.global),
        ]),
      };
      
      this.formatter.table(tableData);
    }
  }

  private async getEnv(name: string, options: EnvOptions & { default?: string }): Promise<void> {
    const env = options.global ? process.env : await this.loadLocalEnv();
    const value = env[name] || options.default;
    
    if (value === undefined) {
      throw errorMessages.configurationInvalid('variable', `Environment variable '${name}' not found`);
    }

    this.output(value, `Environment Variable: ${name}`);
  }

  private async setEnv(name: string, value: string, options: EnvOptions): Promise<void> {
    if (options.global) {
      // Set in global environment (for current session)
      process.env[name] = value;
      this.log(`Global environment variable '${name}' set`, 'success');
    } else {
      // Set in local environment file
      await this.updateLocalEnv(name, value, options);
      this.log(`Local environment variable '${name}' set`, 'success');
    }
  }

  private async unsetEnv(name: string, options: EnvOptions): Promise<void> {
    if (!options.force) {
      const confirm = await this.confirm(`Are you sure you want to unset '${name}'?`);
      if (!confirm) {
        this.log('Environment variable unset cancelled', 'info');
        return;
      }
    }

    if (options.global) {
      delete process.env[name];
      this.log(`Global environment variable '${name}' unset`, 'success');
    } else {
      await this.updateLocalEnv(name, null, options);
      this.log(`Local environment variable '${name}' unset`, 'success');
    }
  }

  private async loadEnv(options: EnvOptions & { merge?: boolean; override?: boolean }): Promise<void> {
    const envFile = options.file || '.env';
    const envPath = path.resolve(envFile);
    
    try {
      const parsed = dotenv.config({ path: envPath });
      
      if (parsed.error) {
        throw parsed.error;
      }

      const loadedCount = Object.keys(parsed.parsed || {}).length;
      this.log(`Loaded ${loadedCount} environment variables from ${envFile}`, 'success');
      
      if (this.isVerbose()) {
        this.formatter.keyValue(parsed.parsed || {}, 'Loaded Variables');
      }
    } catch (error) {
      throw errorMessages.fileNotFound(envPath);
    }
  }

  private async saveEnv(options: EnvOptions & { filter?: string; format?: string }): Promise<void> {
    const envFile = options.file || '.env';
    const env = await this.loadLocalEnv();
    let variables = Object.entries(env);

    // Filter variables
    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      variables = variables.filter(([key]) => pattern.test(key));
    }

    let content: string;
    switch (options.format) {
      case 'json':
        content = JSON.stringify(Object.fromEntries(variables), null, 2);
        break;
      case 'yaml':
        const yaml = await import('js-yaml');
        content = yaml.dump(Object.fromEntries(variables));
        break;
      default:
        content = variables.map(([key, value]) => `${key}=${value}`).join('\n');
    }

    await fs.writeFile(envFile, content);
    this.log(`Environment saved to ${envFile}`, 'success');
  }

  private async detectEnv(options: EnvOptions & { save?: boolean }): Promise<void> {
    this.log('Detecting environment configuration...', 'info');
    
    const detected = await this.envManager.detectEnvironment();
    
    this.formatter.keyValue({
      'Platform OS': detected.platform.os,
      'Architecture': detected.platform.arch,
      'Environment Type': detected.type,
      'OS Distribution': detected.platform.distro || 'N/A',
      'OS Version': detected.platform.version || 'N/A',
      'User': detected.connection?.user || 'N/A',
      'Host': detected.connection?.host || 'localhost',
      'Shell Available': detected.capabilities.shell ? 'Yes' : 'No',
      'Sudo Available': detected.capabilities.sudo ? 'Yes' : 'No',
      'Docker Available': detected.capabilities.docker ? 'Yes' : 'No',
      'Systemd Available': detected.capabilities.systemd ? 'Yes' : 'No',
    }, 'Detected Environment');

    if (options.save) {
      const envFile = options.file || '.env.detected';
      const envContent = [
        `# Environment detected on ${new Date().toISOString()}`,
        `PLATFORM=${detected.platform.os}`,
        `ARCHITECTURE=${detected.platform.arch}`,
        `NODE_ENV=${detected.type}`,
        `OS_TYPE=${detected.platform.os}`,
        `OS_DISTRO=${detected.platform.distro || 'unknown'}`,
        `OS_RELEASE=${detected.platform.version || 'unknown'}`,
        `USER=${detected.connection?.user || 'unknown'}`,
        `HOST=${detected.connection?.host || 'localhost'}`,
        `HAS_SHELL=${detected.capabilities.shell}`,
        `HAS_SUDO=${detected.capabilities.sudo}`,
        `HAS_DOCKER=${detected.capabilities.docker}`,
        `HAS_SYSTEMD=${detected.capabilities.systemd}`,
      ].join('\n');
      
      await fs.writeFile(envFile, envContent);
      this.log(`Detected environment saved to ${envFile}`, 'success');
    }
  }

  private async validateEnv(options: EnvOptions & { schema?: string }): Promise<void> {
    const envFile = options.file || '.env';
    const env = await this.loadEnvFile(envFile);
    
    // Basic validation
    const issues: string[] = [];
    
    Object.entries(env).forEach(([key, value]) => {
      // Check for empty values
      if (!value || value.trim() === '') {
        issues.push(`Empty value for ${key}`);
      }
      
      // Check for suspicious patterns
      if (value.includes('TODO') || value.includes('FIXME') || value.includes('CHANGE_ME')) {
        issues.push(`Placeholder value in ${key}: ${value}`);
      }
      
      // Check for potential secrets in key names
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
        if (value.length < 8) {
          issues.push(`Potentially weak secret in ${key}`);
        }
      }
    });
    
    if (issues.length > 0) {
      this.log(`Found ${issues.length} validation issues:`, 'warn');
      issues.forEach(issue => this.log(`  - ${issue}`, 'warn'));
    } else {
      this.log('Environment validation passed', 'success');
    }
  }

  private async diffEnv(env1: string, env2: string, options: { keysOnly?: boolean }): Promise<void> {
    const envData1 = await this.loadEnvFile(env1);
    const envData2 = await this.loadEnvFile(env2);
    
    const keys1 = new Set(Object.keys(envData1));
    const keys2 = new Set(Object.keys(envData2));
    
    const onlyIn1 = Array.from(keys1).filter(key => !keys2.has(key));
    const onlyIn2 = Array.from(keys2).filter(key => !keys1.has(key));
    const different = Array.from(keys1).filter(key => 
      keys2.has(key) && envData1[key] !== envData2[key]
    );
    
    if (onlyIn1.length > 0) {
      this.log(`Variables only in ${env1}:`, 'info');
      onlyIn1.forEach(key => this.log(`  + ${key}`, 'info'));
    }
    
    if (onlyIn2.length > 0) {
      this.log(`Variables only in ${env2}:`, 'info');
      onlyIn2.forEach(key => this.log(`  + ${key}`, 'info'));
    }
    
    if (different.length > 0) {
      this.log('Different values:', 'warn');
      different.forEach(key => {
        if (options.keysOnly) {
          this.log(`  ~ ${key}`, 'warn');
        } else {
          this.log(`  ~ ${key}:`, 'warn');
          this.log(`    ${env1}: ${envData1[key]}`, 'warn');
          this.log(`    ${env2}: ${envData2[key]}`, 'warn');
        }
      });
    }
    
    if (onlyIn1.length === 0 && onlyIn2.length === 0 && different.length === 0) {
      this.log('No differences found', 'success');
    }
  }

  private async generateTemplate(options: EnvOptions & { from?: string; includeComments?: boolean }): Promise<void> {
    const templateFile = options.file || '.env.template';
    let template = '';
    
    if (options.includeComments) {
      template += '# Environment Configuration Template\n';
      template += `# Generated on ${new Date().toISOString()}\n`;
      template += '# Copy this file to .env and fill in the values\n\n';
    }
    
    if (options.from) {
      const sourceEnv = await this.loadEnvFile(options.from);
      
      Object.entries(sourceEnv).forEach(([key, value]) => {
        if (options.includeComments) {
          template += `# ${key}\n`;
        }
        
        // Remove actual values for security
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
          template += `${key}=\n`;
        } else {
          template += `${key}=${value}\n`;
        }
        
        if (options.includeComments) {
          template += '\n';
        }
      });
    } else {
      // Generate common template
      const commonVars = [
        'NODE_ENV=development',
        'PORT=3000',
        'HOST=localhost',
        'DATABASE_URL=',
        'API_KEY=',
        'SECRET_KEY=',
        'DEBUG=false',
      ];
      
      commonVars.forEach(varLine => {
        template += `${varLine}\n`;
      });
    }
    
    await fs.writeFile(templateFile, template);
    this.log(`Environment template generated: ${templateFile}`, 'success');
  }

  private async loadLocalEnv(): Promise<Record<string, string>> {
    const envPaths = ['.env', '.env.local', '.env.development'];
    const env: Record<string, string> = {};
    
    for (const envPath of envPaths) {
      try {
        const content = await fs.readFile(envPath, 'utf8');
        const parsed = dotenv.parse(content);
        Object.assign(env, parsed);
      } catch {
        // File doesn't exist, continue
      }
    }
    
    return env;
  }

  private async loadEnvFile(filePath: string): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return dotenv.parse(content);
    } catch (error) {
      throw errorMessages.fileNotFound(filePath);
    }
  }

  private async updateLocalEnv(name: string, value: string | null, options: EnvOptions): Promise<void> {
    const envFile = '.env';
    let content = '';
    
    try {
      content = await fs.readFile(envFile, 'utf8');
    } catch {
      // File doesn't exist, will be created
    }
    
    const lines = content.split('\n');
    const existingIndex = lines.findIndex(line => line.startsWith(`${name}=`));
    
    if (value === null) {
      // Remove the variable
      if (existingIndex !== -1) {
        lines.splice(existingIndex, 1);
      }
    } else {
      // Set or update the variable
      const newLine = `${name}=${value}`;
      if (existingIndex !== -1) {
        lines[existingIndex] = newLine;
      } else {
        lines.push(newLine);
      }
    }
    
    const newContent = lines.filter(line => line.trim() !== '').join('\n');
    await fs.writeFile(envFile, newContent);
  }

  private truncateValue(value: string): string {
    if (value.length > 40) {
      return value.substring(0, 37) + '...';
    }
    return value;
  }

  private getVariableSource(key: string, global?: boolean): string {
    if (global) {
      return 'system';
    }
    
    // Check if it's from a specific file
    const envFiles = ['.env', '.env.local', '.env.development'];
    for (const file of envFiles) {
      // This is a simplified check - in real implementation you'd parse each file
      if (process.env[key]) {
        return 'local';
      }
    }
    
    return 'unknown';
  }
}
