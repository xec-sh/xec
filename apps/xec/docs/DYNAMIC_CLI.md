# Dynamic CLI Documentation

Xec supports dynamic CLI commands that can be added to extend the CLI functionality without modifying the core codebase. This feature is particularly useful for project-specific commands and team workflows.

## Overview

Dynamic CLI allows you to:
- Add custom commands specific to your project
- Create reusable command plugins
- Extend Xec functionality without forking
- Share commands across teams
- Build context-aware commands

## How It Works

1. Commands are loaded from `.xec/commands/` directory
2. Each file exports a `command` function that receives the Commander program
3. Commands are registered automatically on CLI startup
4. Full access to Commander.js API and Xec utilities

## Creating Dynamic Commands

### Basic Command

Create a file in `.xec/commands/`:

```javascript
// .xec/commands/hello.js
export function command(program) {
  program
    .command('hello [name]')
    .description('Say hello')
    .option('-u, --uppercase', 'Output in uppercase')
    .action((name = 'World', options) => {
      const message = `Hello, ${name}!`;
      console.log(options.uppercase ? message.toUpperCase() : message);
    });
}
```

Usage:
```bash
xec hello John
xec hello --uppercase
```

### Command with Subcommands

```javascript
// .xec/commands/deploy.js
export function command(program) {
  const deploy = program
    .command('deploy')
    .description('Deployment commands');

  deploy
    .command('start <environment>')
    .description('Start deployment')
    .option('--dry-run', 'Simulate deployment')
    .action(async (environment, options) => {
      const { spinner, log } = await import('@clack/prompts');
      
      if (options.dryRun) {
        log.info('Running in dry-run mode');
      }
      
      const s = spinner();
      s.start(`Deploying to ${environment}...`);
      
      // Your deployment logic here
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      s.stop(`Deployed to ${environment}`);
    });

  deploy
    .command('status <environment>')
    .description('Check deployment status')
    .action(async (environment) => {
      console.log(`Checking ${environment} status...`);
      // Status check logic
    });
}
```

Usage:
```bash
xec deploy start production
xec deploy status staging
```

### Command with Xec Integration

```javascript
// .xec/commands/build.js
export function command(program) {
  program
    .command('build:docker')
    .description('Build and push Docker images')
    .option('-t, --tag <tag>', 'Image tag', 'latest')
    .option('--no-push', 'Skip pushing to registry')
    .action(async (options) => {
      const { $ } = await import('@xec/core');
      const { spinner, log, confirm } = await import('@clack/prompts');
      
      // Load project config
      const config = await import('../../.xec/config.json');
      const imageName = `${config.docker.registry}/${config.name}:${options.tag}`;
      
      // Confirmation
      if (options.push) {
        const proceed = await confirm({
          message: `Push ${imageName} to registry?`
        });
        
        if (!proceed) {
          process.exit(0);
        }
      }
      
      // Build
      const buildSpinner = spinner();
      buildSpinner.start('Building Docker image...');
      
      try {
        await $`docker build -t ${imageName} .`;
        buildSpinner.stop('Build completed');
        
        if (options.push) {
          const pushSpinner = spinner();
          pushSpinner.start('Pushing to registry...');
          await $`docker push ${imageName}`;
          pushSpinner.stop('Push completed');
        }
        
        log.success(`Successfully built ${imageName}`);
      } catch (error) {
        buildSpinner.stop('Build failed');
        log.error(error.message);
        process.exit(1);
      }
    });
}
```

### Command with Recipe Integration

```javascript
// .xec/commands/test.js
export function command(program) {
  program
    .command('test:integration')
    .description('Run integration tests')
    .option('-e, --env <environment>', 'Test environment', 'test')
    .action(async (options) => {
      const { executeRecipe, loadStandardLibrary } = await import('@xec/core');
      const { log } = await import('@clack/prompts');
      
      // Load standard library
      await loadStandardLibrary();
      
      // Load and run test recipe
      const testRecipe = await import('../../.xec/recipes/test.js');
      
      const result = await executeRecipe(testRecipe.default, {
        vars: {
          environment: options.env,
          type: 'integration'
        }
      });
      
      if (result.success) {
        log.success('All tests passed!');
      } else {
        log.error('Tests failed');
        process.exit(1);
      }
    });
}
```

## Advanced Features

### Command Aliases

```javascript
export function command(program) {
  program
    .command('db:migrate')
    .alias('migrate')
    .alias('mig')
    .description('Run database migrations')
    .action(async () => {
      // Migration logic
    });
}
```

### Interactive Commands

```javascript
// .xec/commands/init-service.js
export function command(program) {
  program
    .command('init:service')
    .description('Initialize a new microservice')
    .action(async () => {
      const { text, select, multiselect, confirm, spinner } = await import('@clack/prompts');
      
      // Gather information
      const name = await text({
        message: 'Service name:',
        placeholder: 'my-service',
        validate: (value) => {
          if (!value) return 'Service name is required';
          if (!/^[a-z0-9-]+$/.test(value)) return 'Use lowercase letters, numbers, and hyphens';
        }
      });
      
      const type = await select({
        message: 'Service type:',
        options: [
          { value: 'api', label: 'REST API' },
          { value: 'grpc', label: 'gRPC Service' },
          { value: 'worker', label: 'Background Worker' },
          { value: 'frontend', label: 'Frontend Application' }
        ]
      });
      
      const features = await multiselect({
        message: 'Select features:',
        options: [
          { value: 'database', label: 'Database (PostgreSQL)' },
          { value: 'redis', label: 'Redis Cache' },
          { value: 'auth', label: 'Authentication' },
          { value: 'monitoring', label: 'Monitoring (Prometheus)' },
          { value: 'logging', label: 'Centralized Logging' }
        ]
      });
      
      const confirmed = await confirm({
        message: 'Create service with these settings?'
      });
      
      if (!confirmed) {
        process.exit(0);
      }
      
      // Create service
      const s = spinner();
      s.start('Creating service structure...');
      
      // Service creation logic here
      await createServiceStructure(name, type, features);
      
      s.stop('Service created successfully!');
    });
}
```

### Command Validation

```javascript
export function command(program) {
  program
    .command('config:set <key> <value>')
    .description('Set configuration value')
    .hook('preAction', (thisCommand) => {
      const [key, value] = thisCommand.args;
      
      // Validate key format
      if (!/^[A-Z_]+$/.test(key)) {
        console.error('Error: Key must be uppercase with underscores');
        process.exit(1);
      }
      
      // Validate value based on key
      if (key.endsWith('_PORT') && isNaN(parseInt(value))) {
        console.error('Error: Port must be a number');
        process.exit(1);
      }
    })
    .action(async (key, value) => {
      // Set config logic
      console.log(`Set ${key} = ${value}`);
    });
}
```

### Command Composition

```javascript
// .xec/commands/workflow.js
export function command(program) {
  program
    .command('workflow:deploy')
    .description('Complete deployment workflow')
    .option('--skip-tests', 'Skip running tests')
    .option('--skip-build', 'Skip building')
    .action(async (options) => {
      const { $ } = await import('@xec/core');
      const { log, spinner } = await import('@clack/prompts');
      
      const steps = [
        {
          name: 'Running tests',
          skip: options.skipTests,
          action: async () => {
            await $`npm test`;
          }
        },
        {
          name: 'Building application',
          skip: options.skipBuild,
          action: async () => {
            await $`npm run build`;
          }
        },
        {
          name: 'Deploying to production',
          action: async () => {
            await $`xec run deploy --var environment=production`;
          }
        }
      ];
      
      for (const step of steps) {
        if (step.skip) {
          log.info(`Skipping: ${step.name}`);
          continue;
        }
        
        const s = spinner();
        s.start(step.name);
        
        try {
          await step.action();
          s.stop(`✓ ${step.name}`);
        } catch (error) {
          s.stop(`✗ ${step.name}`);
          throw error;
        }
      }
      
      log.success('Workflow completed successfully!');
    });
}
```

## TypeScript Support

Dynamic commands can be written in TypeScript:

```typescript
// .xec/commands/analyze.ts
import { Command } from 'commander';

interface AnalyzeOptions {
  format: 'json' | 'text' | 'html';
  output?: string;
  verbose: boolean;
}

export function command(program: Command): void {
  program
    .command('analyze [directory]')
    .description('Analyze codebase')
    .option('-f, --format <format>', 'Output format', 'text')
    .option('-o, --output <file>', 'Output file')
    .option('-v, --verbose', 'Verbose output', false)
    .action(async (directory: string = '.', options: AnalyzeOptions) => {
      // Type-safe implementation
      const results = await analyzeCode(directory, options);
      
      if (options.output) {
        await saveResults(options.output, results, options.format);
      } else {
        displayResults(results, options.format);
      }
    });
}
```

## Plugin System

Create reusable command plugins:

```javascript
// .xec/commands/plugin-loader.js
import { readdirSync } from 'fs';
import { join } from 'path';

export function command(program) {
  // Load plugins from a directory
  const pluginDir = join(process.cwd(), '.xec/plugins');
  
  try {
    const plugins = readdirSync(pluginDir);
    
    for (const plugin of plugins) {
      if (plugin.endsWith('.js')) {
        const pluginPath = join(pluginDir, plugin);
        const { install } = await import(pluginPath);
        
        if (typeof install === 'function') {
          install(program);
        }
      }
    }
  } catch (error) {
    // No plugins directory
  }
}
```

## Best Practices

### 1. Naming Conventions

Use clear, consistent naming:
- `domain:action` format (e.g., `db:migrate`, `cache:clear`)
- Use kebab-case for multi-word commands
- Group related commands with common prefixes

### 2. Error Handling

Always handle errors gracefully:

```javascript
export function command(program) {
  program
    .command('risky:operation')
    .action(async () => {
      try {
        await riskyOperation();
      } catch (error) {
        console.error('Error:', error.message);
        if (process.env.XEC_DEBUG) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}
```

### 3. Help Text

Provide comprehensive help:

```javascript
export function command(program) {
  program
    .command('complex:command')
    .description('Perform complex operation')
    .usage('[options] <input>')
    .addHelpText('after', `
Examples:
  $ xec complex:command input.json
  $ xec complex:command --format yaml data.json
  $ xec complex:command --validate schema.json data.json
    `)
    .action(() => {});
}
```

### 4. Configuration

Use project configuration:

```javascript
export function command(program) {
  program
    .command('project:info')
    .action(async () => {
      // Load project config
      const config = await import('../../.xec/config.json');
      
      console.log(`Project: ${config.name}`);
      console.log(`Version: ${config.version}`);
      console.log(`Features: ${config.features.join(', ')}`);
    });
}
```

### 5. Async Operations

Handle async operations properly:

```javascript
export function command(program) {
  program
    .command('async:operation')
    .action(async () => {
      const { spinner } = await import('@clack/prompts');
      const s = spinner();
      
      s.start('Processing...');
      
      try {
        const result = await longRunningOperation();
        s.stop('Completed');
        console.log(result);
      } catch (error) {
        s.stop('Failed');
        throw error;
      }
    });
}
```

## Examples

### Database Management Commands

```javascript
// .xec/commands/database.js
export function command(program) {
  const db = program
    .command('db')
    .description('Database management commands');

  db.command('create <name>')
    .description('Create a new database')
    .action(async (name) => {
      const { $ } = await import('@xec/core');
      await $`createdb ${name}`;
      console.log(`Database ${name} created`);
    });

  db.command('drop <name>')
    .description('Drop a database')
    .option('--force', 'Force drop without confirmation')
    .action(async (name, options) => {
      const { confirm } = await import('@clack/prompts');
      
      if (!options.force) {
        const proceed = await confirm({
          message: `Drop database ${name}?`
        });
        if (!proceed) return;
      }
      
      const { $ } = await import('@xec/core');
      await $`dropdb ${name}`;
      console.log(`Database ${name} dropped`);
    });

  db.command('backup [name]')
    .description('Backup database')
    .option('-o, --output <file>', 'Output file')
    .action(async (name = 'myapp', options) => {
      const { $ } = await import('@xec/core');
      const output = options.output || `backup-${name}-${Date.now()}.sql`;
      
      await $`pg_dump ${name} > ${output}`;
      console.log(`Database backed up to ${output}`);
    });
}
```

### Git Workflow Commands

```javascript
// .xec/commands/git.js
export function command(program) {
  program
    .command('feature <name>')
    .description('Create a new feature branch')
    .action(async (name) => {
      const { $ } = await import('@xec/core');
      
      // Ensure clean working directory
      const status = await $`git status --porcelain`.quiet();
      if (status.stdout.trim()) {
        console.error('Error: Working directory is not clean');
        process.exit(1);
      }
      
      // Create and checkout feature branch
      await $`git checkout -b feature/${name}`;
      console.log(`Created and switched to feature/${name}`);
    });

  program
    .command('pr')
    .description('Create pull request')
    .option('-t, --title <title>', 'PR title')
    .option('-b, --body <body>', 'PR body')
    .action(async (options) => {
      const { $ } = await import('@xec/core');
      const { text } = await import('@clack/prompts');
      
      const title = options.title || await text({
        message: 'PR title:',
        placeholder: 'Add new feature'
      });
      
      const body = options.body || await text({
        message: 'PR description:',
        placeholder: 'Describe your changes...'
      });
      
      await $`gh pr create --title ${title} --body ${body}`;
    });
}
```

## Troubleshooting

### Command Not Found

If your dynamic command isn't recognized:
1. Check file location: `.xec/commands/`
2. Verify export: `export function command(program) {}`
3. Check for syntax errors
4. Enable debug mode: `XEC_DEBUG=1 xec`

### Loading Issues

Common problems:
- **File extension**: Use `.js`, `.mjs`, or `.ts`
- **Module errors**: Check imports and dependencies
- **Async issues**: Ensure proper async/await usage

### Debugging

Enable debug output:
```bash
XEC_DEBUG=1 xec my:command
```

View loaded commands:
```bash
xec --help
```