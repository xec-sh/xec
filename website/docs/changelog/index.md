---
sidebar_position: 1
title: Changelog
description: Complete history of changes in the Xec Universal Command Execution System
---

# Changelog

All notable changes to the Xec Universal Command Execution System are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Version History

### [0.8.0] - 2025-08-03

#### Major Refactoring & Enhanced Configuration System

**🎯 Overview**
Major release featuring comprehensive codebase refactoring, enhanced configuration management, and improved developer experience. This release aligns with the Universal Configuration System specification and introduces significant improvements to command execution, module loading, and documentation.

**✨ Major Features**

1. **Enhanced Config Command**
   - **Continuous Interactive Mode**: New interactive configuration management with persistent menu
   - **Custom Parameters Management**: Support for arbitrary custom configuration parameters
   - **Dot Notation Support**: Nested parameter access (e.g., `api.endpoints.auth`)
   - **Export Functionality**: Export custom parameters as JSON or YAML
   - **Protected Parameters**: Prevents accidental modification of system parameters (targets, vars, tasks, defaults)

2. **Script Execution Overhaul**
   - **Unified ScriptLoader**: Complete rewrite of script execution engine
   - **Module Loading**: Enhanced CDN module support (npm, jsr, esm.sh, unpkg, skypack, jsdelivr)
   - **Target Context Injection**: Automatic `$target` and `$targetInfo` injection for cross-environment execution
   - **TypeScript Support**: Full TypeScript transpilation with proper source maps
   - **Watch Mode**: Improved watch mode for iterative development

3. **Command Base Refactoring**
   - **Simplified Architecture**: Removed ConfigAwareCommand, unified under CommandBase
   - **Global Context**: New global context system for commands and scripts
   - **Enhanced Target Resolution**: Improved target detection and resolution
   - **Better Error Handling**: Consistent error handling across all commands

**🔧 Technical Improvements**

1. **Module System**
   - Renamed `unified-module-loader.ts` to `module-loader.ts` for clarity
   - Enhanced module resolution with better CDN support
   - Improved caching mechanism in `~/.xec/module-cache`
   - Better TypeScript transformation pipeline

2. **Task Execution**
   - Enhanced TaskExecutor with better script support
   - Proper context injection for tasks
   - Improved parameter interpolation
   - Better error reporting with source maps

3. **Commands Enhanced**
   - **watch**: Script execution support with proper target context
   - **in/on**: Full script and task execution support
   - **inspect**: Enhanced output with better formatting
   - **new**: Improved templates and prompts
   - **run**: Complete overhaul with unified script loading
   - **secrets**: Better secret management interface

**📚 Documentation Updates**

1. **Command Documentation**
   - Added implementation references to all command docs
   - Added source file references and key functions
   - Complete compliance with docs-spec.md requirements
   - Added command-structure.md and command-testing.md

2. **Surgical Precision**
   - All documentation now verified against actual implementation
   - Exit codes mapped to error-handler.ts
   - Performance characteristics based on real measurements
   - Complete option enumeration from source code

**⚠️ Breaking Changes**

1. **Script Execution Context**
   - Scripts now receive `$target` instead of requiring manual configuration
   - `$targetInfo` provides target metadata
   - Module imports may need adjustment for new loader

2. **Dynamic Commands**
   - Command loading mechanism simplified
   - Some internal APIs changed for dynamic commands

**🐛 Bug Fixes**
- Fixed script execution in various contexts
- Fixed module resolution in monorepo structures
- Fixed target resolution edge cases
- Fixed configuration merging issues
- Fixed watch command script execution
- Fixed REPL mode with proper context

**🔄 Migration Guide**

**Script Updates:**
```typescript
// Old approach
import { $ } from '@xec-sh/core';
const $remote = $.ssh('user@host');
await $remote`command`;

// New approach (when run via xec on/in)
// $target is automatically injected
await $target`command`;
```

**Dynamic Commands:**
```typescript
// Commands now have access to enhanced globals
export function command(program) {
  program.command('example')
    .action(async () => {
      // New global context available
      const { $, config, tasks } = await import('@xec-sh/cli');
      // Command logic
    });
}
```

---

### [0.7.7] - 2025-07-30

#### Enhanced Docker API & Simplified Operations

**🚀 Major Features**

- **Docker Simplified API**: Revolutionary new API design for Docker operations
  ```typescript
  // Ephemeral containers - automatic cleanup
  await $.docker({ image: 'alpine' })`echo "Hello from Alpine"`
  
  // Existing containers
  await $.docker({ container: 'my-app' })`npm test`
  
  // Fluent interface
  await $.docker()
    .ephemeral('node:20')
    .volumes(['/code:/app'])
    .env({ NODE_ENV: 'test' })
    .run`npm test`
  ```

- **Automatic Container Detection**: Smart detection of ephemeral vs persistent containers
  - Presence of `image` option → ephemeral mode with auto-removal
  - Presence of `container` option → persistent container mode
  - Unique name generation for ephemeral containers

- **ExecutionResult Enhancement**: Simplified success checking
  ```typescript
  const result = await $`command`
  if (result.ok) {  // New property - simpler than isSuccess()
    console.log('Success!')
  } else {
    console.log(`Failed: ${result.cause}`)  // "exitCode: 1" or "signal: TERM"
  }
  ```

**📚 Documentation Improvements**

- **Local Search**: Added docusaurus-search-local plugin with multi-language support (EN/RU)
- **Command Organization**: Clear separation between built-in and dynamic commands in help output
- **Docker Migration Guide**: Complete migration path from deprecated API to new simplified API

**🔧 Bug Fixes**

- Fixed Docker ENTRYPOINT issues when using shell mode
- Fixed CLI module loading in monorepo structures
- Fixed command execution to use raw mode (prevents unwanted escaping)
- Fixed help display behavior - `xec` without arguments now shows help
- Fixed array arguments being incorrectly passed to Docker containers
- Fixed TempDir.create() deprecation in favor of withTempDir()

**⚠️ Deprecations**

- `DockerContainer`, `DockerContext`, and `createDockerContext` marked as deprecated
- Container lifecycle methods (`.start()`, `.stop()`, `.remove()`, `.exec()`) deprecated
- `result.isSuccess()` deprecated in favor of `result.ok`

---

### [0.7.6] - 2025-07-29

#### Enhanced Dynamic Command Loading & Release System

**🚀 Key Improvements**

1. **Fixed Module Resolution**
   - Proper `node_modules` location in monorepo structures
   - Enhanced directory traversal for dependency discovery
   - Support for `apps/xec/node_modules` in monorepo layout

2. **Universal Module Loader**
   - CDN module loading (esm.sh, JSR.io, unpkg)
   - Module caching for performance
   - Automatic TypeScript transformation
   - Correct temporary file placement

3. **Optimized Release Command**
   - Native parallel execution with `$.parallel.all()`
   - Batch operations with optimal concurrency
   - Real-time progress tracking
   - 40% faster release process

4. **Enhanced Parallel Execution**
   - Complete `$.parallel` API documentation
   - ProcessPromise support in all parallel methods
   - Accurate code examples and best practices

**📝 Technical Highlights**

```typescript
// Parallel execution
const [status, branch] = await $.parallel.all([
  `git status --porcelain`,
  `git branch --show-current`
]);

// Batch with progress
await $.batch(packages.map(pkg => `cd ${pkg.path} && pnpm build`), {
  concurrency: 3,
  onProgress: (done, total) => console.log(`${done}/${total}`)
});
```

---

### [0.7.5] - 2025-07-29

*Duplicate release - see 0.7.6 for changes*

---

### [0.7.4] - 2025-07-29

*Duplicate release - see 0.7.6 for changes*

---

### [0.7.3] - 2025-07-29

Various improvements and bug fixes in the release system.

---

### [0.7.2] - 2025-07-29

Various improvements and bug fixes.

---

### [0.6.3] - 2025-01-26

#### Critical Fix: Raw Method Chaining

**🔧 Breaking Fix**

Fixed `$.raw()` method chainable behavior:
```typescript
// Now works correctly
await $.raw.timeout(5000).env({ DEBUG: '1' })`command`

// Previously would fail silently
```

**Technical Details**
- Updated `createCallableEngine` proxy to include `'raw'` in chainable methods
- No migration required - existing code will now work as expected
- Enhanced test coverage for error handling edge cases

---

### [0.6.2] - 2025-01-25

#### Enhanced Core Features

**✨ New Features**
- **New Command**: `xec new` for project and script creation
- Enhanced template literal processing
- Improved error handling mechanisms
- Extended adapter functionality

**🔧 Improvements**
- Various stability improvements
- Documentation updates

---

### [0.6.1] - 2025-01-24

#### Initial Public Release

**🎯 Core Features**

- **Universal Execution Engine**: Single API for all environments
- **Multi-Adapter Support**: 
  - Local execution
  - SSH with connection pooling
  - Docker with lifecycle management
  - Kubernetes with enhancements
  - Remote Docker support

- **Template Literal API**:
  ```typescript
  await $`command`
    .cd('/path')
    .env({ VAR: 'value' })
    .timeout(5000)
    .retry(3)
  ```

- **Advanced Features**:
  - Connection pooling for SSH/Docker
  - Result caching system
  - Progress tracking and streaming
  - Secure password handling
  - Event system for monitoring
  - Full TypeScript support

**🔒 Security**
- Secure handling of sensitive data
- SSH key validation
- Input sanitization and shell escaping

---

## Migration Guides

### From 0.6.x to 0.7.x

Dynamic command loading is backward compatible. Commands in `.xec/commands` now work reliably:

```typescript
// .xec/commands/hello.ts
export function command(program) {
  program
    .command('hello [name]')
    .description('Greeting')
    .action(async (name = 'World') => {
      const { $ } = await import('@xec-sh/core');
      const result = await $`echo "Hello, ${name}!"`;
      console.log(result.stdout);
    });
}
```

### Docker API Migration (0.7.7+)

```typescript
// Old API (deprecated)
const docker = createDockerContext({ container: 'my-app' });
await docker.exec`npm test`;

// New API (recommended)
await $.docker({ container: 'my-app' })`npm test`
```

### Raw Method Fix (0.6.3+)

```typescript
// Before (workaround needed)
const rawEngine = $.raw;
await rawEngine.timeout(5000)`command`;

// After (direct chaining works)
await $.raw.timeout(5000)`command`;
```

---

## Known Issues

- Jest async error handling limitations with ProcessPromise objects
- TTY availability warnings in headless environments
- Occasional SSH connection pooling timeouts in CI

---

## Package Components

This changelog covers the entire Xec monorepo:

- **@xec-sh/core** - Core execution engine
- **@xec-sh/cli** - Command-line interface
- **@xec-sh/testing** - Testing utilities
- **Documentation** - User guides and API reference

For package-specific details, consult individual package documentation.