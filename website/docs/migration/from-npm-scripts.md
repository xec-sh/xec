---
title: Migrating from npm Scripts
description: Complete guide for migrating from package.json scripts to Xec
keywords: [migration, npm, scripts, package.json, automation]
source_files:
  - apps/xec/src/commands/run.ts
  - packages/ops/src/config/task-manager.ts
  - apps/xec/src/commands/run.ts
---

# Migrating from npm Scripts to Xec {#migrating-from-npm-scripts-to-xec}

## Overview {#overview}

This guide helps you migrate from npm scripts in `package.json` to Xec's more powerful task and script system. Xec provides better cross-platform compatibility, parallel execution, environment management, and TypeScript support while maintaining the simplicity of npm scripts.

## Why Migrate to Xec? {#why-migrate-to-xec}

### Limitations of npm Scripts {#limitations-of-npm-scripts}

```json
{
  "scripts": {
    "build": "webpack --mode production",
    "deploy": "npm run build && scp -r dist/ user@server:/app/",
    "complex": "node scripts/task1.js && node scripts/task2.js || echo 'Failed'"
  }
}
```

**Problems:**
- Platform-specific commands (Windows vs Unix)
- Limited error handling
- No built-in parallelization
- String concatenation for complex tasks
- No TypeScript support
- Poor IDE integration

### Xec Advantages {#xec-advantages}

```yaml
# .xec/config.yaml
tasks:
  build:
    command: webpack --mode production
    timeout: 5m

  deploy:
    steps:
      - name: Build
        command: xec build
      - name: Upload
        targets: production-server
        command: xec copy dist/ /app/
    parallel: false
```

**Benefits:**
- Cross-platform compatibility
- Structured error handling
- Native parallel execution
- TypeScript scripts with type safety
- Multi-environment support
- Better debugging and logging

## Migration Strategies {#migration-strategies}

### Strategy 1: Gradual Migration {#strategy-1-gradual-migration}

Keep npm scripts while gradually moving to Xec:

```json
{
  "scripts": {
    "build": "xec build",
    "test": "xec test",
    "deploy": "npm run build && npm run upload",
    "upload": "xec deploy production"
  }
}
```

### Strategy 2: Full Migration {#strategy-2-full-migration}

Replace all npm scripts with Xec tasks:

```yaml
# .xec/config.yaml
tasks:
  build:
    command: webpack --mode production
  test:
    command: jest --coverage
  deploy:
    needs: [build, test]
    command: xec deploy production
```

## Common Patterns Migration {#common-patterns-migration}

### 1. Simple Commands {#1-simple-commands}

**npm Script:**
```json
{
  "scripts": {
    "clean": "rm -rf dist",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

**Xec Equivalent:**
```yaml
# .xec/config.yaml
tasks:
  clean:
    # Cross-platform: avoids depending on a Unix shell for `rm -rf`
    command: xec -e "const fs = await import('node:fs/promises'); await fs.rm('dist', { recursive: true, force: true })"

  lint:
    command: eslint src/**/*.ts

  format:
    command: prettier --write src/**/*.ts
```

**Or as Xec Script:**
```typescript
// scripts/clean.ts
import { $ } from '@xec-sh/core';
import { rm } from 'fs/promises';

// Cross-platform clean
await rm('dist', { recursive: true, force: true });
console.log('✅ Cleaned dist directory');
```

### 2. Sequential Commands {#2-sequential-commands}

**npm Script:**
```json
{
  "scripts": {
    "build:all": "npm run clean && npm run compile && npm run bundle"
  }
}
```

**Xec Task:**
```yaml
tasks:
  build:all:
    steps:
      - name: Clean
        command: xec clean
      - name: Compile
        command: tsc
      - name: Bundle
        command: webpack
```

**Xec Script:**
```typescript
// scripts/build-all.ts
import { $ } from '@xec-sh/core';

console.log('🧹 Cleaning...');
await $`rm -rf dist`;

console.log('📦 Compiling...');
await $`tsc`;

console.log('🎁 Bundling...');
await $`webpack`;

console.log('✅ Build complete!');
```

### 3. Parallel Commands {#3-parallel-commands}

**npm Script (Limited):**
```json
{
  "scripts": {
    "dev": "concurrently \"npm run watch:ts\" \"npm run watch:css\" \"npm run serve\""
  }
}
```

**Xec Task:**
```yaml
tasks:
  dev:
    parallel: true
    steps:
      - name: Watch TypeScript
        command: tsc --watch
      - name: Watch CSS
        command: sass --watch src:dist
      - name: Serve
        command: vite dev
```

**Xec Script:**
```typescript
// scripts/dev.ts
import { $ } from '@xec-sh/core';

// Run all commands in parallel
await Promise.all([
  $`tsc --watch`,
  $`sass --watch src:dist`,
  $`vite dev`
]);
```

### 4. Environment Variables {#4-environment-variables}

**npm Script:**
```json
{
  "scripts": {
    "build:prod": "NODE_ENV=production webpack",
    "build:dev": "NODE_ENV=development webpack"
  }
}
```

**Xec Task:**
```yaml
tasks:
  build:
    params:
      - name: env
        default: development
        values: [development, production]
    env:
      NODE_ENV: ${params.env}
    command: webpack
```

**Xec Script:**
```typescript
// scripts/build.ts
import { $ } from '@xec-sh/core';

const env = args[0] || 'development';
process.env.NODE_ENV = env;

await $`webpack`;
console.log(`Built for ${env}`);
```

### 5. Pre/Post Hooks {#5-prepost-hooks}

**npm Script:**
```json
{
  "scripts": {
    "pretest": "npm run lint",
    "test": "jest",
    "posttest": "npm run coverage"
  }
}
```

**Xec Task:**
```yaml
tasks:
  test:
    steps:
      - name: Lint (pre-test)
        command: eslint src/**/*.ts
      - name: Run Tests
        command: jest
      - name: Coverage Report (post-test)
        command: jest --coverage
```

### 6. Cross-Platform Commands {#6-cross-platform-commands}

**npm Script (Platform Issues):**
```json
{
  "scripts": {
    "clean": "rm -rf dist || rmdir /s /q dist",
    "copy": "cp -r src/assets dist/ || xcopy src\\assets dist\\ /E"
  }
}
```

**Xec (Cross-Platform):**
```typescript
// scripts/clean.ts
import { rm } from 'fs/promises';

await rm('dist', { recursive: true, force: true });
```

```typescript
// scripts/copy.ts
import { $ } from '@xec-sh/core';

await $`xec copy src/assets/ dist/assets/`;
// Works on all platforms!
```

## Complex Workflows {#complex-workflows}

### Build and Deploy Pipeline {#build-and-deploy-pipeline}

**npm Scripts:**
```json
{
  "scripts": {
    "prebuild": "npm run clean && npm run lint",
    "build": "webpack --mode production",
    "postbuild": "npm run optimize",
    "predeploy": "npm run test",
    "deploy": "npm run build && npm run upload",
    "upload": "scp -r dist/* user@server:/var/www/",
    "postdeploy": "npm run notify"
  }
}
```

**Xec Configuration:**
```yaml
# .xec/config.yaml
targets:
  production:
    type: ssh
    host: server.example.com
    user: deploy

tasks:
  build:
    description: Build application for production
    steps:
      - name: Clean
        command: rm -rf dist
      - name: Lint
        command: eslint src/**/*.ts
      - name: Compile
        command: webpack --mode production
      - name: Optimize
        command: terser dist/bundle.js -o dist/bundle.min.js

  test:
    command: jest --coverage
    timeout: 5m

  deploy:
    description: Deploy to production
    needs: [test, build]
    steps:
      - name: Upload Files
        command: xec copy dist/ production:/var/www/html/
      - name: Restart Service
        targets: production
        command: systemctl restart nginx
      - name: Notify
        command: xec -e "await notify('Deployment complete!')"
```

**Xec Script Version:**
```typescript
// scripts/deploy.ts
import { $ } from '@xec-sh/core';
import { targets } from '@xec-sh/ops';
const target = args[0] || 'hosts.production';
if (!(await targets.get(target))) throw new Error(`Target not configured: ${target}`);

// Pre-deployment checks
console.log('🔍 Running tests...');
const testResult = await $`jest --coverage`.nothrow();
if (!testResult.ok) {
  console.error('❌ Tests failed!');
  process.exit(1);
}

// Build
console.log('🏗️ Building application...');
await $`rm -rf dist`;
await $`eslint src/**/*.ts`;
await $`webpack --mode production`;
await $`terser dist/bundle.js -o dist/bundle.min.js`;

// Deploy
console.log(`🚀 Deploying to ${target}...`);
await $`xec copy dist/ ${target}:/var/www/html/`;
await targets.exec(target, 'systemctl reload nginx');

// Notify
console.log('✅ Deployment complete!');
await $`curl -X POST https://hooks.slack.com/services/... -d '{"text":"Deployed to ${target}"}'`;
```

## Working with Monorepos {#working-with-monorepos}

**npm Scripts with Lerna/Workspaces:**
```json
{
  "scripts": {
    "build": "lerna run build",
    "test": "lerna run test --parallel",
    "deploy": "lerna run deploy --scope=@myapp/api"
  }
}
```

**Xec Monorepo Support:**
```yaml
# .xec/config.yaml
tasks:
  build:
    description: Build all packages
    parallel: true
    steps:
      - name: Build Core
        cwd: packages/core
        command: npm run build
      - name: Build API
        cwd: packages/api
        command: npm run build
      - name: Build UI
        cwd: packages/ui
        command: npm run build

  test:
    pattern: packages/*/test
    command: npm test
    parallel: true

  deploy:
    params:
      - name: package
        required: true
    cwd: packages/${params.package}
    command: npm run deploy
```

## Migration Checklist {#migration-checklist}

### Phase 1: Setup {#phase-1-setup}
- [ ] Install Xec: `npm install -g @xec-sh/cli`
- [ ] Initialize Xec: `xec new project`
- [ ] Create `.xec/config.yaml`

### Phase 2: Migrate Simple Scripts {#phase-2-migrate-simple-scripts}
- [ ] Identify simple, standalone scripts
- [ ] Create equivalent Xec tasks
- [ ] Test each task individually
- [ ] Update npm scripts to call Xec

### Phase 3: Migrate Complex Workflows {#phase-3-migrate-complex-workflows}
- [ ] Map sequential command chains
- [ ] Convert to Xec step-based tasks
- [ ] Add proper error handling
- [ ] Implement parallel execution where beneficial

### Phase 4: Migrate Environment-Specific Scripts {#phase-4-migrate-environment-specific-scripts}
- [ ] Define targets for different environments
- [ ] Use Xec's environment variable management
- [ ] Create environment-specific configurations

### Phase 5: Complete Migration {#phase-5-complete-migration}
- [ ] Replace all npm scripts with Xec commands
- [ ] Update CI/CD pipelines
- [ ] Update documentation
- [ ] Remove unused dependencies

## Compatibility Bridge {#compatibility-bridge}

Keep npm scripts as aliases during transition:

```json
{
  "scripts": {
    "build": "xec build",
    "test": "xec test",
    "deploy": "xec deploy production",
    "dev": "xec dev",
    "clean": "xec clean"
  }
}
```

This allows team members to use familiar `npm run` commands while leveraging Xec's power underneath.

## Advanced Features After Migration {#advanced-features-after-migration}

### 1. Multi-Target Deployment {#1-multi-target-deployment}
```typescript
// Deploy to multiple servers simultaneously
import { $ } from '@xec-sh/core';

await Promise.all([
  $.ssh('server1')`systemctl restart app`,
  $.ssh('server2')`systemctl restart app`,
  $.ssh('server3')`systemctl restart app`
]);
```

### 2. Conditional Execution {#2-conditional-execution}
```typescript
const branch = await $`git branch --show-current`.text();
if (branch === 'main') {
  await $`xec deploy production`;
} else {
  await $`xec deploy staging`;
}
```

### 3. Interactive Prompts {#3-interactive-prompts}
```typescript
import { confirm, isCancel, cancel } from '@xec-sh/kit';

const proceed = await confirm({
  message: 'Deploy to production?',
  initialValue: false
});
if (isCancel(proceed)) { cancel('Cancelled.'); process.exit(0); }

if (proceed) {
  await $`xec deploy production`;
}
```

### 4. Progress Tracking {#4-progress-tracking}
```typescript
import { spinner } from '@xec-sh/kit';

const spin = spinner();
spin.start('Building application...');

await $`webpack --mode production`;

spin.stop('Build complete!');
```

## Common Gotchas {#common-gotchas}

### 1. Path Differences {#1-path-differences}
- npm scripts run from package.json directory
- Xec runs from project root by default
- Use `cwd` option to change working directory

### 2. Shell Differences {#2-shell-differences}
- npm uses system shell
- Xec uses consistent shell across platforms
- Some shell-specific features may need adjustment

### 3. Environment Variables {#3-environment-variables}
- npm scripts inherit all env vars
- Xec provides controlled environment
- Explicitly pass needed variables

## Getting Help {#getting-help}

- Run `xec new task` for task templates
- Check `xec run --help` for execution options
- Visit [Xec Documentation](https://xec.sh/docs/introduction/)

## Summary {#summary}

Migrating from npm scripts to Xec provides:
- ✅ Better cross-platform support
- ✅ TypeScript with full type safety
- ✅ Parallel execution control
- ✅ Multi-environment deployment
- ✅ Advanced error handling
- ✅ Interactive prompts and progress
- ✅ Structured task management

Start with simple scripts and gradually migrate complex workflows to experience the full power of Xec!