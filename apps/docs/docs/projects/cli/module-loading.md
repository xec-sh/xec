---
sidebar_position: 5
---

# Module Loading & Dependencies

Xec provides a sophisticated module loading system that allows scripts and dynamic commands to import dependencies from various sources without requiring local installation.

## Overview

The Xec module loader provides:
- **Transparent CDN fallback** - Automatically loads modules from CDN when not available locally
- **Multiple package sources** - Support for npm, JSR, and various CDNs
- **TypeScript support** - Direct execution of TypeScript files
- **Intelligent caching** - Fast subsequent loads with automatic cache management
- **Zero configuration** - Works out of the box

## Basic Usage

### In Xec Scripts

When writing Xec scripts, you can import modules using standard ES module syntax:

```javascript
// script.js
import chalk from 'chalk';
import dayjs from 'dayjs';
import { $ } from '@xec-sh/core';

// Use the imported modules
console.log(chalk.green('Build started at'), dayjs().format('HH:mm:ss'));
await $`npm run build`;
```

### In Dynamic Commands

Dynamic commands in `.xec/commands/` can also use module imports:

```typescript
// .xec/commands/deploy.ts
import type { Command } from 'commander';
import ora from 'ora';
import { $ } from '@xec-sh/core';

export function command(program: Command): void {
  program
    .command('deploy')
    .description('Deploy the application')
    .action(async () => {
      const spinner = ora('Deploying...').start();
      
      try {
        await $`npm run build`;
        await $`rsync -avz dist/ server:/var/www/`;
        spinner.succeed('Deployed successfully');
      } catch (error) {
        spinner.fail('Deployment failed');
        throw error;
      }
    });
}
```

## Module Sources

### NPM Packages

Standard npm packages can be imported directly:

```javascript
// Automatically resolved from local node_modules or CDN
import lodash from 'lodash';
import axios from 'axios';
import { format } from 'date-fns';
```

### Explicit Source Specification

You can explicitly specify the source using prefixes:

```javascript
// Force loading from npm/CDN
import chalk from 'npm:chalk';
import lodash from 'npm:lodash@4.17.21';

// Load from JSR (JavaScript Registry)
import { encode } from 'jsr:@std/encoding';

// Direct CDN URLs
import confetti from 'https://esm.sh/canvas-confetti@1.6.0';
```

### CDN Sources

Xec supports multiple CDNs:
- **esm.sh** (default) - Optimized ESM bundles
- **unpkg** - Raw npm packages
- **skypack** - Optimized for browsers
- **jsdelivr** - Fast global CDN

## Global Module Context

Xec provides a global module context with helper functions:

```javascript
// Available in all Xec scripts
const dayjs = await globalThis.__xecModuleContext.importNPM('dayjs');
const encoding = await globalThis.__xecModuleContext.importJSR('@std/encoding@0.224.0');
const customLib = await globalThis.__xecModuleContext.import('my-custom-lib');
```

## Caching

### Automatic Caching

Modules are automatically cached for performance:
- **Memory cache** - Fast access during script execution
- **File cache** - Persistent cache across executions
- **7-day expiration** - Automatic refresh of stale modules

### Cache Management

Use the `xec cache` command to manage the module cache:

```bash
# View cache statistics
xec cache stats

# Clear all cached modules
xec cache clear

# Preload modules into cache
xec cache preload chalk dayjs lodash

# Use custom cache directory
xec cache clear --cache-dir ~/.my-cache
```

## TypeScript Support

TypeScript files are automatically transpiled:

```typescript
// script.ts
import { z } from 'zod';
import type { Config } from './types';

const configSchema = z.object({
  port: z.number(),
  host: z.string()
});

async function main(config: Config) {
  // TypeScript code with full type safety
  const validated = configSchema.parse(config);
  console.log(`Server: ${validated.host}:${validated.port}`);
}
```

## Error Handling

The module loader provides clear error messages:

```javascript
try {
  // If module fails to load from all sources
  import unknownModule from 'unknown-module';
} catch (error) {
  // Error: Failed to import module 'unknown-module' from CDN
}
```

## Performance Optimization

### Preloading

Preload commonly used modules for faster execution:

```bash
# Preload modules at project setup
xec cache preload chalk ora dayjs lodash zod

# Your scripts will load these instantly
xec deploy.js
```

### Bundle Mode

For frequently used modules, the loader automatically uses bundled versions from esm.sh:

```javascript
// Automatically uses ?bundle parameter for self-contained loading
import React from 'react';  // Loaded as https://esm.sh/react?bundle
```

## Configuration

### Environment Variables

```bash
# Enable verbose logging
XEC_DEBUG=true xec script.js

# Use specific CDN
XEC_MODULE_CDN=unpkg xec script.js

# Custom cache directory
XEC_CACHE_DIR=/tmp/xec-cache xec script.js
```

### Programmatic Configuration

```javascript
// In your script
import { getModuleLoader } from '@xec-sh/cli/utils';

const loader = getModuleLoader({
  preferredCDN: 'jsdelivr',
  cache: true,
  verbose: true
});

// Custom import
const customModule = await loader.importModule('my-module');
```

## Common Patterns

### Loading UI Libraries

```javascript
// Terminal UI components
import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';

const spinner = ora('Processing...').start();
const answer = await inquirer.prompt([{
  type: 'confirm',
  name: 'continue',
  message: 'Continue deployment?'
}]);
```

### Data Processing

```javascript
// Data manipulation libraries
import _ from 'lodash';
import dayjs from 'dayjs';
import { parse } from 'csv-parse/sync';

const data = await $`cat data.csv`.text();
const records = parse(data, { columns: true });
const grouped = _.groupBy(records, 'category');
```

### HTTP Requests

```javascript
// HTTP client libraries
import axios from 'axios';
import got from 'got';

const response = await axios.get('https://api.example.com/data');
const data = await got('https://api.example.com/data').json();
```

## Limitations

1. **Binary Dependencies** - Modules with native bindings may not work via CDN
2. **Large Modules** - Very large modules may take time to download initially
3. **Private Packages** - Private npm packages require local installation

## Best Practices

1. **Use Version Pinning** - Specify exact versions for consistency:
   ```javascript
   import chalk from 'npm:chalk@5.3.0';
   ```

2. **Preload Common Modules** - Cache frequently used modules:
   ```bash
   xec cache preload $(cat .xec/common-modules.txt)
   ```

3. **Handle Load Failures** - Provide fallbacks for critical modules:
   ```javascript
   let chalk;
   try {
     chalk = await import('chalk');
   } catch {
     // Fallback to no colors
     chalk = { green: (s) => s, red: (s) => s };
   }
   ```

4. **Local Development** - Keep node_modules for IDE support:
   ```json
   // package.json
   {
     "devDependencies": {
       "chalk": "^5.3.0",
       "@types/node": "^20.0.0"
     }
   }
   ```

## Troubleshooting

### Module Not Found

```bash
# Check if module exists on npm
npm view <module-name>

# Try explicit source
import module from 'npm:<module-name>';

# Check cache
xec cache stats
```

### TypeScript Errors

```bash
# Ensure TypeScript support
xec --version  # Should show TypeScript support

# Check for syntax errors
npx tsc --noEmit script.ts
```

### Network Issues

```bash
# Use different CDN
XEC_MODULE_CDN=unpkg xec script.js

# Disable cache for fresh download
xec cache clear && xec script.js
```

## See Also

- [Custom Commands](./custom-commands.md) - Creating dynamic commands
- [Script Execution](./advanced-features.md#script-execution-system) - Running scripts
- [Performance Optimization](./performance-optimization.md) - Speed tips