import fs from 'fs-extra';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { Command } from 'commander';
import { getExecutionSignal } from '@xec-sh/core';
import { log, text, prism, intro, outro, select, confirm, spinner } from '@xec-sh/kit';
import { sortConfigKeys, ConfigValidator, getDefaultConfig, type Configuration, ConfigurationManager } from '@xec-sh/ops';

import { canPrompt } from '../utils/plain-mode.js';
import { ConfigFileEditor } from '../utils/config-file-editor.js';
import { InteractiveHelpers } from '../utils/interactive-helpers.js';
import { BaseCommand, CommandOptions } from '../utils/command-base.js';

interface NewOptions extends CommandOptions {
  force?: boolean;
  minimal?: boolean;
  skipGit?: boolean;
  name?: string;
  desc?: string;
  type?: string;
  advanced?: boolean;
  js?: boolean;
  interactive?: boolean;
}

/**
 * Whether scaffolding may stop and ask a question.
 *
 * CI and XEC_NO_INTERACTIVE stay honoured for callers that set them, but the
 * absence of a terminal is the signal that actually decides it: a pipeline that
 * never sets CI still has nobody to answer a prompt.
 */
function isNonInteractive(): boolean {
  const disabled = process.env['XEC_NO_INTERACTIVE'];
  return !canPrompt() || (disabled !== undefined && !['', '0', 'false'].includes(disabled));
}

// Artifact types
type ArtifactType = 'project' | 'script' | 'command' | 'task' | 'profile';

// JavaScript with checked JSDoc is valid in both generated script languages.
const ADVANCED_SCRIPT = `#!/usr/bin/env xec

/**
 * {description}
 * Usage: xec run {filepath} [--env development|staging|production] [--dry-run] [--verbose]
 * Development selects local; staging/production require a configured hosts.<env> target.
 */
import { parseArgs } from 'node:util';
import { ConfigurationManager, TargetResolver, createTargetEngine, retry } from '@xec-sh/ops';

const { values: options } = parseArgs({
  args,
  options: {
    env: { type: 'string', default: 'development' },
    'dry-run': { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false }
  }
});
validateEnvironment(options.env);

const manager = new ConfigurationManager({ evaluateCommands: !options['dry-run'] });
let configuration = await manager.load();
if (configuration.profiles?.[options.env]) {
  await manager.useProfile(options.env);
  configuration = manager.getConfig();
  log.info(\`Applied profile: \${options.env}\`);
}
const reference = options.env === 'development' ? 'local' : \`hosts.\${options.env}\`;
// Resolution fails if a requested remote target is absent; never run it locally instead.
const target = await new TargetResolver(configuration).resolve(reference);
const execute = await createTargetEngine(target, { verbose: options.verbose });
log.info(\`Environment: \${options.env}; target: \${reference}\`);

const progress = spinner();
if (options['dry-run']) {
  log.info('Dry run: would execute node --version; no command was started');
} else {
  progress.start('Checking the target runtime...');
  try {
    // Retry only this idempotent observation. Replace it with your reviewed operation.
    const result = await retry(() => execute\`node --version\`, {
      maxAttempts: 3,
      initialDelay: 100,
      onRetry: (attempt, error) => log.warning(\`Retry \${attempt}: \${error.message}\`)
    });
    progress.stop('Target runtime checked');
    log.success(result.stdout.trim());
  } catch (error) {
    progress.stop('Target runtime check failed');
    throw error;
  }
}

/** @param {string} environment */
function validateEnvironment(environment) {
  if (!['development', 'staging', 'production'].includes(environment)) {
    throw new Error(\`Invalid environment: \${environment}\`);
  }
}
`;

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

// Example: an interactive prompt, asked only where it can be answered.
// A prompt drawn into a pipe waits forever for keys that cannot arrive,
// so a script meant to run in CI as well as in a terminal checks first.
if (process.stdin.isTTY) {
  const answer = await kit.confirm({
    message: 'Continue with the operation?',
    initialValue: true
  });

  if (answer !== true) throw new Error('Cancelled');
  log.info('Continuing');
}

log.success('Done');
`,
      ts: `#!/usr/bin/env xec
/// <reference types="{globalsPath}" />

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
const qName = process.stdin.isTTY
  ? await kit.text({ message: 'What is your name?', defaultValue: 'Developer' })
  : 'Developer';

if (kit.isCancel(qName)) throw new Error('Cancelled');
log.info(prism.blue(\`Hello, \${qName}!\`));

// A typed local observation; the starter never needs network access.
const summary: { runtime: string; fileCount: number } = {
  runtime: process.version,
  fileCount: files.length
};
log.step(JSON.stringify(summary));

log.success('✅ Script completed successfully!');
`
    },
    advanced: {
      js: ADVANCED_SCRIPT,
      ts: ADVANCED_SCRIPT
        .replace('#!/usr/bin/env xec', '#!/usr/bin/env xec\n/// <reference types="{globalsPath}" />')
        .replace('function validateEnvironment(environment)', 'function validateEnvironment(environment: string)')
    }
  },

  command: {
    basic: {
      js: `/**
 * {description}
 * 
 * This command will be available as: xec {name} [arguments]
 */

/** @param {import('commander').Command} program */
export function command(program) {
  program
    .command('{name} [args...]')
    .description('{description}')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (/** @type {string[]} */ args, /** @type {{ verbose?: boolean }} */ options) => {
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
      ts: `/// <reference types="{globalsPath}" />

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

/** @param {import('commander').Command} program */
export function command(program) {
  const cmd = program
    .command('{name}')
    .description('{description}');
  
  // Subcommand: list
  cmd
    .command('list')
    .description('List all items')
    .option('-f, --filter <pattern>', 'Filter results')
    .action(async (/** @type {{ filter?: string }} */ options) => {
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
        log.error(error instanceof Error ? error.message : String(error));
        throw error;
      }
    });
  
  // Subcommand: create
  cmd
    .command('create <name>')
    .description('Create a new item')
    .option('-t, --type <type>', 'Item type', 'default')
    .option('-d, --description <desc>', 'Item description')
    .option('-y, --yes', 'Confirm the example operation without a prompt')
    .action(async (/** @type {string} */ name, /** @type {{ type: string; description?: string; yes?: boolean; force?: boolean }} */ options) => {
      // log and confirm are already imported from @xec-sh/kit
      const { $ } = await import('@xec-sh/core');
      
      log.info(\`Creating item: \${name}\`);
      log.step(\`Type: \${options.type}\`);
      
      if (options.description) {
        log.step(\`Description: \${options.description}\`);
      }
      
      if (!options.yes && !process.stdin.isTTY) {
        throw new Error('Confirmation requires a terminal; pass --yes explicitly');
      }
      const shouldCreate = options.yes || await kit.confirm({
        message: 'Run the creation example?',
        initialValue: false
      });
      
      if (shouldCreate !== true) {
        log.info('Creation cancelled');
        return;
      }
      
      try {
        // Your create logic here
        await createItem(name, options);
        log.success(\`Item '\${name}' creation example completed (no item was stored)\`);
      } catch (error) {
        log.error(\`Failed to create item: \${error instanceof Error ? error.message : String(error)}\`);
        throw error;
      }
    });
  
  // Subcommand: delete
  cmd
    .command('delete <name>')
    .description('Delete an item')
    .option('-f, --force', 'Skip confirmation')
    .action(async (/** @type {string} */ name, /** @type {{ type: string; description?: string; yes?: boolean; force?: boolean }} */ options) => {
      // log and confirm are already imported from @xec-sh/kit
      
      if (!options.force) {
        if (!process.stdin.isTTY) throw new Error('Confirmation requires a terminal; pass --force explicitly');
        const shouldDelete = await kit.confirm({
          message: \`Are you sure you want to delete '\${name}'?\`,
          initialValue: false
        });
        
        if (shouldDelete !== true) {
          log.info('Deletion cancelled');
          return;
        }
      }
      
      try {
        // Your delete logic here
        await deleteItem(name);
        log.success(\`Item '\${name}' deletion example completed (no item was removed)\`);
      } catch (error) {
        log.error(\`Failed to delete item: \${error instanceof Error ? error.message : String(error)}\`);
        throw error;
      }
    });
}

// Helper functions
/** @param {string | undefined} filter */
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

/** @param {string} name @param {{ type: string }} options */
async function createItem(name, options) {
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Creating item: \${name} (type: \${options.type})"\`;
}

/** @param {string} name */
async function deleteItem(name) {
  const { $ } = await import('@xec-sh/core');
  await $\`echo "Deleting item: \${name}"\`;
}
`,
      ts: `/// <reference types="{globalsPath}" />

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
  metadata?: Record<string, unknown>;
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
  yes?: boolean;
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
          
          console.log(prism.bold('\\nItems:'));
          console.log(prism.gray('─'.repeat(60)));
          
          items.forEach(item => {
            const statusColor = item.status === 'active' ? 'green' : 
                              item.status === 'inactive' ? 'red' : 'yellow';
            
            const statusText = statusColor === 'green' ? prism.green(item.status) :
                              statusColor === 'red' ? prism.red(item.status) :
                              prism.yellow(item.status);
            
            console.log(
              prism.bold(item.name) + ' ' +
              '(' + prism.blue(item.type) + ') - ' +
              statusText
            );
          });
          
          console.log(prism.gray('─'.repeat(60)));
        }
        
      } catch (error) {
        s.stop('Failed to load items');
        log.error(error instanceof Error ? error.message : String(error));
        throw error;
      }
    });
  
  // Subcommand: create
  cmd
    .command('create <name>')
    .description('Create a new item')
    .requiredOption('-t, --type <type>', 'Item type (service|task|resource)')
    .option('-d, --description <desc>', 'Item description')
    .option('-y, --yes', 'Confirm the example operation without a prompt')
    .action(async (name: string, options: CreateOptions) => {
      // log and confirm are already imported from @xec-sh/kit
      const { $ } = await import('@xec-sh/core');
      
      // Validate options
      const validTypes: Item['type'][] = ['service', 'task', 'resource'];
      
      if (!validTypes.includes(options.type)) {
        throw new Error(\`Invalid type: \${options.type}. Must be one of: \${validTypes.join(', ')}\`);
      }
      
      // Display creation summary
      log.info(prism.bold('Creating new item:'));
      log.step(\`Name: \${prism.cyan(name)}\`);
      log.step(\`Type: \${prism.blue(options.type)}\`);
      
      if (options.description) {
        log.step(\`Description: \${options.description}\`);
      }
      
      if (!options.yes && !process.stdin.isTTY) {
        throw new Error('Confirmation requires a terminal; pass --yes explicitly');
      }
      const shouldCreate = options.yes || await kit.confirm({
        message: 'Run the creation example?',
        initialValue: false
      });
      
      if (shouldCreate !== true) {
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
          metadata: { description: options.description }
        };
        
        await createItem(item);
        log.success(\`Item '\${name}' creation example completed (no item was stored)\\nID: \${item.id}\`);
      } catch (error) {
        log.error(\`Failed to create item: \${error instanceof Error ? error.message : String(error)}\`);
        throw error;
      }
    });
  
  // Subcommand: delete
  cmd
    .command('delete <name>')
    .description('Delete an item')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name: string, options: { force?: boolean }) => {
      // log and confirm are already imported from @xec-sh/kit
      
      // Check if item exists
      const item = await getItemByName(name);
      if (!item) {
        throw new Error(\`Item '\${name}' not found\`);
      }
      
      // Show item details
      log.info(prism.bold('Item to delete:'));
      log.step(\`Name: \${item.name}\`);
      log.step(\`Type: \${item.type}\`);
      log.step(\`Status: \${item.status}\`);
      
      if (!options.force) {
        if (!process.stdin.isTTY) throw new Error('Confirmation requires a terminal; pass --force explicitly');
        const shouldDelete = await kit.confirm({
          message: prism.red(\`Are you sure you want to delete '\${name}'?\`),
          initialValue: false
        });
        
        if (shouldDelete !== true) {
          log.info('Deletion cancelled');
          return;
        }
      }
      
      try {
        await deleteItem(item.id);
        log.success(\`Item '\${name}' deletion example completed (no item was removed)\`);
      } catch (error) {
        log.error(\`Failed to delete item: \${error instanceof Error ? error.message : String(error)}\`);
        throw error;
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


};

async function getArtifactType(): Promise<ArtifactType> {
  if (isNonInteractive()) throw new Error('Specify the artifact type and name for non-interactive scaffolding.');
  const type = await select({
    signal: getExecutionSignal(),
    message: 'What would you like to create?',
    options: [
      { value: 'project', label: '📁 Project - Initialize a new Xec project' },
      { value: 'script', label: '📜 Script - Create an executable script' },
      { value: 'command', label: '⚡ Command - Add a CLI command' },
      { value: 'task', label: '🔧 Task - Define a reusable task' },
      { value: 'profile', label: '🌍 Profile - Environment configuration' },
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
      if (isNonInteractive()) {
        throw new Error('Xec is already initialized in this directory. Use --force to reinitialize.');
      }

      const shouldContinue = await confirm({
        signal: getExecutionSignal(),
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
        if (isNonInteractive()) {
          throw new Error(`Directory ${name} is not empty. Use --force to overwrite.`);
        }

        const shouldContinue = await confirm({
          signal: getExecutionSignal(),
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
      if (isNonInteractive()) {
        projectDescription = 'An Xec automation project';
      } else {
        const result = await text({
          signal: getExecutionSignal(),
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
    // Runnable local checks; deployment targets and recovery belong to the
    // project, not to a scaffold with invented remote hosts or schedules.
    config.vars = { app: { name: config.name } };
    config.tasks = {
      hello: {
        description: 'Print the configured project name',
        env: { PROJECT_NAME: '${vars.app.name}' },
        command: 'node -e "console.log(process.env.PROJECT_NAME)"',
      },
      check: {
        description: 'Verify the local runtime and configuration',
        steps: [
          { name: 'Node.js', command: 'node --version' },
          { name: 'Project', task: 'hello' },
        ],
      },
    };

    // Sort and save config
    const sortedConfig = sortConfigKeys(config);
    const configPath = path.join(xecDir, 'config.yaml');
    await fs.ensureDir(path.dirname(configPath));

    let yamlContent = yaml.dump(sortedConfig, { indent: 2, lineWidth: -1 });

    // Example targets ride along as real YAML comments under the targets
    // key, uncommentable in place. The previous approach encoded comments
    // as mapping keys ('# staging') and post-processed the dump with
    // regexes; the closing quotes survived (`# staging':`) and the volumes
    // list escaped commenting entirely, leaving a live `- ./:/app` entry
    // that made targets.containers a list — a warning on every invocation
    // of a freshly scaffolded project.
    const targetExamples = [
      '  # Declare remote targets here and reach them with on/in/copy/logs:',
      '  # hosts:',
      '  #   staging:',
      '  #     host: staging.example.com',
      '  #     user: deploy',
      '  #     hostKeyChecking: strict',
      '  #     privateKey: ~/.ssh/id_rsa',
      '  # containers:',
      '  #   app:',
      '  #     container: existing-app',
      '  #     workdir: /app',
      '  # pods:',
      '  #   web:',
      '  #     namespace: default',
      '  #     selector: app=web',
    ].join('\n');
    yamlContent = yamlContent.replace(/^targets:$/m, `targets:\n${targetExamples}`);

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
/// <reference types="@xec-sh/cli/globals" />

/**
 * Example Xec script
 * Run with: pnpm exec xec run .xec/scripts/example.ts
 */

// Use the $ function from @xec-sh/core
const result = await $\`echo "Hello from Xec!"\`;
log.success(result.stdout);

// Interactive prompts — kit is a global; nothing to import
const name = process.stdin.isTTY
  ? await kit.text({ message: 'What is your name?' })
  : 'world';
if (kit.isCancel(name)) throw new Error('Cancelled');
log.info(\`Hello, \${name}!\`);

// Work with targets: the configuration comes from @xec-sh/ops
const { config } = await import('@xec-sh/ops');
await config.load();
const hosts = config.get('targets.hosts') ?? {};
log.info(\`Found \${Object.keys(hosts).length} hosts\`);

// Use helper functions
log.info('Done!');
`;
    const exampleScriptPath = path.join(scriptsDir, 'example.ts');
    await fs.writeFile(exampleScriptPath, exampleScript);
    await fs.chmod(exampleScriptPath, '755');

    const readmePath = path.join(targetDir, 'README.md');
    const guide = `## Xec Automation

Pin the CLI in this project and commit the manifest and lockfile:

\`\`\`sh
pnpm add -D -E @xec-sh/cli
pnpm exec xec inspect tasks
pnpm exec xec run check
pnpm exec xec run .xec/scripts/example.ts
\`\`\`

The example checks run locally. Define and verify targets before adding remote
operations. Configuration is in \`.xec/config.yaml\`; scripts and native project
commands belong in \`.xec/scripts/\` and \`.xec/commands/\`.

[Configuration](https://xec.sh/docs/configuration/config-file) ·
[Tasks](https://xec.sh/docs/configuration/tasks/overview) ·
[Project commands](https://xec.sh/docs/commands/custom/creating-commands)
`;
    if (!await fs.exists(readmePath)) {
      await fs.writeFile(readmePath, `# ${config.name}\n\n${config.description}\n\n${guide}`);
    } else {
      const existing = await fs.readFile(readmePath, 'utf8');
      if (!existing.includes('## Xec Automation')) await fs.writeFile(readmePath, `${existing}\n\n${guide}`);
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

    if (!(isNonInteractive())) {
      const result = await confirm({
        signal: getExecutionSignal(),
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
    log.info('  pnpm exec xec run .xec/scripts/example.ts');
    log.info('  pnpm exec xec run check');
    log.info('  pnpm exec xec run hello');
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
    if (isNonInteractive()) {
      throw new Error(`Script ${fileName} already exists. Use --force to overwrite.`);
    }

    const shouldOverwrite = await confirm({
      signal: getExecutionSignal(),
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
    if (isNonInteractive()) {
      scriptDescription = `Custom script ${name}`;
    } else {
      const result = await text({
        signal: getExecutionSignal(),
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
  // Process template
  const content = template
    .replace(/{name}/g, path.basename(name, ext))
    .replace(/{description}/g, String(scriptDescription || ''))
    .replace(/{filepath}/g, path.relative(process.cwd(), filePath))
    .replace(/{globalsPath}/g, '@xec-sh/cli/globals');

  // Write file
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content);
  await fs.chmod(filePath, '755');

  outro(prism.green(`✅ Created script: ${fileName}`));

  // Show usage
  log.info('\nUsage:');
  log.info(`  ${prism.cyan('xec')} run .xec/scripts/${fileName}`);
  if (options.advanced) log.info(`  ${prism.cyan('xec')} run .xec/scripts/${fileName} -- --dry-run`);
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
    if (isNonInteractive()) {
      throw new Error(`Command ${fileName} already exists. Use --force to overwrite.`);
    }

    const shouldOverwrite = await confirm({
      signal: getExecutionSignal(),
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
    if (isNonInteractive()) {
      commandDescription = `Custom command ${name}`;
    } else {
      const result = await text({
        signal: getExecutionSignal(),
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
  // Process template
  const content = template
    .replace(/{name}/g, name)
    .replace(/{description}/g, String(commandDescription || ''))
    .replace(/{globalsPath}/g, '@xec-sh/cli/globals');

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

  const configManager = new ConfigurationManager({ configFilePath: options.config });
  const config = await configManager.load();

  if (!config) {
    log.error('No configuration found. Run "xec new project" first.');
    process.exit(1);
  }

  // Get description
  let taskDescription = description;

  if (!taskDescription) {
    // In non-interactive mode (CI), use default
    if (isNonInteractive()) {
      taskDescription = `Task ${name}`;
    } else {
      const result = await text({
        signal: getExecutionSignal(),
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
  } else if (isNonInteractive()) {
    // Default to simple in non-interactive mode
    complexity = 'simple';
  } else {
    const result = await select({
      signal: getExecutionSignal(),
      message: 'Task complexity:',
      options: [
        { value: 'simple', label: 'Simple - Single command' },
        { value: 'standard', label: 'Standard - With parameters' },
        { value: 'advanced', label: 'Advanced - Validated multi-step task' }
      ]
    });

    if (InteractiveHelpers.isCancelled(result)) {
      throw new Error('cancelled');
    }

    complexity = result as string || 'simple';
  }

  const task: Exclude<NonNullable<Configuration['tasks']>[string], string> = {
    description: String(taskDescription),
    target: 'local',
    command: 'node -e "console.log(process.env.MESSAGE)"',
    env: { MESSAGE: `Task ${name} executed!` },
  };
  if (complexity !== 'simple') {
    task.params = [{ name: 'message', type: 'string', description: 'Message to display', default: `Hello from ${name}` }];
    task.env = { MESSAGE: '${params.message}' };
  }
  if (complexity === 'advanced') {
    delete task.command;
    task.steps = [
      { name: 'Inspect runtime', command: 'node --version' },
      { name: 'Display message', command: 'node -e "console.log(process.env.MESSAGE)"' },
    ];
  }
  if (Object.hasOwn(config.tasks || {}, name) && !options.force) {
    throw new Error(`Task ${name} already exists. Use --force to replace it.`);
  }
  await saveValidatedConfig(configManager, { ...config, tasks: { ...config.tasks, [name]: task } }, ['tasks', name], task);

  outro(prism.green(`✅ Created task: ${name}`));

  // Show usage
  log.info('\nUsage:');
  log.info(`  ${prism.cyan('xec')} run ${name}`);
  if (complexity !== 'simple') {
    log.info(`  ${prism.cyan('xec')} run ${name} --help`);
  }
}

async function createProfile(name: string, options: NewOptions) {
  // Extract the description from desc option
  const description = options.desc;

  const configManager = new ConfigurationManager({ configFilePath: options.config });
  const config = await configManager.load();

  if (!config) {
    log.error('No configuration found. Run "xec new project" first.');
    process.exit(1);
  }

  // Get description
  let profileDescription = description;

  if (!profileDescription) {
    // In non-interactive mode (CI), use default
    if (isNonInteractive()) {
      profileDescription = `${name} environment profile`;
    } else {
      const result = await text({
        signal: getExecutionSignal(),
        message: 'Profile description:',
        defaultValue: `${name} environment profile`
      });

      if (InteractiveHelpers.isCancelled(result)) {
        throw new Error('cancelled');
      }

      profileDescription = result as string || `${name} environment profile`;
    }
  }

  const profile: NonNullable<Configuration['profiles']>[string] = {
    description: String(profileDescription),
    vars: { environment: name, logLevel: 'info' },
  };
  if (options.advanced) {
    profile.targets = { local: { type: 'local', env: { NODE_ENV: '${vars.environment}' } } };
  }
  if (Object.hasOwn(config.profiles || {}, name) && !options.force) {
    throw new Error(`Profile ${name} already exists. Use --force to replace it.`);
  }
  await saveValidatedConfig(configManager, { ...config, profiles: { ...config.profiles, [name]: profile } }, ['profiles', name], profile);

  outro(prism.green(`✅ Created profile: ${name}`));

  // Show usage
  log.info('\nUsage:');
  log.info(`  ${prism.cyan('XEC_PROFILE=')}${name} xec <command>`);
}

async function saveValidatedConfig(manager: ConfigurationManager, candidate: Configuration, field: readonly string[], value: unknown): Promise<void> {
  const errors = (await new ConfigValidator().validate(candidate)).filter(error => error.rule !== 'warning');
  if (errors.length) throw new Error(errors.map(error => `${error.path}: ${error.message}`).join('\n'));
  const editor = await ConfigFileEditor.open(await manager.getConfigPath());
  editor.set(field, value);
  await editor.save();
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
          command: 'xec new task build --desc "Build the application"',
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

    if (options?.output && options.output !== 'text') {
      throw new Error('new produces human-readable scaffold instructions; structured output is not implemented.');
    }
    if (options?.config) {
      if (type !== 'task' && type !== 'profile') throw new Error('--config selects the file edited by new task or new profile only.');
      await this.requireConfigFile(options);
    }
    if (options?.dryRun) {
      throw new Error('new does not implement a dry-run preview. No files were created; inspect the generated template in an isolated directory.');
    }
    if (type === 'extension') {
      throw new Error('Extension loading is not implemented. Use "xec new command <name>" for a native project command.');
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
      if (!type && hasPackageJson && !hasXecConfig && !isNonInteractive()) {
        const packageJson = await fs.readJson(currentPackageJsonPath);

        intro(prism.bold('🎯 Initialize Xec in existing project'));
        log.info(prism.dim(`Found Node.js project: ${packageJson.name}`));

        const shouldInit = await confirm({
          signal: getExecutionSignal(),
          message: 'Initialize Xec in this project?',
          initialValue: true
        });

        if (InteractiveHelpers.isCancelled(shouldInit)) return;
        if (!shouldInit) {
          // Declining initialization permits choosing another artifact.
          artifactType = await getArtifactType();
        } else {
          artifactType = 'project';
          artifactName = '.'; // Current directory
        }
      } else {
        intro(prism.bold('🎨 Create new Xec artifact'));

        // Determine artifact type
        if (type && ['project', 'script', 'command', 'task', 'profile'].includes(type)) {
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
            signal: getExecutionSignal(),
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
          signal: getExecutionSignal(),
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

export async function createArtifact(type?: string, name?: string, options?: NewOptions): Promise<void> {
  const cmd = new NewCommand();
  const args: any[] = [];
  if (type) args.push(type);
  if (name) args.push(name);
  args.push(options || {});
  return cmd['execute'](args);
}

export default function registerCommand(program: Command): void {
  const cmd = new NewCommand();
  program.addCommand(cmd.create());
}
