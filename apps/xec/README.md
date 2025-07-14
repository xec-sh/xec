# Xec CLI

Xec is a DevOps orchestration and automation framework with a powerful command-line interface. It provides a unified way to manage infrastructure, run automation scripts, and execute complex deployment workflows.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Script Execution](#script-execution)
- [Commands](#commands)
- [Options](#options)
- [Script Utilities](#script-utilities)
- [Examples](#examples)
- [Advanced Usage](#advanced-usage)

## Installation

### From npm (when published)
```bash
npm install -g @xec/cli
```

### From source
```bash
# Clone the repository
git clone https://github.com/xec-sh/xec.git
cd xec

# Install dependencies
yarn install

# Build the project
yarn build

# Link the CLI globally
cd apps/xec
npm link
```

## Quick Start

### Running Scripts

Xec CLI now provides a simplified way to run scripts directly:

```bash
# Run a JavaScript file
xec script.js

# Run a TypeScript file
xec app.ts

# Run with arguments
xec script.js arg1 arg2

# Evaluate code directly
xec -e "console.log('Hello, Xec!')"

# Evaluate code with arguments
xec -e "console.log(argv)" arg1 arg2
```

### Using Commands

```bash
# Initialize a new project
xec init

# List available commands
xec list

# Run a recipe
xec run my-recipe

# Execute a task from the standard library
xec task shell:exec -v '{"command": "ls -la"}'

# Show version information
xec version:info
```

## Script Execution

### Direct File Execution

Xec automatically detects and executes script files with the following extensions:
- `.js` - JavaScript files
- `.ts` - TypeScript files (automatically transpiled)
- `.mjs` - ES modules

```bash
# Examples
xec deploy.js
xec setup.ts
xec automation.mjs
```

### Inline Code Execution

Use the `-e` or `--eval` option to execute code directly:

```bash
# Simple expression
xec -e "console.log(2 + 2)"

# Multi-line code
xec -e "
  const result = await $('ls -la');
  console.log(result.stdout);
"

# Using script utilities
xec -e "
  await sleep(1000);
  echo('Done waiting!');
"
```

### Script Arguments

Arguments passed after the script file or eval code are available in the `argv` array:

```bash
# script.js: console.log('Args:', argv);
xec script.js hello world
# Output: Args: ['hello', 'world']
```

## Commands

### init
Initialize a new Xec project in the current directory.

```bash
xec init [options]

Options:
  --name <name>          Project name
  --template <template>  Project template (default, minimal, full)
  --force               Overwrite existing files
  --no-git             Skip git initialization
```

### list
List available commands and recipes.

```bash
xec list [options]

Options:
  --json       Output as JSON
  --recipes    Show only recipes
  --commands   Show only commands
```

### run
Run a recipe file.

```bash
xec run <recipe> [options]

Options:
  -v, --vars <json>      Variables in JSON format
  --var <key=value>      Set individual variable
  -d, --dry-run         Perform a dry run
  -f, --file <path>     Recipe file path
  --verbose             Enable verbose output
```

### task
Run a single task from the standard library.

```bash
xec task <task-name> [options]

Options:
  -v, --vars <json>      Variables in JSON format
  -m, --module <name>    Module to load task from
  --list                List available tasks
  --json               Output as JSON
```

### version:info
Show detailed version information.

```bash
xec version:info
# Alias: xec vi
```

## Options

Global options available for all commands:

- `-v, --verbose` - Enable verbose output
- `-q, --quiet` - Suppress output
- `--cwd <path>` - Set current working directory
- `--no-color` - Disable colored output
- `-e, --eval <code>` - Evaluate code instead of running a file

## Script Utilities

When running scripts, Xec provides a rich set of utilities:

### Shell Execution ($)
```javascript
// Execute shell commands
const result = await $('ls -la');
console.log(result.stdout);

// Chain commands
await $('npm install').pipe('grep lodash');
```

### File System
```javascript
// Change directory
cd('/path/to/dir');

// Get current directory
console.log(pwd());

// File operations
const content = await fs.readFile('config.json', 'utf-8');
await fs.writeFile('output.txt', 'Hello');

// Glob patterns
const files = await glob('**/*.js');
```

### Process Control
```javascript
// Sleep/delay
await sleep(1000); // 1 second

// Environment variables
const apiKey = env('API_KEY', 'default-value');
setEnv('NODE_ENV', 'production');

// Exit
exit(0); // Success
exit(1); // Error
```

### Interactive Prompts
```javascript
// Text input
const name = await question('What is your name?');

// Confirmation
const proceed = await confirm('Continue?');

// Selection
const choice = await select({
  message: 'Pick a color',
  options: [
    { value: 'red', label: 'Red' },
    { value: 'blue', label: 'Blue' }
  ]
});

// Multi-select
const features = await multiselect({
  message: 'Select features',
  options: [
    { value: 'auth', label: 'Authentication' },
    { value: 'db', label: 'Database' },
    { value: 'api', label: 'REST API' }
  ]
});
```

### HTTP Requests
```javascript
// Fetch data
const response = await fetch('https://api.example.com/data');
const data = await response.json();
```

### Utilities
```javascript
// Retry with backoff
const result = await retry(
  async () => {
    return await fetch('https://flaky-api.com');
  },
  { retries: 3, delay: 1000 }
);

// Template strings
const msg = template`Hello, ${name}!`;

// Check if command exists
const hasGit = await which('git');

// Temporary files
const tmpFile = tmpfile('data-', '.json');

// Colored output
echo(chalk.green('Success!'));
echo(chalk.red('Error!'));

// Logging
log.info('Information');
log.success('Operation completed');
log.warning('Warning message');
log.error('Error occurred');
```

### Advanced Utilities
```javascript
// YAML parsing
const { parse, stringify } = await yaml();
const config = parse(yamlContent);

// CSV parsing
const { parse, stringify } = await csv();
const data = parse(csvContent);

// Diff comparison
const changes = await diff(oldContent, newContent);

// Parse command arguments
const args = await parseArgs(['--verbose', '--name', 'test']);

// Load .env files
await loadEnv('.env.local');

// Process management
const processes = await ps();
kill(1234, 'SIGTERM');

// Scoped execution
await within({ cwd: '/tmp', env: { NODE_ENV: 'test' } }, async () => {
  // This runs in /tmp with NODE_ENV=test
  await $('npm test');
});
```

## Examples

### Deployment Script
```javascript
// deploy.js
const environment = argv[0] || 'staging';

log.info(`Deploying to ${environment}...`);

// Build the application
await $('npm run build');

// Run tests
if (environment === 'production') {
  await $('npm test');
}

// Deploy
await retry(async () => {
  await $(`deploy-cli push --env ${environment}`);
}, { retries: 3 });

log.success('Deployment complete!');
```

Run: `xec deploy.js production`

### Interactive Setup
```javascript
// setup.js
const config = {
  name: await question('Project name?'),
  type: await select({
    message: 'Project type?',
    options: [
      { value: 'web', label: 'Web Application' },
      { value: 'api', label: 'API Server' },
      { value: 'cli', label: 'CLI Tool' }
    ]
  }),
  features: await multiselect({
    message: 'Select features',
    options: [
      { value: 'typescript', label: 'TypeScript' },
      { value: 'testing', label: 'Testing' },
      { value: 'docker', label: 'Docker' }
    ]
  })
};

// Save configuration
await fs.writeFile('project.json', JSON.stringify(config, null, 2));

// Initialize project
await $(`npm init -y`);

if (config.features.includes('typescript')) {
  await $('npm install -D typescript @types/node');
}

log.success('Project initialized!');
```

Run: `xec setup.js`

### Data Processing
```javascript
// process-data.js
const inputFile = argv[0];
if (!inputFile) {
  log.error('Please provide an input file');
  exit(1);
}

// Read and parse CSV
const { parse } = await csv();
const content = await fs.readFile(inputFile, 'utf-8');
const data = parse(content, { columns: true });

// Process data
const processed = data
  .filter(row => row.status === 'active')
  .map(row => ({
    ...row,
    timestamp: new Date().toISOString()
  }));

// Save results
const { stringify } = await csv();
const output = stringify(processed, { header: true });
await fs.writeFile('processed.csv', output);

log.success(`Processed ${processed.length} records`);
```

Run: `xec process-data.js input.csv`

## Advanced Usage

### TypeScript Support

Xec automatically transpiles TypeScript files:

```typescript
// script.ts
interface Config {
  name: string;
  port: number;
}

const config: Config = {
  name: await question('App name?'),
  port: parseInt(await question('Port?')) || 3000
};

console.log(`Starting ${config.name} on port ${config.port}`);
```

### Watch Mode

For development, use the watch mode:

```bash
xec dev.js --watch
```

### Custom Recipe Integration

Scripts can run Xec recipes:

```javascript
// run-recipe.js
const result = await runRecipe('deploy', {
  environment: 'production',
  version: '1.0.0'
});

if (result.success) {
  log.success('Recipe completed');
} else {
  log.error('Recipe failed');
}
```

### Environment Variables

Access and manage environment variables:

```javascript
// Load from .env file
await loadEnv();

// Access variables
const apiUrl = env('API_URL');
const apiKey = env('API_KEY', 'default-key');

// Set variables
setEnv('NODE_ENV', 'production');
```

### Error Handling

Proper error handling in scripts:

```javascript
try {
  await $('risky-command');
} catch (error) {
  log.error(`Command failed: ${error.message}`);
  
  if (await confirm('Retry?')) {
    await retry(() => $('risky-command'), { retries: 3 });
  } else {
    exit(1);
  }
}
```

## Best Practices

1. **Use TypeScript** for better type safety and IDE support
2. **Handle errors** gracefully with try-catch blocks
3. **Validate inputs** using the script arguments
4. **Use logging utilities** instead of console.log for better formatting
5. **Leverage retry** for network operations and flaky commands
6. **Keep scripts modular** and reusable
7. **Document your scripts** with comments and help text

## Troubleshooting

### Script not found
- Ensure the file exists and has the correct extension
- Check the current working directory with `pwd`

### TypeScript errors
- Xec uses esbuild for fast TypeScript transpilation
- Some advanced TypeScript features might not be supported

### Permission errors
- Ensure scripts have proper file permissions
- Use `chmod +x script.js` if needed

### Import errors
- Use dynamic imports for ES modules: `await import('module')`
- For CommonJS modules, use the provided `require` function

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

MIT License - see LICENSE file for details