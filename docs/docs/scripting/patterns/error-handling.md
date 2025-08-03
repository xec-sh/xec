# Error Handling Patterns

Robust error handling is crucial for production scripts. This guide covers comprehensive error handling patterns for Xec scripts, from basic try-catch to advanced recovery strategies.

## Basic Error Handling

### Try-Catch Pattern

```javascript
import { $ } from '@xec-sh/core';

async function basicErrorHandling() {
  try {
    await $`rm /protected/file`;
  } catch (error) {
    console.error('Command failed:', error.message);
    console.error('Exit code:', error.exitCode);
    console.error('Stderr:', error.stderr);
  }
}
```

### Non-Throwing Commands

Use `.nothrow()` to prevent exceptions and handle errors manually:

```javascript
const result = await $`test -f /nonexistent`.nothrow();

if (result.exitCode !== 0) {
  console.log('File does not exist');
} else {
  console.log('File exists');
}

// Using the ok property
if (!result.ok) {
  console.error('Command failed:', result.error);
}
```

## Error Recovery Patterns

### Retry with Exponential Backoff

```javascript
async function retryWithBackoff(
  command,
  maxRetries = 3,
  initialDelay = 1000
) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await command();
    } catch (error) {
      lastError = error;
      const delay = initialDelay * Math.pow(2, i);
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

// Usage
const result = await retryWithBackoff(
  () => $`curl https://flaky-api.example.com`
);
```

### Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(
    private threshold = 5,
    private timeout = 60000
  ) {
    this.failures = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }
  
  async execute(command) {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.timeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      // Try half-open
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await command();
      
      // Success - reset circuit
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
        console.error(`Circuit breaker opened after ${this.failures} failures`);
      }
      
      throw error;
    }
  }
}

// Usage
const breaker = new CircuitBreaker(3, 30000);

try {
  await breaker.execute(() => $`curl https://api.example.com`);
} catch (error) {
  if (error.message === 'Circuit breaker is OPEN') {
    console.log('Service is temporarily unavailable');
  }
}
```

### Fallback Strategy

```javascript
async function withFallback(primary, fallback) {
  try {
    return await primary();
  } catch (primaryError) {
    console.warn('Primary command failed, trying fallback:', primaryError.message);
    
    try {
      return await fallback();
    } catch (fallbackError) {
      throw new Error(
        `Both primary and fallback failed:\n` +
        `Primary: ${primaryError.message}\n` +
        `Fallback: ${fallbackError.message}`
      );
    }
  }
}

// Usage
const data = await withFallback(
  () => $`curl https://primary-api.example.com/data`,
  () => $`curl https://backup-api.example.com/data`
);
```

## Structured Error Types

### Custom Error Classes

```javascript
class CommandError extends Error {
  constructor(message, command, exitCode, stderr) {
    super(message);
    this.name = 'CommandError';
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

class ValidationError extends Error {
  constructor(message, field, value) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

class NetworkError extends Error {
  constructor(message, url, statusCode) {
    super(message);
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

// Usage
async function deployService(name, version) {
  // Validation
  if (!name) {
    throw new ValidationError('Service name is required', 'name', name);
  }
  
  // Command execution
  const result = await $`docker pull ${name}:${version}`.nothrow();
  if (result.exitCode !== 0) {
    throw new CommandError(
      `Failed to pull image ${name}:${version}`,
      `docker pull ${name}:${version}`,
      result.exitCode,
      result.stderr
    );
  }
  
  // Network request
  const health = await $`curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health`.nothrow();
  if (health.stdout.trim() !== '200') {
    throw new NetworkError(
      'Health check failed',
      'http://localhost:8080/health',
      health.stdout.trim()
    );
  }
}
```

## Error Context and Logging

### Contextual Error Wrapping

```javascript
class ErrorContext {
  constructor() {
    this.context = [];
  }
  
  push(label, value) {
    this.context.push({ label, value, timestamp: new Date() });
    return this;
  }
  
  async wrap(label, fn) {
    this.push(label, 'started');
    try {
      const result = await fn();
      this.push(label, 'completed');
      return result;
    } catch (error) {
      this.push(label, `failed: ${error.message}`);
      error.context = this.context;
      throw error;
    }
  }
  
  toString() {
    return this.context
      .map(c => `[${c.timestamp.toISOString()}] ${c.label}: ${c.value}`)
      .join('\n');
  }
}

// Usage
const context = new ErrorContext();

try {
  await context.wrap('build', async () => {
    await $`npm run build`;
  });
  
  await context.wrap('test', async () => {
    await $`npm test`;
  });
  
  await context.wrap('deploy', async () => {
    await $`npm run deploy`;
  });
} catch (error) {
  console.error('Pipeline failed with context:');
  console.error(error.context);
  throw error;
}
```

### Structured Logging

```javascript
import chalk from 'chalk';

class Logger {
  constructor(name) {
    this.name = name;
    this.context = {};
  }
  
  setContext(context) {
    this.context = { ...this.context, ...context };
  }
  
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      logger: this.name,
      message,
      ...this.context,
      ...data
    };
    
    // Console output
    const color = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.blue,
      debug: chalk.gray
    }[level] || chalk.white;
    
    console.log(color(`[${timestamp}] [${level.toUpperCase()}] ${message}`));
    
    // JSON output for parsing
    if (process.env.LOG_FORMAT === 'json') {
      console.log(JSON.stringify(logData));
    }
  }
  
  error(message, error) {
    this.log('error', message, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...error
      }
    });
  }
  
  warn(message, data) {
    this.log('warn', message, data);
  }
  
  info(message, data) {
    this.log('info', message, data);
  }
  
  debug(message, data) {
    if (process.env.DEBUG) {
      this.log('debug', message, data);
    }
  }
}

// Usage
const logger = new Logger('deployment');
logger.setContext({ environment: 'production', version: '1.2.3' });

try {
  logger.info('Starting deployment');
  await $`npm run deploy`;
  logger.info('Deployment successful');
} catch (error) {
  logger.error('Deployment failed', error);
  throw error;
}
```

## Graceful Degradation

### Feature Flags

```javascript
class FeatureFlags {
  constructor(flags = {}) {
    this.flags = flags;
  }
  
  isEnabled(feature) {
    return this.flags[feature] === true;
  }
  
  async executeWithFlag(feature, enabledFn, disabledFn = () => {}) {
    if (this.isEnabled(feature)) {
      try {
        return await enabledFn();
      } catch (error) {
        console.warn(`Feature ${feature} failed, using fallback:`, error.message);
        return await disabledFn();
      }
    } else {
      return await disabledFn();
    }
  }
}

// Usage
const features = new FeatureFlags({
  useNewDeployment: true,
  enableMetrics: false
});

await features.executeWithFlag(
  'useNewDeployment',
  async () => {
    // New deployment method
    await $`kubectl apply -f deployment.yaml`;
  },
  async () => {
    // Legacy deployment
    await $`docker-compose up -d`;
  }
);
```

### Partial Success Handling

```javascript
async function deployToServers(servers) {
  const results = {
    successful: [],
    failed: [],
    skipped: []
  };
  
  for (const server of servers) {
    try {
      // Check if server is reachable
      const ping = await $`ping -c 1 ${server}`.nothrow();
      if (ping.exitCode !== 0) {
        results.skipped.push({ server, reason: 'unreachable' });
        continue;
      }
      
      // Deploy to server
      await $`ssh ${server} "cd /app && git pull && npm install"`;
      results.successful.push(server);
      
    } catch (error) {
      results.failed.push({
        server,
        error: error.message
      });
    }
  }
  
  // Report results
  console.log(`Deployment results:`);
  console.log(`✅ Successful: ${results.successful.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  
  // Determine overall success
  const successRate = results.successful.length / servers.length;
  if (successRate < 0.5) {
    throw new Error('Deployment failed: Less than 50% of servers succeeded');
  }
  
  return results;
}
```

## Cleanup and Resource Management

### Finally Blocks

```javascript
async function withCleanup() {
  let tempDir;
  
  try {
    // Create temporary directory
    tempDir = await $`mktemp -d`.then(r => r.stdout.trim());
    console.log(`Created temp dir: ${tempDir}`);
    
    // Do work
    await $`cd ${tempDir} && npm init -y`;
    await $`cd ${tempDir} && npm install express`;
    
    // Return result
    return await $`cd ${tempDir} && npm ls --json`;
    
  } finally {
    // Always cleanup
    if (tempDir) {
      await $`rm -rf ${tempDir}`.nothrow();
      console.log(`Cleaned up temp dir: ${tempDir}`);
    }
  }
}
```

### Resource Pool with Error Recovery

```javascript
class ResourcePool {
  constructor(factory, maxSize = 5) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.available = [];
    this.inUse = new Set();
  }
  
  async acquire() {
    // Try to get available resource
    if (this.available.length > 0) {
      const resource = this.available.pop();
      this.inUse.add(resource);
      return resource;
    }
    
    // Create new resource if under limit
    if (this.inUse.size < this.maxSize) {
      try {
        const resource = await this.factory();
        this.inUse.add(resource);
        return resource;
      } catch (error) {
        throw new Error(`Failed to create resource: ${error.message}`);
      }
    }
    
    // Wait for resource to become available
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.acquire();
  }
  
  release(resource) {
    this.inUse.delete(resource);
    this.available.push(resource);
  }
  
  async destroy(resource) {
    this.inUse.delete(resource);
    const index = this.available.indexOf(resource);
    if (index > -1) {
      this.available.splice(index, 1);
    }
    
    // Cleanup resource
    if (resource.cleanup) {
      await resource.cleanup();
    }
  }
  
  async withResource(fn) {
    const resource = await this.acquire();
    try {
      return await fn(resource);
    } catch (error) {
      // Destroy resource on error
      await this.destroy(resource);
      throw error;
    } finally {
      // Return resource to pool if not destroyed
      if (this.inUse.has(resource) || this.available.includes(resource)) {
        this.release(resource);
      }
    }
  }
}

// Usage
const connectionPool = new ResourcePool(
  async () => {
    // Create SSH connection
    const conn = await $`ssh -o ConnectTimeout=5 server.example.com`;
    conn.cleanup = async () => {
      await $`ssh server.example.com exit`;
    };
    return conn;
  },
  10
);

await connectionPool.withResource(async (conn) => {
  // Use connection
  await $`echo "command" | ${conn}`;
});
```

## Error Aggregation

### Collecting Multiple Errors

```javascript
class ErrorCollector {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  
  addError(context, error) {
    this.errors.push({ context, error, timestamp: new Date() });
  }
  
  addWarning(context, message) {
    this.warnings.push({ context, message, timestamp: new Date() });
  }
  
  hasErrors() {
    return this.errors.length > 0;
  }
  
  async collectAsync(context, fn) {
    try {
      return await fn();
    } catch (error) {
      this.addError(context, error);
      return null;
    }
  }
  
  throwIfErrors() {
    if (this.hasErrors()) {
      const message = this.errors
        .map(e => `${e.context}: ${e.error.message}`)
        .join('\n');
      
      const error = new Error(`Multiple errors occurred:\n${message}`);
      error.errors = this.errors;
      error.warnings = this.warnings;
      throw error;
    }
  }
  
  report() {
    console.log(`Errors: ${this.errors.length}, Warnings: ${this.warnings.length}`);
    
    if (this.warnings.length > 0) {
      console.log('\nWarnings:');
      this.warnings.forEach(w => {
        console.log(`  ⚠️  ${w.context}: ${w.message}`);
      });
    }
    
    if (this.errors.length > 0) {
      console.log('\nErrors:');
      this.errors.forEach(e => {
        console.log(`  ❌ ${e.context}: ${e.error.message}`);
      });
    }
  }
}

// Usage
const collector = new ErrorCollector();

// Collect errors from multiple operations
await collector.collectAsync('build', async () => {
  await $`npm run build`;
});

await collector.collectAsync('lint', async () => {
  await $`npm run lint`;
});

await collector.collectAsync('test', async () => {
  await $`npm test`;
});

// Check for critical errors
const criticalTest = await collector.collectAsync('critical-test', async () => {
  await $`npm run test:critical`;
});

if (!criticalTest) {
  collector.addWarning('critical-test', 'Critical tests failed but continuing');
}

// Report and decide
collector.report();

if (collector.hasErrors()) {
  console.error('Build failed with errors');
  process.exit(1);
}
```

## Complete Error Handling Example

```javascript
// deployment-with-error-handling.js
import { $ } from '@xec-sh/core';
import chalk from 'chalk';

class DeploymentManager {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('deployment');
    this.errors = new ErrorCollector();
  }
  
  async deploy() {
    const startTime = Date.now();
    
    try {
      // Pre-deployment validation
      await this.validate();
      
      // Build with retry
      await this.buildWithRetry();
      
      // Run tests with partial success allowed
      await this.runTests();
      
      // Deploy to servers
      await this.deployToServers();
      
      // Health checks
      await this.performHealthChecks();
      
      // Success
      const duration = Date.now() - startTime;
      this.logger.info(`Deployment completed in ${duration}ms`);
      
    } catch (error) {
      // Rollback on failure
      await this.rollback();
      
      // Report errors
      this.errors.report();
      
      throw error;
      
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }
  
  async validate() {
    this.logger.info('Validating deployment configuration');
    
    // Check required fields
    if (!this.config.version) {
      throw new ValidationError('Version is required', 'version', null);
    }
    
    // Check git status
    const status = await $`git status --porcelain`.nothrow();
    if (status.stdout.trim() && !this.config.force) {
      throw new Error('Working directory is not clean (use --force to override)');
    }
  }
  
  async buildWithRetry() {
    this.logger.info('Building application');
    
    await retryWithBackoff(
      async () => {
        const result = await $`npm run build`.nothrow();
        if (result.exitCode !== 0) {
          throw new CommandError(
            'Build failed',
            'npm run build',
            result.exitCode,
            result.stderr
          );
        }
        return result;
      },
      3,
      2000
    );
  }
  
  async runTests() {
    this.logger.info('Running tests');
    
    const testSuites = ['unit', 'integration', 'e2e'];
    const results = await Promise.allSettled(
      testSuites.map(suite => 
        $`npm run test:${suite}`.nothrow()
      )
    );
    
    results.forEach((result, i) => {
      if (result.status === 'rejected' || result.value.exitCode !== 0) {
        this.errors.addError(
          `test:${testSuites[i]}`,
          new Error(`Test suite ${testSuites[i]} failed`)
        );
      }
    });
    
    // Allow deployment if at least unit tests pass
    if (results[0].status === 'rejected' || results[0].value.exitCode !== 0) {
      throw new Error('Critical: Unit tests failed');
    }
  }
  
  async deployToServers() {
    this.logger.info('Deploying to servers');
    
    const results = await deployToServers(this.config.servers);
    
    if (results.failed.length > 0) {
      results.failed.forEach(f => {
        this.errors.addWarning('deployment', `Server ${f.server}: ${f.error}`);
      });
    }
    
    return results;
  }
  
  async performHealthChecks() {
    this.logger.info('Performing health checks');
    
    for (const server of this.config.servers) {
      const health = await $`curl -f http://${server}/health`
        .timeout(5000)
        .nothrow();
      
      if (health.exitCode !== 0) {
        this.errors.addError(
          'health-check',
          new Error(`Health check failed for ${server}`)
        );
      }
    }
    
    if (this.errors.hasErrors()) {
      throw new Error('Health checks failed');
    }
  }
  
  async rollback() {
    this.logger.warn('Rolling back deployment');
    
    try {
      await $`git reset --hard HEAD`;
      await $`npm run rollback`;
    } catch (error) {
      this.logger.error('Rollback failed', error);
    }
  }
  
  async cleanup() {
    this.logger.info('Cleaning up');
    
    try {
      await $`rm -rf ./temp`;
      await $`docker system prune -f`;
    } catch (error) {
      this.logger.warn('Cleanup failed', error);
    }
  }
}

// Main execution
async function main() {
  const config = {
    version: process.env.VERSION || '1.0.0',
    servers: (process.env.SERVERS || 'localhost').split(','),
    force: process.argv.includes('--force')
  };
  
  const manager = new DeploymentManager(config);
  
  try {
    await manager.deploy();
    console.log(chalk.green('✅ Deployment successful!'));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('❌ Deployment failed:'), error.message);
    process.exit(1);
  }
}

await main();
```

This comprehensive example demonstrates:
- Custom error classes for different error types
- Retry logic with exponential backoff
- Partial success handling
- Error collection and aggregation
- Structured logging
- Graceful degradation
- Rollback on failure
- Resource cleanup in finally blocks
- Health checks and validation
- Comprehensive error reporting