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
}

// Script templates
const BASIC_SCRIPT_TEMPLATE = `#!/usr/bin/env xec

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

const ADVANCED_SCRIPT_TEMPLATE = `#!/usr/bin/env xec

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

// Command templates
const BASIC_COMMAND_TEMPLATE = `/**
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

const ADVANCED_COMMAND_TEMPLATE = `/**
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
        s.stop(\`Found \${items.length} items\`);
        
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
          template = options.advanced ? ADVANCED_SCRIPT_TEMPLATE : BASIC_SCRIPT_TEMPLATE;
        } else {
          template = options.advanced ? ADVANCED_COMMAND_TEMPLATE : BASIC_COMMAND_TEMPLATE;
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