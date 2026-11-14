---
title: new
description: Initialize Xec in a project or create new artifacts
---

# new {#new}

Create new Xec artifacts (projects, scripts, commands, tasks, profiles, or extensions).

## Synopsis {#synopsis}

```bash
xec new [type] [name] [options]
xec n [type] [name] [options]  # Alias
```

## Description {#description}

The `new` command creates various Xec artifacts with pre-configured templates. It provides an interactive mode when no arguments are provided, or can be used with specific arguments for automation.

## Arguments {#arguments}

- `[type]` - Type of artifact to create: `project`, `script`, `command`, `task`, `profile`, or `extension`
- `[name]` - Name for the new artifact

## Options {#options}

### Common Options {#common-options}

- `-o, --output <format>` - Output format: `text` (default), `json`, `yaml`, `csv`
- `-c, --config <path>` - Path to configuration file
- `--dry-run` - Perform a dry run without making changes

### General Options {#general-options}

- `-d, --desc <desc>` - Description for the artifact
- `-f, --force` - Overwrite existing files
- `-p, --profile <name>` - Apply profile after creation
- `-i, --interactive` - Enable interactive mode (default for this command)

### Project Options {#project-options}

- `-m, --minimal` - Create minimal structure (projects only)
- `--skip-git` - Skip git initialization (projects only)

### Script & Command Options {#script--command-options}

- `--advanced` - Use advanced template with more features
- `--js` - Create JavaScript instead of TypeScript (scripts/commands only)

### Template Options {#template-options}

- `--from <template>` - Create from a template or example

## Examples {#examples}

### Interactive Mode {#interactive-mode}

```bash
# Interactive mode to create any artifact
xec new

# Interactive mode with alias
xec n
```

### Project Creation {#project-creation}

```bash
# Create a new Xec project
xec new project my-app

# Create minimal project structure
xec new project my-app --minimal

# Create project with description
xec new project my-app --desc "My automation project"

# Skip git initialization
xec new project my-app --skip-git
```

### Script Creation {#script-creation}

```bash
# Create a new TypeScript script
xec new script deploy

# Create JavaScript script
xec new script deploy --js

# Create advanced script with more features
xec new script deploy --advanced

# Create script with description
xec new script backup --desc "Database backup script"
```

### Command Creation {#command-creation}

```bash
# Create a new CLI command
xec new command mycmd

# Create advanced command with subcommands
xec new command mycmd --advanced

# Create JavaScript command
xec new command mycmd --js
```

### Task Creation {#task-creation}

```bash
# Create a new task
xec new task build

# Create task with description
xec new task deploy --desc "Deploy application to production"

# Create advanced multi-step task
xec new task deploy --advanced
```

### Profile Creation {#profile-creation}

```bash
# Create environment profile
xec new profile production

# Create profile with description
xec new profile staging --desc "Staging environment configuration"

# Create advanced profile with targets
xec new profile production --advanced
```

### Extension Creation {#extension-creation}

```bash
# Create a new extension
xec new extension my-extension

# Create advanced extension
xec new extension my-extension --advanced

# Create extension with description
xec new extension monitoring --desc "System monitoring extension"
```

## Artifact Types {#artifact-types}

### Project {#project}

Creates a complete Xec project with:
- `.xec/config.yaml` - Main configuration
- `.xec/scripts/` - Script directory with examples
- `.xec/commands/` - Custom commands directory
- `.xec/.gitignore` - Git ignore file
- Documentation and examples

**Templates:**
- **Minimal** - Basic structure with essential files
- **Standard** - Full structure with examples and documentation

### Script {#script}

Creates executable scripts with shebang and imports:
- TypeScript or JavaScript files
- Pre-configured with Xec imports
- Executable permissions set
- Example code and documentation

**Templates:**
- **Basic** - Simple script structure
- **Advanced** - Complex script with argument parsing and error handling

### Command {#command}

Creates dynamic CLI commands:
- Command definition with arguments and options
- Action handlers
- Help documentation
- Integration with Commander.js

**Templates:**
- **Basic** - Simple command with basic options
- **Advanced** - Complex command with subcommands and validation

### Task {#task}

Creates reusable task definitions:
- Task configuration in YAML format
- Parameter definitions
- Step definitions
- Error handling configuration

**Templates:**
- **Simple** - Single command task
- **Standard** - Task with parameters
- **Advanced** - Multi-step task with hooks and error handling

### Profile {#profile}

Creates environment profiles:
- Environment-specific variables
- Target configurations
- Environment variables
- Profile inheritance

**Templates:**
- **Basic** - Simple profile with variables
- **Advanced** - Complex profile with targets and inheritance

### Extension {#extension}

Creates Xec extensions:
- Extension manifest
- Task definitions
- Configuration schema
- Documentation and examples

**Templates:**
- **Basic** - Simple extension structure
- **Advanced** - Full extension with scripts and examples

## Template Variables {#template-variables}

All templates support variable replacement:

- `{name}` - Artifact name
- `{description}` - Artifact description
- `{filepath}` - File path (scripts only)

## Project Structure {#project-structure}

When creating a project, the following structure is generated:

:::filetree{title="my-project/"}
- `.xec/`
  - `config.yaml` — Main configuration
  - `.gitignore` — Git ignore rules
  - `scripts/` — Executable scripts
    - `example.js` — Example script
  - `commands/` — Custom CLI commands
    - `hello.js` — Example command
  - `cache/` — Cache directory
  - `logs/` — Log files
  - `tmp/` — Temporary files
- `README.md` — Project documentation
:::
## Script Templates {#script-templates}

### Basic Script (TypeScript) {#basic-script-typescript}

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
const name = await kit.text({ message: 'What is your name?', defaultValue: 'Developer' });
if (kit.isCancel(name)) throw new Error('Cancelled');
log.info(prism.blue(`Hello, ${name}!`));
```

### Advanced Script Features {#advanced-script-features}

- Command line argument parsing
- Configuration loading and declared profile application
- Explicit local/staging/production target resolution; missing remote targets fail
- Bounded retry of an idempotent runtime observation and propagated failures
- Progress indicators and spinners
- Environment validation
- Cleanup limited to resources explicitly created by your script

The advanced starter reads `--env`, `--dry-run` and `--verbose` with Node's typed argument parser. Development selects the local target; staging and production require `hosts.staging` and `hosts.production` in the project configuration. A dry run resolves the configuration but does not execute the observation. The starter does not fetch external APIs or delete existing temporary directories.

## Command Templates {#command-templates}

### Basic Command {#basic-command}

```javascript
/**
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
    .action(async (
      /** @type {string[]} */ args,
      /** @type {{ verbose?: boolean }} */ options
    ) => {
      const { log } = await import('@xec-sh/kit');
      
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

## Validation {#validation}

The command validates artifact names based on type:

- **Project names**: Letters, numbers, hyphens, underscores
- **Script names**: Letters, numbers, hyphens, underscores, dots
- **Command/Task/Profile names**: Letters, numbers, hyphens, underscores, colons
- **Extension names**: Letters, numbers, hyphens, underscores

## Git Integration {#git-integration}

For projects, git initialization is automatic unless `--skip-git` is used:

- Creates git repository
- Adds all files
- Creates initial commit with message "Initial Xec project setup"

## File Permissions {#file-permissions}

Scripts are automatically made executable (chmod 755) after creation.

## Error Handling {#error-handling}

The command provides helpful error messages for:

- Invalid artifact names
- Existing files (unless `--force` is used)
- Missing project directories
- Invalid template options

## Related Commands {#related-commands}

- [run](run.md) - Execute scripts and tasks
- [config](config.md) - Manage configuration
- [inspect](inspect.md) - Inspect created artifacts

## Configuration {#configuration}

Command behavior can be configured in `.xec/config.yaml`:

```yaml
commands:
  new:
    defaultType: script
    defaultLanguage: typescript
    gitInit: true
    makeExecutable: true
```

## Exit Codes {#exit-codes}

- `0` - Success
- `1` - General error
- `2` - Invalid arguments
- `3` - File exists (without --force)
- `4` - Validation error
- `5` - Template error