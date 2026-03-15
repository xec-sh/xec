# Shell and Terminal Configuration

Advanced shell configuration for the local execution environment, including shell detection, customization, and terminal interaction.

## Shell Detection

### Automatic Detection
The local adapter automatically detects the appropriate shell based on your platform:

```javascript
import { $ } from '@xec-sh/core';

// Platform-based detection
const result = await $`echo $0`;
// Linux/macOS: /bin/sh, /bin/bash, or /bin/zsh
// Windows: cmd.exe or powershell.exe
```

### Detection Priority
The adapter uses the following priority for shell detection:

```javascript
// Unix-like systems priority
const unixShells = [
  '/bin/bash',      // Preferred
  '/bin/sh',        // Fallback
  '/usr/bin/bash',  // Alternative locations
  '/usr/bin/sh'
];

// Windows systems priority  
const windowsShells = [
  'cmd.exe',        // Default
  'powershell.exe'  // If available
];
```

### Runtime Detection
Check which shell is being used:

```javascript
// Get current shell
const shell = await $`echo $SHELL || echo %COMSPEC%`;
console.log('Current shell:', shell.stdout.trim());

// Detect shell type
const isBasher = await $.with({ throwOnNonZeroExit: false })`[[ -n "$BASH_VERSION" ]]`;
const isZsh = await $.with({ throwOnNonZeroExit: false })`[[ -n "$ZSH_VERSION" ]]`;
const isFish = await $.with({ throwOnNonZeroExit: false })`echo $FISH_VERSION`;

if (isBasher.exitCode === 0) {
  console.log('Running in Bash');
} else if (isZsh.exitCode === 0) {
  console.log('Running in Zsh');
} else if (isFish.stdout) {
  console.log('Running in Fish');
}
```

## Shell Profiles and RC Files

### Loading Shell Profiles
Control which initialization files are loaded:

```javascript
// Load interactive shell with full profile
await $.with({ 
  shell: '/bin/bash -i' 
})`alias`; // Shows all aliases

// Load specific profile
await $.with({ 
  shell: '/bin/bash',
  env: { 
    BASH_ENV: '~/.bashrc' 
  }
})`source ~/.bash_profile && echo $MY_CUSTOM_VAR`;

// Skip profile loading (faster)
await $.with({ 
  shell: '/bin/sh' 
})`echo "Fast execution without profiles"`;
```

### Custom RC Files
Use custom initialization files:

```javascript
// Create temporary RC file
const customRc = `
  export PS1='> '
  alias ll='ls -la'
  function greet() { echo "Hello, $1!"; }
`;

await $`echo '${customRc}' > /tmp/custom.rc`;

// Use custom RC
await $.with({ 
  shell: '/bin/bash',
  env: { 
    BASH_ENV: '/tmp/custom.rc' 
  }
})`greet World`; // Output: Hello, World!
```

## Shell Options and Modes

### Bash Options
Configure Bash behavior with options:

```javascript
// Strict mode
await $.with({ shell: '/bin/bash' })`
  set -euo pipefail  # Exit on error, undefined vars, pipe failures
  IFS=$'\\n\\t'       # Set Internal Field Separator
  
  # Your commands here
  echo "Running in strict mode"
`;

// Debug mode
await $.with({ shell: '/bin/bash' })`
  set -x  # Print commands before execution
  VAR="test"
  echo $VAR
  set +x  # Disable debug mode
`;

// Nounset mode
await $.with({ shell: '/bin/bash' })`
  set -u  # Error on undefined variables
  echo ${UNDEFINED_VAR:-"default value"}
`;
```

### Zsh Options
Configure Zsh-specific features:

```javascript
// Zsh with extended globbing
await $.with({ shell: '/bin/zsh' })`
  setopt EXTENDED_GLOB
  echo **/*.js  # Recursive glob
`;

// Zsh with history expansion disabled
await $.with({ shell: '/bin/zsh' })`
  setopt NO_BANG_HIST
  echo "No history expansion!"
`;

// Zsh with null glob
await $.with({ shell: '/bin/zsh' })`
  setopt NULL_GLOB
  files=(*.nonexistent)
  echo "Files: \${files[@]}"  # No error if no matches
`;
```

### Fish Shell Options
Configure Fish shell features:

```javascript
// Fish with custom functions
await $.with({ shell: '/usr/bin/fish' })`
  function greet
    echo "Hello, $argv!"
  end
  
  greet "Fish User"
`;

// Fish with abbreviations
await $.with({ shell: '/usr/bin/fish' })`
  abbr -a g git
  abbr -a ga 'git add'
  abbr -a gc 'git commit'
`;
```

## Interactive vs Non-Interactive Shells

### Non-Interactive Mode (Default)
Standard execution without terminal interaction:

```javascript
// Non-interactive (default)
const result = await $`echo "Simple output"`;
console.log(result.stdout); // "Simple output\n"

// Explicitly non-interactive
await $.with({ 
  shell: '/bin/bash' 
})`echo "No terminal required"`;
```

### Interactive Mode
Enable terminal interaction when needed:

```javascript
// Interactive shell with TTY
await $.with({ 
  shell: '/bin/bash -i',
  stdio: 'inherit'  // Inherit parent's stdio
})`read -p "Enter your name: " name && echo "Hello, $name"`;

// Interactive with custom TTY settings
const proc = $.with({ 
  shell: '/bin/bash -i',
  env: {
    TERM: 'xterm-256color',
    COLUMNS: '120',
    LINES: '40'
  }
})`top`;

// Kill after 5 seconds
setTimeout(() => proc.kill(), 5000);
```

## Terminal Emulation

### TTY Allocation
Control pseudo-terminal allocation:

```javascript
// Allocate PTY for color output
const result = await $.with({ 
  env: { 
    TERM: 'xterm-256color',
    FORCE_COLOR: '1'
  }
})`ls --color=always`;

// Check if TTY is available
const hasTTY = await $`test -t 0 && echo "TTY available" || echo "No TTY"`;
console.log(hasTTY.stdout);
```

### ANSI Color Support
Handle colored terminal output:

```javascript
// Force color output
await $.with({ 
  env: {
    CLICOLOR: '1',
    CLICOLOR_FORCE: '1',
    FORCE_COLOR: '1',
    NO_COLOR: ''  // Remove NO_COLOR if set
  }
})`npm test`;

// Strip ANSI codes if needed
import { stripAnsi } from '@xec-sh/core/utils';

const colored = await $`ls --color=always`;
const plain = stripAnsi(colored.stdout);
console.log('Plain output:', plain);
```

### Terminal Size
Set terminal dimensions:

```javascript
// Set specific terminal size
await $.with({ 
  env: {
    COLUMNS: '80',
    LINES: '24'
  }
})`tput cols && tput lines`;

// Get current terminal size
const size = await $`
  echo "Columns: $(tput cols)"
  echo "Lines: $(tput lines)"
`;
console.log(size.stdout);
```

## Shell Functions and Aliases

### Defining Functions
Create and use shell functions:

```javascript
// Bash functions
await $.with({ shell: '/bin/bash' })`
  # Define function
  function deploy() {
    local env=$1
    echo "Deploying to $env environment"
    # deployment logic here
  }
  
  # Use function
  deploy production
`;

// Zsh functions with advanced features
await $.with({ shell: '/bin/zsh' })`
  function backup() {
    local source=\${1:?Source required}
    local dest=\${2:-/backup}
    echo "Backing up $source to $dest"
    cp -r "$source" "$dest"
  }
  
  backup /data /backup/data
`;
```

### Using Aliases
Work with shell aliases:

```javascript
// Load and use aliases
await $.with({ shell: '/bin/bash -i' })`
  # Define aliases
  alias ll='ls -la'
  alias gs='git status'
  alias dc='docker-compose'
  
  # Use aliases
  ll /tmp
`;

// Check available aliases
const aliases = await $.with({ shell: '/bin/bash -i' })`alias`;
console.log('Available aliases:', aliases.stdout);
```

## Environment Customization

### PATH Management
Customize command search paths:

```javascript
// Prepend to PATH
await $.with({ 
  env: {
    PATH: `/custom/bin:${process.env.PATH}`
  }
})`which custom-command`;

// Append to PATH
await $.with({ 
  env: {
    PATH: `${process.env.PATH}:/opt/tools/bin`
  }
})`tool --version`;

// Complete PATH replacement
await $.with({ 
  env: {
    PATH: '/usr/bin:/bin'  // Minimal PATH
  }
})`ls /`;
```

### Locale Settings
Configure locale and language settings:

```javascript
// Set UTF-8 locale
await $.with({ 
  env: {
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    LC_CTYPE: 'en_US.UTF-8'
  }
})`echo "Unicode: 你好世界 🌍"`;

// Different locale for dates
await $.with({ 
  env: {
    LC_TIME: 'de_DE.UTF-8'
  }
})`date`;
```

### Prompt Customization
Customize shell prompts:

```javascript
// Bash prompt
await $.with({ 
  shell: '/bin/bash -i',
  env: {
    PS1: '\\u@\\h:\\w\\$ ',  // user@host:path$
    PS2: '> ',               // Continuation prompt
    PS4: '+ '                // Debug prompt
  }
})`echo "Custom prompt"`;

// Zsh prompt with colors
await $.with({ 
  shell: '/bin/zsh -i',
  env: {
    PROMPT: '%F{green}%n@%m%f:%F{blue}%~%f$ '
  }
})`pwd`;
```

## Shell Integration

### Command History
Manage shell command history:

```javascript
// Use history file
await $.with({ 
  shell: '/bin/bash',
  env: {
    HISTFILE: '~/.custom_history',
    HISTSIZE: '10000',
    HISTCONTROL: 'ignoredups:erasedups'
  }
})`history | tail -10`;

// Disable history
await $.with({ 
  shell: '/bin/bash',
  env: {
    HISTFILE: '/dev/null'
  }
})`sensitive-command`;
```

### Job Control
Manage background jobs:

```javascript
// Run job in background
await $.with({ shell: '/bin/bash' })`
  sleep 10 &
  JOB_PID=$!
  echo "Started job with PID: $JOB_PID"
  
  # Wait for job
  wait $JOB_PID
  echo "Job completed"
`;

// List jobs
await $.with({ shell: '/bin/bash -i' })`
  sleep 100 &
  sleep 200 &
  jobs -l
`;
```

## PowerShell Configuration (Windows)

### Execution Policy
Configure PowerShell execution policies:

```javascript
// Set execution policy for session
await $.with({ shell: 'powershell.exe' })`
  Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
  ./script.ps1
`;

// Check current policy
const policy = await $.with({ shell: 'powershell.exe' })`
  Get-ExecutionPolicy
`;
console.log('Execution policy:', policy.stdout.trim());
```

### PowerShell Profiles
Load PowerShell profiles:

```javascript
// Load specific profile
await $.with({ 
  shell: 'powershell.exe',
  env: {
    PSModulePath: 'C:\\CustomModules'
  }
})`
  . $PROFILE
  Get-Module
`;

// Skip profiles (faster)
await $.with({ shell: 'powershell.exe -NoProfile' })`
  Write-Host "Fast execution"
`;
```

## Performance Optimization

### Shell Selection for Performance
Choose the right shell for your needs:

```javascript
// Fastest: sh (minimal features)
const fast = await $.with({ shell: '/bin/sh' })`echo "Fast"`;

// Balanced: bash (good features, reasonable speed)
const balanced = await $.with({ shell: '/bin/bash' })`echo "Balanced"`;

// Feature-rich: zsh (many features, slower startup)
const featured = await $.with({ shell: '/bin/zsh' })`echo "Featured"`;

// Benchmark shell startup
const shells = ['/bin/sh', '/bin/bash', '/bin/zsh'];
for (const shell of shells) {
  const start = Date.now();
  await $.with({ shell })`true`;
  console.log(`${shell}: ${Date.now() - start}ms`);
}
```

### Optimize Shell Startup
Reduce shell initialization time:

```javascript
// Skip RC files
await $.with({ 
  shell: '/bin/bash --norc' 
})`echo "Fast startup"`;

// Minimal environment
await $.with({ 
  shell: '/bin/sh',
  env: {
    PATH: '/usr/bin:/bin',
    HOME: '/tmp'
  }
})`command`;

// Direct execution (no shell)
await $.with({ 
  shell: false 
})`/usr/bin/echo "Fastest - no shell overhead"`;
```

## Troubleshooting Shell Issues

### Debug Shell Execution
Enable debugging to troubleshoot issues:

```javascript
// Bash debug mode
await $.with({ shell: '/bin/bash -x' })`
  VAR="test"
  echo $VAR
`; // Shows: + VAR=test \n + echo test

// Verbose mode
await $.with({ shell: '/bin/bash -v' })`
  echo "Verbose"
`; // Shows commands as read

// Combined debugging
await $.with({ shell: '/bin/bash -xv' })`
  complex-script
`;
```

### Common Shell Problems

#### Quoting Issues
```javascript
// Problem: Spaces in arguments
const file = "my file.txt";
// await $`cat ${file}`; // Error: tries to cat "my" and "file.txt"

// Solution: Proper quoting
await $`cat "${file}"`;
// Or use array form
await $.with({ shell: false })`cat ${file}`;
```

#### Variable Expansion
```javascript
// Problem: Variable not expanding
await $`echo '$HOME'`; // Output: $HOME

// Solution: Use double quotes
await $`echo "$HOME"`; // Output: /home/user
```

#### Path Issues
```javascript
// Problem: Command not found
try {
  await $`custom-tool`;
} catch (error) {
  // Solution: Check PATH
  const path = await $`echo $PATH`;
  console.log('Current PATH:', path.stdout);
  
  // Add to PATH if needed
  await $.with({ 
    env: { 
      PATH: `${process.env.PATH}:/usr/local/bin` 
    }
  })`custom-tool`;
}
```

## Next Steps

- [Debugging Techniques](./debugging.md) - Debug shell command execution
- [Local Setup](./setup.md) - Basic local environment configuration
- [SSH Environment](../ssh/setup.md) - Remote shell execution
- [Performance Guide](../../core/execution-engine/performance/optimization.md) - Optimize shell performance