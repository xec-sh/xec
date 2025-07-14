# 10. Integration Layer

## Overview

The Xec Core integration layer provides seamless interaction with external systems, tools, and platforms. It is built on the Adapter pattern, making it easy to add new integrations without changing the system core.

## Integration Layer Architecture

### Basic Structure

```typescript
interface IntegrationAdapter {
  // Metadata
  name: string;
  version: string;
  description: string;
  
  // Lifecycle
  connect(config: any): Promise<void>;
  disconnect(): Promise<void>;
  validate(config: any): ValidationResult;
  
  // Main execution method
  execute(operation: string, params: any): Promise<any>;
  
  // Optional capabilities
  capabilities?: string[];
  healthCheck?(): Promise<HealthStatus>;
}
```

### Integration Types

1. **Execution Adapters** - command execution (SSH, Local, Docker)
2. **Cloud Adapters** - cloud providers (AWS, Azure, GCP)
3. **Tool Adapters** - DevOps tools (Terraform, Ansible, Kubernetes)
4. **Service Adapters** - external services (GitHub, Slack, PagerDuty)
5. **Storage Adapters** - storage systems (S3, GCS, FTP)

## Built-in Adapters

### UshAdapter

Primary adapter for command execution via @xec/ush.

```typescript
import { UshAdapter } from '@xec/core/integrations';

const adapter = new UshAdapter({
  defaultTimeout: 300000,
  defaultShell: '/bin/bash',
  env: {
    PATH: '/usr/local/bin:/usr/bin:/bin'
  }
});

// Local execution
await adapter.execute('local', {
  command: 'ls -la',
  cwd: '/tmp'
});

// SSH execution
await adapter.execute('ssh', {
  command: 'uptime',
  host: '10.0.1.1',
  username: 'deploy',
  privateKey: '/path/to/key'
});

// Docker execution
await adapter.execute('docker', {
  command: 'ps aux',
  container: 'myapp',
  user: 'app'
});

// Streaming execution
const stream = await adapter.execute('stream', {
  command: 'tail -f /var/log/app.log',
  onData: (chunk) => console.log(chunk)
});

// Stop the stream
setTimeout(() => stream.kill(), 10000);
```

### KubernetesAdapter

Integration with the Kubernetes API.

```typescript
import { KubernetesAdapter } from '@xec/core/integrations';

const k8s = new KubernetesAdapter({
  kubeconfig: '/home/user/.kube/config',
  context: 'production',
  namespace: 'default'
});

await k8s.connect();

// Deployment operations
await k8s.execute('apply', {
  manifest: {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'nginx' },
    spec: { /* ... */ }
  }
});

await k8s.execute('scale', {
  resource: 'deployment/nginx',
  replicas: 5
});

await k8s.execute('rollout', {
  resource: 'deployment/nginx',
  action: 'restart'
});

// Pod operations
const pods = await k8s.execute('get', {
  resource: 'pods',
  selector: 'app=nginx'
});

await k8s.execute('logs', {
  pod: 'nginx-abc123',
  container: 'nginx',
  tail: 100
});

await k8s.execute('exec', {
  pod: 'nginx-abc123',
  container: 'nginx',
  command: ['sh', '-c', 'nginx -s reload']
});

// ConfigMap and Secrets
await k8s.execute('create-secret', {
  name: 'api-keys',
  data: {
    'api-key': Buffer.from('secret').toString('base64')
  }
});
```

### TerraformAdapter

Integration with Terraform.

```typescript
import { TerraformAdapter } from '@xec/core/integrations';

const terraform = new TerraformAdapter({
  workingDir: './terraform',
  version: '1.5.0',
  autoApprove: false
});

// Initialization
await terraform.execute('init', {
  backend: true,
  upgrade: true
});

// Planning
const plan = await terraform.execute('plan', {
  out: 'tfplan',
  vars: {
    environment: 'production',
    region: 'us-east-1'
  },
  varFile: 'production.tfvars'
});

console.log(`Plan: ${plan.toAdd} to add, ${plan.toChange} to change, ${plan.toDestroy} to destroy`);

// Apply
if (plan.hasChanges) {
  const result = await terraform.execute('apply', {
    plan: 'tfplan',
    parallelism: 10
  });
  
  console.log(`Applied: ${result.outputs}`);
}

// Get outputs
const outputs = await terraform.execute('output', {
  json: true
});

// Import existing resources
await terraform.execute('import', {
  resource: 'aws_instance.web',
  id: 'i-1234567890'
});

// State operations
await terraform.execute('state', {
  command: 'mv',
  source: 'aws_instance.old',
  destination: 'aws_instance.new'
});
```

### AWSAdapter

Integration with AWS SDK.

```typescript
import { AWSAdapter } from '@xec/core/integrations';

const aws = new AWSAdapter({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// EC2 operations
const instances = await aws.execute('ec2.describeInstances', {
  Filters: [
    { Name: 'tag:Environment', Values: ['production'] },
    { Name: 'instance-state-name', Values: ['running'] }
  ]
});

await aws.execute('ec2.startInstances', {
  InstanceIds: ['i-1234567890']
});

// S3 operations
await aws.execute('s3.upload', {
  Bucket: 'my-bucket',
  Key: 'path/to/file.txt',
  Body: 'file content',
  ServerSideEncryption: 'AES256'
});

const objects = await aws.execute('s3.listObjects', {
  Bucket: 'my-bucket',
  Prefix: 'logs/',
  MaxKeys: 1000
});

// Lambda operations
await aws.execute('lambda.invoke', {
  FunctionName: 'my-function',
  Payload: JSON.stringify({ key: 'value' }),
  InvocationType: 'Event'
});

// CloudFormation
await aws.execute('cloudformation.createStack', {
  StackName: 'my-stack',
  TemplateBody: JSON.stringify(template),
  Parameters: [
    { ParameterKey: 'Environment', ParameterValue: 'prod' }
  ]
});

// SSM Parameter Store
await aws.execute('ssm.putParameter', {
  Name: '/myapp/database/password',
  Value: 'secret',
  Type: 'SecureString',
  Overwrite: true
});
```

### DockerAdapter

Integration with the Docker API.

```typescript
import { DockerAdapter } from '@xec/core/integrations';

const docker = new DockerAdapter({
  socketPath: '/var/run/docker.sock',
  // or
  host: 'tcp://remote-docker:2376',
  cert: '/path/to/cert.pem',
  key: '/path/to/key.pem'
});

// Image operations
await docker.execute('pull', {
  image: 'nginx:latest',
  onProgress: (progress) => console.log(progress)
});

await docker.execute('build', {
  context: '.',
  dockerfile: 'Dockerfile',
  tag: 'myapp:latest',
  buildArgs: {
    NODE_VERSION: '18'
  }
});

// Container operations
const container = await docker.execute('run', {
  image: 'nginx:latest',
  name: 'web',
  ports: {
    '80/tcp': '8080'
  },
  volumes: {
    '/data': '/usr/share/nginx/html'
  },
  env: {
    NGINX_HOST: 'example.com'
  },
  restart: 'unless-stopped'
});

await docker.execute('exec', {
  container: 'web',
  command: ['nginx', '-s', 'reload'],
  user: 'root'
});

// Docker Compose
await docker.execute('compose.up', {
  file: 'docker-compose.yml',
  project: 'myapp',
  detach: true,
  build: true
});

// Swarm mode
await docker.execute('service.create', {
  name: 'web',
  image: 'nginx:latest',
  replicas: 3,
  ports: [{ target: 80, published: 8080 }]
});
```

### GitHubAdapter

Integration with the GitHub API.

```typescript
import { GitHubAdapter } from '@xec/core/integrations';

const github = new GitHubAdapter({
  token: process.env.GITHUB_TOKEN,
  baseUrl: 'https://api.github.com' // or GitHub Enterprise
});

// Repository operations
const repo = await github.execute('getRepo', {
  owner: 'myorg',
  repo: 'myapp'
});

// Create release
const release = await github.execute('createRelease', {
  owner: 'myorg',
  repo: 'myapp',
  tag: 'v2.0.0',
  name: 'Release 2.0.0',
  body: 'Release notes...',
  draft: false,
  prerelease: false
});

// Pull Request operations
await github.execute('createPR', {
  owner: 'myorg',
  repo: 'myapp',
  title: 'Feature: Add new functionality',
  body: 'Description...',
  head: 'feature-branch',
  base: 'main'
});

// Actions operations
await github.execute('triggerWorkflow', {
  owner: 'myorg',
  repo: 'myapp',
  workflow: 'deploy.yml',
  ref: 'main',
  inputs: {
    environment: 'production',
    version: '2.0.0'
  }
});

// Issue operations
await github.execute('createIssue', {
  owner: 'myorg',
  repo: 'myapp',
  title: 'Bug: Application crashes',
  body: 'Steps to reproduce...',
  labels: ['bug', 'critical']
});
```

## Creating a Custom Adapter

### Basic Example

```typescript
import { IntegrationAdapter, BaseAdapter } from '@xec/core/integrations';

export class MyServiceAdapter extends BaseAdapter implements IntegrationAdapter {
  name = 'my-service';
  version = '1.0.0';
  description = 'Integration with My Service';
  
  private client: MyServiceClient;
  
  async connect(config: MyServiceConfig): Promise<void> {
    this.validateConfig(config);
    
    this.client = new MyServiceClient({
      apiKey: config.apiKey,
      endpoint: config.endpoint
    });
    
    // Connection check
    await this.client.ping();
    
    this.logger.info('Connected to My Service');
  }
  
  async disconnect(): Promise<void> {
    await this.client?.close();
    this.logger.info('Disconnected from My Service');
  }
  
  async execute(operation: string, params: any): Promise<any> {
    this.ensureConnected();
    
    switch (operation) {
      case 'deploy':
        return this.deploy(params);
      case 'status':
        return this.getStatus(params);
      case 'rollback':
        return this.rollback(params);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
  
  private async deploy(params: DeployParams): Promise<DeployResult> {
    const deployment = await this.client.createDeployment({
      application: params.app,
      version: params.version,
      environment: params.env
    });
    
    // Wait for completion
    while (deployment.status === 'in_progress') {
      await this.wait(5000);
      await deployment.refresh();
    }
    
    return {
      id: deployment.id,
      status: deployment.status,
      url: deployment.url
    };
  }
  
  validate(config: any): ValidationResult {
    const errors = [];
    
    if (!config.apiKey) {
      errors.push({ field: 'apiKey', message: 'API key is required' });
    }
    
    if (!config.endpoint) {
      errors.push({ field: 'endpoint', message: 'Endpoint is required' });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  async healthCheck(): Promise<HealthStatus> {
    try {
      const response = await this.client.getHealth();
      return {
        healthy: response.status === 'ok',
        details: response
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}
```

### Eventful Adapter

```typescript
export class EventfulAdapter extends BaseAdapter {
  name = 'eventful';
  
  async execute(operation: string, params: any): Promise<any> {
    // Emit events
    this.emit('operation:start', { operation, params });
    
    try {
      const result = await this.performOperation(operation, params);
      
      this.emit('operation:complete', { operation, result });
      
      return result;
    } catch (error) {
      this.emit('operation:error', { operation, error });
      throw error;
    }
  }
  
  // Subscribe to events
  onOperationComplete(handler: (event: any) => void): void {
    this.on('operation:complete', handler);
  }
}

// Usage
const adapter = new EventfulAdapter();

adapter.onOperationComplete(({ operation, result }) => {
  console.log(`Operation ${operation} completed:`, result);
});
```

### Adapter with Caching

```typescript
export class CachedAdapter extends BaseAdapter {
  private cache = new Map<string, CacheEntry>();
  
  async execute(operation: string, params: any): Promise<any> {
    const cacheKey = this.getCacheKey(operation, params);
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      this.logger.debug(`Cache hit for ${operation}`);
      return cached.value;
    }
    
    // Execute operation
    const result = await this.performOperation(operation, params);
    
    // Save to cache
    this.cache.set(cacheKey, {
      value: result,
      timestamp: Date.now(),
      ttl: this.getTTL(operation)
    });
    
    return result;
  }
  
  private getCacheKey(operation: string, params: any): string {
    return `${operation}:${JSON.stringify(params)}`;
  }
  
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }
  
  private getTTL(operation: string): number {
    // Different TTLs for different operations
    const ttlMap = {
      'list': 60000,      // 1 minute
      'get': 300000,      // 5 minutes
      'status': 10000     // 10 seconds
    };
    
    return ttlMap[operation] || 30000; // default 30 seconds
  }
}
```

## Registering and Using Adapters

### Registration

```typescript
import { IntegrationRegistry } from '@xec/core';

const registry = new IntegrationRegistry();

// Register built-in adapters
registry.register(new UshAdapter());
registry.register(new KubernetesAdapter());
registry.register(new TerraformAdapter());

// Register custom adapter
registry.register(new MyServiceAdapter());

// With alias
registry.register(new AWSAdapter(), 'aws');
registry.register(new AWSAdapter({ region: 'eu-west-1' }), 'aws-eu');
```

### Usage in Tasks

```typescript
task('deploy-to-k8s')
  .run(async ({ integrations }) => {
    const k8s = await integrations.get('kubernetes');
    
    await k8s.execute('apply', {
      manifest: loadManifest('app.yaml')
    });
    
    await k8s.execute('wait', {
      resource: 'deployment/app',
      condition: 'available',
      timeout: 300
    });
  })
  .build();

// Or via helper
task('terraform-apply')
  .run(async ({ terraform }) => {
    await terraform.init();
    const plan = await terraform.plan();
    
    if (plan.hasChanges) {
      await terraform.apply();
    }
  })
  .build();
```

### Adapter Configuration

```typescript
// In Xec configuration
const xec = new Xec({
  integrations: {
    kubernetes: {
      adapter: 'kubernetes',
      config: {
        kubeconfig: '/home/user/.kube/config',
        context: 'production'
      }
    },
    aws: {
      adapter: 'aws',
      config: {
        region: 'us-east-1',
        profile: 'production'
      }
    },
    github: {
      adapter: 'github',
      config: {
        token: process.env.GITHUB_TOKEN
      }
    }
  }
});

// Or via environment
// XEC_INTEGRATION_KUBERNETES_KUBECONFIG=/home/user/.kube/config
// XEC_INTEGRATION_AWS_REGION=us-east-1
```

## Adapter Middleware

### Logging Middleware

```typescript
class LoggingMiddleware implements AdapterMiddleware {
  async execute(context: MiddlewareContext, next: Next): Promise<any> {
    const start = Date.now();
    const { adapter, operation, params } = context;
    
    console.log(`[${adapter}] Starting ${operation}`);
    
    try {
      const result = await next();
      const duration = Date.now() - start;
      
      console.log(`[${adapter}] Completed ${operation} in ${duration}ms`);
      
      return result;
    } catch (error) {
      console.error(`[${adapter}] Failed ${operation}:`, error);
      throw error;
    }
  }
}
```

### Retry Middleware

```typescript
class RetryMiddleware implements AdapterMiddleware {
  constructor(private options: RetryOptions = {}) {}
  
  async execute(context: MiddlewareContext, next: Next): Promise<any> {
    const { attempts = 3, delay = 1000, backoff = 2 } = this.options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await next();
      } catch (error) {
        lastError = error;
        
        if (attempt < attempts) {
          const waitTime = delay * Math.pow(backoff, attempt - 1);
          console.log(`Retry ${attempt}/${attempts} after ${waitTime}ms`);
          await this.wait(waitTime);
        }
      }
    }
    
    throw lastError!;
  }
}
```

### Applying Middleware

```typescript
const registry = new IntegrationRegistry();

// Globally for all adapters
registry.use(new LoggingMiddleware());
registry.use(new RetryMiddleware({ attempts: 3 }));

// For a specific adapter
registry.register(
  new KubernetesAdapter(),
  {
    middleware: [
      new LoggingMiddleware(),
      new AuthMiddleware()
    ]
  }
);
```

## Integration Testing

### Mock Adapters

```typescript
class MockAdapter extends BaseAdapter {
  private responses = new Map<string, any>();
  
  mock(operation: string, response: any): void {
    this.responses.set(operation, response);
  }
  
  async execute(operation: string, params: any): Promise<any> {
    const response = this.responses.get(operation);
    
    if (response instanceof Error) {
      throw response;
    }
    
    return response || null;
  }
}

// Usage in tests
describe('Deployment Task', () => {
  it('should deploy to kubernetes', async () => {
    const k8sMock = new MockAdapter();
    k8sMock.mock('apply', { success: true });
    k8sMock.mock('wait', { ready: true });
    
    const registry = new IntegrationRegistry();
    registry.register(k8sMock, 'kubernetes');
    
    const result = await deployTask.run({ integrations: registry });
    
    expect(result.success).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('AWS Integration', () => {
  let adapter: AWSAdapter;
  
  beforeEach(async () => {
    adapter = new AWSAdapter({
      region: 'us-east-1',
      endpoint: 'http://localhost:4566' // LocalStack
    });
    
    await adapter.connect();
  });
  
  afterEach(async () => {
    await adapter.disconnect();
  });
  
  it('should create S3 bucket', async () => {
    const result = await adapter.execute('s3.createBucket', {
      Bucket: 'test-bucket'
    });
    
    expect(result.Location).toBeDefined();
  });
});
```

## Best Practices

### 1. Error Handling

```typescript
class RobustAdapter extends BaseAdapter {
  async execute(operation: string, params: any): Promise<any> {
    try {
      return await this.performOperation(operation, params);
    } catch (error) {
      // Convert to standard Xec errors
      if (error.code === 'ECONNREFUSED') {
        throw new NetworkError('Connection refused', { cause: error });
      }
      
      if (error.code === 'UNAUTHORIZED') {
        throw new AuthError('Authentication failed', { cause: error });
      }
      
      // Unknown errors
      throw new IntegrationError(
        `Operation ${operation} failed`,
        { cause: error, adapter: this.name }
      );
    }
  }
}
```

### 2. Parameter Validation

```typescript
class ValidatingAdapter extends BaseAdapter {
  private schemas = new Map<string, Schema>();
  
  registerSchema(operation: string, schema: Schema): void {
    this.schemas.set(operation, schema);
  }
  
  async execute(operation: string, params: any): Promise<any> {
    // Parameter validation
    const schema = this.schemas.get(operation);
    if (schema) {
      const validation = validate(params, schema);
      if (!validation.valid) {
        throw new ValidationError('Invalid parameters', {
          errors: validation.errors
        });
      }
    }
    
    return super.execute(operation, params);
  }
}
```

### 3. Resource Cleanup

```typescript
class CleanupAdapter extends BaseAdapter {
  private resources = new Set<Resource>();
  
  async execute(operation: string, params: any): Promise<any> {
    const result = await super.execute(operation, params);
    
    // Track created resources
    if (operation === 'create') {
      this.resources.add(result);
    }
    
    return result;
  }
  
  async cleanup(): Promise<void> {
    for (const resource of this.resources) {
      try {
        await this.deleteResource(resource);
      } catch (error) {
        this.logger.error(`Failed to cleanup ${resource.id}:`, error);
      }
    }
    
    this.resources.clear();
  }
  
  async disconnect(): Promise<void> {
    await this.cleanup();
    await super.disconnect();
  }
}
```

## Conclusion

The Xec Core integration layer provides a unified way to interact with external systems. Thanks to adapters, middleware, and an extensible architecture, you can easily add support for new tools and services while maintaining a consistent API and testability.