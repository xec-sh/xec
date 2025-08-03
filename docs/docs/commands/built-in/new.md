# new

Create new Xec artifacts (projects, scripts, commands, tasks, profiles, or extensions).

## Synopsis

```bash
xec new [type] [name] [options]
xec n [type] [name] [options]  # Alias
```

## Description

The `new` command creates various Xec artifacts with pre-configured templates. It provides an interactive mode when no arguments are provided, or can be used with specific arguments for automation.

## Arguments

- `[type]` - Type of artifact to create: `project`, `script`, `command`, `task`, `profile`, or `extension`
- `[name]` - Name for the new artifact

## Options

### General Options

- `-d, --description <desc>` - Description for the artifact
- `-f, --force` - Overwrite existing files
- `-p, --profile <name>` - Apply profile after creation
- `-i, --interactive` - Enable interactive mode (default for this command)

### Project Options

- `-m, --minimal` - Create minimal structure (projects only)
- `--skip-git` - Skip git initialization (projects only)

### Script & Command Options

- `--advanced` - Use advanced template with more features
- `--js` - Create JavaScript instead of TypeScript (scripts/commands only)

### Template Options

- `--from <template>` - Create from a template or example

## Examples

### Interactive Mode

```bash
# Interactive mode to create any artifact
xec new

# Interactive mode with alias
xec n
```

### Project Creation

```bash
# Create a new Xec project
xec new project my-app

# Create minimal project structure
xec new project my-app --minimal

# Create project with description
xec new project my-app --description "My automation project"

# Skip git initialization
xec new project my-app --skip-git
```

### Script Creation

```bash
# Create a new TypeScript script
xec new script deploy

# Create JavaScript script
xec new script deploy --js

# Create advanced script with more features
xec new script deploy --advanced

# Create script with description
xec new script backup --description "Database backup script"
```

### Command Creation

```bash
# Create a new CLI command
xec new command mycmd

# Create advanced command with subcommands
xec new command mycmd --advanced

# Create JavaScript command
xec new command mycmd --js
```

### Task Creation

```bash
# Create a new task
xec new task build

# Create task with description
xec new task deploy --description "Deploy application to production"

# Create advanced multi-step task
xec new task deploy --advanced
```

### Profile Creation

```bash
# Create environment profile
xec new profile production

# Create profile with description
xec new profile staging --description "Staging environment configuration"

# Create advanced profile with targets
xec new profile production --advanced
```

### Extension Creation

```bash
# Create a new extension
xec new extension my-extension

# Create advanced extension
xec new extension my-extension --advanced

# Create extension with description
xec new extension monitoring --description "System monitoring extension"
```

## Artifact Types

### Project

Creates a complete Xec project with:
- `.xec/config.yaml` - Main configuration
- `.xec/scripts/` - Script directory with examples
- `.xec/commands/` - Custom commands directory
- `.xec/.gitignore` - Git ignore file
- Documentation and examples

**Templates:**
- **Minimal** - Basic structure with essential files
- **Standard** - Full structure with examples and documentation

### Script

Creates executable scripts with shebang and imports:
- TypeScript or JavaScript files
- Pre-configured with Xec imports
- Executable permissions set
- Example code and documentation

**Templates:**
- **Basic** - Simple script structure
- **Advanced** - Complex script with argument parsing and error handling

### Command

Creates dynamic CLI commands:
- Command definition with arguments and options
- Action handlers
- Help documentation
- Integration with Commander.js

**Templates:**
- **Basic** - Simple command with basic options
- **Advanced** - Complex command with subcommands and validation

### Task

Creates reusable task definitions:
- Task configuration in YAML format
- Parameter definitions
- Step definitions
- Error handling configuration

**Templates:**
- **Simple** - Single command task
- **Standard** - Task with parameters
- **Advanced** - Multi-step task with hooks and error handling

### Profile

Creates environment profiles:
- Environment-specific variables
- Target configurations
- Environment variables
- Profile inheritance

**Templates:**
- **Basic** - Simple profile with variables
- **Advanced** - Complex profile with targets and inheritance

### Extension

Creates Xec extensions:
- Extension manifest
- Task definitions
- Configuration schema
- Documentation and examples

**Templates:**
- **Basic** - Simple extension structure
- **Advanced** - Full extension with scripts and examples

## Template Variables

All templates support variable replacement:

- `{name}` - Artifact name
- `{description}` - Artifact description
- `{filepath}` - File path (scripts only)

## Project Structure

When creating a project, the following structure is generated:

```
my-project/
├── .xec/
│   ├── config.yaml          # Main configuration
│   ├── .gitignore           # Git ignore rules
│   ├── scripts/             # Executable scripts
│   │   └── example.js       # Example script
│   ├── commands/            # Custom CLI commands
│   │   └── hello.js         # Example command
│   ├── cache/               # Cache directory
│   ├── logs/                # Log files
│   └── tmp/                 # Temporary files
└── README.md                # Project documentation
```

## Script Templates

### Basic Script (TypeScript)

```typescript
#!/usr/bin/env xec

/**
 * {description}
 * 
 * Usage: xec {filepath}
 */

// Type-safe command execution
const result = await $`echo "Hello from TypeScript!"`;
log.success(result.stdout);

// Work with files using built-in fs
const files = await glob('**/*.ts');
log.step(`Found ${files.length} TypeScript files`);

// Interactive prompts with type inference
const name = await question({
  message: 'What is your name?',
  defaultValue: 'Developer'
});

log.info(chalk.blue(`Hello, ${name}!`));
```

### Advanced Script Features

- Command line argument parsing
- Configuration loading and profile application
- Retry logic and error handling
- Progress indicators and spinners
- Environment validation
- Cleanup functions

## Command Templates

### Basic Command

```javascript
/**
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
        log.step(`Arguments: ${args.join(', ') || 'none'}`);
      }
      
      // Example: Use $ from @xec-sh/core
      const { $ } = await import('@xec-sh/core');
      const result = await $`echo "Command {name} executed successfully!"`;
      
      log.success(result.stdout);
    });
}
```

## Validation

The command validates artifact names based on type:

- **Project names**: Letters, numbers, hyphens, underscores
- **Script names**: Letters, numbers, hyphens, underscores, dots
- **Command/Task/Profile names**: Letters, numbers, hyphens, underscores, colons
- **Extension names**: Letters, numbers, hyphens, underscores

## Git Integration

For projects, git initialization is automatic unless `--skip-git` is used:

- Creates git repository
- Adds all files
- Creates initial commit with message "Initial Xec project setup"

## File Permissions

Scripts are automatically made executable (chmod 755) after creation.

## Error Handling

The command provides helpful error messages for:

- Invalid artifact names
- Existing files (unless `--force` is used)
- Missing project directories
- Invalid template options

## Related Commands

- [run](run.md) - Execute scripts and tasks
- [config](config.md) - Manage configuration
- [inspect](inspect.md) - Inspect created artifacts

## Configuration

Command behavior can be configured in `.xec/config.yaml`:

```yaml
commands:
  new:
    defaultType: script
    defaultLanguage: typescript
    gitInit: true
    makeExecutable: true
```

## Exit Codes

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - File exists (without --force)
- `4` - Validation error
- `5` - Template error