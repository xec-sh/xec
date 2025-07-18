# 07. DSL Reference

## Overview

Xec Core provides an expressive Domain Specific Language (DSL) for creating automation tasks. The DSL is built on fluent interface and method chaining principles, providing readable and intuitive syntax.

## Core DSL Concepts

### 1. Builder Pattern

All core components (Task, Recipe, Phase) are created through builders:

```typescript
// Task builder
const task = task('name')
  .description('Task description')
  .run(handler)
  .build();

// Recipe builder  
const recipe = recipe('name')
  .version('1.0.0')
  .task('task1', task1)
  .build();
```

### 2. Method Chaining

Methods return `this`, allowing call chaining:

```typescript
const deployment = recipe('deploy')
  .version('1.0.0')
  .description('Application deployment')
  .vars({
    environment: { required: true },
    version: { required: true }
  })
  .phase('prepare', preparePhase)
  .phase('deploy', deployPhase)
  .phase('verify', verifyPhase)
  .build();
```

### 3. Inline Definitions

Many components can be defined inline:

```typescript
recipe('example')
  .task('inline-task', task()
    .run(async ({ $ }) => {
      await $`echo "Hello, World!"`;
    })
  )
  .build();
```

## Task DSL

### Creating Tasks

#### Basic Syntax

```typescript
import { task } from '@xec-js/core';

const myTask = task('task-name')
  .description('What this task does')
  .run(async (context) => {
    // Task implementation
  })
  .build();
```

#### Complete Example

```typescript
const deployApp = task('deploy-application')
  .description('Deploy application to production')
  
  // Variables with validation
  .vars({
    version: {
      type: 'string',
      required: true,
      pattern: /^\d+\.\d+\.\d+$/
    },
    replicas: {
      type: 'number',
      default: 3,
      min: 1,
      max: 10
    },
    environment: {
      type: 'string',
      enum: ['dev', 'staging', 'production'],
      required: true
    }
  })
  
  // Conditional execution
  .when(ctx => ctx.vars.environment === 'production')
  
  // Retry settings
  .retry({
    attempts: 3,
    delay: 5000,
    backoff: 'exponential'
  })
  
  // Timeout
  .timeout(300000) // 5 minutes
  
  // Dependencies
  .dependsOn('prepare-environment', 'backup-current')
  
  // Tags
  .tags('deployment', 'critical')
  
  // Target hosts
  .host(h => h.tags.includes('web'))
  
  // Parallel execution on hosts
  .parallel()
  
  // Hooks
  .before(async (ctx) => {
    ctx.logger.info('Starting deployment');
  })
  
  .after(async (ctx, result) => {
    ctx.logger.info(`Deployment completed: ${result}`);
  })
  
  .onError(async (error, ctx) => {
    await notifyOps(error);
    return false; // Stop execution
  })
  
  // Main handler
  .run(async ({ $, vars, host }) => {
    await $`docker pull myapp:${vars.version}`;
    await $`docker stop myapp || true`;
    await $`docker run -d --name myapp myapp:${vars.version}`;
    
    return {
      deployed: true,
      version: vars.version,
      host: host.name
    };
  })
  
  .build();
```

### Shorthand Forms

#### Shell Commands

```typescript
import { shell } from '@xec-js/core';

// Simple command
const update = shell('apt-get update');

// With template strings
const deploy = shell`docker run -d ${image}:${tag}`;

// With context variable interpolation
const install = shell('npm install {{package}}');
```

#### Scripts

```typescript
import { script } from '@xec-js/core';

// Run external script
const migrate = script('./scripts/migrate.sh');

// With arguments
const backup = script('./backup.sh', ['--full', '--compress']);

// With environment variables
const test = script('./test.sh', [], {
  env: { NODE_ENV: 'test' }
});
```

### Task Composition

#### Parallel Execution

```typescript
import { parallel } from '@xec-js/core';

const setupEnvironment = parallel(
  task('install-deps', installDependencies),
  task('create-dirs', createDirectories),
  task('copy-configs', copyConfigs)
);

// Inline definition
const prepare = parallel(
  shell`npm install`,
  shell`pip install -r requirements.txt`,
  shell`bundle install`
);
```

#### Sequential Execution

```typescript
import { sequence } from '@xec-js/core';

const deployment = sequence(
  task('stop', stopServices),
  task('update', updateCode),
  task('migrate', runMigrations),
  task('start', startServices)
);
```

#### Grouping

```typescript
import { group } from '@xec-js/core';

const databases = group('setup-databases', [
  task('postgres', setupPostgres),
  task('redis', setupRedis),
  task('elasticsearch', setupElastic)
]);
```

### Conditional Logic

#### Conditional Execution

```typescript
// With function
task('prod-only')
  .when(ctx => ctx.vars.environment === 'production')
  .run(handler);

// With template
task('conditional')
  .when('{{ environment == "production" && deploy_enabled }}')
  .run(handler);
```