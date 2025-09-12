import path from 'path';
import fs from 'fs-extra';
import * as yaml from 'js-yaml';
import { Command } from 'commander';
import { log, text, prism, intro, outro, select, confirm, spinner } from '@xec-sh/kit';

import { InteractiveHelpers } from '../utils/interactive-helpers.js';
import { BaseCommand, CommandOptions } from '../utils/command-base.js';
import { sortConfigKeys, getDefaultConfig } from '../config/defaults.js';
import { ConfigurationManager } from '../config/configuration-manager.js';

interface NewOptions extends CommandOptions {
  force?: boolean;
  minimal?: boolean;
  skipGit?: boolean;
  name?: string;
  desc?: string;
  type?: string;
  advanced?: boolean;
  js?: boolean;
  profile?: string;
  from?: string;
  interactive?: boolean;
}

// Artifact types
type ArtifactType = 'project' | 'script' | 'command' | 'task' | 'profile' | 'extension';

// Template registry
const TEMPLATES = {
  // project templates removed - now using getDefaultConfig() instead
  script: {
    basic: {
      js: `#!/usr/bin/env xec

/**
 * {description}
 * 
 * Usage: xec {filepath}
 */

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
`,
      ts: `#!/usr/bin/env xec
/// <reference path="{globalsPath}" />

/**
 * {description}
 * 
 * Usage: xec {filepath}
 */

// Type-safe command execution
const result = await $\`echo "Hello from TypeScript!"\`;
log.success(result.stdout);

// Work with files using built-in fs
const files = await glob('**/*.ts');
log.step(\`Found \${files.length} TypeScript files\`);

// Interactive prompts with type inference
const qName = await question({
  message: 'What is your name?',
  defaultValue: 'Developer'
});

// Use chalk for colored output
log.info(prism.blue(\`Hello, \${qName}!\`));

// Example: Fetch data from API
interface GitHubRepo {
  name: string;
  description: string;
  stargazers_count: number;
}

try {
  const response = await fetch('https://api.github.com/repos/xec-sh/xec');
  const repo: GitHubRepo = await response.json();
  
  log.step(\`Repo: \${prism.cyan(repo.name)}\`);
  log.step(\`Stars: \${prism.yellow('⭐')} \${repo.stargazers_count}\`);
} catch (error) {
  log.error(\`Failed to fetch repo info: \${error}\`);
}

log.success('✅ Script completed successfully!');
`
    },
    advanced: {
      js: `#!/usr/bin/env xec

/**
 * {description}
 * 
 * Usage: xec {filepath} [options]
 * 
 * Options:
 *   --env <environment>  Environment to run in
 *   --dry-run           Show what would be done
 *   --verbose           Enable verbose output
 */

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

// Load configuration
const config = await xec.config.load();
const profile = config.profiles?.[options.env];

if (profile) {
  xec.config.applyProfile(options.env);
  log.info(prism.dim(\`Applied profile: \${options.env}\`));
}

log.info(prism.bold('🚀 {description}'));
log.step(\`Environment: \${options.env}\`);
log.step(\`Dry run: \${options.dryRun}\`);

const s = spinner();

try {
  // Step 1: Validation
  s.start('Validating environment...');
  await validateEnvironment(options.env);
  s.stop('Environment validated');

  // Step 2: Main operation
  if (!options.dryRun) {
    s.start('Executing main operation...');
    await executeMainOperation(options);
    s.stop('Operation completed');
  } else {
    log.info('Dry run mode - skipping execution');
  }

  // Step 3: Cleanup
  s.start('Cleaning up...');
  await cleanup();
  s.stop('Cleanup completed');

  log.success(prism.green('✅ Script completed successfully!'));
  
} catch (error) {
  s.stop(prism.red('Operation failed'));
  log.error(error.message);
  process.exit(1);
}

// Helper functions
async function validateEnvironment(env) {
  const validEnvs = ['development', 'staging', 'production'];
  if (!validEnvs.includes(env)) {
    throw new Error(\`Invalid environment: \${env}\`);
  }
}

async function executeMainOperation(options) {
  // Example: Use targets from config
  const targets = await xec.config.getTargets();
  
  if (options.env === 'production' && targets.hosts?.production) {
    const $prod = $.ssh(targets.hosts.production);
    
    await $prod\`uptime\`;
    await $prod\`df -h\`;
  } else {
    // Local operations
    await $\`echo "Running in \${options.env} mode"\`;
  }
}

async function cleanup() {
  if (await fs.exists('.tmp')) {
    await fs.remove('.tmp');
  }
}
`,
      ts: `#!/usr/bin/env xec
/// <reference path="{globalsPath}" />

/**
 * {description}
 * 
 * Usage: xec {filepath} [options]
 * 
 * Options:
 *   --env <environment>  Environment to run in
 *   --dry-run           Show what would be done
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

// Configure execution
if (isVerbose) {
  $.verbose = true;
}

// Load and apply configuration
const config = await xec.config.load();
const profile = config.profiles?.[environment];

if (profile) {
  xec.config.applyProfile(environment);
  log.info(prism.dim(\`Applied profile: \${environment}\`));
}

log.info(prism.bold('🚀 {description}'));
log.step(\`Environment: \${prism.cyan(environment)}\`);
log.step(\`Dry run: \${isDryRun ? prism.yellow('yes') : prism.green('no')}\`);

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

const envConfig = configs[environment];
const s = spinner();

try {
  // Step 1: Validation
  s.start('Validating environment...');
  await validateEnvironment(environment);
  s.stop('Environment validated');

  // Step 2: Connect to services
  if (environment === 'production') {
    s.start('Connecting to production services...');
    
    const targets = await xec.config.getTargets();
    const prodHost = targets.hosts?.production;
    
    if (prodHost && !isDryRun) {
      const $prod = $.ssh(prodHost);
      
      const uptimeResult = await $prod\`uptime\`;
      log.step('Server uptime: ' + uptimeResult.stdout.trim());
    }
    
    s.stop('Connected to production');
  }

  // Step 3: Main operation with retry logic
  if (!isDryRun) {
    s.start('Executing main operation...');
    
    await retry(
      async () => {
        await executeMainOperation(envConfig);
      },
      {
        retries: envConfig.retries,
        delay: 1000,
        onRetry: (error, attempt) => {
          log.warning(\`Retry \${attempt}/\${envConfig.retries}: \${error.message}\`);
        }
      }
    );
    
    s.stop('Operation completed');
  } else {
    log.info('Dry run mode - skipping execution');
  }

  // Step 4: Cleanup
  s.start('Cleaning up...');
  await cleanup();
  s.stop('Cleanup completed');

  log.success(prism.green('✅ Script completed successfully!'));
  
} catch (error) {
  s.stop(prism.red('Operation failed'));
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
  const requiredVars = ['API_KEY'];
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
  const tempFiles = await glob('.tmp-{name}-*');
  for (const file of tempFiles) {
    await fs.remove(file);
  }
}
`
    }
  },

  command: {
    basic: {
      js: `/**
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
      // log is already imported from @xec-sh/kit
      
      // Your command logic here
      log.info('Running {name} command...');
      
      if (options.verbose) {
        log.step('Verbose mode enabled');
        log.step(\`Arguments: \${args.join(', ') || 'none'}\`);
      }
      
      // Example: Use $ from @xec-sh/cli
      const result = await $\`echo "Command {name} executed successfully!"\`;
      
      log.success(result.stdout);
    });
}
`,
      ts: `/// <reference path="{globalsPath}" />

/**
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
      // log is already imported from @xec-sh/kit
      
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
`
    },
    advanced: {
      js: `/**
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
      // log and spinner are already imported from @xec-sh/kit
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
      // log and confirm are already imported from @xec-sh/kit
      const { $ } = await import('@xec-sh/core');
      
      log.info(\`Creating item: \${name}\`);
      log.step(\`Type: \${options.type}\`);
      
      if (options.desc) {
        log.step(\`Description: \${options.desc}\`);
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
      // log and confirm are already imported from @xec-sh/kit
      
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

// Helper functions
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
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Creating item: \${name} (type: \${options.type})"\`;
}

async function deleteItem(name) {
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Deleting item: \${name}"\`;
}
`,
      ts: `/// <reference path="{globalsPath}" />

/**
 * {description}
 * 
 * This command will be available as: xec {name} <action> [options]
 * 
 * Examples:
 *   xec {name} list --filter=active
 *   xec {name} create myitem --type=service
 *   xec {name} delete myitem --force
 */

import type { Command } from 'commander';

// Type definitions
interface Item {
  id: string;
  name: string;
  type: 'service' | 'task' | 'resource';
  status: 'active' | 'inactive' | 'pending';
  created: Date;
  metadata?: Record<string, any>;
}

interface ListOptions {
  filter?: string;
  type?: Item['type'];
  status?: Item['status'];
  json?: boolean;
}

interface CreateOptions {
  type: Item['type'];
  description?: string;
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
    .option('-t, --type <type>', 'Filter by type')
    .option('-s, --status <status>', 'Filter by status')
    .option('--json', 'Output as JSON')
    .action(async (options: ListOptions) => {
      // log and spinner are already imported from @xec-sh/kit
      const { $ } = await import('@xec-sh/core');
      
      const s = spinner();
      s.start('Loading items...');
      
      try {
        const items = await getItems(options);
        s.stop('Found ' + items.length + ' items');
        
        if (items.length === 0) {
          log.info('No items found');
          return;
        }
        
        if (options.json) {
          console.log(JSON.stringify(items, null, 2));
        } else {
          const chalk = await import('chalk');
          
          console.log(prism.default.bold('\\nItems:'));
          console.log(prism.default.gray('─'.repeat(60)));
          
          items.forEach(item => {
            const statusColor = item.status === 'active' ? 'green' : 
                              item.status === 'inactive' ? 'red' : 'yellow';
            
            const statusText = statusColor === 'green' ? prism.default.green(item.status) :
                              statusColor === 'red' ? prism.default.red(item.status) :
                              prism.default.yellow(item.status);
            
            console.log(
              prism.default.bold(item.name) + ' ' +
              '(' + prism.default.blue(item.type) + ') - ' +
              statusText
            );
          });
          
          console.log(prism.default.gray('─'.repeat(60)));
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
    .option('-d, --description <desc>', 'Item description')
    .action(async (name: string, options: CreateOptions) => {
      // log and confirm are already imported from @xec-sh/kit
      const { $ } = await import('@xec-sh/core');
      const chalk = await import('chalk');
      
      // Validate options
      const validTypes: Item['type'][] = ['service', 'task', 'resource'];
      
      if (!validTypes.includes(options.type)) {
        log.error(\`Invalid type: \${options.type}. Must be one of: \${validTypes.join(', ')}\`);
        process.exit(1);
      }
      
      // Display creation summary
      log.info(prism.default.bold('Creating new item:'));
      log.step(\`Name: \${prism.default.cyan(name)}\`);
      log.step(\`Type: \${prism.default.blue(options.type)}\`);
      
      if (options.desc) {
        log.step(\`Description: \${options.desc}\`);
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
        const item: Item = {
          id: crypto.randomUUID(),
          name,
          type: options.type,
          status: 'pending',
          created: new Date(),
          metadata: { description: options.desc }
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
      // log and confirm are already imported from @xec-sh/kit
      const chalk = await import('chalk');
      
      // Check if item exists
      const item = await getItemByName(name);
      if (!item) {
        log.error(\`Item '\${name}' not found\`);
        process.exit(1);
      }
      
      // Show item details
      log.info(prism.default.bold('Item to delete:'));
      log.step(\`Name: \${item.name}\`);
      log.step(\`Type: \${item.type}\`);
      log.step(\`Status: \${item.status}\`);
      
      if (!options.force) {
        const shouldDelete = await confirm({
          message: prism.default.red(\`Are you sure you want to delete '\${name}'?\`),
          initialValue: false
        });
        
        if (!shouldDelete) {
          log.info('Deletion cancelled');
          return;
        }
      }
      
      try {
        await deleteItem(item.id);
        log.success(\`Item '\${name}' deleted successfully!\`);
      } catch (error) {
        log.error(\`Failed to delete item: \${error instanceof Error ? error.message : String(error)}\`);
        process.exit(1);
      }
    });
}

// Helper functions
async function getItems(options: ListOptions): Promise<Item[]> {
  // Mock implementation - replace with your logic
  const allItems: Item[] = [
    { 
      id: '1', 
      name: 'example-service', 
      type: 'service', 
      status: 'active',
      created: new Date('2024-01-01')
    },
    { 
      id: '2', 
      name: 'backup-task', 
      type: 'task', 
      status: 'pending',
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
  
  return filtered;
}

async function getItemByName(name: string): Promise<Item | null> {
  const items = await getItems({});
  return items.find(item => item.name === name) || null;
}

async function createItem(item: Item): Promise<void> {
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Creating item: \${item.name} (ID: \${item.id})"\`;
}

async function deleteItem(id: string): Promise<void> {
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Deleting item with ID: \${id}"\`;
}
`
    }
  },

  task: {
    simple: `# Simple command task
{name}:
  description: {description}
  command: echo "Task {name} executed!"
`,
    standard: `# Standard task with parameters
{name}:
  description: {description}
  params:
    - name: message
      description: Message to display
      default: "Hello from {name}"
  command: |
    echo "Starting {name} task..."
    echo "\${params.message}"
    echo "Task completed!"
`,
    advanced: `# Advanced multi-step task
{name}:
  description: {description}
  params:
    - name: target
      description: Target environment
      required: true
      values: [development, staging, production]
    - name: version
      description: Version to deploy
      required: true
      pattern: "^v\\\\d+\\\\.\\\\d+\\\\.\\\\d+$"
  
  # Task-specific variables
  env:
    LOG_LEVEL: info
    DEPLOY_PATH: /opt/apps/myapp
  
  steps:
    # Step 1: Validation
    - name: Validate environment
      command: |
        if [ "\${params.target}" = "production" ]; then
          echo "⚠️  Production deployment - proceed with caution!"
        fi
      onFailure: abort
    
    # Step 2: Build
    - name: Build application
      command: npm run build:\${params.target}
      register: build_output
    
    # Step 3: Run tests
    - name: Run tests
      command: npm test
      when: params.target != 'production'
      onFailure:
        retry: 2
        delay: 5s
    
    # Step 4: Deploy to target
    - name: Deploy to \${params.target}
      target: hosts.\${params.target}
      command: |
        cd \${env.DEPLOY_PATH}
        git fetch origin
        git checkout \${params.version}
        npm install --production
        npm run migrate
        pm2 reload app
      alwaysRun: true
    
    # Step 5: Health check
    - name: Verify deployment
      command: |
        sleep 5
        curl -f http://\${params.target}.example.com/health || exit 1
      onFailure:
        command: |
          echo "Health check failed!"
          # Rollback logic here
  
  # Hooks
  hooks:
    before:
      - command: echo "🚀 Starting deployment to \${params.target}"
    after:
      - command: echo "✅ Deployment completed successfully"
    onError:
      - command: echo "❌ Deployment failed"
      - task: notify:slack
        args:
          message: "Deployment to \${params.target} failed"
  
  # Success/error handlers
  onSuccess:
    emit: deployment:completed
  onError:
    emit: deployment:failed
`
  },

  profile: {
    basic: `# Basic environment profile
{name}:
  description: {description}
  
  # Profile-specific variables
  vars:
    environment: {name}
    log_level: info
  
  # Environment variables
  env:
    NODE_ENV: {name}
    LOG_LEVEL: \${vars.log_level}
`,
    advanced: `# Advanced environment profile with targets
{name}:
  description: {description}
  extends: base  # Inherit from base profile
  
  # Profile-specific variables
  vars:
    environment: {name}
    region: us-east-1
    deploy_path: /opt/apps/myapp
    log_level: info
    api_url: https://api-{name}.example.com
  
  # Environment variables
  env:
    NODE_ENV: {name}
    API_URL: \${vars.api_url}
    AWS_REGION: \${vars.region}
    LOG_LEVEL: \${vars.log_level}
  
  # Profile-specific targets
  targets:
    hosts:
      app-server:
        host: {name}.example.com
        user: deploy
        privateKey: ~/.ssh/{name}_rsa
    
    containers:
      app:
        image: myapp:{name}
        env:
          - NODE_ENV=\${vars.environment}
          - API_URL=\${vars.api_url}
    
    pods:
      web:
        namespace: {name}
        selector: app=web,env={name}
`
  },

  extension: {
    basic: `# Basic Xec extension
name: {name}
description: {description}
version: 1.0.0

# Tasks provided by this extension
tasks:
  {name}:hello:
    description: Say hello from {name} extension
    command: echo "Hello from {name} extension!"
  
  {name}:info:
    description: Show extension information
    command: |
      echo "Extension: {name}"
      echo "Version: 1.0.0"
      echo "Description: {description}"

# Configuration schema
config:
  type: object
  properties:
    enabled:
      type: boolean
      default: true
    settings:
      type: object
      properties:
        option1:
          type: string
          default: "default value"
`,
    advanced: `# Advanced Xec extension
name: {name}
description: {description}
version: 1.0.0
author: Your Name

# Dependencies
requires:
  - xec: ">=0.7.0"
  - node: ">=18.0.0"

# Tasks provided by this extension
tasks:
  # Setup task
  {name}:setup:
    description: Setup {name} extension
    params:
      - name: config
        description: Configuration file path
        default: ./{name}.config.json
    command: |
      echo "Setting up {name} extension..."
      if [ ! -f "\${params.config}" ]; then
        echo '{
          "version": "1.0.0",
          "settings": {}
        }' > "\${params.config}"
      fi
      echo "Setup complete!"
  
  # Main task with multiple steps
  {name}:run:
    description: Run {name} main task
    params:
      - name: mode
        description: Execution mode
        values: [fast, normal, thorough]
        default: normal
    steps:
      - name: Validate environment
        command: |
          if ! command -v node &> /dev/null; then
            echo "Node.js is required but not installed"
            exit 1
          fi
      
      - name: Execute main logic
        script: ./scripts/{name}-main.ts
        env:
          MODE: \${params.mode}
      
      - name: Generate report
        command: |
          echo "Generating report..."
          echo "Mode: \${params.mode}"
          echo "Timestamp: $(date)"
  
  # Cleanup task
  {name}:clean:
    description: Clean up {name} resources
    command: |
      echo "Cleaning up {name} resources..."
      rm -rf ./{name}-temp/
      rm -f ./{name}.log
      echo "Cleanup complete!"

# Hooks that other tasks can use
hooks:
  before_{name}:
    description: Hook to run before {name} tasks
    command: echo "Preparing {name} environment..."
  
  after_{name}:
    description: Hook to run after {name} tasks
    command: echo "{name} task completed"

# Configuration schema
config:
  type: object
  required: [enabled]
  properties:
    enabled:
      type: boolean
      default: true
      description: Enable or disable this extension
    
    settings:
      type: object
      properties:
        logLevel:
          type: string
          enum: [debug, info, warn, error]
          default: info
        
        timeout:
          type: number
          minimum: 0
          default: 30
          description: Task timeout in seconds
        
        features:
          type: array
          items:
            type: string
          default: []
          description: Enabled features

# Scripts included with the extension
scripts:
  - scripts/{name}-main.ts
  - scripts/{name}-utils.ts

# Documentation
docs:
  readme: README.md
  examples: examples/
`
  }
};

async function getArtifactType(): Promise<ArtifactType> {
  const type = await select({
    message: 'What would you like to create?',
    options: [
      { value: 'project', label: '📁 Project - Initialize a new Xec project' },
      { value: 'script', label: '📜 Script - Create an executable script' },
      { value: 'command', label: '⚡ Command - Add a CLI command' },
      { value: 'task', label: '🔧 Task - Define a reusable task' },
      { value: 'profile', label: '🌍 Profile - Environment configuration' },
      { value: 'extension', label: '🧩 Extension - Create an Xec extension' },
    ]
  }) as ArtifactType;

  if (InteractiveHelpers.isCancelled(type)) {
    throw new Error('cancelled');
  }

  return type;
}

function validateName(name: string, type: ArtifactType): string | undefined {
  if (!name) return 'Name is required';

  // Different validation rules for different types
  // eslint-disable-next-line default-case
  switch (type) {
    case 'project':
      if (!/^[a-z0-9-_]+$/i.test(name)) {
        return 'Project name must contain only letters, numbers, hyphens, and underscores';
      }
      break;
    case 'command':
    case 'task':
    case 'profile':
    case 'extension':
      if (!/^[a-z0-9-_:]+$/i.test(name)) {
        return 'Name must contain only letters, numbers, hyphens, underscores, and colons';
      }
      break;
    case 'script':
      if (!/^[a-z0-9-_.]+$/i.test(name)) {
        return 'Script name must contain only letters, numbers, hyphens, underscores, and dots';
      }
      if (name.includes('/') || name.includes('\\')) {
        return 'Script name cannot contain path separators';
      }
      break;
  }

  return undefined;
}

async function createProject(name: string, options: NewOptions) {
  // Check if we're initializing in the current directory (when name is '.' or empty)
  const isCurrentDir = !name || name === '.';

  // Check if current directory has a package.json
  const currentPackageJsonPath = path.join(process.cwd(), 'package.json');
  const hasPackageJson = fs.existsSync(currentPackageJsonPath);

  let targetDir: string;
  let projectName: string;
  let projectDescription: string;

  if (isCurrentDir || hasPackageJson) {
    // Initialize in current directory
    targetDir = process.cwd();

    // If package.json exists, read project info from it
    if (hasPackageJson) {
      const packageJson = await fs.readJson(currentPackageJsonPath);
      projectName = packageJson.name || path.basename(targetDir);
      projectDescription = options.desc || packageJson.description || 'An Xec automation project';

      log.info(prism.dim(`Found existing Node.js project: ${projectName}`));
    } else {
      projectName = path.basename(targetDir);
      projectDescription = options.desc || 'An Xec automation project';
    }

    // Check if .xec already exists
    const xecDir = path.join(targetDir, '.xec');
    if (fs.existsSync(xecDir) && !options.force) {
      // In non-interactive mode, fail
      if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
        throw new Error('Xec is already initialized in this directory. Use --force to reinitialize.');
      }

      const shouldContinue = await confirm({
        message: 'Xec is already initialized in this directory. Reinitialize?',
        initialValue: false
      });

      if (InteractiveHelpers.isCancelled(shouldContinue) || !shouldContinue) {
        log.info('Initialization cancelled');
        return;
      }
    }
  } else {
    // Create new directory for the project (old behavior)
    targetDir = path.resolve(name);
    projectName = path.basename(name);

    // Check if directory exists
    if (fs.existsSync(targetDir) && !options.force) {
      const files = await fs.readdir(targetDir);
      if (files.length > 0) {
        // In non-interactive mode, fail
        if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
          throw new Error(`Directory ${name} is not empty. Use --force to overwrite.`);
        }

        const shouldContinue = await confirm({
          message: `Directory ${name} is not empty. Continue?`,
          initialValue: false
        });

        if (InteractiveHelpers.isCancelled(shouldContinue) || !shouldContinue) {
          log.info('Project creation cancelled');
          return;
        }
      }
    }

    // Get project description
    projectDescription = options.desc || '';

    if (!projectDescription) {
      // In non-interactive mode (CI), use default
      if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
        projectDescription = 'An Xec automation project';
      } else {
        const result = await text({
          message: 'Project description:',
          defaultValue: 'An Xec automation project'
        });

        if (InteractiveHelpers.isCancelled(result)) {
          throw new Error('cancelled');
        }

        projectDescription = result as string || 'An Xec automation project';
      }
    }
  }

  const xecDir = path.join(targetDir, '.xec');

  const s = spinner();
  s.start('Creating project structure...');

  // Get absolute path to globals.d.ts
  const globalsPath = path.resolve(import.meta.dirname, '../../globals.d.ts');

  // Generate configuration from defaults
  const defaultConfig = getDefaultConfig();
  const config = {
    ...defaultConfig,
    name: projectName,
    description: projectDescription || 'An Xec automation project'
  };

  // For minimal projects, keep only essential fields
  if (options.minimal) {
    const minimalConfig = {
      version: config.version,
      name: config.name,
      description: config.description,
      targets: {
        local: config.targets?.local || { type: 'local' },
        hosts: {},
        containers: {},
        pods: {}
      },
      tasks: {
        hello: {
          description: 'Example task',
          command: 'echo "Hello from Xec!"'
        }
      }
    };
    // Sort and save minimal config
    const sortedConfig = sortConfigKeys(minimalConfig);
    const configPath = path.join(xecDir, 'config.yaml');
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, yaml.dump(sortedConfig, { indent: 2, lineWidth: -1 }));
  } else {
    // For standard projects, use full default config with some example content
    config.vars = {
      app_name: config.name,
      deploy_path: `/opt/apps/${config.name}`,
      log_level: 'info'
    };

    // Add example tasks
    config.tasks = {
      hello: {
        description: 'Say hello',
        command: `echo "Hello from ${config.name}!"`
      },
      deploy: {
        description: 'Deploy application',
        params: [
          {
            name: 'version',
            required: true,
            description: 'Version to deploy'
          }
        ],
        steps: [
          {
            name: 'Build application',
            command: 'npm run build'
          },
          {
            name: 'Run tests',
            command: 'npm test',
            onFailure: 'abort'
          },
          {
            name: 'Deploy to servers',
            targets: ['hosts.staging', 'hosts.production'],
            command: `cd \${vars.deploy_path}
git pull origin \${params.version}
npm install --production
npm run migrate
pm2 reload app`
          }
        ]
      },
      backup: {
        description: 'Backup database and files',
        schedule: '0 2 * * *',
        target: 'hosts.production',
        command: `pg_dump myapp > /backup/db-$(date +%Y%m%d).sql
tar -czf /backup/files-$(date +%Y%m%d).tar.gz /app/uploads`
      }
    };

    // Add profiles
    (config as any).profiles = {
      development: {
        vars: {
          log_level: 'debug'
        },
        env: {
          NODE_ENV: 'development'
        }
      },
      production: {
        vars: {
          log_level: 'error'
        },
        env: {
          NODE_ENV: 'production'
        }
      }
    };

    // Add example comments in the hosts section
    if (!config.targets) config.targets = {};
    config.targets.hosts = {
      '# staging': {
        '#   host': 'staging.example.com',
        '#   user': 'deploy',
        '#   privateKey': '~/.ssh/id_rsa'
      },
      '# production': {
        '#   host': 'prod.example.com',
        '#   user': 'deploy',
        '#   privateKey': '~/.ssh/id_rsa'
      }
    };

    if (!config.targets) config.targets = {};
    config.targets.containers = {
      '# app': {
        '#   image': 'node:18',
        '#   volumes': ['./:/app'],
        '#   workdir': '/app'
      }
    };

    if (!config.targets) config.targets = {};
    config.targets.pods = {
      '# web': {
        '#   namespace': 'default',
        '#   selector': 'app=web'
      }
    };

    // Sort and save config
    const sortedConfig = sortConfigKeys(config);
    const configPath = path.join(xecDir, 'config.yaml');
    await fs.ensureDir(path.dirname(configPath));

    // Convert to YAML and add comments manually
    let yamlContent = yaml.dump(sortedConfig, { indent: 2, lineWidth: -1 });

    // Fix comment formatting
    yamlContent = yamlContent.replace(/ {2}'# /g, '  # ');
    yamlContent = yamlContent.replace(/'# {3}/g, '  #   ');
    yamlContent = yamlContent.replace(/: {}/g, '');

    await fs.writeFile(configPath, yamlContent);
  }

  // Create .gitignore
  const gitignoreContent = `.env
.env.*
cache/
logs/
tmp/
secrets/
*.log
`;
  await fs.writeFile(path.join(xecDir, '.gitignore'), gitignoreContent);

  // Create example script for non-minimal projects
  if (!options.minimal) {
    const scriptsDir = path.join(xecDir, 'scripts');
    await fs.ensureDir(scriptsDir);

    const exampleScript = `#!/usr/bin/env xec
/// <reference path="${globalsPath}" />

/**
 * Example Xec script
 * Run with: xec scripts/example.ts
 */

// Use the $ function from @xec-sh/core
const result = await $\`echo "Hello from Xec!"\`;
log.success(result.stdout);

// Interactive prompts
const name = await prompt('What is your name?');
log.info(\`Hello, \${name}!\`);

// Work with targets
const hosts = config.targets.hosts || {};
log.info(\`Found \${Object.keys(hosts).length} hosts\`);

// Use helper functions
await sleep(1000);
log.info('Done!');
`;
    const exampleScriptPath = path.join(scriptsDir, 'example.ts');
    await fs.writeFile(exampleScriptPath, exampleScript);
    await fs.chmod(exampleScriptPath, '755');

    // Create or update README.md
    const readmePath = path.join(targetDir, 'README.md');
    const readmeExists = await fs.exists(readmePath);

    if (!readmeExists) {
      // Create new README.md
      const readmeContent = `# ${config.name}

${config.description}

## Getting Started

1. Install Xec CLI globally:
   \`\`\`bash
   npm install -g @xec-sh/cli
   \`\`\`

2. Explore the project:
   \`\`\`bash
   xec inspect
   \`\`\`

3. Run the example task:
   \`\`\`bash
   xec tasks:run hello
   \`\`\`

## Project Structure

- \`.xec/config.yaml\` - Project configuration
- \`.xec/scripts/\` - Xec TypeScript scripts
- \`.xec/commands/\` - Custom CLI commands
- \`.xec/cache/\` - Cache directory
- \`.xec/logs/\` - Log files

## Configuration

Edit \`.xec/config.yaml\` to:
- Add SSH hosts, Docker containers, or Kubernetes pods
- Define reusable tasks
- Set up environment profiles
- Configure secrets management

## Learn More

- [Xec Documentation](https://xec.sh/docs)
- [Configuration Reference](https://xec.sh/docs/config)
- [Task System](https://xec.sh/docs/tasks)
`;
      await fs.writeFile(readmePath, readmeContent);
      log.info(prism.green('✅ Created README.md'));
    } else {
      // Append Xec section to existing README if it doesn't already have it
      const existingReadme = await fs.readFile(readmePath, 'utf8');

      // Check if Xec section already exists
      if (!existingReadme.includes('## Xec Automation')) {
        const xecSection = `\n\n## Xec Automation

This project has been initialized with Xec for automation tasks.

### Getting Started with Xec

1. Install Xec CLI globally:
   \`\`\`bash
   npm install -g @xec-sh/cli
   \`\`\`

2. Explore the project automation:
   \`\`\`bash
   xec inspect
   \`\`\`

3. Run the example task:
   \`\`\`bash
   xec tasks:run hello
   \`\`\`

### Xec Project Structure

- \`.xec/config.yaml\` - Xec configuration
- \`.xec/scripts/\` - Automation scripts
- \`.xec/commands/\` - Custom CLI commands

For more information, see [Xec Documentation](https://xec.sh/docs).
`;

        await fs.writeFile(readmePath, existingReadme + xecSection);
        log.info(prism.green('✅ Added Xec section to existing README.md'));
      } else {
        log.info(prism.dim('README.md already contains Xec information'));
      }
    }
  }

  // Create additional directories
  const dirs = ['cache', 'logs', 'tmp'];
  for (const dir of dirs) {
    await fs.ensureDir(path.join(xecDir, dir));
  }

  // Create or update package.json for non-minimal projects
  if (!options.minimal && !hasPackageJson) {
    // Only create package.json if it doesn't exist
    const packageJsonPath = path.join(targetDir, 'package.json');
    const packageJson = {
      name: projectName,
      description: projectDescription || '',
      type: 'module',
      devDependencies: {
        'commander': '^14.0.0'
      }
    };

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }

  s.stop('Project structure created');

  // Initialize git if not skipped
  if (!options.skipGit && !fs.existsSync(path.join(targetDir, '.git'))) {
    // In non-interactive mode, skip git init unless explicitly enabled
    let shouldInitGit = false;

    if (!(process.env['CI'] || process.env['XEC_NO_INTERACTIVE'])) {
      const result = await confirm({
        message: 'Initialize git repository?',
        initialValue: true
      });

      if (InteractiveHelpers.isCancelled(result)) {
        return;
      }

      shouldInitGit = result as boolean;
    }

    if (shouldInitGit) {
      s.start('Initializing git repository...');
      const { $ } = await import('@xec-sh/core');
      await $`cd ${targetDir} && git init`;
      await $`cd ${targetDir} && git add .`;
      await $`cd ${targetDir} && git commit -m "Initial Xec project setup"`.nothrow();
      s.stop('Git repository initialized');
    }
  }


  outro(prism.green('✅ Xec project initialized successfully!'));

  // Show next steps
  log.info('\nNext steps:');

  // Only show cd command if we created a new directory
  if (!isCurrentDir && !hasPackageJson) {
    log.info(`  ${prism.cyan('cd')} ${name}`);
  }

  if (!options.minimal) {
    log.info(`  ${prism.cyan('xec')} scripts/example.ts`);
    log.info(`  ${prism.cyan('xec')} hello World`);
    log.info(`  ${prism.cyan('xec')} tasks:run hello`);
  }
  log.info(`  ${prism.cyan('xec')} new script my-script`);
  log.info(`  ${prism.cyan('xec')} new task deploy`);
}

async function createScript(name: string, options: NewOptions) {
  // Extract the description from desc option
  const description = options.desc;

  const xecDir = path.join(process.cwd(), '.xec');
  if (!fs.existsSync(xecDir)) {
    log.error('Not in an Xec project directory. Run "xec new project" first.');
    process.exit(1);
  }

  // Determine file path
  const isJs = options.js ?? false;
  const ext = isJs ? '.js' : '.ts';
  const fileName = name.endsWith('.js') || name.endsWith('.ts') ? name : `${name}${ext}`;
  const filePath = path.join(xecDir, 'scripts', fileName);

  // Check if file exists
  if (fs.existsSync(filePath) && !options.force) {
    // In non-interactive mode, fail
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      throw new Error(`Script ${fileName} already exists. Use --force to overwrite.`);
    }

    const shouldOverwrite = await confirm({
      message: `Script ${fileName} already exists. Overwrite?`,
      initialValue: false
    });

    if (InteractiveHelpers.isCancelled(shouldOverwrite) || !shouldOverwrite) {
      log.info('Script creation cancelled');
      return;
    }
  }

  // Get description
  let scriptDescription = description;

  if (!scriptDescription) {
    // In non-interactive mode (CI), use default
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      scriptDescription = `Custom script ${name}`;
    } else {
      const result = await text({
        message: 'Script description:',
        defaultValue: `Custom script ${name}`
      });

      if (InteractiveHelpers.isCancelled(result)) {
        throw new Error('cancelled');
      }

      scriptDescription = result as string || `Custom script ${name}`;
    }
  }

  // Select template
  const templateKey = options.advanced ? 'advanced' : 'basic';
  const template = TEMPLATES.script[templateKey][isJs ? 'js' : 'ts'];

  // Get absolute path to globals.d.ts
  const globalsPath = path.resolve(import.meta.dirname, '../../globals.d.ts');

  // Process template
  const content = template
    .replace(/{name}/g, path.basename(name, ext))
    .replace(/{description}/g, String(scriptDescription || ''))
    .replace(/{filepath}/g, path.relative(process.cwd(), filePath))
    .replace(/{globalsPath}/g, globalsPath);

  // Write file
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  await fs.chmod(filePath, '755');

  outro(prism.green(`✅ Created script: ${fileName}`));

  // Show usage
  log.info('\nUsage:');
  log.info(`  ${prism.cyan('xec')} scripts/${fileName}`);
  log.info(`  ${prism.cyan('xec')} scripts/${fileName} --env=production`);
}

async function createCommand(name: string, options: NewOptions) {
  // Extract the description from desc option
  const description = options.desc;

  const xecDir = path.join(process.cwd(), '.xec');
  if (!fs.existsSync(xecDir)) {
    log.error('Not in an Xec project directory. Run "xec new project" first.');
    process.exit(1);
  }

  // Determine file path
  const isJs = options.js ?? false;
  const ext = isJs ? '.js' : '.ts';
  const fileName = `${name}${ext}`;
  const filePath = path.join(xecDir, 'commands', fileName);

  // Check if file exists
  if (fs.existsSync(filePath) && !options.force) {
    // In non-interactive mode, fail
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      throw new Error(`Command ${fileName} already exists. Use --force to overwrite.`);
    }

    const shouldOverwrite = await confirm({
      message: `Command ${fileName} already exists. Overwrite?`,
      initialValue: false
    });

    if (InteractiveHelpers.isCancelled(shouldOverwrite) || !shouldOverwrite) {
      log.info('Command creation cancelled');
      return;
    }
  }

  // Get description
  let commandDescription = description;

  if (!commandDescription) {
    // In non-interactive mode (CI), use default
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      commandDescription = `Custom command ${name}`;
    } else {
      const result = await text({
        message: 'Command description:',
        defaultValue: `Custom command ${name}`
      });

      if (InteractiveHelpers.isCancelled(result)) {
        throw new Error('cancelled');
      }

      commandDescription = result as string || `Custom command ${name}`;
    }
  }

  // Select template
  const templateKey = options.advanced ? 'advanced' : 'basic';
  const template = TEMPLATES.command[templateKey][isJs ? 'js' : 'ts'];

  // Get absolute path to globals.d.ts
  const globalsPath = path.resolve(import.meta.dirname, '../../globals.d.ts');

  // Process template
  const content = template
    .replace(/{name}/g, name)
    .replace(/{description}/g, String(commandDescription || ''))
    .replace(/{globalsPath}/g, globalsPath);

  // Write file
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);

  outro(prism.green(`✅ Created command: ${fileName}`));

  // Show usage
  log.info('\nUsage:');
  log.info(`  ${prism.cyan('xec')} ${name} --help`);
  if (options.advanced) {
    log.info(`  ${prism.cyan('xec')} ${name} list`);
    log.info(`  ${prism.cyan('xec')} ${name} create myitem`);
  }
}

async function createTask(name: string, options: NewOptions) {
  // Extract the description from desc option
  const description = options.desc;

  const configManager = new ConfigurationManager();
  const config = await configManager.load();

  if (!config) {
    log.error('No configuration found. Run "xec new project" first.');
    process.exit(1);
  }

  // Get description
  let taskDescription = description;

  if (!taskDescription) {
    // In non-interactive mode (CI), use default
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      taskDescription = `Task ${name}`;
    } else {
      const result = await text({
        message: 'Task description:',
        defaultValue: `Task ${name}`
      });

      if (InteractiveHelpers.isCancelled(result)) {
        throw new Error('cancelled');
      }

      taskDescription = result as string || `Task ${name}`;
    }
  }

  // Select complexity
  let complexity: string;

  if (options.advanced) {
    complexity = 'advanced';
  } else if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
    // Default to simple in non-interactive mode
    complexity = 'simple';
  } else {
    const result = await select({
      message: 'Task complexity:',
      options: [
        { value: 'simple', label: 'Simple - Single command' },
        { value: 'standard', label: 'Standard - With parameters' },
        { value: 'advanced', label: 'Advanced - Multi-step with hooks' }
      ]
    });

    if (InteractiveHelpers.isCancelled(result)) {
      throw new Error('cancelled');
    }

    complexity = result as string || 'simple';
  }

  // Get template
  const template = TEMPLATES.task[complexity as keyof typeof TEMPLATES.task];
  const taskYaml = template
    .replace(/{name}/g, name)
    .replace(/{description}/g, String(taskDescription || ''));

  // Parse the task YAML
  const taskConfig = yaml.load(taskYaml) as any;

  // Add to configuration
  const existingTasks = configManager.get('tasks') || {};
  const updatedTasks = { ...existingTasks, ...taskConfig };
  configManager.set('tasks', updatedTasks);

  // Save configuration
  await configManager.save();

  outro(prism.green(`✅ Created task: ${name}`));

  // Show usage
  log.info('\nUsage:');
  log.info(`  ${prism.cyan('xec')} tasks:run ${name}`);
  if (complexity !== 'simple') {
    log.info(`  ${prism.cyan('xec')} tasks:run ${name} --help`);
  }
}

async function createProfile(name: string, options: NewOptions) {
  // Extract the description from desc option
  const description = options.desc;

  const configManager = new ConfigurationManager();
  const config = await configManager.load();

  if (!config) {
    log.error('No configuration found. Run "xec new project" first.');
    process.exit(1);
  }

  // Get description
  let profileDescription = description;

  if (!profileDescription) {
    // In non-interactive mode (CI), use default
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      profileDescription = `${name} environment profile`;
    } else {
      const result = await text({
        message: 'Profile description:',
        defaultValue: `${name} environment profile`
      });

      if (InteractiveHelpers.isCancelled(result)) {
        throw new Error('cancelled');
      }

      profileDescription = result as string || `${name} environment profile`;
    }
  }

  // Select template
  const templateKey = options.advanced ? 'advanced' : 'basic';
  const template = TEMPLATES.profile[templateKey];

  const profileYaml = template
    .replace(/{name}/g, name)
    .replace(/{description}/g, String(profileDescription || ''));

  // Parse the profile YAML
  const profileConfig = yaml.load(profileYaml) as any;

  // Add to configuration
  const existingProfiles = configManager.get('profiles') || {};
  const updatedProfiles = { ...existingProfiles, ...profileConfig };
  configManager.set('profiles', updatedProfiles);

  // Save configuration
  await configManager.save();

  outro(prism.green(`✅ Created profile: ${name}`));

  // Show usage
  log.info('\nUsage:');
  log.info(`  ${prism.cyan('xec')} --profile ${name} <command>`);
  log.info(`  ${prism.cyan('XEC_PROFILE=')}${name} xec <command>`);
}

async function createExtension(name: string, options: NewOptions) {
  // Extract the description from desc option
  const description = options.desc;

  const targetDir = path.resolve(name);

  // Check if directory exists
  if (fs.existsSync(targetDir) && !options.force) {
    // In non-interactive mode, fail
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      throw new Error(`Directory ${name} already exists. Use --force to overwrite.`);
    }

    const shouldContinue = await confirm({
      message: `Directory ${name} already exists. Continue?`,
      initialValue: false
    });

    if (InteractiveHelpers.isCancelled(shouldContinue) || !shouldContinue) {
      log.info('Extension creation cancelled');
      return;
    }
  }

  // Get description
  let extensionDescription = options.desc;

  if (!extensionDescription) {
    // In non-interactive mode (CI), use default
    if (process.env['CI'] || process.env['XEC_NO_INTERACTIVE']) {
      extensionDescription = `Xec extension ${name}`;
    } else {
      const result = await text({
        message: 'Extension description:',
        defaultValue: `Xec extension ${name}`
      });

      if (InteractiveHelpers.isCancelled(result)) {
        throw new Error('cancelled');
      }

      extensionDescription = result as string || `Xec extension ${name}`;
    }
  }

  const s = spinner();
  s.start('Creating extension structure...');

  // Select template
  const templateKey = options.advanced ? 'advanced' : 'basic';
  const template = TEMPLATES.extension[templateKey];

  const extensionYaml = template
    .replace(/{name}/g, name)
    .replace(/{description}/g, String(extensionDescription || ''));

  // Create extension structure
  await fs.ensureDir(targetDir);
  await fs.writeFile(path.join(targetDir, 'extension.yaml'), extensionYaml);

  // Create additional files for advanced template
  if (options.advanced) {
    // Scripts directory
    await fs.ensureDir(path.join(targetDir, 'scripts'));
    const mainScriptPath = path.join(targetDir, 'scripts', `${name}-main.ts`);
    await fs.writeFile(
      mainScriptPath,
      `#!/usr/bin/env node
/// <reference path="${path.resolve(import.meta.dirname, '../../../globals.d.ts')}" />

// Main script for ${name} extension

const mode = process.env.MODE || 'normal';
console.log(\`Running ${name} in \${mode} mode...\`);

// Your extension logic here
`
    );
    await fs.chmod(mainScriptPath, '755');

    await fs.writeFile(
      path.join(targetDir, 'scripts', `${name}-utils.ts`),
      `/// <reference path="${path.resolve(import.meta.dirname, '../../../globals.d.ts')}" />

// Utility functions for ${name} extension

export function helper(): string {
  return 'Helper function';
}
`
    );

    // Examples directory
    await fs.ensureDir(path.join(targetDir, 'examples'));
    await fs.writeFile(
      path.join(targetDir, 'examples', 'basic.yaml'),
      `# Example usage of ${name} extension

extensions:
  - source: ./${name}
    config:
      enabled: true
      settings:
        logLevel: info

tasks:
  example:
    description: Example using ${name}
    steps:
      - task: ${name}:setup
      - task: ${name}:run
        args:
          mode: fast
`
    );

    // README - only create if it doesn't exist
    const readmePath = path.join(targetDir, 'README.md');
    const readmeExists = await fs.exists(readmePath);

    if (!readmeExists) {
      await fs.writeFile(
        readmePath,
        `# ${name}

${extensionDescription}

## Installation

\`\`\`yaml
# In your .xec/config.yaml
extensions:
  - source: path/to/${name}
    config:
      enabled: true
\`\`\`

## Usage

\`\`\`bash
# Setup the extension
xec tasks:run ${name}:setup

# Run the main task
xec tasks:run ${name}:run --mode=fast
\`\`\`

## Configuration

See \`extension.yaml\` for configuration options.

## Tasks

- \`${name}:setup\` - Initial setup
- \`${name}:run\` - Main task
- \`${name}:clean\` - Cleanup resources
`
      );
      log.info(prism.green('✅ Created README.md'));
    } else {
      log.info(prism.dim('README.md already exists, skipping'));
    }
  }

  // Create package.json for npm distribution
  await fs.writeFile(
    path.join(targetDir, 'package.json'),
    JSON.stringify({
      name: `xec-ext-${name}`,
      version: '1.0.0',
      description: extensionDescription,
      main: 'extension.yaml',
      keywords: ['xec', 'extension', name],
      files: ['extension.yaml', 'scripts', 'examples', 'README.md'],
      engines: {
        xec: '>=0.7.0'
      }
    }, null, 2)
  );

  s.stop('Extension structure created');

  outro(prism.green(`✅ Created extension: ${name}`));

  // Show next steps
  log.info('\nNext steps:');
  log.info(`  ${prism.cyan('cd')} ${name}`);
  log.info(`  ${prism.cyan('edit')} extension.yaml`);
  log.info('\nTo use in a project:');
  log.info(`  Add to .xec/config.yaml:`);
  log.info(`  ${prism.gray('extensions:')}`);
  log.info(`  ${prism.gray('  - source:')} ${targetDir}`);
}

export class NewCommand extends BaseCommand {
  constructor() {
    super({
      name: 'new',
      description: 'Initialize Xec in existing project or create new artifacts',
      arguments: '[type] [name]',
      aliases: ['n', 'init'],
      options: [
        {
          flags: '-d, --desc <desc>',
          description: 'Description for the artifact'
        },
        {
          flags: '-f, --force',
          description: 'Overwrite existing files'
        },
        {
          flags: '-m, --minimal',
          description: 'Create minimal structure (projects only)'
        },
        {
          flags: '--skip-git',
          description: 'Skip git initialization (projects only)'
        },
        {
          flags: '--advanced',
          description: 'Use advanced template with more features'
        },
        {
          flags: '--js',
          description: 'Create JavaScript instead of TypeScript (scripts/commands only)'
        },
        {
          flags: '--from <template>',
          description: 'Create from a template or example'
        },
        {
          flags: '-p, --profile <name>',
          description: 'Apply profile after creation'
        },
        {
          flags: '-i, --interactive',
          description: 'Enable interactive mode (default for this command)'
        }
      ],
      examples: [
        {
          command: 'xec new',
          description: 'Interactive mode - detects existing projects automatically'
        },
        {
          command: 'xec new project',
          description: 'Initialize Xec in current directory'
        },
        {
          command: 'xec new project my-app',
          description: 'Create a new Xec project in my-app directory'
        },
        {
          command: 'xec new script deploy',
          description: 'Create a new script'
        },
        {
          command: 'xec new command mycmd --advanced',
          description: 'Create an advanced command'
        },
        {
          command: 'xec new task build --description "Build the application"',
          description: 'Create a new task with description'
        }
      ]
    });
  }

  public async execute(args_: any[]): Promise<void> {
    const args = [...args_];
    const [type, name] = args.slice(0, -1);
    const commandObject = args[args.length - 1];

    // Extract actual options from Commander object
    let options: NewOptions;
    if (typeof commandObject?.opts === 'function') {
      options = commandObject.opts() as NewOptions;
    } else {
      options = commandObject as NewOptions;
    }

    try {
      // Set up cancel handlers for interactive mode
      InteractiveHelpers.setupCancelHandlers();

      // Check if we're in an existing Node.js project without arguments
      const currentPackageJsonPath = path.join(process.cwd(), 'package.json');
      const hasPackageJson = fs.existsSync(currentPackageJsonPath);
      const xecDir = path.join(process.cwd(), '.xec');
      const hasXecConfig = fs.existsSync(xecDir);

      let artifactType: ArtifactType;
      let artifactName: string | undefined;

      // If no arguments and we have package.json but no .xec, suggest initialization
      if (!type && hasPackageJson && !hasXecConfig) {
        const packageJson = await fs.readJson(currentPackageJsonPath);

        intro(prism.bold('🎯 Initialize Xec in existing project'));
        log.info(prism.dim(`Found Node.js project: ${packageJson.name}`));

        const shouldInit = await confirm({
          message: 'Initialize Xec in this project?',
          initialValue: true
        });

        if (InteractiveHelpers.isCancelled(shouldInit) || !shouldInit) {
          // Fall back to regular artifact selection
          artifactType = await getArtifactType();
        } else {
          artifactType = 'project';
          artifactName = '.'; // Current directory
        }
      } else {
        intro(prism.bold('🎨 Create new Xec artifact'));

        // Determine artifact type
        if (type && ['project', 'script', 'command', 'task', 'profile', 'extension'].includes(type)) {
          artifactType = type as ArtifactType;
        } else if (type && !name) {
          // If only one argument provided and it's not a valid type, treat it as name for project
          artifactType = 'project';
          args[1] = type;
        } else {
          artifactType = await getArtifactType();
        }
      }

      // Get name if not provided (only if not already set)
      if (!artifactName) {
        artifactName = name || args[1];
      }

      // Special handling for 'xec new project' without name - initialize in current directory
      if (artifactType === 'project' && !artifactName) {
        // Check if we're already in a project directory
        if (hasPackageJson || fs.existsSync(process.cwd())) {
          artifactName = '.'; // Use current directory
        } else {
          // Ask for project name if creating new directory
          artifactName = await text({
            message: 'Project name:',
            defaultValue: 'my-xec-project',
            validate: (value) => validateName(value || '', artifactType)
          }) as string;

          if (InteractiveHelpers.isCancelled(artifactName)) {
            throw new Error('cancelled');
          }
        }
      } else if (!artifactName) {
        const defaultName = `my-${artifactType}`;
        artifactName = await text({
          message: `${artifactType.charAt(0).toUpperCase() + artifactType.slice(1)} name:`,
          defaultValue: defaultName,
          validate: (value) => validateName(value || '', artifactType)
        }) as string;

        if (InteractiveHelpers.isCancelled(artifactName)) {
          throw new Error('cancelled');
        }
      } else if (artifactName !== '.') {
        // Validate provided name (skip validation for current directory)
        const error = validateName(artifactName, artifactType);
        if (error) {
          log.error(error);
          throw new Error(error);
        }
      }

      // Create the artifact
      // eslint-disable-next-line default-case
      switch (artifactType) {
        case 'project':
          await createProject(artifactName, options || {});
          break;
        case 'script':
          await createScript(artifactName, options || {});
          break;
        case 'command':
          await createCommand(artifactName, options || {});
          break;
        case 'task':
          await createTask(artifactName, options || {});
          break;
        case 'profile':
          await createProfile(artifactName, options || {});
          break;
        case 'extension':
          await createExtension(artifactName, options || {});
          break;
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        // User cancelled, exit gracefully
        return;
      }
      log.error(error instanceof Error ? error.message : 'Creation failed');
      throw error;
    }
  }
}

// Export for backward compatibility
export async function createArtifact(type?: string, name?: string, options?: NewOptions): Promise<void> {
  const cmd = new NewCommand();
  const args: any[] = [];
  if (type) args.push(type);
  if (name) args.push(name);
  args.push(options || {});
  return cmd['execute'](args);
}

export default function command(program: Command): void {
  const cmd = new NewCommand();
  program.addCommand(cmd.create());
}