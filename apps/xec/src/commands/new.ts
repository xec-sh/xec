import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

interface NewOptions {
  type?: 'script' | 'command';
  name?: string;
  description?: string;
  force?: boolean;
  advanced?: boolean;
  js?: boolean; // Generate JavaScript instead of TypeScript
}

// JavaScript Script templates
const BASIC_JS_SCRIPT_TEMPLATE = `#!/usr/bin/env xec

/**
 * {description}
 * 
 * Usage: xec .xec/scripts/{name}.js
 */

import { $ } from '@xec-sh/core';

// Your script logic here
log.info('Running {name} script...');

// Example: Run a command
const result = await $\`echo "Hello from {name} script!"\`;
log.success(result.stdout);

// Example: Work with files
const files = await glob('**/*.js');
log.step(\`Found \${files.length} JavaScript files\`);

// Example: Interactive prompt
const answer = await question({
  message: 'Continue with the operation?',
  defaultValue: 'yes'
});

if (answer.toLowerCase() === 'yes') {
  log.success('Operation completed successfully!');
} else {
  log.info('Operation cancelled');
}
`;

const ADVANCED_JS_SCRIPT_TEMPLATE = `#!/usr/bin/env xec

/**
 * {description}
 * 
 * Usage: xec .xec/scripts/{name}.js [options]
 * 
 * Options can be passed as arguments:
 *   xec .xec/scripts/{name}.js --env=production --dry-run
 */

import { $ } from '@xec-sh/core';

// Parse command line arguments
const options = {
  env: argv.env || 'development',
  dryRun: argv['dry-run'] || false,
  verbose: argv.verbose || false
};

// Configure logging
if (options.verbose) {
  $.verbose = true;
}

log.info(chalk.bold('🚀 {description}'));
log.step(\`Environment: \${options.env}\`);
log.step(\`Dry run: \${options.dryRun}\`);

const spinner = clack.spinner();

try {
  // Step 1: Validation
  spinner.start('Validating environment...');
  await validateEnvironment(options.env);
  spinner.stop('Environment validated');

  // Step 2: Main operation
  if (!options.dryRun) {
    spinner.start('Executing main operation...');
    await executeMainOperation(options);
    spinner.stop('Operation completed');
  } else {
    log.info('Dry run mode - skipping execution');
  }

  // Step 3: Cleanup
  spinner.start('Cleaning up...');
  await cleanup();
  spinner.stop('Cleanup completed');

  log.success(chalk.green('✅ Script completed successfully!'));
  
} catch (error) {
  spinner.stop(chalk.red('Operation failed'));
  log.error(error.message);
  process.exit(1);
}

// Helper functions
async function validateEnvironment(env) {
  // Add your validation logic here
  const validEnvs = ['development', 'staging', 'production'];
  if (!validEnvs.includes(env)) {
    throw new Error(\`Invalid environment: \${env}\`);
  }
}

async function executeMainOperation(options) {
  // Add your main logic here
  
  // Example: SSH operations
  if (options.env === 'production') {
    const $prod = $.ssh({
      host: 'production.example.com',
      username: 'deploy'
    });
    
    await $prod\`uptime\`;
    await $prod\`df -h\`;
  } else {
    // Local operations
    await $\`echo "Running in \${options.env} mode"\`;
  }
}

async function cleanup() {
  // Add cleanup logic here
  if (await fs.exists('.tmp')) {
    await fs.remove('.tmp');
  }
}
`;

// JavaScript Command templates
const BASIC_JS_COMMAND_TEMPLATE = `/**
 * {description}
 * 
 * This command will be available as: xec {name} [arguments]
 */

export function command(program) {
  program
    .command('{name} [args...]')
    .description('{description}')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (args, options) => {
      const { log } = await import('@clack/prompts');
      
      // Your command logic here
      log.info('Running {name} command...');
      
      if (options.verbose) {
        log.step('Verbose mode enabled');
        log.step(\`Arguments: \${args.join(', ') || 'none'}\`);
      }
      
      // Example: Use $ from @xec-sh/core
      const { $ } = await import('@xec-sh/core');
      const result = await $\`echo "Command {name} executed successfully!"\`;
      
      log.success(result.stdout);
    });
}
`;

const ADVANCED_JS_COMMAND_TEMPLATE = `/**
 * {description}
 * 
 * This command will be available as: xec {name} <action> [options]
 * 
 * Examples:
 *   xec {name} list
 *   xec {name} create myitem --type=example
 *   xec {name} delete myitem --force
 */

export function command(program) {
  const cmd = program
    .command('{name}')
    .description('{description}');
  
  // Subcommand: list
  cmd
    .command('list')
    .description('List all items')
    .option('-f, --filter <pattern>', 'Filter results')
    .action(async (options) => {
      const { log, spinner } = await import('@clack/prompts');
      const { $ } = await import('@xec-sh/core');
      
      const s = spinner();
      s.start('Loading items...');
      
      try {
        // Your list logic here
        const items = await getItems(options.filter);
        s.stop('Found ' + items.length + ' items');
        
        if (items.length === 0) {
          log.info('No items found');
          return;
        }
        
        // Display items
        items.forEach(item => {
          log.step(\`• \${item.name} (\${item.type})\`);
        });
        
      } catch (error) {
        s.stop('Failed to load items');
        log.error(error.message);
        process.exit(1);
      }
    });
  
  // Subcommand: create
  cmd
    .command('create <name>')
    .description('Create a new item')
    .option('-t, --type <type>', 'Item type', 'default')
    .option('-d, --description <desc>', 'Item description')
    .action(async (name, options) => {
      const { log, confirm } = await import('@clack/prompts');
      const { $ } = await import('@xec-sh/core');
      
      log.info(\`Creating item: \${name}\`);
      log.step(\`Type: \${options.type}\`);
      
      if (options.description) {
        log.step(\`Description: \${options.description}\`);
      }
      
      const shouldCreate = await confirm({
        message: 'Proceed with creation?',
        initialValue: true
      });
      
      if (!shouldCreate) {
        log.info('Creation cancelled');
        return;
      }
      
      try {
        // Your create logic here
        await createItem(name, options);
        log.success(\`Item '\${name}' created successfully!\`);
      } catch (error) {
        log.error(\`Failed to create item: \${error.message}\`);
        process.exit(1);
      }
    });
  
  // Subcommand: delete
  cmd
    .command('delete <name>')
    .description('Delete an item')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name, options) => {
      const { log, confirm } = await import('@clack/prompts');
      
      if (!options.force) {
        const shouldDelete = await confirm({
          message: \`Are you sure you want to delete '\${name}'?\`,
          initialValue: false
        });
        
        if (!shouldDelete) {
          log.info('Deletion cancelled');
          return;
        }
      }
      
      try {
        // Your delete logic here
        await deleteItem(name);
        log.success(\`Item '\${name}' deleted successfully!\`);
      } catch (error) {
        log.error(\`Failed to delete item: \${error.message}\`);
        process.exit(1);
      }
    });
}

// Helper functions (these would typically be in a separate module)
async function getItems(filter) {
  // Mock implementation - replace with your logic
  const allItems = [
    { name: 'example1', type: 'script' },
    { name: 'example2', type: 'command' }
  ];
  
  if (filter) {
    return allItems.filter(item => 
      item.name.includes(filter) || item.type.includes(filter)
    );
  }
  
  return allItems;
}

async function createItem(name, options) {
  // Mock implementation - replace with your logic
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Creating item: \${name} (type: \${options.type})"\`;
}

async function deleteItem(name) {
  // Mock implementation - replace with your logic
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Deleting item: \${name}"\`;
}
`;

// TypeScript Script templates
const BASIC_TS_SCRIPT_TEMPLATE = `#!/usr/bin/env xec

/**
 * {description}
 * 
 * Usage: xec .xec/scripts/{name}.ts
 * 
 * This script demonstrates the universal loader features:
 * - Cross-runtime support (Node.js, Bun, Deno)
 * - TypeScript support out of the box
 * - Global utilities available without imports
 * - CDN module loading
 */

// The $ function from @xec-sh/core is globally available
log.info('🚀 Running {name} script...');

// Type-safe command execution
const result = await $\`echo "Hello from TypeScript!"\`;
log.success(result.stdout);

// Work with files using built-in fs
const files = await glob('**/*.ts');
log.step(\`Found \${files.length} TypeScript files\`);

// Interactive prompts with type inference
const name = await question({
  message: 'What is your name?',
  defaultValue: 'Developer'
});

// Use chalk for colored output
log.info(chalk.blue(\`Hello, \${name}!\`));

// Example: Fetch data from API
interface GitHubRepo {
  name: string;
  description: string;
  stargazers_count: number;
}

try {
  const response = await fetch('https://api.github.com/repos/xec-sh/xec');
  const repo: GitHubRepo = await response.json();
  
  log.step(\`Repo: \${chalk.cyan(repo.name)}\`);
  log.step(\`Stars: \${chalk.yellow('⭐')} \${repo.stargazers_count}\`);
} catch (error) {
  log.error(\`Failed to fetch repo info: \${error}\`);
}

// Temporary file operations
const tempFile = tmpfile('demo-', '.json');
await fs.writeJson(tempFile, { message: 'Hello from TypeScript!' });
log.step(\`Created temp file: \${tempFile}\`);

// Clean up
await fs.remove(tempFile);
log.success('✅ Script completed successfully!');
`;

const ADVANCED_TS_SCRIPT_TEMPLATE = `#!/usr/bin/env xec

/**
 * {description}
 * 
 * Usage: xec .xec/scripts/{name}.ts [options]
 * 
 * Options:
 *   --env <environment>  Environment to run in (development, staging, production)
 *   --dry-run           Show what would be done without executing
 *   --verbose           Enable verbose output
 */

import type { ExecutionEngine } from '@xec-sh/core';

// Parse command line arguments with type safety
interface Options {
  env: 'development' | 'staging' | 'production';
  dryRun: boolean;
  verbose: boolean;
  _: string[];
}

const options = argv as unknown as Options;
const environment = options.env || 'development';
const isDryRun = options['dry-run'] || false;
const isVerbose = options.verbose || false;

// Configure logging
if (isVerbose) {
  log.info(chalk.dim('Verbose mode enabled'));
}

log.info(chalk.bold('🚀 {description}'));
log.step(\`Environment: \${chalk.cyan(environment)}\`);
log.step(\`Dry run: \${isDryRun ? chalk.yellow('yes') : chalk.green('no')}\`);

// Type-safe configuration
interface Config {
  apiUrl: string;
  timeout: number;
  retries: number;
}

const configs: Record<typeof environment, Config> = {
  development: {
    apiUrl: 'http://localhost:3000',
    timeout: 5000,
    retries: 1
  },
  staging: {
    apiUrl: 'https://staging.example.com',
    timeout: 10000,
    retries: 2
  },
  production: {
    apiUrl: 'https://api.example.com',
    timeout: 30000,
    retries: 3
  }
};

const config = configs[environment];
const spinner = clack.spinner();

try {
  // Step 1: Validation
  spinner.start('Validating environment...');
  await validateEnvironment(environment);
  spinner.stop('Environment validated');

  // Step 2: Connect to services
  if (environment === 'production') {
    spinner.start('Connecting to production services...');
    
    // Example: SSH with type-safe configuration
    interface SSHConfig {
      host: string;
      username: string;
      privateKey?: string;
    }
    
    const sshConfig: SSHConfig = {
      host: 'production.example.com',
      username: 'deploy',
      privateKey: env('SSH_KEY_PATH')
    };
    
    const $prod = $.ssh(sshConfig);
    
    if (!isDryRun) {
      const uptimeResult = await $prod\`uptime\`;
      log.step('Server uptime: ' + uptimeResult.stdout.trim());
    }
    
    spinner.stop('Connected to production');
  }

  // Step 3: Main operation with retry logic
  if (!isDryRun) {
    spinner.start('Executing main operation...');
    
    await retry(
      async () => {
        await executeMainOperation(config);
      },
      {
        retries: config.retries,
        delay: 1000,
        onRetry: (error, attempt) => {
          log.warning(\`Retry \${attempt}/\${config.retries}: \${error.message}\`);
        }
      }
    );
    
    spinner.stop('Operation completed');
  } else {
    log.info('Dry run mode - skipping execution');
  }

  // Step 4: Cleanup
  spinner.start('Cleaning up...');
  await cleanup();
  spinner.stop('Cleanup completed');

  log.success(chalk.green('✅ Script completed successfully!'));
  
} catch (error) {
  spinner.stop(chalk.red('Operation failed'));
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// Helper functions with proper typing
async function validateEnvironment(env: string): Promise<void> {
  const validEnvs = ['development', 'staging', 'production'];
  if (!validEnvs.includes(env)) {
    throw new Error(\`Invalid environment: \${env}\`);
  }
  
  // Check required environment variables
  const requiredVars = ['API_KEY', 'DATABASE_URL'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(\`Missing required environment variables: \${missing.join(', ')}\`);
  }
}

async function executeMainOperation(config: Config): Promise<void> {
  // Example: API call with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout);
  
  try {
    const response = await fetch(config.apiUrl + '/health', {
      signal: controller.signal,
      headers: {
        'Authorization': \`Bearer \${env('API_KEY')}\`
      }
    });
    
    if (!response.ok) {
      throw new Error(\`API returned \${response.status}\`);
    }
    
    const data = await response.json();
    log.step(\`API health: \${data.status}\`);
  } finally {
    clearTimeout(timeout);
  }
}

async function cleanup(): Promise<void> {
  // Clean up temporary files
  const tempFiles = await glob('.tmp-{name}-*');
  for (const file of tempFiles) {
    await fs.remove(file);
  }
}
`;

// TypeScript Command templates
const BASIC_TS_COMMAND_TEMPLATE = `/**
 * {description}
 * 
 * This command will be available as: xec {name} [arguments]
 */

import type { Command } from 'commander';

export function command(program: Command): void {
  program
    .command('{name} [args...]')
    .description('{description}')
    .option('-v, --verbose', 'Enable verbose output')
    .option('-f, --format <type>', 'Output format', 'json')
    .action(async (args: string[], options: { verbose: boolean; format: string }) => {
      const { log } = await import('@clack/prompts');
      
      // Your command logic here
      log.info('Running {name} command...');
      
      if (options.verbose) {
        log.step('Verbose mode enabled');
        log.step(\`Arguments: \${args.join(', ') || 'none'}\`);
        log.step(\`Format: \${options.format}\`);
      }
      
      // Example: Use $ from @xec-sh/core with type safety
      const { $ } = await import('@xec-sh/core');
      const result = await $\`echo "Command {name} executed successfully!"\`;
      
      // Format output based on option
      if (options.format === 'json') {
        console.log(JSON.stringify({
          success: true,
          message: result.stdout.trim(),
          args
        }, null, 2));
      } else {
        log.success(result.stdout);
      }
    });
}
`;

const ADVANCED_TS_COMMAND_TEMPLATE = `/**
 * {description}
 * 
 * This command will be available as: xec {name} <action> [options]
 * 
 * Examples:
 *   xec {name} list --filter=active
 *   xec {name} create myitem --type=service --priority=high
 *   xec {name} delete myitem --force
 *   xec {name} status myitem --json
 */

import type { Command } from 'commander';

// Type definitions
interface Item {
  id: string;
  name: string;
  type: 'service' | 'task' | 'resource';
  status: 'active' | 'inactive' | 'pending';
  priority: 'low' | 'medium' | 'high';
  created: Date;
  metadata?: Record<string, any>;
}

interface ListOptions {
  filter?: string;
  type?: Item['type'];
  status?: Item['status'];
  limit?: number;
  json?: boolean;
}

interface CreateOptions {
  type: Item['type'];
  priority: Item['priority'];
  description?: string;
  metadata?: string;
}

export function command(program: Command): void {
  const cmd = program
    .command('{name}')
    .description('{description}');
  
  // Subcommand: list
  cmd
    .command('list')
    .description('List all items')
    .option('-f, --filter <pattern>', 'Filter by name pattern')
    .option('-t, --type <type>', 'Filter by type (service|task|resource)')
    .option('-s, --status <status>', 'Filter by status')
    .option('-l, --limit <n>', 'Limit results', '10')
    .option('--json', 'Output as JSON')
    .action(async (options: ListOptions) => {
      const { log, spinner } = await import('@clack/prompts');
      const { $ } = await import('@xec-sh/core');
      
      const s = spinner();
      s.start('Loading items...');
      
      try {
        // Your list logic here
        const items = await getItems(options);
        s.stop('Found ' + items.length + ' items');
        
        if (items.length === 0) {
          log.info('No items found');
          return;
        }
        
        if (options.json) {
          console.log(JSON.stringify(items, null, 2));
        } else {
          // Display items in a formatted table
          const chalk = await import('chalk');
          
          console.log(chalk.default.bold('\nItems:'));
          console.log(chalk.default.gray('─'.repeat(60)));
          
          items.forEach(item => {
            const statusColor = item.status === 'active' ? 'green' : 
                              item.status === 'inactive' ? 'red' : 'yellow';
            const priorityIcon = item.priority === 'high' ? '🔴' :
                               item.priority === 'medium' ? '🟡' : '🟢';
            
            const statusText = statusColor === 'green' ? chalk.default.green(item.status) :
                              statusColor === 'red' ? chalk.default.red(item.status) :
                              chalk.default.yellow(item.status);
            
            console.log(
              priorityIcon + ' ' + chalk.default.bold(item.name) + ' ' +
              '(' + chalk.default.blue(item.type) + ') - ' +
              statusText
            );
          });
          
          console.log(chalk.default.gray('─'.repeat(60)));
        }
        
      } catch (error) {
        s.stop('Failed to load items');
        log.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
  
  // Subcommand: create
  cmd
    .command('create <name>')
    .description('Create a new item')
    .requiredOption('-t, --type <type>', 'Item type (service|task|resource)')
    .option('-p, --priority <priority>', 'Priority level', 'medium')
    .option('-d, --description <desc>', 'Item description')
    .option('-m, --metadata <json>', 'Additional metadata as JSON')
    .action(async (name: string, options: CreateOptions) => {
      const { log, confirm } = await import('@clack/prompts');
      const { $ } = await import('@xec-sh/core');
      const chalk = await import('chalk');
      
      // Validate options
      const validTypes: Item['type'][] = ['service', 'task', 'resource'];
      const validPriorities: Item['priority'][] = ['low', 'medium', 'high'];
      
      if (!validTypes.includes(options.type)) {
        log.error(\`Invalid type: \${options.type}. Must be one of: \${validTypes.join(', ')}\`);
        process.exit(1);
      }
      
      if (!validPriorities.includes(options.priority)) {
        log.error(\`Invalid priority: \${options.priority}. Must be one of: \${validPriorities.join(', ')}\`);
        process.exit(1);
      }
      
      // Parse metadata if provided
      let metadata: Record<string, any> = {};
      if (options.metadata) {
        try {
          metadata = JSON.parse(options.metadata);
        } catch (error) {
          log.error('Invalid metadata JSON');
          process.exit(1);
        }
      }
      
      // Display creation summary
      log.info(chalk.default.bold('Creating new item:'));
      log.step(\`Name: \${chalk.default.cyan(name)}\`);
      log.step(\`Type: \${chalk.default.blue(options.type)}\`);
      log.step(\`Priority: \${options.priority}\`);
      
      if (options.description) {
        log.step(\`Description: \${options.description}\`);
      }
      
      if (Object.keys(metadata).length > 0) {
        log.step(\`Metadata: \${JSON.stringify(metadata)}\`);
      }
      
      const shouldCreate = await confirm({
        message: 'Proceed with creation?',
        initialValue: true
      });
      
      if (!shouldCreate) {
        log.info('Creation cancelled');
        return;
      }
      
      try {
        // Your create logic here
        const item: Item = {
          id: crypto.randomUUID(),
          name,
          type: options.type,
          status: 'pending',
          priority: options.priority,
          created: new Date(),
          metadata: { ...metadata, description: options.description }
        };
        
        await createItem(item);
        log.success(\`Item '\${name}' created successfully!\\nID: \${item.id}\`);
      } catch (error) {
        log.error(\`Failed to create item: \${error instanceof Error ? error.message : String(error)}\`);
        process.exit(1);
      }
    });
  
  // Subcommand: delete
  cmd
    .command('delete <name>')
    .description('Delete an item')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name: string, options: { force?: boolean }) => {
      const { log, confirm } = await import('@clack/prompts');
      const chalk = await import('chalk');
      
      // Check if item exists
      const item = await getItemByName(name);
      if (!item) {
        log.error(\`Item '\${name}' not found\`);
        process.exit(1);
      }
      
      // Show item details
      log.info(chalk.default.bold('Item to delete:'));
      log.step(\`Name: \${item.name}\`);
      log.step(\`Type: \${item.type}\`);
      log.step(\`Status: \${item.status}\`);
      
      if (!options.force) {
        const shouldDelete = await confirm({
          message: chalk.default.red(\`Are you sure you want to delete '\${name}'?\`),
          initialValue: false
        });
        
        if (!shouldDelete) {
          log.info('Deletion cancelled');
          return;
        }
      }
      
      try {
        // Your delete logic here
        await deleteItem(item.id);
        log.success(\`Item '\${name}' deleted successfully!\`);
      } catch (error) {
        log.error(\`Failed to delete item: \${error instanceof Error ? error.message : String(error)}\`);
        process.exit(1);
      }
    });
    
  // Subcommand: status
  cmd
    .command('status <name>')
    .description('Get item status')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: { json?: boolean }) => {
      const { log } = await import('@clack/prompts');
      const chalk = await import('chalk');
      
      try {
        const item = await getItemByName(name);
        if (!item) {
          log.error(\`Item '\${name}' not found\`);
          process.exit(1);
        }
        
        if (options.json) {
          console.log(JSON.stringify(item, null, 2));
        } else {
          console.log(chalk.default.bold('\\nItem Status:'));
          console.log(chalk.default.gray('─'.repeat(40)));
          console.log(\`ID:       \${item.id}\`);
          console.log(\`Name:     \${chalk.default.cyan(item.name)}\`);
          console.log(\`Type:     \${chalk.default.blue(item.type)}\`);
          console.log(\`Status:   \${item.status === 'active' ? chalk.default.green(item.status) : chalk.default.yellow(item.status)}\`);
          console.log(\`Priority: \${item.priority}\`);
          console.log(\`Created:  \${item.created.toLocaleString()}\`);
          
          if (item.metadata && Object.keys(item.metadata).length > 0) {
            console.log(\`Metadata: \${JSON.stringify(item.metadata, null, 2)}\`);
          }
          
          console.log(chalk.default.gray('─'.repeat(40)));
        }
      } catch (error) {
        log.error(\`Failed to get status: \${error instanceof Error ? error.message : String(error)}\`);
        process.exit(1);
      }
    });
}

// Helper functions (these would typically be in a separate module)
async function getItems(options: ListOptions): Promise<Item[]> {
  // Mock implementation - replace with your logic
  const allItems: Item[] = [
    { 
      id: '1', 
      name: 'example-service', 
      type: 'service', 
      status: 'active',
      priority: 'high',
      created: new Date('2024-01-01')
    },
    { 
      id: '2', 
      name: 'backup-task', 
      type: 'task', 
      status: 'pending',
      priority: 'medium',
      created: new Date('2024-01-02')
    }
  ];
  
  let filtered = allItems;
  
  if (options.filter) {
    const pattern = new RegExp(options.filter, 'i');
    filtered = filtered.filter(item => pattern.test(item.name));
  }
  
  if (options.type) {
    filtered = filtered.filter(item => item.type === options.type);
  }
  
  if (options.status) {
    filtered = filtered.filter(item => item.status === options.status);
  }
  
  if (options.limit) {
    filtered = filtered.slice(0, parseInt(options.limit.toString(), 10));
  }
  
  return filtered;
}

async function getItemByName(name: string): Promise<Item | null> {
  const items = await getItems({});
  return items.find(item => item.name === name) || null;
}

async function createItem(item: Item): Promise<void> {
  // Mock implementation - replace with your logic
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Creating item: \${item.name} (ID: \${item.id})"\`;
  
  // In a real implementation, you would:
  // - Save to database
  // - Call external APIs
  // - Update configuration files
  // - etc.
}

async function deleteItem(id: string): Promise<void> {
  // Mock implementation - replace with your logic
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Deleting item with ID: \${id}"\`;
  
  // In a real implementation, you would:
  // - Remove from database
  // - Clean up resources
  // - Update related services
  // - etc.
}
`;

export default function (program: Command) {
  program
    .command('new <type> <name>')
    .description('Create a new script or command template')
    .option('-d, --description <desc>', 'Description for the template')
    .option('-f, --force', 'Overwrite existing file')
    .option('--advanced', 'Use advanced template with more features')
    .action(async (type: string, name: string, options: NewOptions) => {
      try {
        // Validate type
        if (!['script', 'command'].includes(type)) {
          clack.log.error(`Invalid type: ${type}. Use 'script' or 'command'`);
          process.exit(1);
        }

        // Validate name
        if (!/^[a-z0-9-_]+$/i.test(name)) {
          clack.log.error('Name must contain only letters, numbers, hyphens, and underscores');
          process.exit(1);
        }

        clack.intro(chalk.bold(`🎨 Create new ${type}: ${name}`));

        // Get description if not provided
        let description = options.description;
        if (!description) {
          description = await clack.text({
            message: `Description for the ${type}:`,
            defaultValue: `Custom ${type} created with Xec`
          }) as string;
        }

        // Determine paths
        const xecDir = path.join(process.cwd(), '.xec');
        if (!fs.existsSync(xecDir)) {
          clack.log.error('Not in an Xec project directory. Run "xec init" first.');
          process.exit(1);
        }

        const subDir = type === 'script' ? 'scripts' : 'commands';
        const fileName = `${name}.js`;
        const filePath = path.join(xecDir, subDir, fileName);

        // Check if file exists
        if (fs.existsSync(filePath) && !options.force) {
          const shouldOverwrite = await clack.confirm({
            message: `File ${fileName} already exists. Overwrite?`,
            initialValue: false
          });

          if (!shouldOverwrite) {
            clack.log.info('Operation cancelled');
            return;
          }
        }

        const spinner = clack.spinner();
        spinner.start(`Creating ${type} template...`);

        // Select template
        let template: string;
        if (type === 'script') {
          template = options.advanced ? ADVANCED_JS_SCRIPT_TEMPLATE : BASIC_JS_SCRIPT_TEMPLATE;
        } else {
          template = options.advanced ? ADVANCED_JS_COMMAND_TEMPLATE : BASIC_JS_COMMAND_TEMPLATE;
        }

        // Replace placeholders
        const content = template
          .replace(/{name}/g, name)
          .replace(/{description}/g, description);

        // Ensure directory exists
        await fs.ensureDir(path.dirname(filePath));

        // Write file
        await fs.writeFile(filePath, content);

        // Make script executable if it's a script
        if (type === 'script') {
          await fs.chmod(filePath, '755');
        }

        spinner.stop(`${type} created successfully`);

        clack.outro(chalk.green(`✅ Created ${type}: ${fileName}`));

        // Show next steps
        clack.log.info('\nNext steps:');
        if (type === 'script') {
          clack.log.info(`  ${chalk.cyan('xec')} .xec/scripts/${name}.js`);
          clack.log.info(`  ${chalk.cyan('edit')} .xec/scripts/${name}.js`);
        } else {
          clack.log.info(`  ${chalk.cyan('xec')} ${name} --help`);
          clack.log.info(`  ${chalk.cyan('edit')} .xec/commands/${name}.js`);
        }

        if (!options.advanced) {
          clack.log.info(`\n💡 Tip: Use --advanced flag for a more feature-rich template`);
        }

      } catch (error) {
        clack.log.error(error instanceof Error ? error.message : 'Failed to create template');
        process.exit(1);
      }
    });
}