# @xec/cli - Command Line Interface

## Package Overview
The CLI package provides the command-line interface for the Xec infrastructure orchestration system. Built with Commander.js and featuring dynamic command loading, Xec Scripts, and interactive prompts via @clack/prompts.

## Directory Structure
```
apps/xec/
├── src/
│   ├── cli/              # CLI components
│   │   ├── cli.ts        # Main CLI setup with Commander
│   │   ├── commands/     # Built-in commands
│   │   │   ├── run.ts    # Run recipes
│   │   │   ├── init.ts   # Initialize projects
│   │   │   ├── script.ts # Run Xec scripts
│   │   │   ├── list.ts   # List recipes
│   │   │   └── task.ts   # Run individual tasks
│   │   ├── script-utils.ts # Utilities for scripts
│   │   └── types.ts      # TypeScript types
│   └── index.ts          # Main entry point
├── bin/
│   └── xec              # Executable script
├── docs/                 # Documentation
│   ├── XEC_SCRIPTS.md   # Xec Scripts guide
│   └── DYNAMIC_CLI.md    # Dynamic CLI guide
└── test/                 # Test suites
```

## CLI Architecture

### Command System
- Built on Commander.js for robust CLI parsing
- Dynamic command loading from `.xec/commands/`
- Interactive prompts with @clack/prompts
- Xec Scripts for automation
- Full TypeScript support

### Built-in Commands
1. **run** - Execute Xec recipes
2. **init** - Initialize new projects with .xec isolation
3. **Direct script execution** - Run scripts directly (enhanced zx-like experience)
4. **list** - List available recipes
5. **task** - Run individual tasks from stdlib
6. **help** - Show help information

### Dynamic Commands
Commands can be added dynamically by placing files in `.xec/commands/`:
```javascript
// .xec/commands/custom.js
export function command(program) {
  program
    .command('custom:hello')
    .description('Custom command')
    .action(() => console.log('Hello from custom command!'));
}
```

## Development Guide

### Adding a New Built-in Command
1. Create command file in `src/cli/commands/`
2. Export default function that receives Commander program
3. Define command using Commander API
4. Add tests
5. Update documentation

### Command Structure
```typescript
// src/cli/commands/mycommand.ts
export default function (program: Command) {
  program
    .command('mycommand <arg>')
    .description('My command description')
    .option('-f, --flag', 'Flag description')
    .action(async (arg, options) => {
      // Command implementation
    });
}
```

### Testing Commands
```bash
# Run all CLI tests
yarn test

# Test specific command
yarn test -- test/cli/deploy.test.ts
```

## Integration Points

### With @xec/core
- Uses core DSL for infrastructure definitions
- Leverages state management
- Utilizes module system
- Accesses deployment patterns

### With @xec/ush
- Uses for command execution
- Handles remote operations
- Manages SSH connections

## Configuration

### Project Structure
Xec projects use `.xec/` directory for isolation:
```
.xec/
├── config.json       # Project configuration
├── recipes/          # Project recipes
├── scripts/          # Xec scripts
├── commands/         # Dynamic CLI commands
├── modules/          # Custom modules
├── vars/             # Variable files
├── cache/            # Cache directory
└── logs/             # Log files
```

### Configuration Files
- `.xec/config.json` - Project configuration
- `.env` files - Environment variables
- Command line arguments (highest priority)

## Output Formats

### JSON Output
```bash
xec deploy --output json
```

### Text Output (Default)
```bash
xec deploy
```

### Verbose Mode
```bash
xec deploy --verbose
```

## Error Handling
- User-friendly error messages
- Detailed debug information with --debug
- Exit codes follow Unix conventions
- Stack traces in debug mode

## Interactive Features

### Prompts (@clack/prompts)
- Text input with validation
- Single and multi-select options
- Confirmation prompts
- Password input with masking
- Progress spinners
- Styled output (info, success, warning, error)

### Xec Scripts
Powerful scripting with @xec/ush:
```javascript
#!/usr/bin/env xec

// Full JavaScript/TypeScript support
const result = await $`ls -la`
const name = await question({ message: 'Your name?' })
await runRecipe('deploy', { user: name })
```

### REPL Mode
Interactive shell for exploration:
```bash
xec --repl
```

## Performance Considerations
- Lazy loading of commands
- Minimal startup time
- Efficient configuration parsing
- Stream-based output for large data

## Security
- Secure credential handling
- Environment variable filtering
- Safe command execution
- Audit logging support

## Common Issues

### Build Issues
- Run `yarn build` to compile TypeScript
- Check for TypeScript errors
- Verify all dependencies are installed

### Dynamic Commands Not Loading
- Check file location: `.xec/commands/`
- Verify export format: `export function command(program) {}`
- Enable debug: `XEC_DEBUG=1 xec`

### Script Errors
- Check shebang: `#!/usr/bin/env xec`
- Verify async/await usage
- Use `--watch` for development

## Best Practices
1. Use configuration files for repeated values
2. Leverage environment variables for secrets
3. Use --dry-run for testing
4. Enable debug logging for troubleshooting
5. Use JSON output for scripting

## Key Features

### Xec Scripts
- Enhanced JavaScript/TypeScript execution
- Built on @xec/ush for powerful command execution
- Global utilities ($, fs, fetch, etc.)
- Integration with recipes and tasks
- REPL mode for interactive development
- Watch mode for auto-reload
- TypeScript support out of the box

### Dynamic CLI
- Add custom commands without modifying core
- Full access to Commander.js API
- Project-specific commands in `.xec/commands/`
- TypeScript support
- Command composition and workflows

### Project Isolation
- All Xec data in `.xec/` directory
- Supports both standalone and monorepo projects
- Clean separation of concerns
- Easy to gitignore sensitive data

## Future Enhancements
- Plugin marketplace
- Command sharing via npm
- Visual command builder
- AI-powered command suggestions
- Remote command execution