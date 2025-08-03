# Creating Custom Commands

Extend Xec's functionality by creating custom commands that integrate seamlessly with the built-in command system.

## Overview

Xec supports dynamic command loading from `.xec/commands/` directories. Custom commands are JavaScript or TypeScript files that export command definitions compatible with the Commander.js framework used internally by Xec.

## Command Structure

Custom commands must follow this basic structure:

```javascript
/**
 * Command description (optional)
 * This will be available as: xec my-command [args...]
 */

export default function command(program) {
  program
    .command('my-command [args...]')
    .description('A custom command')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (args, options) => {
      // Your command logic here
    });
}
```

## Loading Mechanism

### Discovery Process

Xec discovers commands using the following search pattern:

1. **Primary locations** (in order):
   - `.xec/commands/` in current directory
   - `.xec/cli/` in current directory
   - Parent directories (up to 3 levels)

2. **Environment paths**:
   - Additional paths from `XEC_COMMANDS_PATH` environment variable (colon-separated)

3. **File patterns**:
   - `.js`, `.mjs`, `.ts`, `.tsx` extensions
   - Excludes test files (`.test.js`, `.spec.ts`, etc.)
   - Excludes hidden files and type definition files

### Command Registration

Commands are loaded in this order:
1. Built-in commands (from Xec core)
2. Dynamic commands (from directories above)
3. Dynamic commands override built-in commands if they share the same name

## Command Development

### Basic Command Template

Create a new command file (e.g., `.xec/commands/hello.js`):

```javascript
/**
 * A simple hello world command
 */

export default function command(program) {
  program
    .command('hello [name]')
    .description('Say hello to someone')
    .option('-u, --uppercase', 'Convert to uppercase')
    .option('-c, --count <n>', 'Repeat greeting', '1')
    .action(async (name = 'World', options) => {
      const { log } = await import('@clack/prompts');
      
      let greeting = `Hello, ${name}!`;
      
      if (options.uppercase) {
        greeting = greeting.toUpperCase();
      }
      
      const count = parseInt(options.count);
      for (let i = 0; i < count; i++) {
        log.success(greeting);
      }
    });
}
```

### Advanced Command with Xec Integration

```javascript
/**
 * Deploy application to multiple targets
 */

export default function command(program) {
  program
    .command('deploy [targets...]')
    .description('Deploy application to specified targets')
    .option('-e, --env <environment>', 'Deployment environment', 'production')
    .option('--dry-run', 'Show what would be deployed without executing')
    .option('-p, --parallel', 'Deploy to all targets in parallel')
    .action(async (targets = [], options) => {
      const { $, on, copy } = await import('@xec-sh/core');
      const { log, spinner } = await import('@clack/prompts');
      
      if (targets.length === 0) {
        log.error('No targets specified');
        process.exit(1);
      }
      
      const s = spinner();
      s.start('Preparing deployment...');
      
      try {
        // Build application
        await $`npm run build`;
        
        if (options.dryRun) {
          log.info('Dry run mode - would deploy to:', targets);
          return;
        }
        
        // Deploy to each target
        const deployments = targets.map(async (target) => {
          s.message(`Deploying to ${target}...`);
          
          // Copy files
          await copy('dist/*', `${target}:/app/`);
          
          // Restart service
          await on(target, 'systemctl restart myapp');
          
          return target;
        });
        
        if (options.parallel) {
          await Promise.all(deployments);
        } else {
          for (const deployment of deployments) {
            await deployment;
          }
        }
        
        s.stop('Deployment completed successfully');
        log.success(`Deployed to ${targets.length} target(s)`);
        
      } catch (error) {
        s.stop('Deployment failed');
        log.error(error.message);
        process.exit(1);
      }
    });
}
```

### Nested Commands

Create hierarchical command structures using subdirectories:

```
.xec/commands/
├── database/
│   ├── migrate.js     # xec database:migrate
│   ├── backup.js      # xec database:backup
│   └── restore.js     # xec database:restore
└── cache/
    ├── clear.js       # xec cache:clear
    └── warm.js        # xec cache:warm
```

## Command Metadata

### Export Metadata

Provide rich command information by exporting metadata:

```javascript
export const metadata = {
  description: 'Advanced deployment command',
  aliases: ['dep'],
  usage: 'deploy <targets...> [options]'
};

export default function command(program) {
  // Command implementation
}
```

### JSDoc Comments

Commands can be documented using JSDoc-style comments:

```javascript
/**
 * Command: Deploy application
 * Description: Deploy application to multiple targets with rollback support
 * Aliases: dep, deploy-app
 */

export default function command(program) {
  // Implementation
}
```

## Integration Features

### Xec Core Integration

Access Xec's execution engine and utilities:

```javascript
export default function command(program) {
  program
    .command('my-command')
    .action(async () => {
      // Import Xec core features
      const { 
        $,           // Template literal execution
        on,          // SSH execution
        copy,        // File copying
        forward,     // Port forwarding
        logs         // Log streaming
      } = await import('@xec-sh/core');
      
      // Use built-in prompts
      const { 
        log, 
        spinner, 
        select, 
        confirm,
        text
      } = await import('@clack/prompts');
      
      // Execute commands
      const result = await $`echo "Hello from custom command"`;
      log.success(result.stdout);
    });
}
```

### Configuration Access

Access project configuration in commands:

```javascript
export default function command(program) {
  program
    .command('deploy')
    .action(async () => {
      // Access configuration through global context
      const config = global.xecConfig || {};
      
      const targets = config.targets?.hosts || {};
      const deployConfig = config.tasks?.deploy || {};
      
      // Use configuration in command logic
    });
}
```

### Error Handling

Use Xec's error handling patterns:

```javascript
export default function command(program) {
  program
    .command('risky-operation')
    .action(async (options) => {
      try {
        // Command logic that might fail
        await performRiskyOperation();
      } catch (error) {
        const { log } = await import('@clack/prompts');
        
        if (options.verbose) {
          log.error('Detailed error:', error.stack);
        } else {
          log.error(error.message);
        }
        
        process.exit(1);
      }
    });
}
```

## Command Validation

### File Validation

Xec validates command files during loading:

- Must export a default function or named `command` function
- Function must call `program.command()` to register at least one command
- File must be valid JavaScript/TypeScript

### Runtime Validation

Commands should validate their inputs:

```javascript
export default function command(program) {
  program
    .command('validate-example <required> [optional]')
    .action(async (required, optional, options) => {
      const { log } = await import('@clack/prompts');
      
      // Validate required parameters
      if (!required || required.trim() === '') {
        log.error('Required parameter cannot be empty');
        process.exit(1);
      }
      
      // Validate options
      if (options.count && isNaN(parseInt(options.count))) {
        log.error('Count must be a number');
        process.exit(1);
      }
      
      // Command logic
    });
}
```

## Best Practices

### Command Design

1. **Single Responsibility**: Each command should do one thing well
2. **Consistent Interface**: Follow Xec's option and argument patterns
3. **Error Handling**: Provide clear error messages and appropriate exit codes
4. **Documentation**: Include description and usage examples

### Performance Considerations

1. **Lazy Imports**: Import heavy modules only when needed
2. **Async Operations**: Use async/await for I/O operations
3. **Resource Cleanup**: Properly close connections and clean up resources

### Security

1. **Input Validation**: Validate all user inputs
2. **Safe Execution**: Be careful with shell command construction
3. **Secrets**: Never log sensitive information

## Testing Custom Commands

### Unit Testing

Test command logic separately from CLI integration:

```javascript
// tests/commands/hello.test.js
import { Command } from 'commander';
import commandSetup from '../../.xec/commands/hello.js';

describe('hello command', () => {
  test('registers command correctly', () => {
    const program = new Command();
    commandSetup(program);
    
    const command = program.commands.find(cmd => cmd.name() === 'hello');
    expect(command).toBeDefined();
    expect(command.description()).toBe('Say hello to someone');
  });
});
```

### Integration Testing

Test commands as part of the CLI:

```bash
# Test command registration
xec --help | grep "hello"

# Test command execution
xec hello --dry-run

# Test with different options
xec hello Alice --uppercase --count 3
```

## Command Examples

### File Management Command

```javascript
/**
 * File management utilities
 */

export default function command(program) {
  program
    .command('files')
    .description('File management utilities')
    .addCommand(
      new Command('clean')
        .description('Clean temporary files')
        .option('-f, --force', 'Force deletion without confirmation')
        .action(async (options) => {
          const { $, glob } = await import('@xec-sh/core');
          const { confirm, log } = await import('@clack/prompts');
          
          const files = await glob(['**/*.tmp', '**/*.log']);
          
          if (files.length === 0) {
            log.info('No temporary files found');
            return;
          }
          
          if (!options.force) {
            const shouldDelete = await confirm({
              message: `Delete ${files.length} temporary files?`
            });
            
            if (!shouldDelete) {
              log.info('Operation cancelled');
              return;
            }
          }
          
          await $`rm -f ${files}`;
          log.success(`Deleted ${files.length} files`);
        })
    );
}
```

### Environment Command

```javascript
/**
 * Environment management
 */

export default function command(program) {
  program
    .command('env <action>')
    .description('Manage environment configurations')
    .option('-e, --environment <name>', 'Environment name')
    .action(async (action, options) => {
      const { on, copy } = await import('@xec-sh/core');
      const { select, log } = await import('@clack/prompts');
      
      let environment = options.environment;
      
      if (!environment) {
        environment = await select({
          message: 'Select environment:',
          options: [
            { value: 'development', label: 'Development' },
            { value: 'staging', label: 'Staging' },
            { value: 'production', label: 'Production' }
          ]
        });
      }
      
      switch (action) {
        case 'setup':
          await setupEnvironment(environment);
          break;
        case 'deploy':
          await deployToEnvironment(environment);
          break;
        default:
          log.error(`Unknown action: ${action}`);
          process.exit(1);
      }
    });
}

async function setupEnvironment(env) {
  // Environment setup logic
}

async function deployToEnvironment(env) {
  // Deployment logic
}
```

## Troubleshooting

### Command Not Found

If your command isn't being discovered:

1. Check file location (`.xec/commands/` directory)
2. Verify file extension (`.js`, `.ts`, etc.)
3. Ensure export structure is correct
4. Check for syntax errors
5. Enable debug mode: `XEC_DEBUG=true xec your-command`

### Loading Errors

Common loading issues:

```bash
# Check command discovery
XEC_DEBUG=true xec --help

# Validate command file
node -c .xec/commands/your-command.js

# Test command registration
node -e "
const { Command } = require('commander');
const cmd = require('./.xec/commands/your-command.js');
const program = new Command();
cmd.default(program);
console.log(program.commands.map(c => c.name()));
"
```

### Performance Issues

If commands load slowly:

1. Use dynamic imports for heavy dependencies
2. Avoid synchronous I/O in module scope
3. Cache expensive computations
4. Profile loading time with `XEC_DEBUG=true`

## Migration and Maintenance

### Updating Commands

When updating Xec or dependencies:

1. Test command compatibility
2. Update import statements if needed
3. Check for deprecated APIs
4. Update documentation

### Sharing Commands

To share commands across projects:

1. Create a shared commands repository
2. Use `XEC_COMMANDS_PATH` environment variable
3. Consider publishing as npm packages
4. Document dependencies and requirements

Commands provide a powerful way to extend Xec's functionality while maintaining consistency with the built-in command system. Follow these patterns and best practices to create robust, maintainable custom commands that integrate seamlessly with your Xec workflows.