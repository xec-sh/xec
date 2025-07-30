---
sidebar_position: 3
---

# Creating Custom Commands and Scripts

Learn how to extend Xec with custom scripts and CLI commands for your specific automation needs.

## Overview

Xec provides two ways to extend its functionality:

1. **Scripts** - Standalone automation files executed with `xec`
2. **Commands** - Custom CLI commands integrated into the Xec command structure

## Getting Started

First, initialize a Xec project:

```bash
# Create a new project with examples
xec init my-project

# Or create a minimal project
xec init my-project --minimal
```

Then use the `new` command to create templates:

```bash
# Create a new script
xec new script my-automation

# Create a new command
xec new command my-tool
```

## Scripts

### What are Scripts?

Scripts are JavaScript/TypeScript files that leverage the Xec API for automation tasks. They can be executed directly and have full access to all Xec features.

### Creating Scripts

#### Using Templates

```bash
# Basic script template
xec new script deploy

# Advanced script with more features
xec new script deploy --advanced

# With description
xec new script backup -d "Backup database and files"
```

#### Script Structure

Basic script template:

```javascript
#!/usr/bin/env xec

/**
 * Deploy application to production
 * 
 * Usage: xec .xec/scripts/deploy.js
 */

import { $ } from '@xec-sh/core';

// Your script logic here
log.info('Running deploy script...');

// Run commands
const result = await $`git status`;
log.success(result.stdout);

// Interactive prompts
const environment = await question({
  message: 'Which environment?',
  defaultValue: 'production'
});

// File operations
const files = await glob('dist/**/*.js');
log.step(`Found ${files.length} files to deploy`);
```

### Global Utilities API

Xec provides a rich set of utilities available globally in all scripts and commands:

#### Module Loading

Xec provides a unified import syntax with prefixes for loading modules from various sources:

```javascript
// Import from NPM CDN (doesn't require local installation)
const dayjs = await import('npm:dayjs');
const lodash = await import('npm:lodash-es@4.17.21');

// Import from JSR (Deno's package registry)
const encoding = await import('jsr:@std/encoding@0.224.0');

// Import from specific CDN
const mitt = await import('esm:mitt');           // esm.sh
const react = await import('unpkg:react@18');    // unpkg.com
const vue = await import('skypack:vue@3');       // skypack.dev
const jquery = await import('jsdelivr:jquery');  // jsdelivr.net

// Import local packages (no prefix needed)
const { $ } = await import('@xec-sh/core');
const chalk = await import('chalk');
```

**Note**: Prefixed imports are automatically transformed to use Xec's module loader during execution.

#### Core Utilities

##### Process Execution
```javascript
// Execute commands with $ from @xec-sh/core
const result = await $`npm test`;

// Chain methods
await $`npm build`
  .cwd('/project')
  .env({ NODE_ENV: 'production' })
  .quiet();
```

##### File System Operations
```javascript
// fs-extra - enhanced file operations
await fs.copy('src', 'dist');
await fs.ensureDir('logs');
await fs.remove('temp');
const exists = await fs.pathExists('config.json');
const json = await fs.readJson('package.json');

// glob - pattern matching
const files = await glob('**/*.js');
const tests = await glob('test/**/*.spec.ts', { ignore: 'node_modules/**' });

// path utilities
const fullPath = path.join(process.cwd(), 'src', 'index.js');
const ext = path.extname('file.txt'); // '.txt'
const dir = path.dirname('/path/to/file.js'); // '/path/to'
```

##### Interactive Prompts
```javascript
// Text input
const name = await question('What is your name?');

// Confirmation
const proceed = await confirm({
  message: 'Continue with deployment?',
  initialValue: true
});

// Selection
const env = await select({
  message: 'Select environment',
  options: [
    { value: 'dev', label: 'Development' },
    { value: 'staging', label: 'Staging' },
    { value: 'prod', label: 'Production' }
  ]
});

// Multiple selection
const features = await multiselect({
  message: 'Select features to enable',
  options: [
    { value: 'auth', label: 'Authentication' },
    { value: 'api', label: 'API Gateway' },
    { value: 'db', label: 'Database' }
  ]
});

// Password input
const password = await password({
  message: 'Enter password',
  validate: (value) => value.length < 8 ? 'Password must be at least 8 characters' : undefined
});
```

##### Progress Indicators
```javascript
// Create spinner
const spinner = spinner();
spinner.start('Processing...');
// ... do work ...
spinner.stop('Complete!');

// With error handling
try {
  spinner.start('Building application...');
  await $`npm run build`;
  spinner.stop('Build successful');
} catch (error) {
  spinner.stop('Build failed');
  throw error;
}
```

##### Logging
```javascript
// Structured logging
log.info('Information message');
log.success('✅ Operation completed');
log.error('❌ Something went wrong');
log.warning('⚠️  Warning message');
log.step('→ Processing step');

// With colors using chalk
log.info(chalk.blue('Blue text'));
log.success(chalk.green.bold('Bold green'));
log.error(chalk.red.underline('Underlined red'));

// Chalk color utilities
const text = chalk.hex('#FFA500')('Orange text');
const rainbow = chalk.rgb(255, 0, 0)('R') + chalk.rgb(0, 255, 0)('G') + chalk.rgb(0, 0, 255)('B');
```

##### Environment and Process
```javascript
// Environment variables
const apiKey = env('API_KEY'); // Get env var
const port = env('PORT', '3000'); // With default
setEnv('NODE_ENV', 'production'); // Set env var

// Process control
exit(0); // Exit with code
kill(12345); // Kill process by PID
kill(12345, 'SIGKILL'); // With specific signal

// Process listing
const processes = await ps();
const nodeProcesses = processes.filter(p => p.name.includes('node'));
```

##### Utilities
```javascript
// Sleep/delay
await sleep(1000); // Sleep for 1 second

// Retry with exponential backoff
const result = await retry(
  async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  },
  {
    retries: 3,
    delay: 1000,
    backoff: 2,
    onRetry: (error, attempt) => {
      log.warning(`Retry attempt ${attempt}: ${error.message}`);
    }
  }
);

// Which - find executable
const gitPath = await which('git');
if (!gitPath) {
  log.error('Git is not installed');
  exit(1);
}

// Quote shell arguments
const safeArg = quote("file with spaces.txt");
await $`cat ${safeArg}`;

// Template strings
const message = template`Hello, ${name}! You have ${count} messages.`;

// Working directory
const currentDir = pwd();
cd('../'); // Change directory
cd('/absolute/path'); // Absolute path
const newDir = cd(); // Get current directory

// Echo output
echo('Hello, World!');
echo('Multiple', 'arguments', 'supported');
```

##### HTTP Requests
```javascript
// Fetch API
const response = await fetch('https://api.example.com/users');
const users = await response.json();

// POST request
const result = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John', email: 'john@example.com' })
});
```

##### File Formats
```javascript
// YAML parsing
const { parse, stringify } = await yaml();
const config = parse(await fs.readFile('config.yaml', 'utf8'));
const yamlString = stringify({ key: 'value' });

// CSV parsing
const { parse: parseCSV, stringify: stringifyCSV } = await csv();
const records = parseCSV('name,age\nJohn,30\nJane,25');
const csvString = stringifyCSV([
  ['name', 'age'],
  ['John', 30],
  ['Jane', 25]
]);

// Diff comparison
const changes = await diff('old content', 'new content');
changes.forEach(part => {
  const color = part.added ? chalk.green : part.removed ? chalk.red : chalk.gray;
  process.stdout.write(color(part.value));
});
```

##### Temporary Files
```javascript
// Get temp directory
const tempDir = tmpdir(); // e.g., /tmp

// Generate temp file path
const tempFile = tmpfile('data-', '.json'); // e.g., /tmp/data-abc123.json

// Use temp file
await fs.writeJson(tempFile, { data: 'test' });
// ... use file ...
await fs.remove(tempFile); // Clean up
```

##### Advanced Utilities
```javascript
// Parse command-line arguments
const args = await parseArgs(process.argv.slice(2));
// node script.js --name=John --verbose -> { name: 'John', verbose: true }

// Load .env file
await loadEnv(); // Load .env from current directory
await loadEnv('.env.production'); // Load specific file

// Scoped execution
const result = await within(
  { 
    cwd: '/project',
    env: { NODE_ENV: 'test' }
  },
  async () => {
    // This runs in /project with NODE_ENV=test
    return await $`npm test`;
  }
);
// Original cwd and env are restored
```

##### Operating System
```javascript
// OS information
const platform = os.platform(); // 'darwin', 'linux', 'win32'
const arch = os.arch(); // 'x64', 'arm64'
const cpus = os.cpus(); // CPU information
const totalMem = os.totalmem(); // Total memory in bytes
const freeMem = os.freemem(); // Free memory in bytes
const homeDir = os.homedir(); // User home directory
const hostname = os.hostname(); // Machine hostname
```

Advanced script template includes:
- Command-line argument parsing
- Error handling
- Progress indicators
- Environment validation
- Helper functions
- Full access to global utilities API

### Running Scripts

```bash
# Run a script
xec .xec/scripts/deploy.js

# With arguments
xec .xec/scripts/deploy.js --env=production --dry-run

# With Node.js options
xec --node-options="--max-old-space-size=4096" .xec/scripts/heavy-task.js
```

### Script Features

#### Command-line Arguments

Access arguments via `argv` and `args`:

```javascript
// Named arguments
const env = argv.env || 'development';
const dryRun = argv['dry-run'] || false;

// Positional arguments
const target = args[0]; // First argument
const action = args[1]; // Second argument
```

#### Environment Variables

```javascript
// Read environment variables
const apiKey = process.env.API_KEY;
const nodeEnv = process.env.NODE_ENV || 'development';

// Set for child processes
const result = await $`npm run build`.env({
  NODE_ENV: 'production',
  API_URL: 'https://api.example.com'
});
```

#### Logging and Output

```javascript
// Different log levels
log.info('Information message');
log.success('✅ Operation completed');
log.error('❌ Something went wrong');
log.warn('⚠️  Warning message');
log.step('→ Processing step');

// With chalk for colors
log.info(chalk.blue('Blue text'));
log.success(chalk.green.bold('Bold green text'));
```

#### Progress Indicators

```javascript
const spinner = clack.spinner();

spinner.start('Loading data...');
// ... do work ...
spinner.stop('Data loaded');

// Or handle errors
try {
  spinner.start('Processing...');
  await processData();
  spinner.stop('Processing complete');
} catch (error) {
  spinner.stop(chalk.red('Processing failed'));
}
```

### Script Examples

#### Deployment Script

```javascript
#!/usr/bin/env xec

const environment = argv.env || 'staging';
const branch = argv.branch || 'main';

log.info(chalk.bold(`🚀 Deploying ${branch} to ${environment}`));

// Run tests first
const tests = await $`npm test`.nothrow();
if (!tests.isSuccess()) {
  log.error('Tests failed! Aborting deployment.');
  process.exit(1);
}

// Build application
await $`npm run build`;

// Deploy based on environment
if (environment === 'production') {
  const $prod = $.ssh({
    host: 'prod.example.com',
    username: 'deploy'
  });
  
  await $prod`cd /app && git pull origin ${branch}`;
  await $prod`cd /app && npm install --production`;
  await $prod`cd /app && npm run migrate`;
  await $prod`sudo systemctl restart app`;
} else {
  // Deploy to staging
  await $`docker build -t app:${branch} .`;
  await $`docker push app:${branch}`;
}

log.success('✅ Deployment complete!');
```

#### Backup Script

```javascript
#!/usr/bin/env xec

const timestamp = new Date().toISOString().replace(/:/g, '-');
const backupDir = `/backups/${timestamp}`;

// Create backup directory
await $`mkdir -p ${backupDir}`;

// Backup database
log.step('Backing up database...');
await $`pg_dump myapp > ${backupDir}/database.sql`;

// Backup files
log.step('Backing up files...');
await $`tar -czf ${backupDir}/files.tar.gz /var/www/app`;

// Upload to S3
log.step('Uploading to S3...');
await $`aws s3 cp ${backupDir} s3://my-backups/${timestamp} --recursive`;

// Clean up old backups
log.step('Cleaning up old backups...');
const oldBackups = await glob('/backups/*');
const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

for (const backup of oldBackups) {
  const stat = await fs.stat(backup);
  if (stat.mtime.getTime() < thirtyDaysAgo) {
    await fs.remove(backup);
    log.info(`Removed old backup: ${backup}`);
  }
}

log.success('✅ Backup complete!');
```

## Commands

### What are Commands?

Commands are extensions to the Xec CLI that appear as subcommands. They integrate seamlessly with the CLI and can have their own options and subcommands.

### Creating Commands

```bash
# Basic command
xec new command greet

# Advanced command with subcommands
xec new command manage --advanced

# With description
xec new command deploy -d "Deploy application to various environments"
```

### Command Structure

Basic command template:

```javascript
/**
 * Greet users with a friendly message
 * 
 * This command will be available as: xec greet [name]
 */

export function command(program) {
  program
    .command('greet [name]')
    .description('Say hello to someone')
    .option('-u, --uppercase', 'Output in uppercase')
    .option('-r, --repeat <times>', 'Repeat the message', '1')
    .action(async (name = 'World', options) => {
      // Import utilities dynamically
      const { log } = await import('@clack/prompts');
      const { $ } = await import('@xec-sh/core');
      
      let message = `Hello, ${name}!`;
      
      if (options.uppercase) {
        message = message.toUpperCase();
      }
      
      const times = parseInt(options.repeat, 10);
      for (let i = 0; i < times; i++) {
        log.success(message);
      }
    });
}
```

### Module Loading in Commands

Commands have access to the global module context for flexible dependency management:

```javascript
export async function command(program) {
  program
    .command('analyze <file>')
    .description('Analyze file with various tools')
    .action(async (file) => {
      // Load modules from CDN without local installation
      const dayjs = await import('npm:dayjs@1.11.10');
      const lodash = await import('npm:lodash-es@4.17.21');
      
      // Load local packages
      const { $ } = await import('@xec-sh/core');
      const { log } = await import('@clack/prompts');
      
      // Use the loaded modules
      const stats = await fs.stat(file);
      const modified = dayjs.default(stats.mtime).format('YYYY-MM-DD HH:mm:ss');
      
      log.info(`File: ${file}`);
      log.info(`Modified: ${modified}`);
      log.info(`Size: ${lodash.default.round(stats.size / 1024, 2)} KB`);
    });
}
```

Advanced command with subcommands:

```javascript
export function command(program) {
  const cmd = program
    .command('manage')
    .description('Manage application resources');
  
  // Subcommand: list
  cmd
    .command('list')
    .description('List all resources')
    .option('-f, --filter <pattern>', 'Filter results')
    .action(async (options) => {
      // Implementation
    });
  
  // Subcommand: create
  cmd
    .command('create <name>')
    .description('Create a new resource')
    .option('-t, --type <type>', 'Resource type')
    .action(async (name, options) => {
      // Implementation
    });
}
```

### Using Commands

After creating a command, it's immediately available:

```bash
# Get help for your command
xec greet --help

# Use the command
xec greet Alice
xec greet Alice --uppercase
xec greet Alice --repeat 3

# For commands with subcommands
xec manage list
xec manage list --filter "prod-*"
xec manage create my-resource --type api
```

### Command Best Practices

1. **Clear Names**: Use verbs for actions (deploy, sync, backup)
2. **Helpful Descriptions**: Always provide clear descriptions
3. **Consistent Options**: Follow CLI conventions (--verbose, --force)
4. **Error Handling**: Provide clear error messages
5. **Progress Feedback**: Show progress for long operations

### Command Examples

#### Database Command

```javascript
export function command(program) {
  const cmd = program
    .command('db')
    .description('Database operations');
  
  cmd
    .command('backup [database]')
    .description('Backup database')
    .option('-o, --output <path>', 'Output path', './backups')
    .action(async (database = 'myapp', options) => {
      const { spinner } = await import('@clack/prompts');
      const { $ } = await import('@xec-sh/core');
      
      const s = spinner();
      s.start(`Backing up database: ${database}`);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${database}-${timestamp}.sql`;
      const filepath = `${options.output}/${filename}`;
      
      await $`mkdir -p ${options.output}`;
      await $`pg_dump ${database} > ${filepath}`;
      await $`gzip ${filepath}`;
      
      s.stop(`Backup saved to ${filepath}.gz`);
    });
  
  cmd
    .command('restore <file>')
    .description('Restore database from backup')
    .option('-d, --database <name>', 'Target database')
    .action(async (file, options) => {
      // Restore implementation
    });
}
```

#### Environment Command

```javascript
export function command(program) {
  const cmd = program
    .command('env')
    .description('Environment management');
  
  cmd
    .command('switch <environment>')
    .description('Switch to a different environment')
    .action(async (environment) => {
      const { confirm, log } = await import('@clack/prompts');
      
      const shouldSwitch = await confirm({
        message: `Switch to ${environment} environment?`,
        initialValue: true
      });
      
      if (!shouldSwitch) {
        log.info('Environment switch cancelled');
        return;
      }
      
      // Update configuration
      const config = await loadConfig();
      config.currentEnvironment = environment;
      await saveConfig(config);
      
      log.success(`Switched to ${environment} environment`);
    });
  
  cmd
    .command('list')
    .description('List available environments')
    .action(async () => {
      const config = await loadConfig();
      const { log } = await import('@clack/prompts');
      
      log.info('Available environments:');
      Object.keys(config.environments).forEach(env => {
        const marker = env === config.currentEnvironment ? '→' : ' ';
        log.step(`${marker} ${env}`);
      });
    });
}
```

## Advanced Topics

### Sharing Code Between Scripts

Create utility modules in `.xec/lib/`:

```javascript
// .xec/lib/deploy-utils.js
export async function checkHealth(url) {
  const response = await fetch(url);
  return response.ok;
}

export async function notifySlack(message) {
  await fetch(process.env.SLACK_WEBHOOK, {
    method: 'POST',
    body: JSON.stringify({ text: message })
  });
}
```

Use in scripts:

```javascript
import { checkHealth, notifySlack } from '../lib/deploy-utils.js';

// Use the utilities
if (await checkHealth('https://app.example.com/health')) {
  await notifySlack('Deployment successful! 🎉');
}
```

### Testing Scripts and Commands

Create test scripts:

```javascript
// .xec/scripts/test-commands.js
#!/usr/bin/env xec

log.info('Testing custom commands...');

// Test command exists
const helpResult = await $`xec greet --help`.nothrow();
assert(helpResult.isSuccess(), 'greet command should exist');

// Test command execution
const greetResult = await $`xec greet Test`.nothrow();
assert(greetResult.stdout.includes('Hello, Test!'), 'Should greet correctly');

log.success('All tests passed! ✅');
```

### Environment-Specific Scripts

Use configuration to handle different environments:

```javascript
// Load environment configuration
const config = await loadConfig();
const env = argv.env || config.currentEnvironment || 'development';
const envConfig = config.environments[env];

if (!envConfig) {
  log.error(`Unknown environment: ${env}`);
  process.exit(1);
}

// Use environment-specific settings
const $ = $.defaults({
  env: envConfig.env,
  cwd: envConfig.workDir
});

if (envConfig.ssh) {
  // Use SSH for remote environments
  const $remote = $.ssh(envConfig.ssh);
  await $remote`deployment commands here`;
} else {
  // Local execution
  await $`local deployment commands`;
}
```

## Tips and Tricks

### 1. Use TypeScript for Better IDE Support

```typescript
// .xec/scripts/deploy.ts
import { $ } from '@xec-sh/core';

interface DeployOptions {
  environment: string;
  branch: string;
  dryRun: boolean;
}

async function deploy(options: DeployOptions): Promise<void> {
  // Type-safe deployment logic
}
```

### 2. Create Script Aliases

Add to your shell configuration:

```bash
# ~/.bashrc or ~/.zshrc
alias deploy="xec ~/.xec/scripts/deploy.js"
alias backup="xec ~/.xec/scripts/backup.js"
```

### 3. Use Environment Variables for Secrets

```javascript
// Never hardcode secrets
const apiKey = process.env.API_KEY;
if (!apiKey) {
  log.error('API_KEY environment variable is required');
  process.exit(1);
}
```

### 4. Create Reusable Script Templates

Save common patterns as templates:

```javascript
// .xec/templates/crud-script.js
export function createCrudScript(resourceName) {
  return `#!/usr/bin/env xec

const action = args[0];
const id = args[1];

switch (action) {
  case 'list':
    await list${resourceName}s();
    break;
  case 'create':
    await create${resourceName}(id);
    break;
  case 'delete':
    await delete${resourceName}(id);
    break;
  default:
    log.error(\`Unknown action: \${action}\`);
}`;
}
```

## Next Steps

1. Initialize your project: `xec init my-project`
2. Create your first script: `xec new script my-task`
3. Create a custom command: `xec new command my-tool`
4. Explore the [API documentation](../core/api-reference) for available functions
5. Check [example scripts](https://github.com/xec-sh/xec/tree/main/packages/core/examples)

Remember: Start simple, test thoroughly, and gradually add complexity as needed!