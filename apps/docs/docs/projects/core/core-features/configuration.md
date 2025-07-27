---
sidebar_position: 4
---

# Configuration

Learn how to configure @xec-sh/core globally and per-command.

## Configuration Levels

@xec-sh/core supports configuration at three levels:

1. **Global Configuration** - Affects all commands
2. **Engine Configuration** - For specific engine instances
3. **Command Configuration** - For individual commands

## Global Configuration

### Using configure()

Set global defaults for all commands:

```typescript
import { configure } from '@xec-sh/core';

configure({
  // Default shell
  shell: '/bin/bash',
  
  // Default timeout (ms)
  timeout: 30000,
  
  // Environment variables
  env: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  },
  
  // Working directory
  cwd: '/app',
  
  // Error handling
  throwOnNonZeroExit: true,
  
  // Logging
  verbose: true
});
```

### Using $.config

Alternative configuration API:

```typescript
// Set configuration
$.config.set({
  shell: '/bin/zsh',
  timeout: 60000
});

// Get current configuration
const config = $.config.get();
console.log('Current shell:', config.shell);

// Update specific values
$.config.set({ timeout: 120000 });
```

### Configuration Options

```typescript
interface ExecutionEngineConfig {
  // Shell to use for commands
  shell?: string | boolean;
  
  // Default timeout in milliseconds
  timeout?: number;
  
  // Environment variables
  env?: Record<string, string>;
  
  // Working directory
  cwd?: string;
  
  // Throw on non-zero exit codes
  throwOnNonZeroExit?: boolean;
  
  // Enable verbose logging
  verbose?: boolean;
  
  // Standard input
  stdin?: string | Buffer | Readable;
  
  // Encoding for output
  encoding?: BufferEncoding;
  
  // Max buffer size for stdout/stderr
  maxBuffer?: number;
}
```

## Per-Command Configuration

### Method Chaining

Override global settings for specific commands:

```typescript
// Change shell
await $.shell('/bin/zsh')`echo $ZSH_VERSION`;

// Set timeout
await $.timeout(5000)`quick-command`;

// Change directory
await $.cd('/tmp')`pwd`;

// Set environment
await $.env({ DEBUG: '1' })`npm test`;

// Combine multiple
await $.timeout(60000)
       .env({ NODE_ENV: 'test' })
       .cd('/project')
       .shell('/bin/bash')`npm run integration-test`;
```

### Configuration Methods

#### $.shell()

Configure which shell to use:

```typescript
// Use specific shell
await $.shell('/bin/bash')`source ~/.bashrc && echo $CUSTOM_VAR`;
await $.shell('/bin/zsh')`echo ${(%):-%n}`;
await $.shell('/usr/bin/fish')`echo $fish_version`;

// No shell (direct execution)
await $.shell(false)`node --version`;

// Default shell
await $.shell(true)`echo "Using default shell"`;
```

#### $.timeout()

Set command timeout:

```typescript
// 10 second timeout
await $.timeout(10000)`long-running-command`;

// Very short timeout
await $.timeout(100)`sleep 1`; // Will timeout

// No timeout (0 or undefined)
await $.timeout(0)`very-long-command`;

// Handle timeout errors
try {
  await $.timeout(1000)`sleep 5`;
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.log('Command timed out');
  }
}
```

#### $.env()

Set environment variables:

```typescript
// Single variable
await $.env({ API_KEY: 'secret' })`node api.js`;

// Multiple variables
await $.env({
  NODE_ENV: 'production',
  PORT: '3000',
  DB_HOST: 'localhost'
})`npm start`;

// Extend existing environment
await $.env({
  ...process.env,
  CUSTOM_VAR: 'value'
})`printenv`;

// Clear environment
await $.env({})`env`; // Empty environment
```

#### $.cd()

Change working directory:

```typescript
// Absolute path
await $.cd('/home/user')`pwd`;

// Relative path
await $.cd('./src')`ls`;

// Home directory
await $.cd('~')`pwd`;

// Chain directories
await $.cd('/').cd('usr').cd('local')`pwd`;
// Output: /usr/local

// With environment variable
await $.cd('$HOME/projects')`ls`;
```

#### $.defaults()

Set multiple defaults at once:

```typescript
// Set multiple defaults
const production = $.defaults({
  env: { NODE_ENV: 'production' },
  timeout: 120000,
  cwd: '/app'
});

// Use configured instance
await production`npm start`;
await production`npm run health-check`;

// Override specific settings
await production.timeout(5000)`quick-check`;
```

## Engine Instances

### Creating Custom Engines

Create isolated configuration contexts:

```typescript
import { ExecutionEngine } from '@xec-sh/core';

// Development engine
const dev = new ExecutionEngine({
  env: { NODE_ENV: 'development' },
  cwd: './src',
  verbose: true
});

// Production engine
const prod = new ExecutionEngine({
  env: { NODE_ENV: 'production' },
  cwd: '/app',
  timeout: 300000,
  verbose: false
});

// Use as callable
const $dev = dev.asCallable();
const $prod = prod.asCallable();

await $dev`npm run dev`;
await $prod`npm run build`;
```

### Engine with Custom Adapters

Configure engines with specific adapters:

```typescript
// SSH engine
const remote = new ExecutionEngine({
  adapter: 'ssh',
  adapterOptions: {
    host: 'server.com',
    username: 'deploy'
  }
});

// Docker engine
const docker = new ExecutionEngine({
  adapter: 'docker',
  adapterOptions: {
    container: 'app-container'
  }
});
```

## Environment Variables

### Setting Variables

```typescript
// Global environment
configure({
  env: {
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
  }
});

// Per-command environment
await $.env({ TEMP_VAR: 'temp-value' })`echo $TEMP_VAR`;

// Extend process.env
await $.env({
  ...process.env,
  CUSTOM: 'value'
})`node script.js`;
```

### Environment Inheritance

```typescript
// Commands inherit process.env by default
process.env.MY_VAR = 'hello';
await $`echo $MY_VAR`; // Output: hello

// Override specific variables
await $.env({ MY_VAR: 'goodbye' })`echo $MY_VAR`; // Output: goodbye

// Clear all variables
await $.env({})`env`; // Empty environment
```

### Common Patterns

```typescript
// Development vs Production
const isDev = process.env.NODE_ENV === 'development';

const $ configured = isDev
  ? $.env({ NODE_ENV: 'development', DEBUG: '*' })
  : $.env({ NODE_ENV: 'production' });

await $configured`node app.js`;

// API keys from environment
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY not set');
}

await $.env({ API_KEY: apiKey })`curl -H "X-API-Key: $API_KEY" api.example.com`;
```

## Working Directory

### Directory Management

```typescript
// Get current directory
console.log('Current dir:', process.cwd());

// Change for single command
await $.cd('/tmp')`pwd`; // Output: /tmp

// Original directory preserved
await $`pwd`; // Output: original directory

// Get directory from engine
const engine = new ExecutionEngine({ cwd: '/app' });
console.log('Engine dir:', engine.config.cwd);
```

### Path Resolution

```typescript
// Relative paths are resolved
await $.cd('./src')`pwd`;

// Tilde expansion
await $.cd('~/projects')`ls`;

// Environment variables
await $.cd('$HOME/documents')`pwd`;

// Combine with path module
import path from 'path';
const projectDir = path.join(process.cwd(), 'project');
await $.cd(projectDir)`npm install`;
```

## Shell Configuration

### Shell Selection

```typescript
// Check available shells
const shells = ['/bin/bash', '/bin/zsh', '/usr/bin/fish'];
for (const shell of shells) {
  const result = await $`which ${shell}`.nothrow();
  if (result.isSuccess()) {
    console.log(`${shell} is available`);
  }
}

// Use first available shell
const shell = await detectShell();
configure({ shell });

async function detectShell(): Promise<string> {
  const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  for (const shell of shells) {
    const result = await $`test -x ${shell}`.nothrow();
    if (result.isSuccess()) {
      return shell;
    }
  }
  return '/bin/sh'; // Fallback
}
```

### Shell-Specific Features

```typescript
// Bash arrays
await $.shell('/bin/bash')`
  arr=(one two three)
  echo "\${arr[@]}"
`;

// Zsh globbing
await $.shell('/bin/zsh')`
  echo **/*.js  # Recursive glob
`;

// Fish shell
await $.shell('/usr/bin/fish')`
  for file in *.txt
    echo $file
  end
`;
```

## Error Handling Configuration

### Global Error Handling

```typescript
// Never throw on errors
configure({
  throwOnNonZeroExit: false
});

// Now all commands return results
const result = await $`exit 1`;
console.log('Exit code:', result.exitCode); // 1

// Re-enable throwing
configure({
  throwOnNonZeroExit: true
});
```

### Per-Command Error Handling

```typescript
// Use nothrow() for specific commands
const result = await $`might-fail`.nothrow();
if (!result.isSuccess()) {
  console.log('Failed but continuing');
}

// Or configure engine
const lenient = $.defaults({
  throwOnNonZeroExit: false
});

await lenient`exit 1`; // Doesn't throw
```

## Advanced Configuration

### Stdin Configuration

```typescript
// String stdin
await $.defaults({ 
  stdin: 'Hello, World!\n' 
})`cat`;

// Buffer stdin
const buffer = Buffer.from('binary data');
await $.defaults({ 
  stdin: buffer 
})`process-binary`;

// Stream stdin
import { Readable } from 'stream';
const stream = Readable.from(['line1\n', 'line2\n']);
await $.defaults({ 
  stdin: stream 
})`grep line`;
```

### Output Configuration

```typescript
// Change encoding
await $.defaults({
  encoding: 'base64'
})`cat image.jpg`; // Returns base64 string

// Increase buffer size
await $.defaults({
  maxBuffer: 50 * 1024 * 1024 // 50MB
})`generate-large-output`;
```

### Logging Configuration

```typescript
// Enable verbose mode globally
configure({ verbose: true });

// Disable for specific commands
await $`noisy-command`.quiet();

// Custom logging
$.on('command:start', (event) => {
  console.log(`[${new Date().toISOString()}] ${event.command}`);
});
```

## Configuration Precedence

Configuration follows this precedence (highest to lowest):

1. Per-command configuration (`.timeout()`, `.env()`, etc.)
2. Engine instance configuration
3. Global configuration
4. Default values

```typescript
// Example precedence
configure({ timeout: 10000 }); // Global: 10s

const engine = new ExecutionEngine({ 
  timeout: 20000 // Engine: 20s
});

const $ custom = engine.asCallable();

// Uses 5s (per-command overrides all)
await $custom.timeout(5000)`command`;

// Uses 20s (engine default)
await $custom`command`;

// Uses 10s (global default)
await $`command`;
```

## Best Practices

### 1. Environment-Specific Config

```typescript
// Load config based on environment
const config = {
  development: {
    env: { NODE_ENV: 'development', DEBUG: '*' },
    verbose: true
  },
  production: {
    env: { NODE_ENV: 'production' },
    timeout: 300000,
    verbose: false
  }
};

const env = process.env.NODE_ENV || 'development';
configure(config[env]);
```

### 2. Configuration Files

```typescript
// Load from config file
import { readFileSync } from 'fs';

const configFile = JSON.parse(
  readFileSync('./xec.config.json', 'utf-8')
);

configure(configFile);
```

### 3. Validation

```typescript
// Validate configuration
function validateConfig(config: any) {
  if (config.timeout && config.timeout < 0) {
    throw new Error('Timeout must be positive');
  }
  
  if (config.shell && typeof config.shell !== 'string') {
    throw new Error('Shell must be a string path');
  }
  
  return config;
}

configure(validateConfig({
  timeout: 30000,
  shell: '/bin/bash'
}));
```

### 4. Configuration Factories

```typescript
// Create configuration factories
class ConfigFactory {
  static development() {
    return $.defaults({
      env: { NODE_ENV: 'development' },
      verbose: true
    });
  }
  
  static production() {
    return $.defaults({
      env: { NODE_ENV: 'production' },
      timeout: 300000
    });
  }
  
  static testing() {
    return $.defaults({
      env: { NODE_ENV: 'test' },
      throwOnNonZeroExit: false
    });
  }
}

const $dev = ConfigFactory.development();
const $prod = ConfigFactory.production();
const $test = ConfigFactory.testing();
```