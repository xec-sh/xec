---
title: Hot Reload Development Workflows
description: Implement hot reload and live development workflows using Xec
keywords: [development, hot reload, watch, live reload, dev server]
source_files:
  - apps/xec/src/commands/watch.ts
  - packages/loader/src/watch/file-watcher.ts
---

# Hot Reload Development Workflows {#hot-reload-development-workflows}

## Problem {#problem}

Setting up efficient development workflows with automatic rebuilding, hot module replacement, and synchronized browser reload across multiple services and environments.

## Solution {#solution}

Xec provides integrated file watching and command execution capabilities, while the selected development server owns HMR and backend restarts. Use the shared Xec watcher for additional build steps rather than introducing a second watcher or reload protocol.

## Quick Example {#quick-example}

```typescript
// The package scripts own their framework's HMR/restart behavior.
// Xec awaits both programs and propagates failure and cancellation.
await $.parallel.all([
  $`npm run dev:frontend`,
  $`npm run dev:backend`
], { maxConcurrency: 2 });
```

## Complete Hot Reload Recipes {#complete-hot-reload-recipes}

### Configuration {#configuration}

```yaml
version: '1.0'
tasks:
  dev:
    description: Start the project development servers
    command: xec run scripts/dev-server.ts
  watch-assets:
    description: Rebuild additional assets through Xec's shared watcher
    command: xec watch local "src/assets/**/*" --command "npm run build:assets"
```

### Full-Stack Development Server {#full-stack-development-server}

```typescript
// scripts/dev-server.ts
import { $ } from '@xec-sh/core';

// Vite/React/your backend runtime own HMR and process replacement. Xec does not
// create another WebSocket protocol or rewrite the application's configuration.
// Define these scripts in package.json before starting this orchestrator.
await $.parallel.all([
  $`npm run dev:frontend`,
  $`npm run dev:backend`,
  $`xec watch local "src/assets/**/*" --command "npm run build:assets"`
], { maxConcurrency: 3 });
```

### Mobile Development Hot Reload {#mobile-development-hot-reload}

```typescript
// Let the project's installed mobile toolchain own hot reload and device selection.
// Start the desired emulator separately; do not start every device implicitly.
const platform = args[0];
if (platform === 'react-native') {
  await $`npm run dev:mobile`;
} else if (platform === 'flutter') {
  await $`flutter run --hot`;
} else {
  throw new Error('Select react-native or flutter');
}
```

## Usage Examples {#usage-examples}

```bash
# Start full development environment
xec dev

# Watch specific files
xec watch local "src/**/*.ts" --command "npm run build"

# Run the full-stack script directly
xec run scripts/dev-server.ts

# Mobile development
xec run scripts/mobile-dev.ts react-native
```

## Best Practices {#best-practices}

1. **Use file watching efficiently** with proper ignore patterns
2. **Debounce rapid changes** to avoid excessive rebuilds
3. **Implement graceful shutdown** for all processes
4. **Use hot module replacement** when possible
5. **Separate build and serve** processes
6. **Monitor memory usage** during long dev sessions
7. **Cache dependencies** for faster rebuilds

## Troubleshooting {#troubleshooting}

### Port Already in Use {#port-already-in-use}

Inspect the listener and the configured server port. Stop only the development process you own, or select another port through that server's configuration.

```bash
lsof -i :3000
```

### Hot Reload Not Working {#hot-reload-not-working}

Check the development server's output first. Confirm the watched path, ignored directories and whether the tool expects a full restart or supports HMR. Use Xec's watcher for files outside that framework's watch graph; avoid two tools rebuilding the same output directory.

## Related Topics {#related-topics}

- [Database Setup](database-setup.md)
- [API Mocking](api-mocking.md)
- [Test Data Generation](test-data.md)
- [Docker Development](../deployment/docker-deploy.md)