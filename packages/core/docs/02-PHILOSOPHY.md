# 02. Philosophy and Design Principles

## Core Philosophy

Xec Core is built on the belief that infrastructure automation should be **simple for simple tasks** and **powerful for complex ones**. We believe in the power of composition, transparency, and progressive complexity.

## Key Principles

### 1. Composability Above All

At the heart of Xec is the concept of operations as functions. Everything is a composable operation of type `Op<T>` that can be freely combined.

```typescript
// Simple operations combine into complex ones
const deploy = compose(
  backup(),
  stopService(),
  updateCode(),
  startService(),
  healthCheck()
);
```

**Why this matters:**
- Code reuse at the function level
- Easy testing of individual components
- Creating operation libraries
- No "vendor lock-in" at the abstraction level

### 2. Transparency and Control

The user can always see what any operation does and override its behavior if needed.

```typescript
// Can override any operation from stdlib
xec.override('system', 'update', () => 
  chain(
    log('Using custom update procedure'),
    sh('apt update && apt upgrade -y')
  )
);
```

**Transparency principles:**
- No hidden "magic"
- All operations have source code
- Can replace any part of the system
- Debugging at the level of regular JavaScript

### 3. Progressive Complexity Disclosure

The system is designed to be easy to start with, with capabilities revealed gradually.

```typescript
// Level 1: Simple shell script
await sh`npm install && npm test`;

// Level 2: With error handling
await try(
  sh`npm install && npm test`,
  () => log('Tests failed, but continuing...')
);

// Level 3: With conditions and variables
await when(
  ctx => ctx.vars.runTests,
  chain(
    sh`npm install`,
    retry(sh`npm test`, { attempts: 3 })
  )
);

// Level 4: Full orchestration
await recipe('test-suite')
  .phase('prepare', parallel(
    task('install-deps', sh`npm install`),
    task('setup-db', sh`docker-compose up -d`)
  ))
  .phase('test', sequence(
    task('unit-tests', sh`npm run test:unit`),
    task('integration-tests', sh`npm run test:integration`)
  ))
  .build();
```

### 4. Zero Configuration

The system works out of the box with sensible defaults. Configuration is added only when customization is needed.

```typescript
// Minimal working example
import { sh } from '@xec-js/core';
await sh`echo "Hello, World!"`;

// With configuration when needed
const xec = new Xec({
  logger: customLogger,
  dryRun: true,
  hosts: [...]
});
```

### 5. Batteries Included

Built-in functionality for typical DevOps tasks eliminates the need to reinvent the wheel.

**What's included:**
- Deployment patterns (Blue-Green, Canary, Rolling)
- Service and package management
- File and template operations
- HTTP client and API work
- Git operations
- Docker and Kubernetes integration

### 6. TypeScript First

Full TypeScript support ensures type safety and excellent Developer Experience.

```typescript
// Autocomplete and type checking out of the box
recipe('deploy')
  .vars({
    version: { type: 'string', required: true },
    replicas: { type: 'number', min: 1, max: 10 }
  })
  .task('scale', async ({ vars }) => {
    // vars.version - string
    // vars.replicas - number
    // TypeScript knows the types!
  });
```

### 7. Testability by Design

Every component is designed with testing in mind.

```typescript
// Easy to test with mocks
const result = await deploy
  .mock({
    commands: {
      'git pull': { stdout: 'Already up to date.' },
      'npm test': { exitCode: 0 }
    }
  })
  .run();

expect(result.success).toBe(true);
```

### 8. npm Ecosystem

Using the standard JavaScript/npm ecosystem for module distribution.

```typescript
// Installing a module
npm install @xec-community/aws

// Using it
import awsModule from '@xec-community/aws';
xec.use(awsModule);
```

## Architectural Decisions

### Functional Approach

Preference for functional style:
- Immutability where possible
- Pure functions
- Composition over inheritance
- Monadic patterns for error handling

### Async Everywhere

All operations are asynchronous by default:
- Natural I/O handling
- Parallel execution
- Operation cancellation
- Proper error handling

### Context via AsyncLocalStorage

Using modern Node.js capabilities for implicit context passing:
- Clean API without "prop drilling"
- Context isolation
- async/await compatibility

### Extensibility through Plugins

The plugin system allows:
- Adding new functionality
- Integrating with external systems
- Modifying core behavior
- Creating an ecosystem of extensions

## Anti-patterns We Avoid

### 1. Over-abstraction

❌ **Bad**: Creating abstractions "just in case"
```yaml
# Too many levels of abstraction
abstractions:
  providers:
    clouds:
      aws:
        services:
          compute:
            ec2:
              instances:
                web:
                  type: t3.micro
```

✅ **Good**: Straightforward approach
```typescript
await aws.ec2.launch({ type: 't3.micro', name: 'web' });
```

### 2. DSL-itis

❌ **Bad**: Creating a new language for everything
```
DEPLOY APPLICATION myapp
  WITH VERSION 2.0.0
  TO ENVIRONMENT production
  USING STRATEGY blue-green
  WHEN health-check PASSES
END DEPLOY
```

✅ **Good**: Using host language capabilities
```typescript
await deploy('myapp', {
  version: '2.0.0',
  environment: 'production',
  strategy: 'blue-green',
  healthCheck: () => checkHealth()
});
```

### 3. Hidden State

❌ **Bad**: Global mutable state
```typescript
global.currentHost = 'web1';
runCommand('ls'); // Implicitly uses global.currentHost
```

✅ **Good**: Explicit context passing
```typescript
await on('web1', sh`ls`);
```

### 4. Vendor Lock-in

❌ **Bad**: Binding to specific formats
```typescript
// Can only use with our format
xec.loadXecfile('./Xecfile.xec');
```

✅ **Good**: Standard approaches
```typescript
// Regular JavaScript/TypeScript
import { deploy } from './deploy.js';
await deploy();
```

## Community Principles

### Open Source First
- All core components are open
- Transparent development process
- Contributions are welcome

### Documentation Driven Development
- Documentation is written alongside code
- Examples for every function
- Educational materials

### Backwards Compatibility
- Semantic versioning
- Deprecation warnings
- Migration guides

### Performance Matters
- Benchmarks for critical paths
- Optimization without complicating API
- Profiling and monitoring

## Impact on API Design

These principles directly influence API design:

1. **Methods over configuration**: `.retry(3)` instead of `{ retry: { count: 3 } }`
2. **Functions over strings**: `when(ctx => ctx.prod)` instead of `when: "{{ prod }}"`
3. **Composition over flags**: `parallel(a, b)` instead of `{ parallel: true }`
4. **Types over validation**: TypeScript checks at compile time

## Conclusion

Xec Core's philosophy aims to create a tool that is:
- **Simple** to start using
- **Powerful** for solving complex tasks
- **Transparent** in its operation
- **Extensible** by the community

These principles are not just words, but a guide for action when making any architectural decisions in the project.