# @xec-sh/loader

> Universal script execution engine with TypeScript support, CDN module loading, and REPL

**Status**: 🚧 In Development (Specification Phase)

## Overview

`@xec-sh/loader` is a high-performance, type-safe script execution engine extracted from `@xec-sh/cli`. It provides a unified API for executing scripts, loading modules from CDN, transforming TypeScript, and running interactive REPL sessions.

## Features

- **Script Execution**: Execute JavaScript/TypeScript files with full context control
- **Module Loading**: Load modules from CDN (esm.sh, jsr.io, unpkg, skypack, jsdelivr)
- **TypeScript Support**: Built-in TypeScript transformation via esbuild
- **REPL**: Interactive shell with module loading and script utilities
- **Caching**: Intelligent multi-tier caching (memory + disk)
- **Runtime Utilities**: Rich set of utilities for script development
- **Type Safe**: 100% TypeScript with full type coverage
- **Zero Dependencies**: Minimal dependencies in core package

## Motivation

The script loading infrastructure in `@xec-sh/cli` has grown complex with circular dependencies, mixed responsibilities, and tight coupling. This package extracts and refactors that functionality into a clean, reusable, and well-tested library.

### Problems Solved

1. **Circular Dependencies**: Clean dependency graph with no cycles
2. **Mixed Responsibilities**: Clear separation between execution, loading, and runtime
3. **Tight Coupling**: Decoupled from CLI, usable in any Node.js/Bun/Deno application
4. **Global Pollution**: Opt-in global injection with safety mechanisms
5. **Limited Testability**: Isolated components easy to test

## Architecture

```
@xec-sh/loader
├── core/           # Execution engine
│   ├── execution-context.ts
│   ├── script-executor.ts
│   └── code-evaluator.ts
├── module/         # Module resolution & loading
│   ├── module-resolver.ts
│   ├── module-fetcher.ts
│   ├── module-executor.ts
│   └── module-cache.ts
├── runtime/        # Script utilities
│   ├── script-runtime.ts
│   └── global-injector.ts
├── transform/      # Code transformation
│   └── typescript-transformer.ts
├── repl/           # REPL implementation
│   └── repl-server.ts
└── types/          # TypeScript types
```

## Documentation

- **[Specification](./specs/spec.md)** - Complete architecture and implementation plan
- **[API Documentation](./docs/api.md)** - API reference (coming soon)
- **[Examples](./examples/)** - Usage examples (coming soon)
- **[Migration Guide](./docs/migration.md)** - Migrating from old loaders (coming soon)

## Quick Start (Planned API)

```typescript
import { ScriptExecutor } from '@xec-sh/loader';

const executor = new ScriptExecutor({
  typescript: true,
  cache: true,
  preferredCDN: 'esm.sh',
});

// Execute script
const result = await executor.executeScript('./script.ts', {
  args: ['arg1', 'arg2'],
  env: { FOO: 'bar' },
});

// Evaluate code
const result = await executor.evaluateCode(`
  const lodash = await use('npm:lodash');
  console.log(lodash.chunk([1, 2, 3, 4], 2));
`);

// Start REPL
await executor.startRepl({
  prompt: 'xec> ',
});
```

## Development Status

### Current Phase: Specification

✅ Specification complete - See [spec.md](./specs/spec.md)

### Roadmap

- **Week 1-2**: Package setup, type definitions, core infrastructure
- **Week 3-4**: Module system (resolution, fetching, caching)
- **Week 4-5**: Runtime utilities and transformations
- **Week 5-6**: REPL and integration testing
- **Week 7**: CLI migration
- **Week 8**: Documentation and polish
- **Week 9**: Release

See [spec.md](./specs/spec.md) for detailed implementation plan.

## Contributing

This package is currently in specification phase. Contributions will be welcome once implementation begins.

## License

MIT

## Related Packages

- [@xec-sh/core](../core) - Core execution engine
- [@xec-sh/kit](../kit) - UI and logging utilities
- [@xec-sh/cli](../../apps/xec) - Command-line interface

---

**Note**: This package is under active development. API is subject to change.
