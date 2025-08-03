---
title: Command Structure
description: Internal structure and architecture of Xec commands
keywords: [commands, structure, architecture, BaseCommand, implementation]
source_files:
  - apps/xec/src/commands/base-command.ts
  - apps/xec/src/commands/index.ts
  - apps/xec/src/main.ts
key_functions:
  - BaseCommand.constructor()
  - BaseCommand.execute()
  - BaseCommand.parseTargets()
  - getCommands()
  - resolveCommand()
verification_date: 2025-08-03
---

# Command Structure

## Implementation Reference

**Source Files:**
- `apps/xec/src/commands/base-command.ts` - Base command class implementation
- `apps/xec/src/commands/index.ts` - Command registry and exports
- `apps/xec/src/main.ts` - Command resolution and execution
- `apps/xec/src/utils/error-handler.ts` - Error handling and exit codes

**Key Classes:**
- `BaseCommand` - Abstract base class for all commands
- `ConfigCommand`, `CopyCommand`, `ForwardCommand`, etc. - Command implementations

**Key Functions:**
- `BaseCommand.execute()` - Abstract method for command execution
- `BaseCommand.parseTargets()` - Target resolution from arguments
- `getCommands()` - Returns command registry
- `resolveCommand()` - Finds command by name or alias

## Base Command Architecture

### BaseCommand Class

All Xec commands extend the `BaseCommand` abstract class located in `apps/xec/src/commands/base-command.ts`:

```typescript
export abstract class BaseCommand {
  constructor(
    protected config: Config,
    protected configPath: string,
    protected readonly isVerbose = false,
    protected readonly isDryRun = false,
    protected readonly isQuiet = false,
    protected readonly cwd = process.cwd()
  ) {}

  abstract execute(args: string[], flags: Record<string, any>): Promise<void>;
  
  protected parseTargets(args: string[]): ParsedTargets {
    // Target resolution logic
  }
  
  protected createSSHTarget(host: string): SSHTarget {
    // SSH target creation
  }
  
  protected createDockerTarget(container: string): DockerTarget {
    // Docker target creation
  }
  
  protected createKubernetesTarget(pod: string): KubernetesTarget {
    // Kubernetes target creation
  }
}
```

### Command Properties

Each command instance receives:

| Property | Type | Description | Source |
|----------|------|-------------|--------|
| `config` | `Config` | Loaded configuration | `apps/xec/src/config/types.ts` |
| `configPath` | `string` | Path to config file | Resolved at runtime |
| `isVerbose` | `boolean` | Verbose output flag | CLI flag `--verbose` |
| `isDryRun` | `boolean` | Dry run mode flag | CLI flag `--dry-run` |
| `isQuiet` | `boolean` | Quiet mode flag | CLI flag `--quiet` |
| `cwd` | `string` | Current working directory | `process.cwd()` |

## Command Registry

### Command Registration

Commands are registered in `apps/xec/src/commands/index.ts`:

```typescript
export function getCommands(): CommandRegistry {
  return {
    config: ConfigCommand,
    copy: CopyCommand,
    cp: CopyCommand,  // Alias
    forward: ForwardCommand,
    in: InCommand,
    inspect: InspectCommand,
    logs: LogsCommand,
    new: NewCommand,
    on: OnCommand,
    run: RunCommand,
    secrets: SecretsCommand,
    watch: WatchCommand,
  };
}
```

### Command Resolution

The main CLI (`apps/xec/src/main.ts`) resolves commands:

```typescript
const commands = getCommands();
const CommandClass = commands[commandName];

if (!CommandClass) {
  // Falls back to dynamic command resolution
  // or script execution
}
```

## Command Interface

### Required Methods

Every command must implement:

```typescript
abstract execute(args: string[], flags: Record<string, any>): Promise<void>;
```

**Parameters:**
- `args`: Positional arguments after command name
- `flags`: Parsed flags and options

**Returns:** Promise that resolves when command completes

**Throws:** Various error types mapped to exit codes

### Target Resolution

Commands that operate on targets use `parseTargets()`:

```typescript
protected parseTargets(args: string[]): ParsedTargets {
  const targets: Target[] = [];
  const remainingArgs: string[] = [];
  
  // Parses:
  // - SSH: user@host, ssh://user@host
  // - Docker: docker:container, container (with detection)
  // - Kubernetes: k8s:pod, pod:container
  // - Named targets from config
  
  return { targets, remainingArgs };
}
```

## Error Handling

### Error Classes and Exit Codes

Commands throw specific error types mapped to exit codes in `apps/xec/src/utils/error-handler.ts`:

| Error Class | Exit Code | Description |
|-------------|-----------|-------------|
| `ValidationError` | 1 | Invalid arguments or configuration |
| `ConfigurationError` | 2 | Configuration file issues |
| `TargetNotFoundError` | 3 | Target doesn't exist |
| `ConnectionError` | 4 | Connection failures |
| `ExecutionError` | 5 | Command execution failures |
| `AuthenticationError` | 6 | Authentication issues |
| `FileSystemError` | 7 | File operation failures |
| `DockerError` | 8 | Docker-specific errors |
| `KubernetesError` | 9 | Kubernetes-specific errors |
| `TimeoutError` | 10 | Operation timeouts |
| `PermissionError` | 11 | Permission denied |
| `DependencyError` | 12 | Missing dependencies |
| `NetworkError` | 13 | Network-related errors |

### Error Handling Pattern

```typescript
class MyCommand extends BaseCommand {
  async execute(args: string[], flags: Record<string, any>): Promise<void> {
    try {
      // Command logic
    } catch (error) {
      if (error instanceof ValidationError) {
        // Exits with code 1
        throw error;
      }
      // Wrap unknown errors
      throw new ExecutionError('Command failed', error);
    }
  }
}
```

## Command Lifecycle

### Execution Flow

1. **Resolution** - Command name resolved to class
2. **Instantiation** - Command instance created with config
3. **Validation** - Arguments and flags validated
4. **Execution** - `execute()` method called
5. **Error Handling** - Errors caught and mapped to exit codes
6. **Cleanup** - Resources released

### Context Access

Commands access execution context through:

```typescript
// Configuration
this.config.targets
this.config.tasks
this.config.defaults

// Flags
flags.verbose
flags['dry-run']
flags.quiet

// Environment
this.cwd
process.env
```

## Performance Characteristics

### Initialization Performance

- **Config Loading**: ~50-100ms for typical configs
- **Command Resolution**: &lt;1ms (direct lookup)
- **Target Parsing**: &lt;5ms for typical arguments

### Memory Usage

- **Base Command**: ~2KB per instance
- **Config Object**: 10-100KB depending on size
- **Connection Pools**: Managed by core library

### Optimization Strategies

1. **Lazy Loading** - Commands loaded on demand
2. **Config Caching** - Configuration parsed once
3. **Connection Reuse** - SSH/Docker connections pooled
4. **Stream Processing** - Large outputs streamed

## Best Practices

### Command Design

1. **Single Responsibility** - Each command does one thing
2. **Consistent Arguments** - Follow established patterns
3. **Clear Output** - Use quiet/verbose modes appropriately
4. **Proper Errors** - Throw specific error types
5. **Resource Cleanup** - Always clean up connections

### Code Organization

```typescript
export class MyCommand extends BaseCommand {
  // 1. Static properties
  static readonly description = 'Command description';
  static readonly aliases = ['mc'];
  
  // 2. Constructor (if needed)
  constructor(...args) {
    super(...args);
    // Custom initialization
  }
  
  // 3. Main execute method
  async execute(args: string[], flags: Record<string, any>): Promise<void> {
    // Validation
    this.validateArgs(args);
    
    // Execution
    await this.doWork(args, flags);
    
    // Output
    this.displayResults();
  }
  
  // 4. Private helper methods
  private validateArgs(args: string[]): void { }
  private async doWork(args: string[], flags: any): Promise<void> { }
  private displayResults(): void { }
}
```

## Testing Commands

See [Command Testing](./command-testing.md) for detailed testing guidelines.

## Related Topics

- [Creating Commands](./creating-commands.md) - Step-by-step guide
- [Command Testing](./command-testing.md) - Testing strategies
- [CLI Reference](../cli-reference.md) - Complete command reference
