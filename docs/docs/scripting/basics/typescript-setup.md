# TypeScript Configuration for Xec Scripts

Xec provides native TypeScript support with zero configuration required. This guide covers TypeScript setup, type definitions, and best practices for type-safe scripting.

## Zero-Configuration TypeScript

Xec automatically compiles TypeScript files without any setup:

```bash
# JavaScript files work as-is
xec run script.js

# TypeScript files are automatically compiled
xec run script.ts

# Even TSX files are supported
xec run component.tsx
```

## Built-in Type Definitions

Xec provides comprehensive type definitions through the `@xec-sh/core` package:

```typescript
import { $, ProcessPromise, ProcessOutput } from '@xec-sh/core';
import type { ExecutionEngine, ExecutionOptions } from '@xec-sh/core';

// Fully typed command execution
const result: ProcessOutput = await $`ls -la`;
const promise: ProcessPromise = $`echo "test"`;
```

## Creating a TypeScript Project

### Basic Setup

1. Initialize your project:
```bash
npm init -y
npm install --save-dev typescript @types/node
npm install @xec-sh/core
```

2. Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "types": ["node", "@xec-sh/core"]
  },
  "include": ["**/*.ts", "**/*.js"],
  "exclude": ["node_modules", "dist"]
}
```

3. Create your first TypeScript script:
```typescript
// deploy.ts
import { $ } from '@xec-sh/core';
import type { ProcessOutput } from '@xec-sh/core';

interface DeployConfig {
  environment: 'dev' | 'staging' | 'prod';
  version: string;
  dryRun?: boolean;
}

async function deploy(config: DeployConfig): Promise<void> {
  const { environment, version, dryRun = false } = config;
  
  if (dryRun) {
    console.log(`[DRY RUN] Would deploy ${version} to ${environment}`);
    return;
  }
  
  const result: ProcessOutput = await $`git tag v${version}`;
  console.log(`Tagged version: v${version}`);
  
  await $`npm run deploy:${environment}`;
  console.log(`Deployed to ${environment}`);
}

// Type-safe argument parsing
const config: DeployConfig = {
  environment: (args[0] as DeployConfig['environment']) || 'dev',
  version: args[1] || '1.0.0',
  dryRun: args.includes('--dry-run')
};

await deploy(config);
```

## Type Definitions for Global Context

Xec injects global variables that TypeScript needs to know about:

### Global Type Declarations

Create `xec.d.ts` in your project root:

```typescript
// xec.d.ts
import type { ExecutionEngine } from '@xec-sh/core';

declare global {
  // Script execution context
  const $target: ExecutionEngine;
  const $targetInfo: {
    type: 'local' | 'ssh' | 'docker' | 'k8s';
    name?: string;
    host?: string;
    container?: string;
    pod?: string;
    namespace?: string;
    config: any;
  } | undefined;
  
  // Script metadata
  const args: string[];
  const argv: string[];
  const params: Record<string, any>;
  const __filename: string;
  const __dirname: string;
  const __script: {
    path: string;
    args: string[];
    target?: any;
  };
  
  // Configuration access
  const config: {
    get(path?: string): any;
    reload(): Promise<void>;
  };
  
  const vars: Record<string, any>;
  
  // Task and target APIs
  const tasks: {
    run(name: string, params?: Record<string, any>): Promise<any>;
    list(): Promise<string[]>;
    exists(name: string): Promise<boolean>;
  };
  
  const targets: {
    list(type?: string): Promise<string[]>;
    get(name: string): Promise<any>;
    execute(name: string, command: string): Promise<any>;
  };
  
  // Utilities
  const chalk: any;
  function glob(pattern: string): Promise<string[]>;
  function minimatch(path: string, pattern: string): boolean;
}

export {};
```

## Advanced Type Patterns

### Custom Command Builders

```typescript
import { $, ProcessPromise } from '@xec-sh/core';

class CommandBuilder {
  private options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {};
  
  setCwd(dir: string): this {
    this.options.cwd = dir;
    return this;
  }
  
  setEnv(env: Record<string, string>): this {
    this.options.env = { ...this.options.env, ...env };
    return this;
  }
  
  setTimeout(ms: number): this {
    this.options.timeout = ms;
    return this;
  }
  
  async execute(command: string): Promise<ProcessOutput> {
    let promise: ProcessPromise = $`${command}`;
    
    if (this.options.cwd) {
      promise = promise.cwd(this.options.cwd);
    }
    
    if (this.options.env) {
      promise = promise.env(this.options.env);
    }
    
    if (this.options.timeout) {
      promise = promise.timeout(this.options.timeout);
    }
    
    return await promise;
  }
}

// Usage
const builder = new CommandBuilder()
  .setCwd('/app')
  .setEnv({ NODE_ENV: 'production' })
  .setTimeout(30000);

await builder.execute('npm install');
```

### Result Type Guards

```typescript
import { $ } from '@xec-sh/core';
import type { ProcessOutput } from '@xec-sh/core';

interface SuccessResult extends ProcessOutput {
  exitCode: 0;
}

interface ErrorResult extends ProcessOutput {
  exitCode: number;
  stderr: string;
}

function isSuccess(result: ProcessOutput): result is SuccessResult {
  return result.exitCode === 0;
}

function isError(result: ProcessOutput): result is ErrorResult {
  return result.exitCode !== 0;
}

// Usage with type narrowing
const result = await $`npm test`.nothrow();

if (isSuccess(result)) {
  // TypeScript knows exitCode is 0
  console.log('Tests passed:', result.stdout);
} else if (isError(result)) {
  // TypeScript knows exitCode is non-zero
  console.error(`Tests failed with code ${result.exitCode}:`, result.stderr);
}
```

### Generic Command Wrappers

```typescript
import { $ } from '@xec-sh/core';

async function runWithRetry<T>(
  command: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await command();
    } catch (error) {
      lastError = error as Error;
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Usage
const result = await runWithRetry(
  () => $`curl https://api.example.com`,
  5,
  2000
);
```

## Module Imports and NPM Packages

### Dynamic Imports with Types

```typescript
// Dynamic import with type assertion
const lodash = await import('lodash') as typeof import('lodash');
const result = lodash.uniq([1, 2, 2, 3]);

// Using the 'use' function with types
declare function use<T = any>(specifier: string): Promise<T>;

interface LodashModule {
  uniq<T>(array: T[]): T[];
  debounce<F extends (...args: any[]) => any>(func: F, wait: number): F;
}

const _ = await use<LodashModule>('lodash');
const unique = _.uniq([1, 2, 2, 3]);
```

### NPM Package Types

```typescript
// Install type definitions
// npm install --save-dev @types/node-fetch

import fetch from 'node-fetch';

interface ApiResponse {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

async function fetchData(): Promise<ApiResponse> {
  const response = await fetch('https://api.example.com/data');
  return await response.json() as ApiResponse;
}
```

## Configuration Types

### Typed Configuration Access

```typescript
interface XecConfig {
  targets: {
    [key: string]: {
      type: 'ssh' | 'docker' | 'k8s';
      host?: string;
      username?: string;
      container?: string;
      pod?: string;
      namespace?: string;
    };
  };
  tasks: {
    [key: string]: {
      description?: string;
      command?: string;
      script?: string;
      steps?: Array<{ name: string; command: string }>;
    };
  };
  vars: Record<string, any>;
}

// Type-safe configuration access
const config = global.config as {
  get<K extends keyof XecConfig>(key: K): XecConfig[K];
  get(path: string): any;
  reload(): Promise<void>;
};

const targets = config.get('targets');
const sshTarget = targets['production'];

if (sshTarget.type === 'ssh') {
  console.log(`SSH host: ${sshTarget.host}`);
}
```

## Error Handling with Types

### Custom Error Types

```typescript
class DeploymentError extends Error {
  constructor(
    message: string,
    public readonly stage: string,
    public readonly exitCode?: number
  ) {
    super(message);
    this.name = 'DeploymentError';
  }
}

async function deployWithStages(): Promise<void> {
  try {
    await $`npm run build`;
  } catch (error) {
    throw new DeploymentError(
      'Build failed',
      'build',
      (error as any).exitCode
    );
  }
  
  try {
    await $`npm run test`;
  } catch (error) {
    throw new DeploymentError(
      'Tests failed',
      'test',
      (error as any).exitCode
    );
  }
}

// Usage
try {
  await deployWithStages();
} catch (error) {
  if (error instanceof DeploymentError) {
    console.error(`Deployment failed at ${error.stage}: ${error.message}`);
    process.exit(error.exitCode || 1);
  }
  throw error;
}
```

## IDE Integration

### VS Code Setup

1. Install the TypeScript extension (built-in)
2. Create `.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

3. Create `.vscode/launch.json` for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Xec Script",
      "program": "${workspaceFolder}/node_modules/.bin/xec",
      "args": ["run", "${file}"],
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Testing TypeScript Scripts

### Unit Testing with Jest

```typescript
// math.ts
export function add(a: number, b: number): number {
  return a + b;
}

// math.test.ts
import { add } from './math';

describe('Math functions', () => {
  test('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

### Integration Testing

```typescript
// deploy.test.ts
import { $ } from '@xec-sh/core';
import { deploy } from './deploy';

jest.mock('@xec-sh/core', () => ({
  $: jest.fn()
}));

describe('Deployment', () => {
  test('deploys to staging', async () => {
    const mockExec = $ as jest.MockedFunction<typeof $>;
    mockExec.mockResolvedValue({
      stdout: 'Success',
      stderr: '',
      exitCode: 0,
      signal: null,
      duration: 100
    } as any);
    
    await deploy({ environment: 'staging', version: '1.0.0' });
    
    expect(mockExec).toHaveBeenCalledWith(
      expect.arrayContaining(['npm run deploy:staging'])
    );
  });
});
```

## Best Practices

1. **Use strict TypeScript settings**:
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true,
       "strictNullChecks": true
     }
   }
   ```

2. **Type your function parameters**:
   ```typescript
   async function deploy(env: string, version: string): Promise<void> {
     // Implementation
   }
   ```

3. **Use interface for complex configs**:
   ```typescript
   interface Config {
     required: string;
     optional?: string;
     nested: {
       value: number;
     };
   }
   ```

4. **Leverage type inference**:
   ```typescript
   // Let TypeScript infer the type
   const result = await $`ls`;
   
   // Instead of
   const result: ProcessOutput = await $`ls`;
   ```

5. **Use const assertions for literals**:
   ```typescript
   const config = {
     env: 'production',
     debug: false
   } as const;
   ```

## Complete TypeScript Example

Here's a comprehensive TypeScript script showcasing best practices:

```typescript
// release.ts - Complete release automation script
import { $, ProcessOutput } from '@xec-sh/core';
import chalk from 'chalk';
import * as semver from 'semver';

interface ReleaseOptions {
  type: 'major' | 'minor' | 'patch';
  dryRun?: boolean;
  skipTests?: boolean;
  skipChangelog?: boolean;
}

interface PackageJson {
  name: string;
  version: string;
  scripts?: Record<string, string>;
}

class ReleaseManager {
  constructor(
    private readonly options: ReleaseOptions
  ) {}
  
  async execute(): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Starting release process...'));
      
      const currentVersion = await this.getCurrentVersion();
      const newVersion = this.calculateNewVersion(currentVersion);
      
      console.log(chalk.gray(`Current version: ${currentVersion}`));
      console.log(chalk.green(`New version: ${newVersion}`));
      
      if (this.options.dryRun) {
        console.log(chalk.yellow('DRY RUN - No changes will be made'));
      }
      
      await this.runPreReleaseChecks();
      await this.updateVersion(newVersion);
      await this.generateChangelog(newVersion);
      await this.createGitTag(newVersion);
      await this.publishPackage();
      
      console.log(chalk.green('✅ Release completed successfully!'));
    } catch (error) {
      console.error(chalk.red('❌ Release failed:'), error);
      process.exit(1);
    }
  }
  
  private async getCurrentVersion(): Promise<string> {
    const packageContent = await $`cat package.json`.quiet();
    const packageJson: PackageJson = JSON.parse(packageContent.stdout);
    return packageJson.version;
  }
  
  private calculateNewVersion(current: string): string {
    const version = semver.inc(current, this.options.type);
    if (!version) {
      throw new Error(`Invalid version increment: ${current} -> ${this.options.type}`);
    }
    return version;
  }
  
  private async runPreReleaseChecks(): Promise<void> {
    // Check git status
    const status = await $`git status --porcelain`.nothrow();
    if (status.stdout.trim() && !this.options.dryRun) {
      throw new Error('Working directory is not clean');
    }
    
    // Run tests
    if (!this.options.skipTests) {
      console.log(chalk.yellow('Running tests...'));
      await $`npm test`.pipe(process.stdout);
    }
    
    // Build project
    console.log(chalk.yellow('Building project...'));
    await $`npm run build`.pipe(process.stdout);
  }
  
  private async updateVersion(version: string): Promise<void> {
    if (this.options.dryRun) {
      console.log(chalk.gray(`Would update version to ${version}`));
      return;
    }
    
    await $`npm version ${version} --no-git-tag-version`;
  }
  
  private async generateChangelog(version: string): Promise<void> {
    if (this.options.skipChangelog) {
      return;
    }
    
    console.log(chalk.yellow('Generating changelog...'));
    
    if (this.options.dryRun) {
      console.log(chalk.gray('Would generate changelog'));
      return;
    }
    
    // Get commits since last tag
    const lastTag = await $`git describe --tags --abbrev=0`.nothrow();
    const range = lastTag.exitCode === 0 
      ? `${lastTag.stdout.trim()}..HEAD`
      : 'HEAD';
    
    const commits = await $`git log ${range} --pretty=format:"- %s"`;
    
    // Update CHANGELOG.md
    const date = new Date().toISOString().split('T')[0];
    const entry = `## [${version}] - ${date}\n\n${commits.stdout}\n\n`;
    
    await $`echo "${entry}" | cat - CHANGELOG.md > temp && mv temp CHANGELOG.md`;
  }
  
  private async createGitTag(version: string): Promise<void> {
    if (this.options.dryRun) {
      console.log(chalk.gray(`Would create git tag v${version}`));
      return;
    }
    
    await $`git add .`;
    await $`git commit -m "Release v${version}"`;
    await $`git tag -a v${version} -m "Release v${version}"`;
  }
  
  private async publishPackage(): Promise<void> {
    if (this.options.dryRun) {
      console.log(chalk.gray('Would publish to npm'));
      return;
    }
    
    console.log(chalk.yellow('Publishing to npm...'));
    await $`npm publish`;
    
    console.log(chalk.yellow('Pushing to git...'));
    await $`git push origin main --tags`;
  }
}

// Parse command-line arguments
function parseArgs(): ReleaseOptions {
  const type = (args[0] as ReleaseOptions['type']) || 'patch';
  
  if (!['major', 'minor', 'patch'].includes(type)) {
    console.error(chalk.red(`Invalid release type: ${type}`));
    console.log('Usage: xec run release.ts [major|minor|patch] [--dry-run] [--skip-tests]');
    process.exit(1);
  }
  
  return {
    type,
    dryRun: args.includes('--dry-run'),
    skipTests: args.includes('--skip-tests'),
    skipChangelog: args.includes('--skip-changelog')
  };
}

// Main execution
const options = parseArgs();
const manager = new ReleaseManager(options);
await manager.execute();
```

This comprehensive example demonstrates:
- Complete TypeScript class structure
- Interface definitions for type safety
- Error handling with proper types
- Command-line argument parsing
- Integration with npm packages (semver)
- Dry-run mode for testing
- Git operations and tagging
- Changelog generation
- npm publishing workflow