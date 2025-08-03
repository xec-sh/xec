# Extensions

The Xec execution engine provides powerful extension mechanisms to add custom functionality, create new adapters, and integrate with external systems.

## Overview

Extension support (`packages/core/src/core/extensions.ts`) provides:

- **Custom adapter creation** for new environments
- **Plugin system** for modular features
- **Hook system** for lifecycle events
- **Custom commands** and methods
- **Middleware integration** for cross-cutting concerns
- **Type-safe extensions** with TypeScript

## Custom Adapters

### Creating an Adapter

```typescript
import { BaseAdapter, AdapterConfig, ExecutionResult } from '@xec-sh/core';

// Custom adapter for a new environment
class CustomAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }
  
  async execute(command: string, options: any): Promise<ExecutionResult> {
    // Custom execution logic
    const result = await this.runCommand(command, options);
    
    return {
      stdout: result.output,
      stderr: result.errors,
      exitCode: result.code,
      duration: result.time
    };
  }
  
  async connect(): Promise<void> {
    // Establish connection to custom environment
    await this.establishConnection();
  }
  
  async disconnect(): Promise<void> {
    // Clean up resources
    await this.cleanup();
  }
  
  async healthCheck(): Promise<boolean> {
    // Check if adapter is healthy
    return await this.ping();
  }
}

// Register adapter
$.registerAdapter('custom', CustomAdapter);

// Use custom adapter
await $.custom({ config: 'value' })`command`;
```

### Adapter with Connection Pooling

```typescript
class PooledAdapter extends BaseAdapter {
  private pool: ConnectionPool;
  
  constructor(config: AdapterConfig) {
    super(config);
    this.pool = new ConnectionPool({
      min: 2,
      max: 10,
      idleTimeout: 60000
    });
  }
  
  async execute(command: string, options: any): Promise<ExecutionResult> {
    const connection = await this.pool.acquire();
    
    try {
      return await connection.execute(command, options);
    } finally {
      await this.pool.release(connection);
    }
  }
  
  async getPoolStats() {
    return this.pool.getStats();
  }
}
```

## Plugin System

### Creating Plugins

```typescript
// Plugin interface
interface XecPlugin {
  name: string;
  version: string;
  initialize(engine: ExecutionEngine): void;
  destroy?(): Promise<void>;
}

// Example plugin
class LoggingPlugin implements XecPlugin {
  name = 'logging';
  version = '1.0.0';
  
  initialize(engine: ExecutionEngine) {
    // Add logging to all commands
    engine.on('command:start', this.logStart);
    engine.on('command:complete', this.logComplete);
    engine.on('command:error', this.logError);
    
    // Add custom method
    engine.addMethod('logged', (command: any) => {
      return command
        .on('output', (data: any) => console.log('Output:', data));
    });
  }
  
  private logStart = (event: any) => {
    console.log(`[${event.id}] Starting: ${event.command}`);
  };
  
  private logComplete = (event: any) => {
    console.log(`[${event.id}] Completed in ${event.duration}ms`);
  };
  
  private logError = (event: any) => {
    console.error(`[${event.id}] Error:`, event.error);
  };
  
  async destroy() {
    console.log('Logging plugin destroyed');
  }
}

// Register and use plugin
$.use(new LoggingPlugin());

// Now all commands have logging
await $`command`.logged();
```

### Plugin with Configuration

```typescript
class MetricsPlugin implements XecPlugin {
  name = 'metrics';
  version = '1.0.0';
  private metrics: Map<string, any> = new Map();
  
  constructor(private config: {
    endpoint: string;
    interval: number;
    tags: Record<string, string>;
  }) {}
  
  initialize(engine: ExecutionEngine) {
    // Collect metrics
    engine.on('command:complete', (event) => {
      this.recordMetric({
        command: event.command,
        duration: event.duration,
        exitCode: event.exitCode,
        timestamp: Date.now()
      });
    });
    
    // Send metrics periodically
    setInterval(() => this.sendMetrics(), this.config.interval);
  }
  
  private recordMetric(metric: any) {
    const key = `${metric.command}:${Date.now()}`;
    this.metrics.set(key, metric);
  }
  
  private async sendMetrics() {
    const batch = Array.from(this.metrics.values());
    this.metrics.clear();
    
    await fetch(this.config.endpoint, {
      method: 'POST',
      body: JSON.stringify({
        metrics: batch,
        tags: this.config.tags
      })
    });
  }
}

// Use configured plugin
$.use(new MetricsPlugin({
  endpoint: 'https://metrics.example.com/api',
  interval: 60000,
  tags: { service: 'xec', environment: 'production' }
}));
```

## Custom Commands

### Adding Global Commands

```typescript
// Add custom command method
$.addCommand('deploy', async function(this: ExecutionEngine, target: string) {
  const config = await this`cat deploy.json`.json();
  
  const steps = [
    this`git pull`,
    this`npm install`,
    this`npm run build`,
    this`rsync -av dist/ ${target}:/var/www/`
  ];
  
  for (const step of steps) {
    await step;
  }
  
  return { success: true, target };
});

// Use custom command
await $.deploy('user@server.com');
```

### Command with Options

```typescript
interface DeployOptions {
  environment: 'dev' | 'staging' | 'prod';
  version?: string;
  skipTests?: boolean;
}

$.addCommand('smartDeploy', async function(
  this: ExecutionEngine,
  options: DeployOptions
) {
  // Validate options
  if (!options.environment) {
    throw new Error('Environment is required');
  }
  
  // Build command based on options
  let pipeline = [
    this`git fetch`,
    this`git checkout ${options.version || 'main'}`
  ];
  
  if (!options.skipTests) {
    pipeline.push(this`npm test`);
  }
  
  pipeline.push(
    this`npm run build:${options.environment}`,
    this`deploy-${options.environment}.sh`
  );
  
  // Execute pipeline
  for (const cmd of pipeline) {
    await cmd;
  }
});

// Use with options
await $.smartDeploy({
  environment: 'staging',
  version: 'v1.2.3',
  skipTests: false
});
```

## Middleware System

### Creating Middleware

```typescript
// Middleware interface
type Middleware = (context: ExecutionContext, next: () => Promise<any>) => Promise<any>;

// Timing middleware
const timingMiddleware: Middleware = async (context, next) => {
  const start = Date.now();
  try {
    const result = await next();
    console.log(`Command took ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.log(`Command failed after ${Date.now() - start}ms`);
    throw error;
  }
};

// Auth middleware
const authMiddleware: Middleware = async (context, next) => {
  // Add authentication headers
  context.env.AUTH_TOKEN = await getAuthToken();
  return next();
};

// Retry middleware
const retryMiddleware: Middleware = async (context, next) => {
  let lastError;
  for (let i = 0; i < 3; i++) {
    try {
      return await next();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${i + 1} failed, retrying...`);
    }
  }
  throw lastError;
};

// Apply middleware
$.useMiddleware(timingMiddleware);
$.useMiddleware(authMiddleware);
$.useMiddleware(retryMiddleware);
```

### Conditional Middleware

```typescript
// Middleware that applies conditionally
const conditionalMiddleware: Middleware = async (context, next) => {
  // Only apply to production
  if (context.env.NODE_ENV === 'production') {
    // Add production-specific behavior
    context.timeout = 300000;
    context.retries = 5;
  }
  
  return next();
};

// Environment-specific middleware
const environmentMiddleware: Middleware = async (context, next) => {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      context.env.LOG_LEVEL = 'error';
      break;
    case 'staging':
      context.env.LOG_LEVEL = 'warning';
      break;
    default:
      context.env.LOG_LEVEL = 'debug';
  }
  
  return next();
};
```

## Hook System

### Lifecycle Hooks

```typescript
// Register lifecycle hooks
$.addHook('beforeExecute', async (context) => {
  console.log('Before executing:', context.command);
  // Modify context if needed
  context.env.TIMESTAMP = Date.now().toString();
});

$.addHook('afterExecute', async (context, result) => {
  console.log('After executing:', context.command);
  console.log('Result:', result.exitCode);
  // Can modify result
  result.metadata = { executedAt: Date.now() };
});

$.addHook('onError', async (context, error) => {
  console.error('Error in command:', context.command);
  console.error('Error details:', error);
  // Can transform error
  error.context = context;
});
```

### Async Hooks

```typescript
// Hooks can be async
$.addHook('beforeExecute', async (context) => {
  // Fetch configuration from remote
  const config = await fetch('https://api.example.com/config')
    .then(r => r.json());
  
  // Apply configuration
  Object.assign(context.env, config.environment);
});

// Chain multiple hooks
$.addHook('afterExecute', async (context, result) => {
  // Log to remote service
  await logToService({
    command: context.command,
    result: result.exitCode,
    duration: result.duration
  });
});

$.addHook('afterExecute', async (context, result) => {
  // Send metrics
  await sendMetrics({
    command: context.command,
    success: result.exitCode === 0
  });
});
```

## Type Extensions

### Extending Types

```typescript
// Extend ExecutionEngine with custom methods
declare module '@xec-sh/core' {
  interface ExecutionEngine {
    deploy(target: string): Promise<any>;
    backup(destination: string): Promise<any>;
    healthCheck(): Promise<boolean>;
  }
}

// Implement extensions
ExecutionEngine.prototype.deploy = async function(target: string) {
  return this`deploy.sh ${target}`;
};

ExecutionEngine.prototype.backup = async function(destination: string) {
  return this`backup.sh ${destination}`;
};

ExecutionEngine.prototype.healthCheck = async function() {
  const result = await this`health-check.sh`.nothrow();
  return result.ok;
};

// Now available with type safety
await $.deploy('production');
await $.backup('/backups/daily');
const healthy = await $.healthCheck();
```

### Custom Result Types

```typescript
// Extend result types
interface CustomResult extends ExecutionResult {
  metrics?: {
    cpuUsage: number;
    memoryUsage: number;
    networkIO: number;
  };
  logs?: string[];
}

// Custom adapter returning extended result
class MetricsAdapter extends BaseAdapter {
  async execute(command: string, options: any): Promise<CustomResult> {
    const result = await super.execute(command, options);
    
    // Add custom metrics
    return {
      ...result,
      metrics: await this.collectMetrics(),
      logs: await this.collectLogs()
    };
  }
  
  private async collectMetrics() {
    // Collect system metrics
    return {
      cpuUsage: 45.2,
      memoryUsage: 1024,
      networkIO: 5000
    };
  }
  
  private async collectLogs() {
    // Collect relevant logs
    return ['Log entry 1', 'Log entry 2'];
  }
}
```

## Integration Examples

### Database Integration

```typescript
// Database command extension
class DatabaseExtension {
  constructor(private dbConfig: any) {}
  
  register(engine: ExecutionEngine) {
    engine.addCommand('dbQuery', async function(this: ExecutionEngine, query: string) {
      const result = await this`psql -c "${query}" ${this.dbConfig.connectionString}`;
      return result.stdout;
    });
    
    engine.addCommand('dbBackup', async function(this: ExecutionEngine) {
      const timestamp = new Date().toISOString();
      const filename = `backup-${timestamp}.sql`;
      await this`pg_dump ${this.dbConfig.connectionString} > ${filename}`;
      return filename;
    });
  }
}

// Register extension
const dbExt = new DatabaseExtension({
  connectionString: 'postgresql://localhost/mydb'
});
dbExt.register($);

// Use database commands
const users = await $.dbQuery('SELECT * FROM users');
const backupFile = await $.dbBackup();
```

### Cloud Provider Integration

```typescript
// AWS integration extension
class AWSExtension {
  register(engine: ExecutionEngine) {
    // Add S3 commands
    engine.addCommand('s3Upload', async function(
      this: ExecutionEngine,
      local: string,
      bucket: string
    ) {
      return this`aws s3 cp ${local} s3://${bucket}/`;
    });
    
    // Add EC2 commands
    engine.addCommand('ec2List', async function(this: ExecutionEngine) {
      const result = await this`aws ec2 describe-instances --output json`;
      return JSON.parse(result.stdout);
    });
    
    // Add Lambda commands
    engine.addCommand('lambdaInvoke', async function(
      this: ExecutionEngine,
      functionName: string,
      payload: any
    ) {
      const payloadStr = JSON.stringify(payload);
      return this`aws lambda invoke --function-name ${functionName} --payload '${payloadStr}' output.json`;
    });
  }
}

// Use AWS commands
await $.s3Upload('file.txt', 'my-bucket');
const instances = await $.ec2List();
await $.lambdaInvoke('my-function', { key: 'value' });
```

## Best Practices

### Do's ✅

```typescript
// ✅ Keep extensions focused
class SinglePurposeExtension {
  register(engine: ExecutionEngine) {
    // Do one thing well
  }
}

// ✅ Provide cleanup methods
class CleanableExtension {
  async destroy() {
    // Clean up resources
  }
}

// ✅ Document extension behavior
/**
 * Adds retry capability to all commands
 */
class RetryExtension { /* ... */ }

// ✅ Make extensions configurable
class ConfigurableExtension {
  constructor(private options: ExtensionOptions) {}
}
```

### Don'ts ❌

```typescript
// ❌ Don't modify global state
class BadExtension {
  register() {
    process.env.NODE_ENV = 'production';  // Bad!
  }
}

// ❌ Don't create naming conflicts
$.addCommand('exec', () => {});  // Conflicts with built-in

// ❌ Don't leak resources
class LeakyExtension {
  register() {
    setInterval(() => {}, 1000);  // Never cleaned up
  }
}

// ❌ Don't throw in initialization
class ThrowingExtension {
  register() {
    throw new Error('Failed');  // Will break everything
  }
}
```

## Implementation Details

Extensions are implemented in:
- `packages/core/src/core/extensions.ts` - Extension system
- `packages/core/src/core/plugin-manager.ts` - Plugin management
- `packages/core/src/core/hook-system.ts` - Hook system
- `packages/core/src/core/middleware.ts` - Middleware support

## See Also

- [Execution API](/docs/core/execution-engine/api/execution-api)
- [Custom Adapters](/docs/core/execution-engine/adapters/concept)