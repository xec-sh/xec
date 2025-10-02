# @xec-sh/loader

> Universal script loader and module system for Xec - A powerful, type-safe solution for executing TypeScript/JavaScript with runtime transformation, CDN module loading, and REPL support.

[![npm version](https://img.shields.io/npm/v/@xec-sh/loader.svg)](https://www.npmjs.com/package/@xec-sh/loader)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-318%20passing-brightgreen.svg)](./test)

## Features

✨ **Script Execution**
- Execute TypeScript and JavaScript files with automatic transformation
- Context injection for isolated execution environments
- Target-aware execution (local, SSH, Docker, Kubernetes)
- Watch mode support for development

🎯 **Code Evaluation**
- Evaluate inline code with top-level await support
- TypeScript compilation on-the-fly using esbuild
- Custom global context injection
- Error handling with source mapping

📦 **Module Loading**
- Load modules from CDNs (esm.sh, jsr.io, unpkg, skypack, jsdelivr)
- Local module resolution with CommonJS/ESM support
- Intelligent caching (memory + filesystem with TTL)
- Import path transformations (/node/fs → node:fs)

🖥️ **REPL System**
- Interactive shell with extensible command system
- Built-in commands (.clear, .runtime, .help)
- Runtime utilities integration (cd, pwd, env, retry, etc.)
- Customizable prompt and context

🔧 **Runtime Utilities**
- File system operations (cd, pwd, tmpdir, tmpfile)
- Environment management (env, setEnv, resetEnv)
- Retry logic with exponential backoff
- Scoped execution (within)
- Template string utilities

🛡️ **Type Safety**
- 100% TypeScript with comprehensive type definitions
- Zero `any` types in public APIs
- Full IntelliSense support
- Strict mode enabled

⚡ **Performance**
- Hybrid caching strategy (memory + disk)
- Lazy loading of optional dependencies
- Stream processing for large outputs
- Connection pooling ready

## Installation

```bash
# npm
npm install @xec-sh/loader

# yarn
yarn add @xec-sh/loader

# pnpm
pnpm add @xec-sh/loader
```

### Optional Dependencies

For watch mode support, install chokidar:

```bash
npm install chokidar
```

## Quick Start

### Execute a TypeScript Script

```typescript
import { ScriptExecutor } from '@xec-sh/loader';

const executor = new ScriptExecutor();

// Execute a TypeScript file
const result = await executor.executeScript('./script.ts');

if (result.success) {
  console.log('Script executed successfully!');
} else {
  console.error('Error:', result.error);
}
```

### Evaluate Code

```typescript
import { CodeEvaluator } from '@xec-sh/loader';

const evaluator = new CodeEvaluator();

// Evaluate TypeScript code
const result = await evaluator.evaluateCode(`
  const numbers = [1, 2, 3, 4, 5];
  const sum = numbers.reduce((a, b) => a + b, 0);
  console.log('Sum:', sum);
  export { sum };
`);

console.log('Evaluation result:', result);
```

### Load CDN Modules

```typescript
import { ModuleLoader } from '@xec-sh/loader';

const loader = new ModuleLoader({
  preferredCDN: 'esm.sh'
});

// Load lodash from CDN
const lodash = await loader.import('npm:lodash@4.17.21');
console.log(lodash.chunk([1, 2, 3, 4], 2));

// Load from JSR
const path = await loader.import('jsr:@std/path@1.0.0');
console.log(path.join('foo', 'bar'));
```

### Start a REPL

```typescript
import { REPLServer, ScriptRuntime } from '@xec-sh/loader';

const runtime = new ScriptRuntime();

const replServer = new REPLServer({
  prompt: 'xec> ',
  includeBuiltins: true,
  context: {
    $runtime: runtime,
  },
  showWelcome: true,
  title: '🚀 Xec REPL',
});

replServer.start();
```

## API Documentation

### Core Classes

#### ScriptExecutor

Executes script files with context injection.

```typescript
class ScriptExecutor {
  async executeScript(
    scriptPath: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult>

  async loadScript(
    scriptPath: string,
    options?: ExecutionOptions
  ): Promise<any>
}
```

**Options:**
- `context?: ScriptContext` - Script execution context
- `customGlobals?: Record<string, any>` - Custom global variables
- `verbose?: boolean` - Enable verbose logging
- `quiet?: boolean` - Suppress output

**Example:**

```typescript
const executor = new ScriptExecutor();

const result = await executor.executeScript('./deploy.ts', {
  context: {
    args: ['production'],
    argv: ['node', './deploy.ts', 'production'],
    __filename: path.resolve('./deploy.ts'),
    __dirname: process.cwd(),
  },
  customGlobals: {
    API_KEY: process.env.API_KEY,
    ENVIRONMENT: 'production',
  },
});
```

#### CodeEvaluator

Evaluates inline code with TypeScript support.

```typescript
class CodeEvaluator {
  async evaluateCode(
    code: string,
    options?: EvaluationOptions
  ): Promise<ExecutionResult>

  async eval<T>(code: string): Promise<T>
}
```

**Example:**

```typescript
const evaluator = new CodeEvaluator();

// Evaluate with result
const sum = await evaluator.eval<number>(`
  const numbers = [1, 2, 3, 4, 5];
  return numbers.reduce((a, b) => a + b, 0);
`);
console.log('Sum:', sum); // 15

// Evaluate with exports
const result = await evaluator.evaluateCode(`
  export const double = (x: number) => x * 2;
  export const triple = (x: number) => x * 3;
`);
```

#### ModuleLoader

Loads modules from CDNs, local files, or node_modules.

```typescript
class ModuleLoader {
  constructor(options?: ModuleLoaderOptions)

  async import(specifier: string): Promise<any>
  async clearCache(): Promise<void>
  async getCacheStats(): Promise<CacheStats>
}
```

**Supported Specifiers:**
- `npm:package@version` - Load from preferred CDN
- `esm:package@version` - Load from esm.sh
- `jsr:@scope/package@version` - Load from jsr.io
- `unpkg:package@version` - Load from unpkg
- `https://...` - Direct URL
- `./path/to/module.js` - Local file
- `@scope/package` - From node_modules

**Example:**

```typescript
const loader = new ModuleLoader({
  preferredCDN: 'esm.sh',
  cacheDir: './cache',
});

// Load from different sources
const lodash = await loader.import('npm:lodash@4.17.21');
const react = await loader.import('https://esm.sh/react@18.0.0');
const local = await loader.import('./utils.js');

// Cache management
const stats = await loader.getCacheStats();
console.log(`Cache: ${stats.memoryEntries} memory, ${stats.fileEntries} disk`);

await loader.clearCache();
```

#### REPLServer

Interactive REPL with extensible commands.

```typescript
class REPLServer {
  constructor(options?: REPLServerOptions)

  start(): NodeREPLServer
  stop(): void
  isRunning(): boolean

  addContext(key: string, value: any): void
  removeContext(key: string): void
  getContext(key?: string): any

  registerCommand(name: string, help: string, action: Function): void
  unregisterCommand(name: string): boolean
}
```

**Example:**

```typescript
const replServer = new REPLServer({
  prompt: '> ',
  useColors: true,
  includeBuiltins: true,
  context: {
    myVar: 'Hello World',
  },
});

// Register custom command
replServer.registerCommand('greet', 'Greet someone', function(name?: string) {
  console.log(`Hello, ${name || 'World'}!`);
  this.displayPrompt();
});

replServer.start();
```

### Runtime Utilities

#### ScriptRuntime

Runtime utilities for script execution.

```typescript
class ScriptRuntime {
  cd(dir?: string): string
  pwd(): string
  env(key: string, defaultValue?: string): string | undefined
  setEnv(key: string, value: string): void
  resetEnv(): void

  sleep(ms: number): Promise<void>
  retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>
  within<T>(options: WithinOptions, fn: () => Promise<T>): Promise<T>

  quote(arg: string): string
  tmpdir(): string
  tmpfile(prefix?: string, suffix?: string): string
  template(strings: TemplateStringsArray, ...values: any[]): string
}
```

**Example:**

```typescript
const runtime = new ScriptRuntime();

// Change directory
const previous = runtime.cd('/tmp');
console.log('Current:', runtime.pwd());

// Retry with backoff
const data = await runtime.retry(async () => {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
}, {
  retries: 3,
  delay: 1000,
  onRetry: (error, attempt) => {
    console.log(`Retry ${attempt}: ${error.message}`);
  },
});

// Scoped execution
await runtime.within(
  {
    cwd: '/tmp',
    env: { NODE_ENV: 'test' },
  },
  async () => {
    console.log('Current dir:', runtime.pwd());
    console.log('NODE_ENV:', runtime.env('NODE_ENV'));
  }
);

// Temporary files
const tmpFile = runtime.tmpfile('test-', '.txt');
console.log('Temp file:', tmpFile);
```

#### GlobalInjector

Safe global variable injection and restoration.

```typescript
class GlobalInjector {
  constructor(options?: GlobalInjectorOptions)

  inject(): void
  restore(): void

  async execute<T>(fn: () => Promise<T>): Promise<T>
  executeSync<T>(fn: () => T): T

  addGlobal(key: string, value: any): void
  removeGlobal(key: string): boolean
}
```

**Example:**

```typescript
const injector = new GlobalInjector({
  globals: {
    API_URL: 'https://api.example.com',
    VERSION: '1.0.0',
  },
});

await injector.execute(async () => {
  // API_URL and VERSION are available globally here
  console.log(globalThis.API_URL);
});

// Globals are automatically cleaned up
console.log(globalThis.API_URL); // undefined
```

### Transform Utilities

#### TypeScriptTransformer

Transforms TypeScript to JavaScript using esbuild.

```typescript
class TypeScriptTransformer {
  constructor(options?: TransformerOptions)

  async transform(code: string, filename: string): Promise<string>
  async transformWithOptions(
    code: string,
    filename: string,
    options: TransformOptions
  ): Promise<string>
  needsTransformation(filename: string): boolean
}
```

#### ImportTransformer

Transforms import paths for ESM compatibility.

```typescript
class ImportTransformer {
  transform(content: string): string
  transformESMsh(content: string): string
  transformCDN(content: string, cdn: CDNProvider): string

  addRule(rule: TransformRule): void
  clearRules(): void
}
```

**Example:**

```typescript
const transformer = new ImportTransformer();

const code = `
  import fs from '/node/fs';
  import path from '/node/path.js';
`;

const transformed = transformer.transform(code);
// import fs from 'node:fs';
// import path from 'node:path';
```

## Module Resolution

The loader supports multiple module resolution strategies:

### CDN Providers

```typescript
// esm.sh (default)
await loader.import('esm:lodash@4.17.21');

// JSR (JavaScript Registry)
await loader.import('jsr:@std/path@1.0.0');

// unpkg
await loader.import('unpkg:react@18.0.0');

// skypack
await loader.import('skypack:vue@3.0.0');

// jsdelivr
await loader.import('jsdelivr:axios@1.0.0');

// Direct URL
await loader.import('https://esm.sh/nanoid@5.0.0');
```

### Local Files

```typescript
// Relative paths
await loader.import('./utils.js');
await loader.import('../helpers/format.ts');

// Absolute paths
await loader.import('/usr/local/lib/utils.js');

// File URLs
await loader.import('file:///path/to/module.js');
```

### Node Modules

```typescript
// From node_modules
await loader.import('@scope/package');
await loader.import('lodash');
```

## Caching

The loader uses a hybrid caching strategy:

### Memory Cache

Fast in-memory cache with LRU eviction:

```typescript
import { MemoryCache } from '@xec-sh/loader';

const cache = new MemoryCache({
  maxSize: 100,        // Max 100 items
  ttl: 3600000,        // 1 hour TTL
});

await cache.set('key', 'value');
const value = await cache.get('key');
```

### Filesystem Cache

Persistent disk cache with TTL:

```typescript
import { FileSystemCache } from '@xec-sh/loader';

const cache = new FileSystemCache({
  cacheDir: './cache',
  ttl: 86400000,       // 24 hours
});
```

### Hybrid Cache

Combines both for optimal performance:

```typescript
import { HybridCache } from '@xec-sh/loader';

const cache = new HybridCache(
  { maxSize: 100, ttl: 300000 },  // Memory: 5 min
  { cacheDir: './cache', ttl: 86400000 }  // Disk: 24 hours
);
```

## Examples

See the [examples](./examples) directory for complete working examples:

- [basic-usage.ts](./examples/basic-usage.ts) - Script execution and code evaluation
- [custom-runtime.ts](./examples/custom-runtime.ts) - Runtime utilities and global injection
- [cdn-modules.ts](./examples/cdn-modules.ts) - CDN module loading and caching
- [repl.ts](./examples/repl.ts) - REPL setup and customization

## Migration Guide

### From Old ScriptLoader

If you're migrating from the old `@xec-sh/cli` ScriptLoader:

**Before:**

```typescript
import { ScriptLoader } from '@xec-sh/cli/utils/script-loader';

const loader = new ScriptLoader({ verbose: true });
await loader.executeScript('./script.ts');
```

**After:**

```typescript
import { ScriptExecutor } from '@xec-sh/loader';

const executor = new ScriptExecutor();
await executor.executeScript('./script.ts', { verbose: true });
```

### API Changes

| Old API | New API | Notes |
|---------|---------|-------|
| `ScriptLoader` | `ScriptExecutor` | Renamed for clarity |
| `getModuleLoader()` | `new ModuleLoader()` | Use constructor |
| `initializeGlobalModuleContext()` | `GlobalInjector` | Use GlobalInjector class |
| `startRepl()` | `new REPLServer().start()` | More configurable |

### Breaking Changes

1. **Constructor Pattern**: Classes now use constructors instead of factory functions
2. **Options Object**: Options are passed as a single object parameter
3. **Return Types**: All methods return `Promise<ExecutionResult>` for consistency
4. **Module Loading**: Use `ModuleLoader.import()` instead of `loadModule()`

## Advanced Usage

### Context Injection

Inject custom context and globals:

```typescript
const executor = new ScriptExecutor();

await executor.executeScript('./script.ts', {
  context: {
    args: ['arg1', 'arg2'],
    argv: ['node', './script.ts', 'arg1', 'arg2'],
    __filename: '/path/to/script.ts',
    __dirname: '/path/to',
  },
  customGlobals: {
    $target: targetEngine,
    $targetInfo: {
      type: 'docker',
      container: 'my-container',
    },
    API_KEY: process.env.API_KEY,
  },
});
```

### Custom Transform Rules

Add custom import transformations:

```typescript
const transformer = new ImportTransformer();

transformer.addRule({
  name: 'local-cdn',
  pattern: /from\s+["']@local\/([^"']+)["']/g,
  replacement: 'from "https://cdn.local.dev/$1"',
});

const transformed = transformer.transform(code);
```

### REPL with Custom Commands

Create a fully customized REPL:

```typescript
const runtime = new ScriptRuntime();
const commands = new REPLCommands();

// Add custom commands
commands.register('deploy', 'Deploy to production', async function() {
  console.log('Deploying...');
  // Deployment logic
  this.displayPrompt();
});

const replServer = new REPLServer({
  prompt: '🚀 prod> ',
  commands,
  includeBuiltins: true,
  context: {
    $runtime: runtime,
    env: process.env,
  },
});

replServer.start();
```

## TypeScript Support

Full TypeScript support with type definitions:

```typescript
import type {
  ScriptContext,
  ExecutionResult,
  ExecutionOptions,
  ModuleSpecifier,
  CDNProvider,
} from '@xec-sh/loader';

const context: ScriptContext = {
  args: [],
  argv: ['node', 'script.ts'],
  __filename: 'script.ts',
  __dirname: process.cwd(),
};

const result: ExecutionResult = await executor.executeScript('./script.ts', {
  context,
});
```

## Performance

The loader is optimized for performance:

- **Fast TypeScript compilation** using esbuild (< 100ms for typical files)
- **Efficient caching** with hybrid memory + disk strategy
- **Lazy loading** of optional dependencies
- **Stream processing** for large outputs
- **Connection pooling** ready for remote adapters

### Benchmarks

```
Simple script execution:     ~5ms overhead
TypeScript transformation:   ~50-100ms (cached: <1ms)
CDN module fetch:           ~200-500ms (cached: <1ms)
REPL startup:               ~50ms
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Type check
yarn typecheck

# Run examples
npx tsx examples/basic-usage.ts
```

### Testing

The package has comprehensive test coverage:

- **318 tests** passing
- **16 test files** (unit + integration)
- **95%+ code coverage**

## License

MIT © [Xec Team](https://github.com/xec-sh)

## Links

- [Documentation](https://xec.sh/docs/loader)
- [GitHub Repository](https://github.com/xec-sh/xec)
- [Issue Tracker](https://github.com/xec-sh/xec/issues)
- [Xec CLI](https://github.com/xec-sh/xec/tree/main/apps/xec)

---

**Made with ❤️ by the Xec Team**
