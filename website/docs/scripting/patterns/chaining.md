# Method Chaining Patterns

Xec's fluent API enables elegant method chaining for building complex command pipelines. This guide explores advanced chaining patterns for readable and maintainable scripts.

## Basic Method Chaining

### ProcessPromise Chain Methods

```javascript
import { $ } from '@xec-sh/core';

// Chain multiple modifiers
await $`npm test`
  .quiet()           // Suppress output
  .timeout(30000)    // 30 second timeout
  .cwd('/app')       // Set working directory
  .env({ CI: 'true' }) // Set environment variable
  .nothrow();        // Don't throw on error

// Order doesn't matter for most modifiers
await $`build.sh`
  .env({ NODE_ENV: 'production' })
  .cwd('./project')
  .timeout(60000)
  .verbose()
  .pipe(process.stdout);
```

### Conditional Chaining

```javascript
async function runCommand(cmd, options = {}) {
  let promise = $(cmd);
  
  if (options.quiet) promise = promise.quiet();
  if (options.verbose) promise = promise.verbose();
  if (options.timeout) promise = promise.timeout(options.timeout);
  if (options.cwd) promise = promise.cwd(options.cwd);
  if (options.env) promise = promise.env(options.env);
  if (options.nothrow) promise = promise.nothrow();
  
  return await promise;
}

// Dynamic chaining based on conditions
const isDebug = process.env.DEBUG === 'true';
const isCI = process.env.CI === 'true';

await $`npm test`
  [isDebug ? 'verbose' : 'quiet']()
  .timeout(isCI ? 120000 : 30000)
  .env({ DEBUG: isDebug ? 'true' : 'false' });
```

## Builder Pattern Chains

### Command Builder

```javascript
class CommandChain {
  constructor(command) {
    this.command = command;
    this.options = {};
    this.pipes = [];
    this.transforms = [];
  }
  
  quiet() {
    this.options.quiet = true;
    return this;
  }
  
  verbose() {
    this.options.verbose = true;
    return this;
  }
  
  timeout(ms) {
    this.options.timeout = ms;
    return this;
  }
  
  cwd(dir) {
    this.options.cwd = dir;
    return this;
  }
  
  env(vars) {
    this.options.env = { ...this.options.env, ...vars };
    return this;
  }
  
  pipe(stream) {
    this.pipes.push(stream);
    return this;
  }
  
  transform(fn) {
    this.transforms.push(fn);
    return this;
  }
  
  retry(times = 3, delay = 1000) {
    this.options.retry = { times, delay };
    return this;
  }
  
  async execute() {
    let attempt = 0;
    const maxAttempts = this.options.retry?.times || 1;
    const retryDelay = this.options.retry?.delay || 1000;
    
    while (attempt < maxAttempts) {
      try {
        let promise = $(this.command);
        
        // Apply options
        if (this.options.quiet) promise = promise.quiet();
        if (this.options.verbose) promise = promise.verbose();
        if (this.options.timeout) promise = promise.timeout(this.options.timeout);
        if (this.options.cwd) promise = promise.cwd(this.options.cwd);
        if (this.options.env) promise = promise.env(this.options.env);
        
        // Apply pipes
        for (const pipe of this.pipes) {
          promise = promise.pipe(pipe);
        }
        
        // Execute
        let result = await promise;
        
        // Apply transforms
        for (const transform of this.transforms) {
          result = await transform(result);
        }
        
        return result;
        
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) throw error;
        
        console.log(`Attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
}

// Usage
const result = await new CommandChain('npm test')
  .timeout(30000)
  .env({ NODE_ENV: 'test' })
  .retry(3, 2000)
  .transform(result => ({
    ...result,
    summary: result.stdout.match(/(\d+) tests passed/)?.[1] || '0'
  }))
  .execute();

console.log(`${result.summary} tests passed`);
```

### Pipeline Builder

```javascript
class PipelineBuilder {
  constructor() {
    this.steps = [];
  }
  
  add(name, command) {
    this.steps.push({ name, command, modifiers: [] });
    return this;
  }
  
  quiet() {
    this.lastStep().modifiers.push('quiet');
    return this;
  }
  
  verbose() {
    this.lastStep().modifiers.push('verbose');
    return this;
  }
  
  timeout(ms) {
    this.lastStep().modifiers.push({ timeout: ms });
    return this;
  }
  
  cwd(dir) {
    this.lastStep().modifiers.push({ cwd: dir });
    return this;
  }
  
  env(vars) {
    this.lastStep().modifiers.push({ env: vars });
    return this;
  }
  
  onError(handler) {
    this.lastStep().errorHandler = handler;
    return this;
  }
  
  onSuccess(handler) {
    this.lastStep().successHandler = handler;
    return this;
  }
  
  parallel(...commands) {
    this.steps.push({
      name: 'parallel',
      commands,
      modifiers: [],
      parallel: true
    });
    return this;
  }
  
  lastStep() {
    return this.steps[this.steps.length - 1];
  }
  
  async execute() {
    const results = [];
    
    for (const step of this.steps) {
      console.log(`⚙️  ${step.name}`);
      
      try {
        let result;
        
        if (step.parallel) {
          // Execute parallel commands
          const promises = step.commands.map(cmd => {
            let promise = $(cmd);
            this.applyModifiers(promise, step.modifiers);
            return promise;
          });
          
          result = await Promise.all(promises);
        } else {
          // Execute single command
          let promise = $(step.command);
          this.applyModifiers(promise, step.modifiers);
          result = await promise;
        }
        
        if (step.successHandler) {
          await step.successHandler(result);
        }
        
        results.push({ step: step.name, success: true, result });
        
      } catch (error) {
        if (step.errorHandler) {
          const handled = await step.errorHandler(error);
          if (handled) {
            results.push({ step: step.name, success: false, handled: true });
            continue;
          }
        }
        
        results.push({ step: step.name, success: false, error });
        throw error;
      }
    }
    
    return results;
  }
  
  applyModifiers(promise, modifiers) {
    for (const modifier of modifiers) {
      if (typeof modifier === 'string') {
        promise = promise[modifier]();
      } else if (typeof modifier === 'object') {
        const [key, value] = Object.entries(modifier)[0];
        promise = promise[key](value);
      }
    }
    return promise;
  }
}

// Usage
const pipeline = new PipelineBuilder()
  .add('clean', 'rm -rf dist').quiet()
  .add('install', 'npm ci').timeout(60000)
  .add('lint', 'npm run lint')
    .onError(error => {
      console.warn('Linting failed, continuing...');
      return true; // Mark as handled
    })
  .parallel(
    'npm run test:unit',
    'npm run test:integration',
    'npm run test:e2e'
  )
  .add('build', 'npm run build')
    .env({ NODE_ENV: 'production' })
    .verbose()
  .add('package', 'npm pack')
    .onSuccess(result => {
      console.log('Package created:', result.stdout);
    });

const results = await pipeline.execute();
```

## Functional Chaining

### Pipe Function Composition

```javascript
const pipe = (...fns) => x => fns.reduce((v, f) => f(v), x);

const withTimeout = (ms) => (promise) => promise.timeout(ms);
const withCwd = (dir) => (promise) => promise.cwd(dir);
const withEnv = (vars) => (promise) => promise.env(vars);
const quiet = (promise) => promise.quiet();
const nothrow = (promise) => promise.nothrow();

// Compose modifiers
const testCommand = pipe(
  withTimeout(30000),
  withCwd('/app'),
  withEnv({ NODE_ENV: 'test' }),
  quiet,
  nothrow
);

// Apply composed modifiers
const result = await testCommand($`npm test`);
```

### Chainable Wrapper

```javascript
class ChainableCommand {
  constructor(command) {
    this.command = command;
    this.middlewares = [];
  }
  
  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }
  
  async execute() {
    let promise = $(this.command);
    
    // Apply middlewares in order
    for (const middleware of this.middlewares) {
      promise = await middleware(promise);
    }
    
    return await promise;
  }
}

// Middleware functions
const logger = (name) => (promise) => {
  console.log(`[${new Date().toISOString()}] Starting: ${name}`);
  return promise;
};

const timer = (promise) => {
  const start = Date.now();
  return promise.then(result => {
    result.duration = Date.now() - start;
    console.log(`Completed in ${result.duration}ms`);
    return result;
  });
};

const errorHandler = (promise) => {
  return promise.catch(error => {
    console.error('Command failed:', error.message);
    return { error, failed: true };
  });
};

// Usage
const result = await new ChainableCommand('npm test')
  .use(logger('tests'))
  .use(promise => promise.timeout(30000))
  .use(promise => promise.quiet())
  .use(timer)
  .use(errorHandler)
  .execute();
```

## Complex Chain Patterns

### Branching Chains

```javascript
class BranchingChain {
  constructor(command) {
    this.command = command;
    this.branches = [];
    this.defaultBranch = null;
  }
  
  when(condition, modifier) {
    this.branches.push({ condition, modifier });
    return this;
  }
  
  otherwise(modifier) {
    this.defaultBranch = modifier;
    return this;
  }
  
  async execute() {
    let promise = $(this.command);
    
    // Find matching branch
    const branch = this.branches.find(b => {
      if (typeof b.condition === 'function') {
        return b.condition();
      }
      return b.condition;
    });
    
    // Apply branch modifier or default
    if (branch) {
      promise = branch.modifier(promise);
    } else if (this.defaultBranch) {
      promise = this.defaultBranch(promise);
    }
    
    return await promise;
  }
}

// Usage
const result = await new BranchingChain('npm test')
  .when(
    process.env.CI === 'true',
    p => p.timeout(120000).env({ CI: 'true' })
  )
  .when(
    process.env.DEBUG === 'true',
    p => p.verbose().env({ DEBUG: '*' })
  )
  .otherwise(
    p => p.quiet().timeout(30000)
  )
  .execute();
```

### Chain Router

```javascript
class ChainRouter {
  constructor() {
    this.routes = new Map();
    this.middleware = [];
  }
  
  route(pattern, handler) {
    this.routes.set(pattern, handler);
    return this;
  }
  
  use(middleware) {
    this.middleware.push(middleware);
    return this;
  }
  
  async execute(command) {
    // Find matching route
    let handler = null;
    
    for (const [pattern, routeHandler] of this.routes) {
      if (typeof pattern === 'string' && command.includes(pattern)) {
        handler = routeHandler;
        break;
      } else if (pattern instanceof RegExp && pattern.test(command)) {
        handler = routeHandler;
        break;
      } else if (typeof pattern === 'function' && pattern(command)) {
        handler = routeHandler;
        break;
      }
    }
    
    if (!handler) {
      handler = (cmd) => $(cmd); // Default handler
    }
    
    // Create promise with handler
    let promise = handler(command);
    
    // Apply middleware
    for (const mw of this.middleware) {
      promise = mw(promise);
    }
    
    return await promise;
  }
}

// Usage
const router = new ChainRouter()
  .route('npm', cmd => $(cmd).timeout(60000))
  .route('docker', cmd => $(cmd).quiet())
  .route(/^git/, cmd => $(cmd).cwd(process.env.GIT_REPO || '.'))
  .route(
    cmd => cmd.includes('test'),
    cmd => $(cmd).env({ NODE_ENV: 'test' }).verbose()
  )
  .use(promise => {
    console.log('Executing command...');
    return promise;
  });

await router.execute('npm install');
await router.execute('docker build .');
await router.execute('git status');
```

## Async Chain Patterns

### Sequential Chain

```javascript
class SequentialChain {
  constructor() {
    this.commands = [];
  }
  
  add(command, modifiers = {}) {
    this.commands.push({ command, modifiers });
    return this;
  }
  
  async execute() {
    const results = [];
    
    for (const { command, modifiers } of this.commands) {
      let promise = $(command);
      
      // Apply modifiers
      Object.entries(modifiers).forEach(([key, value]) => {
        if (typeof promise[key] === 'function') {
          promise = promise[key](value);
        }
      });
      
      const result = await promise;
      results.push(result);
      
      // Pass output to next command if needed
      if (modifiers.passOutput && this.commands.indexOf({ command, modifiers }) < this.commands.length - 1) {
        const nextCommand = this.commands[this.commands.indexOf({ command, modifiers }) + 1];
        nextCommand.command = nextCommand.command.replace('$INPUT', result.stdout.trim());
      }
    }
    
    return results;
  }
}

// Usage
const chain = new SequentialChain()
  .add('git rev-parse HEAD', { quiet: true, passOutput: true })
  .add('git show $INPUT --stat', { quiet: false })
  .add('echo "Deployment complete"', { verbose: true });

await chain.execute();
```

### Parallel Chain

```javascript
class ParallelChain {
  constructor() {
    this.groups = [];
  }
  
  group(name) {
    const group = {
      name,
      commands: [],
      waitFor: [],
      modifiers: {}
    };
    
    this.groups.push(group);
    
    return {
      add: (command) => {
        group.commands.push(command);
        return this;
      },
      dependsOn: (...names) => {
        group.waitFor.push(...names);
        return this;
      },
      withModifiers: (modifiers) => {
        group.modifiers = modifiers;
        return this;
      },
      chain: this
    };
  }
  
  async execute() {
    const completed = new Map();
    const executing = new Map();
    
    const executeGroup = async (group) => {
      // Wait for dependencies
      for (const dep of group.waitFor) {
        if (executing.has(dep)) {
          await executing.get(dep);
        }
      }
      
      console.log(`Executing group: ${group.name}`);
      
      // Execute commands in parallel
      const promises = group.commands.map(cmd => {
        let promise = $(cmd);
        
        // Apply group modifiers
        Object.entries(group.modifiers).forEach(([key, value]) => {
          if (typeof promise[key] === 'function') {
            promise = promise[key](value);
          }
        });
        
        return promise;
      });
      
      const results = await Promise.all(promises);
      completed.set(group.name, results);
      
      return results;
    };
    
    // Start all groups
    for (const group of this.groups) {
      const promise = executeGroup(group);
      executing.set(group.name, promise);
    }
    
    // Wait for all groups
    await Promise.all(executing.values());
    
    return completed;
  }
}

// Usage
const parallel = new ParallelChain();

parallel.group('prepare')
  .add('npm ci')
  .add('pip install -r requirements.txt')
  .withModifiers({ quiet: true, timeout: 60000 });

parallel.group('build')
  .add('npm run build')
  .add('python setup.py build')
  .dependsOn('prepare')
  .withModifiers({ verbose: true });

parallel.group('test')
  .add('npm test')
  .add('pytest')
  .dependsOn('build')
  .withModifiers({ env: { CI: 'true' } });

const results = await parallel.execute();
```

## Transformation Chains

### Result Transformer Chain

```javascript
class TransformChain {
  constructor(command) {
    this.command = command;
    this.transformers = [];
  }
  
  map(fn) {
    this.transformers.push({
      type: 'map',
      fn
    });
    return this;
  }
  
  filter(fn) {
    this.transformers.push({
      type: 'filter',
      fn
    });
    return this;
  }
  
  reduce(fn, initial) {
    this.transformers.push({
      type: 'reduce',
      fn,
      initial
    });
    return this;
  }
  
  split(separator = '\n') {
    this.transformers.push({
      type: 'split',
      separator
    });
    return this;
  }
  
  join(separator = '\n') {
    this.transformers.push({
      type: 'join',
      separator
    });
    return this;
  }
  
  async execute() {
    const result = await $(this.command);
    let data = result.stdout;
    
    for (const transformer of this.transformers) {
      switch (transformer.type) {
        case 'split':
          data = data.split(transformer.separator);
          break;
          
        case 'map':
          data = Array.isArray(data) 
            ? data.map(transformer.fn)
            : transformer.fn(data);
          break;
          
        case 'filter':
          data = Array.isArray(data)
            ? data.filter(transformer.fn)
            : (transformer.fn(data) ? data : null);
          break;
          
        case 'reduce':
          data = Array.isArray(data)
            ? data.reduce(transformer.fn, transformer.initial)
            : data;
          break;
          
        case 'join':
          data = Array.isArray(data)
            ? data.join(transformer.separator)
            : data;
          break;
      }
    }
    
    return data;
  }
}

// Usage
const files = await new TransformChain('ls -la')
  .split('\n')
  .filter(line => line.includes('.js'))
  .map(line => line.split(/\s+/).pop())
  .filter(name => !name.startsWith('.'))
  .execute();

console.log('JavaScript files:', files);
```

## Complete Chaining Example

```javascript
// deployment-chain.js
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

class DeploymentChain {
  constructor(config) {
    this.config = config;
    this.steps = [];
    this.state = {};
  }
  
  // Step builders
  validate() {
    this.steps.push({
      name: 'validate',
      execute: async () => {
        console.log(chalk.blue('Validating configuration...'));
        
        const checks = await new ParallelChain()
          .group('files')
          .add('test -f package.json')
          .add('test -f .env.production')
          .chain
          .group('services')
          .add('docker ps')
          .add('kubectl cluster-info')
          .chain
          .execute();
        
        return { validated: true };
      }
    });
    return this;
  }
  
  build() {
    this.steps.push({
      name: 'build',
      execute: async () => {
        console.log(chalk.blue('Building application...'));
        
        const result = await new CommandChain('npm run build')
          .timeout(120000)
          .env({ NODE_ENV: 'production' })
          .retry(2, 5000)
          .transform(result => ({
            ...result,
            artifacts: result.stdout.match(/Created (.+)/g) || []
          }))
          .execute();
        
        this.state.artifacts = result.artifacts;
        return result;
      }
    });
    return this;
  }
  
  test() {
    this.steps.push({
      name: 'test',
      execute: async () => {
        console.log(chalk.blue('Running tests...'));
        
        const suites = ['unit', 'integration', 'e2e'];
        const results = [];
        
        for (const suite of suites) {
          const result = await new BranchingChain(`npm run test:${suite}`)
            .when(
              this.config.parallel,
              p => p.quiet().timeout(30000)
            )
            .when(
              this.config.verbose,
              p => p.verbose().pipe(process.stdout)
            )
            .otherwise(
              p => p.quiet()
            )
            .execute();
          
          results.push(result);
        }
        
        return { tests: results };
      }
    });
    return this;
  }
  
  deploy() {
    this.steps.push({
      name: 'deploy',
      execute: async () => {
        console.log(chalk.blue('Deploying to servers...'));
        
        const router = new ChainRouter()
          .route('ssh', cmd => $(cmd).timeout(30000).quiet())
          .route('docker', cmd => $(cmd).verbose())
          .route('kubectl', cmd => $(cmd).env({ KUBECONFIG: this.config.kubeconfig }));
        
        const deployments = [];
        
        for (const server of this.config.servers) {
          const cmd = `ssh ${server} "cd /app && ./deploy.sh"`;
          deployments.push(router.execute(cmd));
        }
        
        const results = await Promise.all(deployments);
        return { deployed: results.length };
      }
    });
    return this;
  }
  
  verify() {
    this.steps.push({
      name: 'verify',
      execute: async () => {
        console.log(chalk.blue('Verifying deployment...'));
        
        const healthChecks = await new TransformChain('curl -s https://api.example.com/health')
          .map(output => {
            try {
              return JSON.parse(output);
            } catch {
              return { status: 'unknown' };
            }
          })
          .execute();
        
        if (healthChecks.status !== 'healthy') {
          throw new Error('Health check failed');
        }
        
        return { verified: true };
      }
    });
    return this;
  }
  
  rollback() {
    this.steps.push({
      name: 'rollback',
      execute: async () => {
        console.log(chalk.yellow('Rolling back...'));
        
        await $`kubectl rollout undo deployment/app`;
        await $`docker-compose down && docker-compose up -d`;
        
        return { rolledBack: true };
      },
      onError: true // Only execute on error
    });
    return this;
  }
  
  notify() {
    this.steps.push({
      name: 'notify',
      execute: async () => {
        const status = this.state.error ? 'failed' : 'succeeded';
        const color = this.state.error ? chalk.red : chalk.green;
        
        console.log(color(`Deployment ${status}!`));
        
        // Send notification
        await $`curl -X POST https://hooks.slack.com/services/xxx \
          -d '{"text": "Deployment ${status}"}'`.quiet();
        
        return { notified: true };
      },
      always: true // Always execute
    });
    return this;
  }
  
  async execute() {
    const results = [];
    
    for (const step of this.steps) {
      // Skip error-only steps if no error
      if (step.onError && !this.state.error) continue;
      
      // Execute always steps or normal flow
      if (!step.always && !step.onError || step.always) {
        try {
          console.log(chalk.gray(`→ ${step.name}`));
          const result = await step.execute();
          results.push({ step: step.name, ...result });
          
        } catch (error) {
          this.state.error = error;
          results.push({ step: step.name, error: error.message });
          
          // Execute rollback if configured
          const rollbackStep = this.steps.find(s => s.onError);
          if (rollbackStep && rollbackStep !== step) {
            await rollbackStep.execute();
          }
          
          // Don't continue unless it's an always step
          if (!step.always) break;
        }
      }
    }
    
    // Execute always steps that haven't run
    for (const step of this.steps.filter(s => s.always)) {
      if (!results.find(r => r.step === step.name)) {
        await step.execute();
      }
    }
    
    return results;
  }
}

// Usage
const deployment = new DeploymentChain({
  servers: ['prod1.example.com', 'prod2.example.com'],
  parallel: true,
  verbose: process.env.VERBOSE === 'true',
  kubeconfig: '/etc/kubernetes/config'
});

const results = await deployment
  .validate()
  .build()
  .test()
  .deploy()
  .verify()
  .rollback()  // Only on error
  .notify()    // Always
  .execute();

console.log('Deployment results:', results);
```

This comprehensive example demonstrates:
- Multiple chaining patterns
- Step-based execution flow
- Conditional execution (onError, always)
- State management across steps
- Error handling with rollback
- Parallel and sequential operations
- Result transformation
- Dynamic routing
- Notification on completion