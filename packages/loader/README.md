# @xec-sh/loader

Script loading and module system with TypeScript transformation, CDN module loading, and REPL support.

## Install

```bash
pnpm add @xec-sh/loader
```

## Quick Start

```typescript
import { ScriptExecutor, CodeEvaluator, ModuleLoader } from '@xec-sh/loader';

// Execute a TypeScript file
const executor = new ScriptExecutor();
const result = await executor.executeScript('./deploy.ts', {
  customGlobals: { API_KEY: process.env.API_KEY },
});

// Evaluate inline code with top-level await
const evaluator = new CodeEvaluator();
await evaluator.evaluateCode(`
  const res = await fetch('https://api.example.com/data');
  console.log(await res.json());
`);

// Load modules from CDNs
const loader = new ModuleLoader({ preferredCDN: 'esm.sh' });
const lodash = await loader.import('npm:lodash@4.17.21');
const std = await loader.import('jsr:@std/path@1.0.0');
```

```typescript
import { REPLServer, FileWatcher, PluginManager } from '@xec-sh/loader';

// Interactive REPL
const repl = new REPLServer({ prompt: 'xec> ', includeBuiltins: true });
repl.start();

// File watching with debounce
const watcher = new FileWatcher();
watcher.watch('./src', { debounce: 300 }, (event) => {
  console.log(`${event.type}: ${event.path}`);
});

// Plugin system with lifecycle hooks
const plugins = new PluginManager();
plugins.register({
  name: 'my-plugin',
  setup: async (ctx) => { /* initialize */ },
  teardown: async () => { /* cleanup */ },
  resolveSpecifier: (spec) => spec.replace('@my/', 'https://cdn.my.dev/'),
  transformCode: (code) => code,
  beforeExecute: async (ctx) => { /* pre-exec */ },
  afterExecute: async (ctx, result) => { /* post-exec */ },
  onError: async (error) => { /* handle error */ },
});
```

```typescript
import { streamExecute, streamLines, GlobalInjector } from '@xec-sh/loader';

// Streaming execution
for await (const event of streamExecute('./long-task.ts')) {
  if (event.type === 'stdout') process.stdout.write(event.data);
}

// Stream lines from execution
for await (const line of streamLines('./script.ts')) {
  console.log(line);
}

// Global injection with automatic cleanup
const injector = new GlobalInjector({ globals: { VERSION: '1.0.0' } });
await injector.execute(async () => {
  console.log(globalThis.VERSION); // '1.0.0'
});
// globals are restored after execution
```

## API

| Export | Description |
|--------|-------------|
| `ScriptExecutor` | Execute TypeScript/JavaScript files with context injection |
| `CodeEvaluator` | Evaluate inline code with TypeScript support |
| `ModuleLoader` | Load modules from CDN, local, or node_modules |
| `REPLServer` / `REPLCommands` | Interactive REPL with extensible commands |
| `FileWatcher` / `watchFiles` | Native fs.watch file watcher with debounce |
| `PluginManager` | Plugin system with lifecycle hooks |
| `streamExecute` / `streamLines` | Streaming script execution |
| `GlobalInjector` / `createInjector` | Safe global variable injection and restoration |
| `ScriptRuntime` / `createRuntime` | Runtime utilities (cd, pwd, env, retry, within) |
| `TypeScriptTransformer` | TypeScript-to-JS transformation via esbuild |
| `ImportTransformer` | Import path rewriting for ESM compatibility |
| `CDNModuleResolver` | Resolve modules from esm.sh, jsr.io, unpkg, skypack, jsdelivr |
| `NodeModuleResolver` / `LocalModuleResolver` | Resolve from node_modules or local files |
| `MemoryCache` | In-memory LRU cache with TTL |
| `FileSystemCache` | Persistent disk cache with TTL |
| `HybridCache` | Combined memory + filesystem caching |
| `ExecutionContext` | Execution context for scripts |

## Features

- Execute TypeScript and JavaScript files with automatic esbuild transformation
- Evaluate inline code with top-level await support
- CDN module loading from esm.sh, jsr.io, unpkg, skypack, and jsdelivr
- Module specifiers: `npm:`, `esm:`, `jsr:`, `unpkg:`, `skypack:`, `jsdelivr:`, direct URLs
- Caching: MemoryCache (LRU), FileSystemCache (TTL), HybridCache (combined)
- Interactive REPL with extensible command system and built-in commands
- FileWatcher using native fs.watch with configurable debounce
- Plugin system with hooks: setup, teardown, resolver, transformCode, resolveSpecifier, beforeExecute, afterExecute, onError
- Streaming execution with `streamExecute` and `streamLines`
- GlobalInjector for safe global variable injection with automatic restoration
- Import path transformation for ESM compatibility
- Local and node_modules module resolution

## License

MIT
