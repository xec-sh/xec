---
sidebar_position: 2
title: Error Handling
description: Robust error handling patterns for Xec automation scripts
---

# Error Handling

## Problem

Distributed automation scripts fail in complex ways across different environments. Traditional try-catch blocks don't provide enough context for debugging remote failures, and unhandled errors can leave systems in inconsistent states. Teams need comprehensive error handling strategies that work across local, SSH, Docker, and Kubernetes targets.

## Prerequisites

- Xec CLI installed with @xec-sh/core
- Understanding of JavaScript error handling
- Basic knowledge of async/await patterns
- Familiarity with Xec execution model

## Solution

### Step 1: Basic Error Handling

Implement fundamental error handling patterns:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

// Basic try-catch with context
async function safeExecute(command, context = {}) {
  try {
    const result = await $`${command}`;
    return { success: true, result };
  } catch (error) {
    console.error(`Command failed in ${context.environment || 'unknown'}:`);
    console.error(`  Command: ${error.command}`);
    console.error(`  Exit code: ${error.exitCode}`);
    console.error(`  Error: ${error.stderr || error.message}`);
    
    return {
      success: false,
      error: {
        command: error.command,
        exitCode: error.exitCode,
        stdout: error.stdout,
        stderr: error.stderr,
        context
      }
    };
  }
}

// Usage with error recovery
async function deployWithRecovery() {
  const buildResult = await safeExecute('npm run build', { 
    environment: 'build',
    step: 'compilation' 
  });
  
  if (!buildResult.success) {
    console.log('Build failed, attempting recovery...');
    
    // Clean and retry
    await $`rm -rf dist node_modules`.nothrow();
    await $`npm install`;
    
    const retryResult = await safeExecute('npm run build', {
      environment: 'build',
      step: 'compilation-retry'
    });
    
    if (!retryResult.success) {
      throw new Error('Build failed after retry');
    }
  }
  
  // Continue with deployment
  await $`npm run deploy`;
}

// Graceful degradation
async function executeWithFallback(primary, fallback) {
  try {
    return await $`${primary}`;
  } catch (primaryError) {
    console.warn(`Primary command failed: ${primaryError.message}`);
    console.log('Executing fallback...');
    
    try {
      return await $`${fallback}`;
    } catch (fallbackError) {
      throw new Error(`Both primary and fallback failed: ${fallbackError.message}`);
    }
  }
}

// Example: Try fast method, fall back to safe method
await executeWithFallback(
  'rsync -az --delete source/ dest/',
  'cp -r source/* dest/'
);
```

### Step 2: Error Context and Enrichment

Add detailed context to errors:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

class ExecutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ExecutionError';
    this.timestamp = new Date().toISOString();
    this.details = details;
    this.environment = this.captureEnvironment();
    
    // Capture stack trace
    Error.captureStackTrace(this, ExecutionError);
  }
  
  captureEnvironment() {
    return {
      cwd: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DEBUG: process.env.DEBUG,
        XEC_TARGET: process.env.XEC_TARGET
      }
    };
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      details: this.details,
      environment: this.environment,
      stack: this.stack
    };
  }
}

// Error wrapper with context
class ErrorContext {
  constructor(operation) {
    this.operation = operation;
    this.startTime = Date.now();
    this.metadata = {};
  }
  
  addMetadata(key, value) {
    this.metadata[key] = value;
    return this;
  }
  
  async execute(fn) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        duration: Date.now() - this.startTime
      };
    } catch (error) {
      const enrichedError = new ExecutionError(
        `${this.operation} failed: ${error.message}`,
        {
          operation: this.operation,
          duration: Date.now() - this.startTime,
          metadata: this.metadata,
          originalError: {
            message: error.message,
            code: error.code,
            exitCode: error.exitCode,
            stdout: error.stdout,
            stderr: error.stderr
          }
        }
      );
      
      throw enrichedError;
    }
  }
}

// Usage
async function deployApplication(version) {
  const context = new ErrorContext('Application Deployment')
    .addMetadata('version', version)
    .addMetadata('target', 'production')
    .addMetadata('timestamp', new Date().toISOString());
  
  return await context.execute(async () => {
    await $`git checkout ${version}`;
    await $`npm install`;
    await $`npm run build`;
    await $`npm run deploy`;
  });
}

try {
  await deployApplication('v2.0.0');
} catch (error) {
  console.error('Deployment failed:', JSON.stringify(error, null, 2));
  // Send to monitoring system
  await sendErrorToMonitoring(error);
}
```

### Step 3: Remote Execution Error Handling

Handle errors across different execution targets:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

class RemoteExecutor {
  constructor(targets) {
    this.targets = targets; // Array of SSH/Docker/K8s configs
  }
  
  async executeAll(command, options = {}) {
    const results = await Promise.allSettled(
      this.targets.map(target => this.executeOn(target, command, options))
    );
    
    return this.processResults(results);
  }
  
  async executeOn(target, command, options) {
    const { retries = 3, timeout = 30000 } = options;
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const executor = this.getExecutor(target);
        
        // Add timeout
        const result = await Promise.race([
          executor`${command}`,
          this.timeout(timeout, target)
        ]);
        
        return {
          target: target.name,
          success: true,
          result,
          attempt
        };
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt}/${retries} failed for ${target.name}: ${error.message}`);
        
        if (attempt < retries) {
          // Exponential backoff
          await $.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }
    
    return {
      target: target.name,
      success: false,
      error: this.enrichError(lastError, target),
      attempts: retries
    };
  }
  
  getExecutor(target) {
    switch (target.type) {
      case 'ssh':
        return $.ssh(target.config);
      case 'docker':
        return $.docker(target.config);
      case 'k8s':
        return $.k8s(target.config);
      default:
        return $;
    }
  }
  
  timeout(ms, target) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout after ${ms}ms on ${target.name}`));
      }, ms);
    });
  }
  
  enrichError(error, target) {
    return {
      message: error.message,
      target: target.name,
      type: target.type,
      config: this.sanitizeConfig(target.config),
      timestamp: new Date().toISOString(),
      ...error
    };
  }
  
  sanitizeConfig(config) {
    // Remove sensitive data
    const safe = { ...config };
    delete safe.password;
    delete safe.privateKey;
    delete safe.token;
    return safe;
  }
  
  processResults(results) {
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failed = results.filter(r => r.status === 'rejected' || !r.value?.success);
    
    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      results: results.map(r => r.value || { error: r.reason }),
      allSucceeded: failed.length === 0
    };
  }
}

// Usage
const targets = [
  { name: 'web-1', type: 'ssh', config: { host: 'web1.example.com', username: 'deploy' }},
  { name: 'web-2', type: 'ssh', config: { host: 'web2.example.com', username: 'deploy' }},
  { name: 'worker', type: 'docker', config: { container: 'worker-1' }}
];

const executor = new RemoteExecutor(targets);
const results = await executor.executeAll('systemctl restart app', {
  retries: 3,
  timeout: 60000
});

if (!results.allSucceeded) {
  console.error(`Failed on ${results.failed} targets:`);
  results.results.filter(r => !r.success).forEach(r => {
    console.error(`  - ${r.target}: ${r.error.message}`);
  });
}
```

### Step 4: Transaction-Style Error Recovery

Implement rollback mechanisms:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

class Transaction {
  constructor(name) {
    this.name = name;
    this.steps = [];
    this.completedSteps = [];
    this.state = {};
  }
  
  addStep(name, execute, rollback = null) {
    this.steps.push({ name, execute, rollback });
    return this;
  }
  
  async execute() {
    console.log(`Starting transaction: ${this.name}`);
    
    try {
      for (const step of this.steps) {
        console.log(`Executing: ${step.name}`);
        
        const result = await step.execute(this.state);
        this.state[step.name] = result;
        this.completedSteps.push(step);
        
        console.log(`✓ Completed: ${step.name}`);
      }
      
      console.log(`✅ Transaction completed: ${this.name}`);
      return { success: true, state: this.state };
      
    } catch (error) {
      console.error(`❌ Transaction failed at step: ${this.completedSteps.length + 1}`);
      console.error(`Error: ${error.message}`);
      
      await this.rollback();
      
      throw new Error(`Transaction ${this.name} failed and was rolled back: ${error.message}`);
    }
  }
  
  async rollback() {
    console.log('Starting rollback...');
    
    // Rollback in reverse order
    for (const step of this.completedSteps.reverse()) {
      if (step.rollback) {
        try {
          console.log(`Rolling back: ${step.name}`);
          await step.rollback(this.state);
          console.log(`✓ Rolled back: ${step.name}`);
        } catch (rollbackError) {
          console.error(`Failed to rollback ${step.name}: ${rollbackError.message}`);
          // Continue trying to rollback other steps
        }
      }
    }
    
    console.log('Rollback completed');
  }
}

// Usage example: Database migration with rollback
const migration = new Transaction('Database Migration v2.0');

migration
  .addStep(
    'backup',
    async (state) => {
      const timestamp = Date.now();
      await $`pg_dump mydb > backup-${timestamp}.sql`;
      return { backupFile: `backup-${timestamp}.sql` };
    },
    async (state) => {
      // Rollback: restore from backup
      if (state.backup?.backupFile) {
        await $`psql mydb < ${state.backup.backupFile}`;
      }
    }
  )
  .addStep(
    'migrate-schema',
    async () => {
      await $`psql mydb -f migrations/v2.0-schema.sql`;
      return { version: 'v2.0-schema' };
    },
    async () => {
      await $`psql mydb -f migrations/v2.0-schema-rollback.sql`;
    }
  )
  .addStep(
    'migrate-data',
    async () => {
      await $`psql mydb -f migrations/v2.0-data.sql`;
      return { version: 'v2.0-data' };
    },
    async () => {
      await $`psql mydb -f migrations/v2.0-data-rollback.sql`;
    }
  )
  .addStep(
    'verify',
    async () => {
      const result = await $`psql mydb -c "SELECT version FROM migrations ORDER BY id DESC LIMIT 1"`;
      if (!result.stdout.includes('v2.0')) {
        throw new Error('Migration verification failed');
      }
      return { verified: true };
    }
  );

try {
  await migration.execute();
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
```

### Step 5: Error Aggregation and Reporting

Collect and analyze errors:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';
import fs from 'fs/promises';

class ErrorCollector {
  constructor(options = {}) {
    this.errors = [];
    this.logDir = options.logDir || '.xec/errors';
    this.maxErrors = options.maxErrors || 100;
    this.alertThreshold = options.alertThreshold || 5;
  }
  
  async capture(error, context = {}) {
    const errorRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      error: this.serializeError(error),
      context,
      system: await this.getSystemInfo()
    };
    
    this.errors.push(errorRecord);
    
    // Persist to disk
    await this.save(errorRecord);
    
    // Check if we should alert
    if (this.shouldAlert()) {
      await this.sendAlert(errorRecord);
    }
    
    // Trim old errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
    
    return errorRecord;
  }
  
  serializeError(error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      ...error
    };
  }
  
  async getSystemInfo() {
    const info = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    
    // Add Git info if available
    try {
      const branch = await $`git branch --show-current`.nothrow();
      const commit = await $`git rev-parse HEAD`.nothrow();
      
      if (branch.stdout) {
        info.git = {
          branch: branch.stdout.trim(),
          commit: commit.stdout?.trim()
        };
      }
    } catch {
      // Ignore git errors
    }
    
    return info;
  }
  
  generateId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  async save(errorRecord) {
    await fs.mkdir(this.logDir, { recursive: true });
    
    const filename = `${this.logDir}/${errorRecord.id}.json`;
    await fs.writeFile(filename, JSON.stringify(errorRecord, null, 2));
  }
  
  shouldAlert() {
    const recentErrors = this.errors.filter(e => {
      const errorTime = new Date(e.timestamp);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return errorTime > fiveMinutesAgo;
    });
    
    return recentErrors.length >= this.alertThreshold;
  }
  
  async sendAlert(errorRecord) {
    console.error('⚠️  ERROR THRESHOLD REACHED ⚠️');
    console.error(`${this.errors.length} errors in the last 5 minutes`);
    
    // Send to monitoring service
    if (process.env.SLACK_WEBHOOK) {
      await $`curl -X POST ${process.env.SLACK_WEBHOOK} \
        -H 'Content-Type: application/json' \
        -d '{"text": "Error threshold reached: ${errorRecord.error.message}"}'`.nothrow();
    }
  }
  
  async generateReport() {
    const report = {
      summary: {
        total: this.errors.length,
        timeRange: {
          start: this.errors[0]?.timestamp,
          end: this.errors[this.errors.length - 1]?.timestamp
        }
      },
      byType: {},
      byContext: {},
      topErrors: []
    };
    
    // Group by error type
    this.errors.forEach(e => {
      const type = e.error.name || 'Unknown';
      if (!report.byType[type]) {
        report.byType[type] = { count: 0, errors: [] };
      }
      report.byType[type].count++;
      report.byType[type].errors.push(e.id);
    });
    
    // Group by context
    this.errors.forEach(e => {
      const ctx = e.context.operation || 'unknown';
      if (!report.byContext[ctx]) {
        report.byContext[ctx] = { count: 0, errors: [] };
      }
      report.byContext[ctx].count++;
      report.byContext[ctx].errors.push(e.id);
    });
    
    // Top errors
    const errorCounts = {};
    this.errors.forEach(e => {
      const key = e.error.message;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });
    
    report.topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));
    
    return report;
  }
}

// Global error collector
const errorCollector = new ErrorCollector({
  logDir: '.xec/errors',
  alertThreshold: 5
});

// Wrap execution with error collection
async function monitored(operation, fn) {
  try {
    return await fn();
  } catch (error) {
    await errorCollector.capture(error, { operation });
    throw error;
  }
}

// Usage
await monitored('deployment', async () => {
  await $`npm run deploy`;
});

// Generate report
const report = await errorCollector.generateReport();
console.log('Error Report:', JSON.stringify(report, null, 2));
```

## Best Practices

1. **Fail Fast, Recover Gracefully**
   - Detect errors early
   - Provide clear error messages
   - Implement recovery strategies
   - Clean up resources on failure

2. **Context is King**
   - Include relevant metadata
   - Capture system state
   - Log command outputs
   - Track error patterns

3. **Defensive Programming**
   - Validate inputs
   - Check preconditions
   - Handle edge cases
   - Use safe defaults

4. **Error Classification**
   - Distinguish recoverable vs fatal
   - Categorize by severity
   - Track error frequencies
   - Identify patterns

5. **Testing Error Paths**
   - Test failure scenarios
   - Verify rollback procedures
   - Check error messages
   - Validate recovery logic

## Common Pitfalls

1. **Swallowing Errors**
   - ❌ Empty catch blocks
   - ✅ Always log or re-throw errors

2. **Generic Error Messages**
   - ❌ "Something went wrong"
   - ✅ Include specific context and details

3. **Missing Cleanup**
   - ❌ Leaving resources allocated
   - ✅ Use finally blocks for cleanup

4. **Infinite Retry Loops**
   - ❌ Retrying without limits
   - ✅ Implement exponential backoff with max attempts

5. **Ignoring Partial Failures**
   - ❌ Assuming all-or-nothing
   - ✅ Handle partial success scenarios

## Troubleshooting

### Issue: Errors Without Context
```javascript
// Add global error handlers
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  errorCollector.capture(error, { type: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  errorCollector.capture(error, { type: 'uncaughtException' });
  process.exit(1);
});
```

### Issue: Lost Error Details
```javascript
// Preserve original error
class ChainedError extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
  }
}

throw new ChainedError('High-level operation failed', originalError);
```

### Issue: Timeout Handling
```javascript
// Proper timeout with cleanup
async function withTimeout(promise, ms, cleanup) {
  let timeoutId;
  
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timeout after ${ms}ms`));
        }, ms);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
    if (cleanup) await cleanup();
  }
}
```

### Issue: Resource Leaks
```javascript
// Ensure cleanup with error handling
class ResourceManager {
  constructor() {
    this.resources = [];
  }
  
  async acquire(resource) {
    this.resources.push(resource);
    return resource;
  }
  
  async cleanup() {
    const errors = [];
    
    for (const resource of this.resources) {
      try {
        await resource.close();
      } catch (error) {
        errors.push(error);
      }
    }
    
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Cleanup failed');
    }
  }
  
  async withResources(fn) {
    try {
      return await fn(this);
    } finally {
      await this.cleanup();
    }
  }
}
```

## Related Guides

- [Debugging](../development/debugging.md) - Debug error scenarios
- [Testing](../automation/testing.md) - Test error handling