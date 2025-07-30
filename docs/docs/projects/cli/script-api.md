---
sidebar_position: 5
---

# Script API Reference

Complete API reference for all utilities and functions available in Xec scripts and commands.

## Overview

When you run a script with Xec or create a custom command, a rich set of utilities is automatically available in the global scope. This includes file system operations, process execution, interactive prompts, HTTP requests, and much more.

## Module Loading

Xec provides a unified import syntax with prefixes for loading modules from various sources. This allows you to load packages from CDNs without local installation.

### Import Syntax

```javascript
// Import from NPM CDN (doesn't require local installation)
const dayjs = await import('npm:dayjs');
const lodash = await import('npm:lodash-es@4.17.21');

// Import from JSR (Deno's package registry)
const encoding = await import('jsr:@std/encoding@0.224.0');
const base64 = await import('jsr:@std/encoding/base64');

// Import from specific CDNs
const mitt = await import('esm:mitt');           // esm.sh
const react = await import('unpkg:react@18');    // unpkg.com
const vue = await import('skypack:vue@3');       // skypack.dev
const jquery = await import('jsdelivr:jquery');  // jsdelivr.net

// Import local packages (no prefix needed)
const { $ } = await import('@xec-sh/core');
const chalk = await import('chalk');
```

### How It Works

1. **Prefixed imports** (`npm:`, `jsr:`, etc.) are automatically transformed during script execution
2. **Local packages** are loaded from node_modules when available
3. **CDN fallback** - If a package isn't found locally, it's loaded from CDN
4. **Caching** - Downloaded modules are cached for faster subsequent loads

### Examples

```javascript
// Load a date library without installation
const dayjs = await import('npm:dayjs');
const now = dayjs.default();
console.log(now.format('YYYY-MM-DD'));

// Load specific version
const lodash = await import('npm:lodash-es@4.17.21');
const debounced = lodash.debounce(() => console.log('Called'), 300);

// Use JSR for Deno-first packages
const { encode, decode } = await import('jsr:@std/encoding/base64');
const encoded = encode(new TextEncoder().encode('Hello'));
```

### Legacy API

For backward compatibility, the `__xecModuleContext` global is still available:

```javascript
// These still work but are deprecated
const module = await __xecModuleContext.import('module-name');
const npm = await __xecModuleContext.importNPM('package');
const jsr = await __xecModuleContext.importJSR('@std/package');
```

**Recommendation**: Use the new unified `import()` syntax with prefixes for better consistency.

## Core Execution API

### `$` - Command Execution

The `$` function from `@xec-sh/core` is globally available for executing commands:

```javascript
// Basic execution
const result = await $`ls -la`;
console.log(result.stdout);

// With options
await $`npm install`
  .cwd('/project')
  .env({ NODE_ENV: 'production' })
  .timeout(60000);

// Error handling
const { stdout, stderr, exitCode } = await $`command`.nothrow();
if (exitCode !== 0) {
  console.error('Command failed:', stderr);
}
```

See [Core API Reference](/docs/projects/core/api-reference) for complete `$` documentation.

## File System API

### fs (fs-extra)

Enhanced file system operations with promise support:

```javascript
// Read/Write operations
const content = await fs.readFile('file.txt', 'utf8');
await fs.writeFile('output.txt', content);

// JSON operations
const config = await fs.readJson('config.json');
await fs.writeJson('config.json', { ...config, updated: true }, { spaces: 2 });

// Directory operations
await fs.ensureDir('logs/2024');
await fs.emptyDir('temp');
await fs.remove('old-files');

// Copy operations
await fs.copy('src', 'dist');
await fs.copy('file.txt', 'backup.txt');

// Check existence
if (await fs.pathExists('config.json')) {
  // File exists
}

// Move/Rename
await fs.move('old-name.txt', 'new-name.txt');
await fs.move('file.txt', 'archive/file.txt', { overwrite: true });
```

### glob

Pattern matching for files:

```javascript
// Find all JavaScript files
const jsFiles = await glob('**/*.js');

// With options
const files = await glob('src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/*.test.ts'],
  absolute: true
});

// Multiple patterns
const allFiles = await glob(['src/**/*.js', 'lib/**/*.js']);
```

### path

Path manipulation utilities:

```javascript
// Join paths
const fullPath = path.join(process.cwd(), 'src', 'index.js');

// Parse paths
const parsed = path.parse('/home/user/file.txt');
// { root: '/', dir: '/home/user', base: 'file.txt', ext: '.txt', name: 'file' }

// Get components
path.dirname('/path/to/file.js');   // '/path/to'
path.basename('/path/to/file.js');  // 'file.js'
path.extname('/path/to/file.js');   // '.js'

// Resolve paths
path.resolve('src', '../lib', 'utils.js'); // Absolute path
path.relative('/data/src', '/data/lib');   // '../lib'
```

## Interactive Prompts API

### question(message, options?)

Text input prompt:

```javascript
const name = await question('What is your name?');

// With validation
const email = await question({
  message: 'Enter your email',
  validate: (value) => {
    if (!value.includes('@')) return 'Please enter a valid email';
  }
});

// With default value
const port = await question({
  message: 'Port number',
  defaultValue: '3000'
});
```

### confirm(options)

Yes/no confirmation:

```javascript
const proceed = await confirm({
  message: 'Continue with deployment?',
  initialValue: true
});

if (!proceed) {
  process.exit(0);
}
```

### select(options)

Single selection from list:

```javascript
const env = await select({
  message: 'Select environment',
  options: [
    { value: 'dev', label: 'Development' },
    { value: 'staging', label: 'Staging' },
    { value: 'prod', label: 'Production', hint: 'Use with caution' }
  ],
  initialValue: 'dev'
});
```

### multiselect(options)

Multiple selection:

```javascript
const features = await multiselect({
  message: 'Select features to install',
  options: [
    { value: 'auth', label: 'Authentication', hint: 'OAuth2 + JWT' },
    { value: 'db', label: 'Database', hint: 'PostgreSQL' },
    { value: 'cache', label: 'Caching', hint: 'Redis' },
    { value: 'queue', label: 'Job Queue', hint: 'BullMQ' }
  ],
  initialValues: ['auth', 'db'],
  required: true
});
```

### password(options)

Secure password input:

```javascript
const secret = await password({
  message: 'Enter password',
  validate: (value) => {
    if (value.length < 8) return 'Password must be at least 8 characters';
  }
});
```

### spinner()

Progress indicator:

```javascript
const s = spinner();
s.start('Installing dependencies...');

try {
  await $`npm install`;
  s.stop('Dependencies installed');
} catch (error) {
  s.stop('Installation failed');
  throw error;
}
```

## Process & Environment API

### cd(directory?)

Change or get current directory:

```javascript
// Get current directory
const current = cd();

// Change directory
cd('/home/user/project');
cd('../parent');

// Throws error if directory doesn't exist
try {
  cd('/nonexistent');
} catch (error) {
  console.error('Directory not found');
}
```

### pwd()

Get current working directory:

```javascript
const currentDir = pwd();
console.log(`Working in: ${currentDir}`);
```

### env(key, defaultValue?)

Get environment variable:

```javascript
const apiKey = env('API_KEY');
const port = env('PORT', '3000');
const debug = env('DEBUG', 'false') === 'true';
```

### setEnv(key, value)

Set environment variable:

```javascript
setEnv('NODE_ENV', 'production');
setEnv('API_URL', 'https://api.example.com');
```

### exit(code?)

Exit process with code:

```javascript
if (!apiKey) {
  log.error('API_KEY not set');
  exit(1);
}

// Success exit
exit(0); // or just exit()
```

### kill(pid, signal?)

Kill process by PID:

```javascript
kill(12345); // Default SIGTERM
kill(12345, 'SIGKILL'); // Force kill
kill(12345, 'SIGUSR1'); // Custom signal
```

### ps()

List running processes:

```javascript
const processes = await ps();

// Find specific processes
const nodeProcesses = processes.filter(p => p.name.includes('node'));
const highCpu = processes.filter(p => p.cpu > 50);

// Process info includes: pid, ppid, name, cpu, memory
processes.forEach(p => {
  console.log(`${p.pid}: ${p.name} (CPU: ${p.cpu}%, MEM: ${p.memory}MB)`);
});
```

## Utility Functions

### sleep(ms)

Delay execution:

```javascript
console.log('Starting...');
await sleep(2000); // Wait 2 seconds
console.log('Done!');

// In loops
for (let i = 0; i < 5; i++) {
  console.log(`Attempt ${i + 1}`);
  await sleep(1000);
}
```

### retry(fn, options?)

Retry failed operations:

```javascript
const data = await retry(
  async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  {
    retries: 3,
    delay: 1000,
    backoff: 2, // Exponential backoff
    onRetry: (error, attempt) => {
      log.warning(`Retry ${attempt}: ${error.message}`);
    }
  }
);
```

### which(command)

Find executable in PATH:

```javascript
const gitPath = await which('git');
if (!gitPath) {
  log.error('Git is not installed');
  exit(1);
}

// Check multiple commands
const docker = await which('docker');
const podman = await which('podman');
const containerTool = docker || podman;
```

### quote(arg)

Quote shell arguments safely:

```javascript
const filename = "file with spaces.txt";
const safeFilename = quote(filename);
await $`cat ${safeFilename}`;

// Handles special characters
const dangerous = "file'; rm -rf /";
const safe = quote(dangerous);
await $`echo ${safe}`; // Safe to use
```

### within(options, fn)

Execute code with temporary environment:

```javascript
// Temporary directory change
const result = await within({ cwd: '/tmp' }, async () => {
  await $`pwd`; // Outputs: /tmp
  return await fs.readdir('.');
});
// Back to original directory

// Temporary environment variables
await within(
  { env: { NODE_ENV: 'test', DEBUG: 'true' } },
  async () => {
    await $`npm test`; // Runs with test environment
  }
);
// Original environment restored

// Combined
await within(
  { 
    cwd: '/project',
    env: { NODE_ENV: 'production' }
  },
  async () => {
    await $`npm run build`;
    await $`npm run deploy`;
  }
);
```

## HTTP & Networking

### fetch

Standard Fetch API for HTTP requests:

```javascript
// GET request
const response = await fetch('https://api.example.com/users');
const users = await response.json();

// POST request
const result = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com'
  })
});

// Error handling
if (!result.ok) {
  throw new Error(`HTTP ${result.status}: ${result.statusText}`);
}

// Download file
const fileResponse = await fetch('https://example.com/file.pdf');
const buffer = await fileResponse.arrayBuffer();
await fs.writeFile('file.pdf', Buffer.from(buffer));
```

## Data Format Utilities

### yaml()

YAML parsing and stringification:

```javascript
const { parse, stringify } = await yaml();

// Parse YAML
const config = parse(`
name: my-app
version: 1.0.0
features:
  - auth
  - api
`);

// Stringify to YAML
const yamlStr = stringify({
  database: {
    host: 'localhost',
    port: 5432,
    name: 'mydb'
  }
});

// Read/Write YAML files
const data = parse(await fs.readFile('config.yaml', 'utf8'));
await fs.writeFile('output.yaml', stringify(data));
```

### csv()

CSV parsing and generation:

```javascript
const { parse, stringify } = await csv();

// Parse CSV
const records = parse('name,age\nJohn,30\nJane,25');
// [{ name: 'John', age: '30' }, { name: 'Jane', age: '25' }]

// Parse with options
const data = parse(csvText, {
  columns: true,
  skip_empty_lines: true,
  delimiter: ';'
});

// Generate CSV
const csv = stringify([
  ['name', 'email', 'age'],
  ['John', 'john@example.com', 30],
  ['Jane', 'jane@example.com', 25]
]);

// From objects
const csvFromObjects = stringify([
  { name: 'John', age: 30 },
  { name: 'Jane', age: 25 }
], { header: true });
```

### diff(a, b, options?)

Compare text differences:

```javascript
const oldContent = await fs.readFile('old.txt', 'utf8');
const newContent = await fs.readFile('new.txt', 'utf8');

const changes = await diff(oldContent, newContent);

changes.forEach(part => {
  // part.added - true if added
  // part.removed - true if removed
  // part.value - the text
  const color = part.added ? chalk.green : 
                part.removed ? chalk.red : chalk.gray;
  process.stdout.write(color(part.value));
});
```

## Temporary Files

### tmpdir()

Get system temporary directory:

```javascript
const temp = tmpdir(); // e.g., /tmp or C:\Windows\Temp
console.log(`Temp directory: ${temp}`);
```

### tmpfile(prefix?, suffix?)

Generate temporary file path:

```javascript
// Generate temp file path
const tempFile = tmpfile(); // e.g., /tmp/xec-a1b2c3
const logFile = tmpfile('log-', '.txt'); // e.g., /tmp/log-x1y2z3.txt

// Use temp file
await fs.writeFile(tempFile, 'temporary data');
// ... use file ...
await fs.remove(tempFile); // Clean up

// With automatic cleanup
const tempPath = tmpfile('data-', '.json');
try {
  await fs.writeJson(tempPath, { processed: true });
  await $`process-data ${tempPath}`;
} finally {
  await fs.remove(tempPath).catch(() => {});
}
```

## Logging API

### log

Structured logging utilities:

```javascript
// Log levels
log.info('Information message');
log.success('✅ Operation completed successfully');
log.error('❌ An error occurred');
log.warning('⚠️  This needs attention');
log.step('→ Processing step 1 of 3');

// With formatting
log.info(chalk.blue('Deployment starting...'));
log.success(chalk.green.bold('All tests passed!'));
log.error(chalk.red.underline('Build failed'));
```

### echo(...args)

Simple output function:

```javascript
echo('Hello, World!');
echo('Multiple', 'arguments', 'supported');
echo({ name: 'John', age: 30 }); // Objects are displayed
```

## Color & Formatting

### chalk

Terminal string styling:

```javascript
// Basic colors
console.log(chalk.red('Error!'));
console.log(chalk.green('Success!'));
console.log(chalk.yellow('Warning!'));
console.log(chalk.blue('Info'));

// Styles
console.log(chalk.bold('Bold text'));
console.log(chalk.italic('Italic text'));
console.log(chalk.underline('Underlined'));
console.log(chalk.strikethrough('Strikethrough'));

// Background colors
console.log(chalk.bgRed.white('Error'));
console.log(chalk.bgGreen.black('Success'));

// Combinations
console.log(chalk.red.bold.underline('Important error!'));
console.log(chalk.blue.bgYellow.bold('Highlighted'));

// RGB and Hex colors
console.log(chalk.rgb(255, 136, 0)('Orange'));
console.log(chalk.hex('#FF8800')('Also orange'));

// Template literals
const error = chalk.red;
const warning = chalk.yellow;
console.log(error`This is an ${warning`nested`} error`);
```

## Command Line Parsing

### parseArgs(args)

Parse command-line arguments:

```javascript
// Parse arguments
const args = await parseArgs(process.argv.slice(2));

// Example: node script.js --name John --age 30 --verbose
// Result: { name: 'John', age: 30, verbose: true, _: [] }

// With positional arguments
// node script.js deploy --env production server1 server2
const parsed = await parseArgs(['deploy', '--env', 'production', 'server1', 'server2']);
// Result: { env: 'production', _: ['deploy', 'server1', 'server2'] }

// Access parsed values
if (args.verbose) {
  log.info('Verbose mode enabled');
}

const servers = args._ || [];
const environment = args.env || 'development';
```

## Environment Management

### loadEnv(path?)

Load environment variables from file:

```javascript
// Load from .env
await loadEnv();

// Load from specific file
await loadEnv('.env.production');

// Load with error handling
try {
  await loadEnv('.env.local');
} catch (error) {
  log.warning('No .env.local file found');
}

// Use after loading
const apiKey = process.env.API_KEY;
const dbUrl = process.env.DATABASE_URL;
```

## Operating System

### os

Operating system utilities:

```javascript
// System information
os.platform();   // 'darwin', 'linux', 'win32'
os.arch();       // 'x64', 'arm64', etc.
os.hostname();   // Machine name
os.homedir();    // User home directory

// System resources
os.cpus();       // Array of CPU info
os.totalmem();   // Total memory in bytes
os.freemem();    // Free memory in bytes
os.loadavg();    // Load average [1min, 5min, 15min]

// User info
os.userInfo();   // { username, uid, gid, shell, homedir }

// Network interfaces
os.networkInterfaces(); // Network interface details

// Temp directory
os.tmpdir();     // System temp directory

// Uptime
os.uptime();     // System uptime in seconds
```

## Best Practices

### Error Handling

Always handle errors appropriately:

```javascript
try {
  await $`risky-command`;
} catch (error) {
  log.error(`Command failed: ${error.message}`);
  // Decide whether to continue or exit
  if (critical) {
    exit(1);
  }
}
```

### Resource Cleanup

Always clean up resources:

```javascript
const tempFile = tmpfile();
try {
  await fs.writeFile(tempFile, data);
  await processFile(tempFile);
} finally {
  await fs.remove(tempFile).catch(() => {});
}
```

### Progress Feedback

Provide feedback for long operations:

```javascript
const spinner = spinner();
spinner.start('Processing files...');

try {
  const files = await glob('**/*.js');
  for (const file of files) {
    spinner.message(`Processing ${file}...`);
    await processFile(file);
  }
  spinner.stop(`Processed ${files.length} files`);
} catch (error) {
  spinner.stop('Processing failed');
  throw error;
}
```

### Module Loading

Use prefixed imports for CDN packages:

```javascript
// Load from CDN without local installation
const dayjs = await import('npm:dayjs');
const lodash = await import('npm:lodash-es');

// Use specific CDN sources
const mitt = await import('esm:mitt');
const encoding = await import('jsr:@std/encoding');
```

## Examples

### Complete Script Example

```javascript
#!/usr/bin/env xec

// Script for automated deployment
const environment = env('DEPLOY_ENV', 'staging');
const branch = env('DEPLOY_BRANCH', 'main');

log.info(chalk.bold(`🚀 Deploying ${branch} to ${environment}`));

// Validate environment
if (!['staging', 'production'].includes(environment)) {
  log.error('Invalid environment. Use staging or production.');
  exit(1);
}

// Run tests
const spinner = spinner();
spinner.start('Running tests...');

const testResult = await $`npm test`.nothrow();
if (!testResult.ok) {
  spinner.stop('Tests failed');
  log.error(testResult.stderr);
  exit(1);
}
spinner.stop('All tests passed');

// Build application
log.step('Building application...');
await $`npm run build`.env({ NODE_ENV: 'production' });

// Deploy based on environment
if (environment === 'production') {
  const confirm = await confirm({
    message: 'Deploy to PRODUCTION? This cannot be undone!',
    initialValue: false
  });
  
  if (!confirm) {
    log.info('Deployment cancelled');
    exit(0);
  }
}

// Perform deployment
log.step(`Deploying to ${environment}...`);
const deployScript = `deploy-${environment}.sh`;
await $`bash ${deployScript}`;

// Verify deployment
const healthUrl = environment === 'production' 
  ? 'https://api.example.com/health'
  : 'https://staging-api.example.com/health';

const health = await retry(
  async () => {
    const response = await fetch(healthUrl);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },
  { retries: 5, delay: 2000 }
);

log.success(`✅ Deployment complete! Version: ${health.version}`);
```

## See Also

- [Custom Commands Guide](./custom-commands)
- [Core API Reference](/docs/projects/core/api-reference)
- [CLI Configuration](./configuration-guide)
- [Examples Repository](https://github.com/xec-sh/xec/tree/main/packages/core/examples)