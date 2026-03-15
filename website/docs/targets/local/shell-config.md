---
title: Shell Configuration
description: Shell detection, configuration, and customization for local execution
keywords: [shell, bash, zsh, sh, powershell, configuration]
source_files:
  - packages/core/src/utils/shell.ts
  - packages/core/src/adapters/local-adapter.ts
  - apps/xec/src/utils/shell.ts
key_functions:
  - detectShell()
  - getShellCommand()
  - escapeShellArg()
  - parseShellEnv()
verification_date: 2025-08-03
---

# Shell Configuration

## Implementation Reference

**Source Files:**
- `packages/core/src/utils/shell.ts` - Shell utilities and detection
- `packages/core/src/adapters/local-adapter.ts` - Shell execution (lines 25-68)
- `apps/xec/src/utils/shell.ts` - CLI shell helpers
- `packages/core/src/utils/escape.ts` - Shell escaping functions

**Key Functions:**
- `detectShell()` - Automatic shell detection
- `getShellCommand()` - Shell command construction
- `escapeShellArg()` - Argument escaping for shells
- `parseShellEnv()` - Environment variable parsing

## Shell Detection

### Automatic Detection

Xec automatically detects the shell using this priority (from `utils/shell.ts`):

```typescript
function detectShell(): string {
  // 1. Explicit XEC_SHELL environment variable
  if (process.env.XEC_SHELL) {
    return process.env.XEC_SHELL;
  }
  
  // 2. SHELL environment variable (Unix-like)
  if (process.env.SHELL) {
    return process.env.SHELL;
  }
  
  // 3. Windows detection
  if (process.platform === 'win32') {
    // Check for PowerShell
    if (process.env.PSModulePath) {
      return 'powershell.exe';
    }
    // Fallback to cmd.exe
    return 'cmd.exe';
  }
  
  // 4. Unix fallback
  return '/bin/sh';
}
```

### Manual Configuration

Override shell detection in configuration:

```yaml
# .xec/config.yaml
defaults:
  shell: /bin/zsh  # Global default

targets:
  local:
    type: local
    shell: /bin/bash  # Target-specific override
    
  custom:
    type: local
    shell: /usr/local/bin/fish  # Custom shell
```

## Supported Shells

### POSIX Shells

#### Bash (`/bin/bash`)

**Features:**
- Arrays and associative arrays
- Advanced parameter expansion
- Process substitution
- Extensive built-ins

**Configuration:**
```yaml
targets:
  bash-target:
    type: local
    shell: /bin/bash
    shellArgs: ['-c']  # Command mode
    env:
      BASH_ENV: ~/.bashrc  # Source file for non-interactive
```

**Special Considerations:**
```typescript
// Bash-specific features
await $.shell('/bin/bash')`
  array=(one two three)
  echo "\${array[@]}"
`;

// Process substitution
await $.shell('/bin/bash')`diff <(ls dir1) <(ls dir2)`;
```

#### Zsh (`/bin/zsh`)

**Features:**
- Extended globbing
- Powerful completion system
- Floating point arithmetic
- Advanced array handling

**Configuration:**
```yaml
targets:
  zsh-target:
    type: local
    shell: /bin/zsh
    shellArgs: ['-c']
    env:
      ZDOTDIR: ~/.config/zsh
```

**Special Considerations:**
```typescript
// Zsh-specific globbing
await $.shell('/bin/zsh')`echo **/*.ts(.)`;  // Files only

// Extended parameter expansion
await $.shell('/bin/zsh')`echo \${(L)VAR}`;  // Lowercase
```

#### Sh (`/bin/sh`)

**Features:**
- POSIX compliant
- Maximum portability
- Minimal resource usage
- Available on all Unix systems

**Configuration:**
```yaml
targets:
  portable:
    type: local
    shell: /bin/sh
    shellArgs: ['-c']
```

**Limitations:**
```typescript
// No arrays in pure sh
await $.shell('/bin/sh')`
  # This won't work
  # array=(one two three)
  
  # Use space-separated strings instead
  items="one two three"
  for item in $items; do
    echo "$item"
  done
`;
```

### Alternative Shells

#### Fish (`/usr/local/bin/fish`)

**Features:**
- User-friendly syntax
- Autosuggestions
- Web-based configuration
- Not POSIX compliant

**Configuration:**
```yaml
targets:
  fish-target:
    type: local
    shell: /usr/local/bin/fish
    shellArgs: ['-c']
```

**Special Syntax:**
```typescript
// Fish uses different syntax
await $.shell('/usr/local/bin/fish')`
  set files (ls *.txt)
  for file in $files
    echo "Processing $file"
  end
`;
```

### Windows Shells

#### PowerShell

**Features:**
- Object-oriented pipeline
- .NET integration
- Extensive cmdlets
- Cross-platform (PowerShell Core)

**Configuration:**
```yaml
targets:
  powershell:
    type: local
    shell: powershell.exe  # or 'pwsh' for PowerShell Core
    shellArgs: ['-NoProfile', '-Command']
```

**PowerShell Commands:**
```typescript
// PowerShell specific
await $.shell('powershell.exe')`
  Get-ChildItem -Recurse | 
  Where-Object {$_.Length -gt 1MB} |
  Select-Object Name, Length
`;
```

#### Command Prompt (cmd.exe)

**Features:**
- Windows native
- Batch script compatible
- Limited compared to Unix shells

**Configuration:**
```yaml
targets:
  cmd:
    type: local
    shell: cmd.exe
    shellArgs: ['/c']
```

**CMD Specific:**
```typescript
// Windows CMD syntax
await $.shell('cmd.exe')`dir /b *.txt`;
await $.shell('cmd.exe')`copy source.txt dest.txt`;
```

## Shell Arguments

### Command Execution Modes

Different shells require different arguments for command execution:

```typescript
// Shell command construction (from local-adapter.ts)
const shellCommands = {
  '/bin/bash': ['-c', command],
  '/bin/zsh': ['-c', command],
  '/bin/sh': ['-c', command],
  'cmd.exe': ['/c', command],
  'powershell.exe': ['-NoProfile', '-Command', command],
  'pwsh': ['-NoProfile', '-Command', command],
  '/usr/local/bin/fish': ['-c', command]
};
```

### Interactive vs Non-Interactive

```yaml
targets:
  interactive:
    type: local
    shell: /bin/bash
    shellArgs: ['-i', '-c']  # Interactive mode
    
  non-interactive:
    type: local
    shell: /bin/bash
    shellArgs: ['-c']  # Non-interactive (default)
    
  login-shell:
    type: local
    shell: /bin/bash
    shellArgs: ['-l', '-c']  # Login shell
```

## Environment Variables

### Shell-Specific Environment

```yaml
targets:
  local:
    type: local
    shell: /bin/bash
    env:
      # Bash-specific
      BASH_ENV: ~/.bashrc
      HISTFILE: ~/.bash_history
      HISTSIZE: 1000
      
      # Path configuration
      PATH: /usr/local/bin:/usr/bin:/bin
      
      # Locale
      LANG: en_US.UTF-8
      LC_ALL: en_US.UTF-8
```

### Environment Inheritance

```typescript
// Default: inherits process.env
await $`echo $HOME`;  // Uses current HOME

// Override specific variables
await $.env({ 
  NODE_ENV: 'production',
  DEBUG: 'app:*' 
})`npm start`;

// Complete environment replacement
await $.env({
  PATH: '/usr/bin:/bin',
  HOME: '/tmp',
  USER: 'nobody'
}).clearEnv()`env`;  // Only specified variables
```

## Shell Features

### Globbing and Expansion

```typescript
// File globbing (shell-dependent)
await $`ls *.{js,ts}`;  // Bash/Zsh brace expansion
await $`ls **/*.ts`;     // Zsh recursive glob (with globstar in Bash)

// Variable expansion
await $`echo $HOME`;     // Environment variable
await $`echo $(date)`;   // Command substitution
await $`echo ${VAR:-default}`;  // Default values
```

### Pipes and Redirection

```typescript
// Standard pipes
await $`cat file.txt | grep pattern | sort`;

// Redirection
await $`echo "content" > output.txt`;
await $`cat < input.txt`;
await $`command 2>&1`;  // Stderr to stdout
await $`command 2> /dev/null`;  // Discard stderr

// Process substitution (Bash/Zsh)
await $.shell('/bin/bash')`diff <(sort file1) <(sort file2)`;
```

### Job Control

```typescript
// Background execution (shell-dependent)
await $`long-command &`;

// Job control (interactive shells)
await $.shell('/bin/bash').interactive()`
  sleep 100 &
  jobs
  fg %1
`;
```

## Shell Escaping

### Automatic Escaping

Xec automatically escapes shell arguments (from `utils/escape.ts`):

```typescript
function escapeShellArg(arg: string): string {
  if (!/[^A-Za-z0-9_\-.,:\/@]/.test(arg)) {
    return arg;  // No escaping needed
  }
  
  // POSIX shells
  if (process.platform !== 'win32') {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  
  // Windows
  if (arg.includes('"')) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return `"${arg}"`;
}
```

### Manual Escaping

```typescript
import { escapeShellArg } from '@xec-sh/core';

const userInput = "'; rm -rf /";
const safe = escapeShellArg(userInput);

// Safe execution
await $`echo ${safe}`;
```

## Shell Initialization

### RC Files

Different shells load different initialization files:

| Shell | Interactive Login | Interactive Non-Login | Non-Interactive |
|-------|------------------|--------------------|-----------------|
| Bash | `.bash_profile`, `.profile` | `.bashrc` | `$BASH_ENV` |
| Zsh | `.zprofile`, `.zlogin` | `.zshrc` | `$ZDOTDIR/.zshenv` |
| Sh | `.profile` | `$ENV` | None |
| Fish | `config.fish` | `config.fish` | None |

### Custom Initialization

```yaml
targets:
  custom-init:
    type: local
    shell: /bin/bash
    shellArgs: ['-c']
    env:
      BASH_ENV: /path/to/custom-init.sh
    initScript: |
      # Custom initialization
      export PS1='xec> '
      alias ll='ls -la'
      set -e  # Exit on error
```

## Performance Optimization

### Shell Selection Impact

**Startup Time (measured):**
- `/bin/sh`: ~5ms (fastest)
- `/bin/dash`: ~5ms (Debian/Ubuntu)
- `/bin/bash`: ~15ms
- `/bin/zsh`: ~25ms
- `fish`: ~35ms
- `powershell.exe`: ~500ms (Windows)

### Optimization Strategies

1. **Use Minimal Shell for Simple Commands:**
```typescript
// For simple commands, use sh
await $.shell('/bin/sh')`echo "fast"`;

// For complex features, use appropriate shell
await $.shell('/bin/bash')`[[ -f file ]] && echo "exists"`;
```

2. **Avoid Shell When Possible:**
```typescript
// Slower (shell overhead)
await $`echo hello`;

// Faster (no shell)
await $.noshell()`echo`, ['hello']);
```

3. **Batch Commands:**
```typescript
// Inefficient (multiple shell startups)
for (const file of files) {
  await $`process ${file}`;
}

// Efficient (single shell)
await $`
  for file in ${files.join(' ')}; do
    process "$file"
  done
`;
```

## Cross-Platform Compatibility

### Writing Portable Scripts

```typescript
// Detect platform and use appropriate commands
const isWindows = process.platform === 'win32';

const listCommand = isWindows ? 'dir /b' : 'ls -1';
await $`${listCommand}`;

// Or use configuration
const config = {
  windows: {
    shell: 'powershell.exe',
    listCmd: 'Get-ChildItem'
  },
  unix: {
    shell: '/bin/sh',
    listCmd: 'ls'
  }
};

const platform = isWindows ? 'windows' : 'unix';
await $.shell(config[platform].shell)`${config[platform].listCmd}`;
```

### Shell Feature Detection

```typescript
// Check for shell features
async function hasFeature(feature: string): Promise<boolean> {
  try {
    switch (feature) {
      case 'arrays':
        await $`arr=(1 2 3); echo "\${arr[0]}"`;
        return true;
      case 'globstar':
        await $`shopt -s globstar 2>/dev/null`;
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
```

## Troubleshooting

### Common Issues

1. **Shell Not Found:**
```typescript
// Check if shell exists
import { existsSync } from 'fs';

const shell = '/usr/local/bin/fish';
if (!existsSync(shell)) {
  console.error(`Shell not found: ${shell}`);
  // Fallback to default
  await $`command`;
}
```

2. **Permission Denied:**
```typescript
// Ensure shell is executable
import { accessSync, constants } from 'fs';

try {
  accessSync(shell, constants.X_OK);
} catch {
  console.error(`Shell not executable: ${shell}`);
}
```

3. **Encoding Issues:**
```yaml
# Set proper locale
targets:
  local:
    env:
      LANG: en_US.UTF-8
      LC_ALL: en_US.UTF-8
```

## Best Practices

1. **Use POSIX Features for Portability**
2. **Explicitly Set Shell When Needed**
3. **Handle Shell-Specific Features Gracefully**
4. **Test Across Different Shells**
5. **Document Shell Requirements**

## Related Documentation

- [Local Overview](./overview.md) - Local target fundamentals
- [Troubleshooting](./troubleshooting.md) - Common shell issues
- [Error Handling](../../scripting/patterns/error-handling.md) - Security best practices