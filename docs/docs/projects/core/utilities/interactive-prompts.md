---
sidebar_position: 5
---

# Interactive Prompts

User interaction utilities for collecting input, displaying prompts, and managing interactive CLI sessions.

## Overview

@xec-sh/core provides two types of interactive functionality:
- **InteractiveSession**: High-level user prompts, confirmations, and selections
- **Interactive Process**: Low-level process interaction with expect/send patterns

Features include:
- Question prompts with validation
- Confirmation dialogs  
- Single and multi-select menus
- Password input with masking
- Progress spinners
- Interactive process automation
- Expect-style pattern matching

## Basic Usage

### User Prompts

```typescript
import { InteractiveSession, question, confirm, select, password } from '@xec-sh/core';

// Quick one-off prompts
const name = await question($, 'What is your name?');
const confirmed = await confirm($, 'Continue?', true); // default true
const env = await select($, 'Choose environment:', ['dev', 'staging', 'prod']);
const pass = await password($, 'Enter password');

// Or create a session for multiple prompts
const session = new InteractiveSession($);
try {
  const projectName = await session.question('Project name:', {
    defaultValue: 'my-project',
    validate: (input) => input.length > 0 || 'Name required'
  });
  
  const useTypeScript = await session.confirm('Use TypeScript?', true);
  
  const license = await session.select('Choose license:', [
    'MIT', 'Apache-2.0', 'GPL-3.0', 'ISC'
  ]);
} finally {
  session.close();
}
```

### Interactive Processes

```typescript
import { createInteractiveSession } from '@xec-sh/core';

// Create interactive session with a process
const session = createInteractiveSession('npm init', {
  cwd: '/project',
  timeout: 30000
});

// Wait for prompts and respond
await session.expect('package name:');
await session.send('my-package');

await session.expect('version:');
await session.send('1.0.0');

// Wait for completion
await session.expect(['Is this OK?', 'Is this ok?']);
await session.send('yes');

await session.close();
```

## API Reference

### InteractiveSession Class

```typescript
class InteractiveSession {
  constructor(engine: ExecutionEngine, options?: PromptOptions)
  
  question(prompt: string, options?: QuestionOptions): Promise<string>
  confirm(prompt: string, defaultValue?: boolean): Promise<boolean>
  select(prompt: string, choices: string[]): Promise<string>
  multiselect(prompt: string, choices: string[]): Promise<string[]>
  password(prompt: string): Promise<string>
  close(): void
}

interface QuestionOptions {
  defaultValue?: string;
  choices?: string[];
  validate?: (input: string) => boolean | string;
  mask?: boolean;
  multiline?: boolean;
}

interface PromptOptions {
  input?: Readable;
  output?: Writable;
  terminal?: boolean;
}
```

### Interactive Process API

```typescript
function createInteractiveSession(
  command: string, 
  options?: InteractiveOptions
): InteractiveSessionAPI

interface InteractiveOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
  timeout?: number;
  encoding?: BufferEncoding;
}

interface InteractiveSessionAPI {
  send(data: string, addNewline?: boolean): Promise<void>
  sendRaw(data: Buffer): void
  expect(pattern: string | RegExp | (string | RegExp)[], options?: ExpectOptions): Promise<string>
  waitForOutput(text: string): Promise<string>
  close(force?: boolean): Promise<void>
  onStderr(callback: (data: string) => void): void
  onExit(callback: (code: number | null) => void): void
  onError(callback: (error: Error) => void): void
  onData(callback: (data: string) => void): void
}
```

### Utility Functions

```typescript
// Quick prompts without creating a session
async function question(engine: ExecutionEngine, prompt: string, options?: QuestionOptions): Promise<string>
async function confirm(engine: ExecutionEngine, prompt: string, defaultValue?: boolean): Promise<boolean>
async function select(engine: ExecutionEngine, prompt: string, choices: string[]): Promise<string>
async function password(engine: ExecutionEngine, prompt: string): Promise<string>

// Progress indicators
class Spinner {
  constructor(text?: string)
  start(text?: string): void
  update(text: string): void
  succeed(text?: string): void
  fail(text?: string): void
  stop(): void
}

async function withSpinner<T>(text: string, fn: () => T | Promise<T>): Promise<T>
```

## Advanced Usage

### Complex Prompts with Validation

```typescript
const session = new InteractiveSession($);

// Email validation
const email = await session.question('Enter email:', {
  validate: (input) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(input) || 'Invalid email format';
  }
});

// Numeric input with range
const port = await session.question('Port number:', {
  defaultValue: '3000',
  validate: (input) => {
    const num = parseInt(input);
    if (isNaN(num)) return 'Must be a number';
    if (num < 1 || num > 65535) return 'Port must be 1-65535';
    return true;
  }
});

// Choice with default
const environment = await session.question('Environment:', {
  choices: ['development', 'staging', 'production'],
  defaultValue: 'development'
});

session.close();
```

### Multi-Step Wizards

```typescript
async function projectSetupWizard() {
  const session = new InteractiveSession($);
  const config: any = {};
  
  try {
    console.log('=== Project Setup Wizard ===\n');
    
    // Step 1: Basic Info
    config.name = await session.question('Project name:', {
      validate: (input) => /^[a-z0-9-]+$/.test(input) || 
        'Use lowercase letters, numbers, and hyphens only'
    });
    
    config.version = await session.question('Version:', {
      defaultValue: '1.0.0',
      validate: (input) => /^\d+\.\d+\.\d+$/.test(input) || 
        'Use semantic versioning (x.y.z)'
    });
    
    // Step 2: Features
    config.typescript = await session.confirm('Use TypeScript?', true);
    
    if (config.typescript) {
      config.strict = await session.confirm('Enable strict mode?', true);
    }
    
    // Step 3: Dependencies
    const features = await session.multiselect(
      'Select features to include:',
      ['ESLint', 'Prettier', 'Jest', 'Husky', 'GitHub Actions']
    );
    config.features = features;
    
    // Step 4: Confirmation
    console.log('\nConfiguration Summary:');
    console.log(JSON.stringify(config, null, 2));
    
    const proceed = await session.confirm('\nProceed with setup?', true);
    
    if (proceed) {
      await setupProject(config);
    }
  } finally {
    session.close();
  }
}
```

### Interactive Process Automation

```typescript
// Automate git interactive rebase
async function interactiveRebase(commitCount: number) {
  const session = createInteractiveSession(`git rebase -i HEAD~${commitCount}`);
  
  try {
    // Wait for editor to open
    await session.expect('pick');
    
    // Change 'pick' to 'squash' for all but first commit
    for (let i = 1; i < commitCount; i++) {
      await session.send('j'); // Move down
      await session.send('cw'); // Change word
      await session.send('squash');
      await session.send('\x1b'); // ESC
    }
    
    // Save and exit
    await session.send(':wq\n');
    
    // Wait for commit message editor
    await session.expect(['# This is a combination', '# Combine']);
    
    // Save commit message as-is
    await session.send(':wq\n');
    
    // Wait for completion
    await session.expect('Successfully rebased');
  } finally {
    await session.close();
  }
}
```

### SSH Interactive Sessions

```typescript
async function interactiveSSHConfig(host: string) {
  const session = createInteractiveSession(`ssh ${host}`, {
    env: { ...process.env, TERM: 'xterm-256color' }
  });
  
  try {
    // Handle various prompts
    const output = await session.expect([
      'password:', 
      'Are you sure you want to continue connecting',
      '$', // Shell prompt
      '#'  // Root prompt
    ]);
    
    if (output.includes('continue connecting')) {
      await session.send('yes');
      await session.expect('password:');
    }
    
    if (output.includes('password:')) {
      const pass = await password($, 'SSH Password');
      await session.send(pass);
      await session.expect(['$', '#']);
    }
    
    // Now in shell, run commands
    await session.send('sudo apt-get update');
    
    // Handle sudo password if needed
    const sudoOutput = await session.expect(['password for', '$', '#'], {
      timeout: 2000
    });
    
    if (sudoOutput.includes('password for')) {
      await session.send(pass);
    }
    
    // Exit cleanly
    await session.send('exit');
  } finally {
    await session.close();
  }
}
```

### Progress Indicators

```typescript
import { Spinner, withSpinner } from '@xec-sh/core';

// Manual spinner control
const spinner = new Spinner('Installing dependencies...');
spinner.start();

try {
  await $`npm install`;
  spinner.update('Building project...');
  await $`npm run build`;
  spinner.succeed('Build complete!');
} catch (error) {
  spinner.fail('Build failed');
  throw error;
}

// Automatic spinner with callback
const result = await withSpinner('Processing files...', async () => {
  const files = await $`find . -name "*.ts"`;
  return files.stdout.split('\n').length;
});

console.log(`Processed ${result} files`);
```

## Common Patterns

### Menu Systems

```typescript
async function mainMenu() {
  const session = new InteractiveSession($);
  
  while (true) {
    console.clear();
    console.log('=== Main Menu ===\n');
    
    const choice = await session.select('Choose an option:', [
      'Run Tests',
      'Build Project', 
      'Deploy',
      'Configure',
      'Exit'
    ]);
    
    switch (choice) {
      case 'Run Tests':
        await runTests();
        break;
      case 'Build Project':
        await buildProject();
        break;
      case 'Deploy':
        await deployMenu(session);
        break;
      case 'Configure':
        await configureMenu(session);
        break;
      case 'Exit':
        session.close();
        return;
    }
    
    await session.question('\nPress Enter to continue...');
  }
}

async function deployMenu(session: InteractiveSession) {
  const env = await session.select('Deploy to:', [
    'Development',
    'Staging', 
    'Production',
    '← Back'
  ]);
  
  if (env === '← Back') return;
  
  const confirm = await session.confirm(
    `Deploy to ${env}?`,
    env !== 'Production' // Default true except for prod
  );
  
  if (confirm) {
    await withSpinner(`Deploying to ${env}...`, async () => {
      await deploy(env.toLowerCase());
    });
  }
}
```

### Configuration Collectors

```typescript
async function collectDatabaseConfig() {
  const session = new InteractiveSession($);
  const config: any = {};
  
  try {
    config.type = await session.select('Database type:', [
      'PostgreSQL',
      'MySQL',
      'MongoDB',
      'SQLite'
    ]);
    
    if (config.type !== 'SQLite') {
      config.host = await session.question('Host:', {
        defaultValue: 'localhost'
      });
      
      config.port = await session.question('Port:', {
        defaultValue: getDefaultPort(config.type),
        validate: (input) => {
          const port = parseInt(input);
          return (!isNaN(port) && port > 0 && port < 65536) || 
            'Invalid port number';
        }
      });
      
      config.username = await session.question('Username:', {
        defaultValue: 'admin'
      });
      
      config.password = await session.password('Password');
    }
    
    config.database = await session.question('Database name:', {
      validate: (input) => input.length > 0 || 'Database name required'
    });
    
    // Test connection
    const testConnection = await session.confirm('Test connection?', true);
    
    if (testConnection) {
      await withSpinner('Testing connection...', async () => {
        await testDatabaseConnection(config);
      });
    }
    
    return config;
  } finally {
    session.close();
  }
}
```

### Conditional Flows

```typescript
async function deploymentFlow() {
  const session = new InteractiveSession($);
  
  try {
    const environment = await session.select('Target environment:', [
      'development',
      'staging',
      'production'
    ]);
    
    let skipTests = false;
    let createBackup = false;
    let notifyTeam = false;
    
    if (environment === 'development') {
      skipTests = await session.confirm('Skip tests?', true);
    } else {
      // Always run tests for staging/production
      console.log('✓ Tests will be run (required for this environment)');
      
      createBackup = await session.confirm('Create backup?', true);
      
      if (environment === 'production') {
        notifyTeam = await session.confirm('Notify team?', true);
        
        // Double-check for production
        const confirmProd = await session.confirm(
          '⚠️  Deploy to PRODUCTION?',
          false
        );
        
        if (!confirmProd) {
          console.log('Deployment cancelled');
          return;
        }
      }
    }
    
    // Build deployment config
    const config = {
      environment,
      skipTests,
      createBackup,
      notifyTeam
    };
    
    await executeDeployment(config);
  } finally {
    session.close();
  }
}
```

### Error Recovery

```typescript
async function robustPrompt<T>(
  promptFn: () => Promise<T>,
  maxRetries = 3
): Promise<T | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await promptFn();
    } catch (error) {
      lastError = error as Error;
      console.error(`\nAttempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        const retry = await confirm($, 'Retry?', true);
        if (!retry) break;
      }
    }
  }
  
  console.error('Max retries exceeded');
  return null;
}

// Usage
const result = await robustPrompt(async () => {
  const url = await question($, 'Enter URL:', {
    validate: (input) => {
      try {
        new URL(input);
        return true;
      } catch {
        return 'Invalid URL format';
      }
    }
  });
  
  // Test the URL
  await fetch(url);
  return url;
});
```

## Best Practices

### 1. Always Close Sessions

```typescript
// ✅ Good - using try/finally
const session = new InteractiveSession($);
try {
  await session.question('Name:');
} finally {
  session.close();
}

// ✅ Good - using one-off functions
const name = await question($, 'Name:');

// ❌ Bad - session leak
const session = new InteractiveSession($);
await session.question('Name:');
// Forgot to close!
```

### 2. Provide Clear Prompts

```typescript
// ✅ Good - clear context and format
await question($, 'Email address (user@example.com):');
await question($, 'Port number (1-65535) [3000]:');

// ❌ Bad - ambiguous
await question($, 'Input:');
await question($, 'Port:');
```

### 3. Validate User Input

```typescript
// ✅ Good - comprehensive validation
const age = await question($, 'Age:', {
  validate: (input) => {
    const num = parseInt(input);
    if (isNaN(num)) return 'Must be a number';
    if (num < 0) return 'Must be positive';
    if (num > 150) return 'Invalid age';
    return true;
  }
});

// ❌ Bad - no validation
const age = await question($, 'Age:');
const num = parseInt(age); // Could be NaN
```

### 4. Handle Interruptions

```typescript
// ✅ Good - handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nOperation cancelled by user');
  session?.close();
  process.exit(0);
});

// For interactive processes
const session = createInteractiveSession('long-running-command');
process.on('SIGINT', () => {
  session.close(true); // Force close
});
```

### 5. Provide Defaults

```typescript
// ✅ Good - sensible defaults
const config = {
  host: await question($, 'Host:', { defaultValue: 'localhost' }),
  port: await question($, 'Port:', { defaultValue: '5432' }),
  ssl: await confirm($, 'Use SSL?', true) // Default true for security
};

// ❌ Bad - no defaults
const host = await question($, 'Host:') || 'localhost'; // Manual fallback
```

## Troubleshooting

### Common Issues

1. **"Session already closed"**
   - Don't reuse closed sessions
   - Create new session or use one-off functions

2. **Prompts not appearing**
   - Ensure stdout is not redirected
   - Check terminal capabilities
   - Use `terminal: true` option

3. **Input not being read**
   - Check if stdin is available
   - Ensure process has TTY
   - Verify no other readline instances

4. **Expect pattern not matching**
   - Use regex for flexible matching
   - Account for ANSI escape codes
   - Check encoding settings

### Debugging Interactive Processes

```typescript
const session = createInteractiveSession('command', {
  encoding: 'utf8'
});

// Log all output
session.onData((data) => {
  console.log('>>> Output:', JSON.stringify(data));
});

// Log stderr separately
session.onStderr((data) => {
  console.error('>>> Stderr:', data);
});

// Monitor exit
session.onExit((code) => {
  console.log('>>> Exited with code:', code);
});
```

### Platform Considerations

- **Windows**: Some features may require Windows Terminal or newer PowerShell
- **CI/CD**: Use non-interactive mode or provide all inputs via defaults
- **Docker**: Ensure TTY allocation with `-it` flags
- **SSH**: May need `ssh -tt` for forced TTY allocation