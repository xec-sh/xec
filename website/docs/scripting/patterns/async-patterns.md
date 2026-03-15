# Async Patterns for Command Execution

Xec scripts are inherently asynchronous, leveraging JavaScript's async/await for elegant control flow. This guide covers advanced async patterns for efficient and scalable command execution.

## Sequential vs Parallel Execution

### Sequential Execution

Commands execute one after another:

```javascript
import { $ } from '@xec-sh/core';

// Sequential - each command waits for the previous
async function sequential() {
  console.time('sequential');
  
  await $`sleep 1 && echo "Task 1"`;
  await $`sleep 1 && echo "Task 2"`;
  await $`sleep 1 && echo "Task 3"`;
  
  console.timeEnd('sequential'); // ~3 seconds
}
```

### Parallel Execution

Execute multiple commands simultaneously:

```javascript
// Parallel - all commands run at the same time
async function parallel() {
  console.time('parallel');
  
  await Promise.all([
    $`sleep 1 && echo "Task 1"`,
    $`sleep 1 && echo "Task 2"`,
    $`sleep 1 && echo "Task 3"`
  ]);
  
  console.timeEnd('parallel'); // ~1 second
}

// With result handling
async function parallelWithResults() {
  const results = await Promise.all([
    $`echo "Result 1"`,
    $`echo "Result 2"`,
    $`echo "Result 3"`
  ]);
  
  results.forEach((result, i) => {
    console.log(`Task ${i + 1}: ${result.stdout.trim()}`);
  });
}
```

### Mixed Sequential and Parallel

```javascript
async function mixed() {
  // Phase 1: Parallel preparation
  await Promise.all([
    $`npm install`,
    $`pip install -r requirements.txt`,
    $`bundle install`
  ]);
  
  // Phase 2: Sequential build
  await $`npm run build`;
  await $`python setup.py build`;
  
  // Phase 3: Parallel tests
  const testResults = await Promise.all([
    $`npm test`,
    $`pytest`,
    $`rspec`
  ]);
  
  return testResults;
}
```

## Promise Control Patterns

### Promise.allSettled for Resilient Execution

```javascript
async function runAllTests() {
  const tests = [
    $`npm run test:unit`,
    $`npm run test:integration`,
    $`npm run test:e2e`,
    $`npm run test:performance`
  ];
  
  const results = await Promise.allSettled(tests);
  
  const summary = {
    total: results.length,
    passed: 0,
    failed: 0,
    errors: []
  };
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.exitCode === 0) {
      summary.passed++;
    } else {
      summary.failed++;
      summary.errors.push({
        test: tests[index],
        reason: result.reason || result.value.stderr
      });
    }
  });
  
  console.log(`Tests: ${summary.passed}/${summary.total} passed`);
  return summary;
}
```

### Promise.race for Timeouts

```javascript
async function raceWithTimeout(command, timeoutMs = 5000) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Command timed out')), timeoutMs)
  );
  
  try {
    return await Promise.race([command, timeout]);
  } catch (error) {
    if (error.message === 'Command timed out') {
      // Kill the command if it's still running
      command.kill();
    }
    throw error;
  }
}

// Usage
const result = await raceWithTimeout(
  $`curl https://slow-api.example.com`,
  3000
);
```

### Promise.any for Fallback Servers

```javascript
async function fetchFromAnyServer(servers) {
  const attempts = servers.map(server => 
    $`curl https://${server}/api/data`
  );
  
  try {
    const result = await Promise.any(attempts);
    console.log('Fetched from first available server');
    return result;
  } catch (error) {
    console.error('All servers failed:', error);
    throw new Error('No servers available');
  }
}

// Usage
const data = await fetchFromAnyServer([
  'primary.example.com',
  'backup1.example.com',
  'backup2.example.com'
]);
```

## Concurrency Control

### Limited Parallelism

```javascript
class ConcurrencyLimiter {
  constructor(limit = 5) {
    this.limit = limit;
    this.running = 0;
    this.queue = [];
  }
  
  async run(fn) {
    while (this.running >= this.limit) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    
    this.running++;
    
    try {
      return await fn();
    } finally {
      this.running--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

// Usage
const limiter = new ConcurrencyLimiter(3);

async function deployToManyServers(servers) {
  const deployments = servers.map(server => 
    limiter.run(async () => {
      console.log(`Deploying to ${server}...`);
      await $`ssh ${server} "cd /app && git pull && npm install"`;
      console.log(`Deployed to ${server}`);
    })
  );
  
  await Promise.all(deployments);
}
```

### Batch Processing

```javascript
async function processBatches(items, batchSize = 10, processor) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}/${Math.ceil(items.length / batchSize)}`);
    
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    
    results.push(...batchResults);
    
    // Optional delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

// Usage
const files = await glob('**/*.log');
await processBatches(files, 5, async (file) => {
  return await $`gzip ${file}`;
});
```

## Async Iterators and Generators

### Async Generator for Streaming Results

```javascript
async function* executeCommands(commands) {
  for (const command of commands) {
    try {
      const result = await command;
      yield { success: true, result };
    } catch (error) {
      yield { success: false, error };
    }
  }
}

// Usage
const commands = [
  $`echo "Command 1"`,
  $`echo "Command 2"`,
  $`false`, // This will fail
  $`echo "Command 4"`
];

for await (const outcome of executeCommands(commands)) {
  if (outcome.success) {
    console.log('✅', outcome.result.stdout.trim());
  } else {
    console.log('❌', outcome.error.message);
  }
}
```

### Async Iterator for Progress Updates

```javascript
async function* deployWithProgress(steps) {
  const total = steps.length;
  
  for (let i = 0; i < total; i++) {
    const step = steps[i];
    
    yield {
      type: 'progress',
      current: i,
      total,
      message: `Starting: ${step.name}`
    };
    
    try {
      const result = await step.command();
      
      yield {
        type: 'complete',
        current: i + 1,
        total,
        message: `Completed: ${step.name}`,
        result
      };
    } catch (error) {
      yield {
        type: 'error',
        current: i,
        total,
        message: `Failed: ${step.name}`,
        error
      };
      throw error;
    }
  }
}

// Usage
const deploymentSteps = [
  { name: 'Build', command: () => $`npm run build` },
  { name: 'Test', command: () => $`npm test` },
  { name: 'Deploy', command: () => $`npm run deploy` }
];

for await (const update of deployWithProgress(deploymentSteps)) {
  const progress = `[${update.current}/${update.total}]`;
  
  switch (update.type) {
    case 'progress':
      console.log(`${progress} 🔄 ${update.message}`);
      break;
    case 'complete':
      console.log(`${progress} ✅ ${update.message}`);
      break;
    case 'error':
      console.log(`${progress} ❌ ${update.message}`);
      break;
  }
}
```

## Event-Driven Async Patterns

### Event Emitter for Long Operations

```javascript
import { EventEmitter } from 'events';

class AsyncTaskRunner extends EventEmitter {
  async run(tasks) {
    this.emit('start', { total: tasks.length });
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      this.emit('taskStart', { index: i, task });
      
      try {
        const result = await task.execute();
        this.emit('taskComplete', { index: i, task, result });
      } catch (error) {
        this.emit('taskError', { index: i, task, error });
        
        if (!task.optional) {
          this.emit('abort', { reason: `Critical task failed: ${task.name}` });
          throw error;
        }
      }
    }
    
    this.emit('complete');
  }
}

// Usage
const runner = new AsyncTaskRunner();

runner.on('start', ({ total }) => {
  console.log(`Starting ${total} tasks...`);
});

runner.on('taskStart', ({ task }) => {
  console.log(`  ⏳ ${task.name}`);
});

runner.on('taskComplete', ({ task }) => {
  console.log(`  ✅ ${task.name}`);
});

runner.on('taskError', ({ task, error }) => {
  console.log(`  ❌ ${task.name}: ${error.message}`);
});

const tasks = [
  { name: 'Lint', execute: () => $`npm run lint`, optional: true },
  { name: 'Build', execute: () => $`npm run build`, optional: false },
  { name: 'Test', execute: () => $`npm test`, optional: false }
];

await runner.run(tasks);
```

## Queue Management

### Priority Queue

```javascript
class PriorityQueue {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }
  
  async add(task, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }
  
  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }
    
    this.running++;
    const { task, resolve, reject } = this.queue.shift();
    
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

// Usage
const queue = new PriorityQueue(3);

// High priority tasks
await queue.add(() => $`npm run critical-fix`, 10);

// Normal priority tasks
await queue.add(() => $`npm run build`, 5);

// Low priority tasks
await queue.add(() => $`npm run cleanup`, 1);
```

## Async Coordination Patterns

### Semaphore for Resource Limiting

```javascript
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.waiting = [];
  }
  
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    
    await new Promise(resolve => this.waiting.push(resolve));
    this.current++;
  }
  
  release() {
    this.current--;
    const next = this.waiting.shift();
    if (next) next();
  }
  
  async use(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Usage - limit concurrent SSH connections
const sshSemaphore = new Semaphore(10);

async function executeOnServer(server, command) {
  return sshSemaphore.use(async () => {
    return await $`ssh ${server} "${command}"`;
  });
}

// Can have many concurrent calls but only 10 SSH connections
const results = await Promise.all(
  servers.map(server => 
    executeOnServer(server, 'uptime')
  )
);
```

### Barrier Synchronization

```javascript
class Barrier {
  constructor(count) {
    this.count = count;
    this.current = 0;
    this.promise = new Promise(resolve => {
      this.resolve = resolve;
    });
  }
  
  async wait() {
    this.current++;
    
    if (this.current >= this.count) {
      this.resolve();
    }
    
    return this.promise;
  }
}

// Usage - wait for all services to be ready
async function startMicroservices() {
  const barrier = new Barrier(3);
  
  // Start services in parallel
  const services = [
    startDatabase(barrier),
    startCache(barrier),
    startAPI(barrier)
  ];
  
  await Promise.all(services);
  console.log('All services started and ready');
}

async function startDatabase(barrier) {
  await $`docker-compose up -d postgres`;
  await $`wait-for-it postgres:5432`;
  console.log('Database ready');
  await barrier.wait();
}

async function startCache(barrier) {
  await $`docker-compose up -d redis`;
  await $`wait-for-it redis:6379`;
  console.log('Cache ready');
  await barrier.wait();
}

async function startAPI(barrier) {
  await $`npm run start:dev`;
  console.log('API ready');
  await barrier.wait();
}
```

## Async Pipelines

### Pipeline Builder

```javascript
class AsyncPipeline {
  constructor() {
    this.steps = [];
  }
  
  add(name, fn) {
    this.steps.push({ name, fn });
    return this;
  }
  
  async execute(input) {
    let result = input;
    
    for (const step of this.steps) {
      console.log(`⚙️  ${step.name}`);
      
      try {
        result = await step.fn(result);
      } catch (error) {
        console.error(`❌ ${step.name} failed:`, error.message);
        throw error;
      }
    }
    
    return result;
  }
}

// Usage
const buildPipeline = new AsyncPipeline()
  .add('Clean', async () => {
    await $`rm -rf dist`;
    return { cleaned: true };
  })
  .add('Install', async (ctx) => {
    await $`npm ci`;
    return { ...ctx, installed: true };
  })
  .add('Build', async (ctx) => {
    await $`npm run build`;
    return { ...ctx, built: true };
  })
  .add('Test', async (ctx) => {
    const result = await $`npm test`.nothrow();
    return { ...ctx, tested: true, testsPassed: result.exitCode === 0 };
  })
  .add('Package', async (ctx) => {
    if (!ctx.testsPassed) {
      throw new Error('Cannot package: tests failed');
    }
    await $`npm pack`;
    return { ...ctx, packaged: true };
  });

const result = await buildPipeline.execute({});
console.log('Pipeline result:', result);
```

## Async Stream Processing

### Transform Stream for Command Output

```javascript
import { Transform } from 'stream';

function createAsyncTransform(asyncFn) {
  return new Transform({
    async transform(chunk, encoding, callback) {
      try {
        const result = await asyncFn(chunk.toString());
        callback(null, result);
      } catch (error) {
        callback(error);
      }
    }
  });
}

// Usage - transform log output
const logTransformer = createAsyncTransform(async (line) => {
  // Parse JSON logs
  try {
    const log = JSON.parse(line);
    return `[${log.level}] ${log.message}\n`;
  } catch {
    return line;
  }
});

await $`tail -f app.log`
  .pipe(logTransformer)
  .pipe(process.stdout);
```

## Complete Async Workflow Example

```javascript
// async-deployment-workflow.js
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

class AsyncDeploymentWorkflow {
  constructor(config) {
    this.config = config;
    this.stats = {
      startTime: Date.now(),
      steps: []
    };
  }
  
  async execute() {
    console.log(chalk.blue('🚀 Starting deployment workflow'));
    
    try {
      // Phase 1: Parallel preparation
      await this.preparePhase();
      
      // Phase 2: Sequential build
      await this.buildPhase();
      
      // Phase 3: Parallel testing
      const testResults = await this.testPhase();
      
      // Phase 4: Staged deployment
      await this.deployPhase();
      
      // Phase 5: Parallel health checks
      await this.healthCheckPhase();
      
      this.reportSuccess();
      
    } catch (error) {
      await this.handleFailure(error);
      throw error;
    }
  }
  
  async preparePhase() {
    console.log(chalk.yellow('📦 Preparation phase'));
    
    const preparations = [
      this.trackStep('clean', () => $`rm -rf dist node_modules`),
      this.trackStep('fetch', () => $`git fetch --all`),
      this.trackStep('install', () => $`npm ci`)
    ];
    
    await Promise.all(preparations);
  }
  
  async buildPhase() {
    console.log(chalk.yellow('🔨 Build phase'));
    
    await this.trackStep('lint', () => $`npm run lint`);
    await this.trackStep('compile', () => $`npm run build`);
    await this.trackStep('bundle', () => $`npm run bundle`);
  }
  
  async testPhase() {
    console.log(chalk.yellow('🧪 Test phase'));
    
    const testSuites = ['unit', 'integration', 'e2e'];
    const limiter = new ConcurrencyLimiter(2);
    
    const results = await Promise.allSettled(
      testSuites.map(suite => 
        limiter.run(() => 
          this.trackStep(`test:${suite}`, () => $`npm run test:${suite}`)
        )
      )
    );
    
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0 && !this.config.allowTestFailures) {
      throw new Error(`${failed.length} test suites failed`);
    }
    
    return results;
  }
  
  async deployPhase() {
    console.log(chalk.yellow('🚢 Deployment phase'));
    
    // Deploy to canary first
    await this.deployToEnvironment('canary', 1);
    
    // Wait and check
    await this.wait(10000);
    await this.checkEnvironment('canary');
    
    // Rolling deployment to production
    const productionServers = this.config.servers.production;
    const batchSize = Math.ceil(productionServers.length / 3);
    
    for (let i = 0; i < productionServers.length; i += batchSize) {
      const batch = productionServers.slice(i, i + batchSize);
      console.log(`Deploying batch ${i / batchSize + 1}`);
      
      await Promise.all(
        batch.map(server => 
          this.deployToServer(server)
        )
      );
      
      // Wait between batches
      if (i + batchSize < productionServers.length) {
        await this.wait(5000);
      }
    }
  }
  
  async healthCheckPhase() {
    console.log(chalk.yellow('💚 Health check phase'));
    
    const allServers = [
      ...this.config.servers.canary,
      ...this.config.servers.production
    ];
    
    const checks = allServers.map(server => 
      this.trackStep(
        `health:${server}`,
        () => $`curl -f https://${server}/health`.timeout(5000)
      )
    );
    
    const results = await Promise.allSettled(checks);
    const healthy = results.filter(r => r.status === 'fulfilled').length;
    
    console.log(`Health check: ${healthy}/${allServers.length} servers healthy`);
    
    if (healthy < allServers.length * 0.9) {
      throw new Error('Too many servers unhealthy');
    }
  }
  
  async deployToEnvironment(env, percentage = 100) {
    const servers = this.config.servers[env];
    const count = Math.ceil(servers.length * percentage / 100);
    const selected = servers.slice(0, count);
    
    await Promise.all(
      selected.map(server => this.deployToServer(server))
    );
  }
  
  async deployToServer(server) {
    return this.trackStep(`deploy:${server}`, async () => {
      await $`ssh ${server} "cd /app && git pull"`;
      await $`ssh ${server} "cd /app && npm ci --production"`;
      await $`ssh ${server} "sudo systemctl restart app"`;
    });
  }
  
  async checkEnvironment(env) {
    const servers = this.config.servers[env];
    const checks = await Promise.all(
      servers.map(s => 
        $`curl -s -o /dev/null -w "%{http_code}" https://${s}/health`
          .then(r => r.stdout.trim() === '200')
      )
    );
    
    const healthy = checks.filter(Boolean).length;
    if (healthy < servers.length) {
      throw new Error(`Environment ${env} is not healthy`);
    }
  }
  
  async trackStep(name, fn) {
    const start = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      this.stats.steps.push({ name, duration, success: true });
      console.log(chalk.green(`  ✅ ${name} (${duration}ms)`));
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      this.stats.steps.push({ name, duration, success: false });
      console.log(chalk.red(`  ❌ ${name} (${duration}ms): ${error.message}`));
      
      throw error;
    }
  }
  
  async wait(ms) {
    console.log(chalk.gray(`  ⏱️  Waiting ${ms}ms...`));
    await new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async handleFailure(error) {
    console.error(chalk.red('❌ Deployment failed:'), error.message);
    
    // Attempt rollback
    try {
      console.log(chalk.yellow('🔄 Attempting rollback...'));
      await $`npm run rollback`;
      console.log(chalk.green('✅ Rollback successful'));
    } catch (rollbackError) {
      console.error(chalk.red('❌ Rollback failed:'), rollbackError.message);
    }
  }
  
  reportSuccess() {
    const totalTime = Date.now() - this.stats.startTime;
    const successful = this.stats.steps.filter(s => s.success).length;
    const failed = this.stats.steps.filter(s => !s.success).length;
    
    console.log(chalk.green('\n✨ Deployment completed successfully!'));
    console.log(chalk.gray(`Total time: ${totalTime}ms`));
    console.log(chalk.gray(`Steps: ${successful} successful, ${failed} failed`));
  }
}

// Usage
const workflow = new AsyncDeploymentWorkflow({
  servers: {
    canary: ['canary-1.example.com'],
    production: [
      'prod-1.example.com',
      'prod-2.example.com',
      'prod-3.example.com'
    ]
  },
  allowTestFailures: false
});

await workflow.execute();
```

This comprehensive example demonstrates:
- Mixed sequential and parallel execution
- Concurrency control with limiters
- Phased deployment strategy
- Progress tracking and reporting
- Health checks and validation
- Rollback on failure
- Batch processing
- Performance monitoring
- Error recovery strategies