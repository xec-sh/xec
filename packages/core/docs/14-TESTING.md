# 14. Testing Guide

## Overview

Testing in Xec Core covers all levels: from unit tests of individual functions to end-to-end tests of complete workflows. The framework provides built-in utilities for testing tasks, recipes, and integrations.

## Test Environment Setup

### Installing Dependencies

```bash
npm install --save-dev @xec-js/testing jest @types/jest
npm install --save-dev @xec-js/testing-utils
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: '@xec-js/testing/jest-preset',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### Test Helpers Setup

```typescript
// test/helpers/setup.ts
import { TestEnvironment } from '@xec-js/testing';

export const testEnv = new TestEnvironment({
  mockFileSystem: true,
  mockNetwork: true,
  mockTime: true
});

beforeEach(async () => {
  await testEnv.setup();
});

afterEach(async () => {
  await testEnv.cleanup();
});
```

## Unit Testing

### Testing Tasks

```typescript
import { task } from '@xec-js/core';
import { TaskTester } from '@xec-js/testing';

describe('Deploy Task', () => {
  let tester: TaskTester;
  
  beforeEach(() => {
    tester = new TaskTester();
  });
  
  it('should deploy application successfully', async () => {
    // Arrange
    const deployTask = task('deploy')
      .run(async ({ $ }) => {
        await $`git pull`;
        await $`npm install`;
        await $`npm run build`;
        return { version: '2.0.0' };
      })
      .build();
    
    // Mock commands
    tester.mockCommand('git pull', { exitCode: 0 });
    tester.mockCommand('npm install', { exitCode: 0 });
    tester.mockCommand('npm run build', { exitCode: 0 });
    
    // Act
    const result = await tester.run(deployTask);
    
    // Assert
    expect(result.success).toBe(true);
    expect(result.output.version).toBe('2.0.0');
    expect(tester.getExecutedCommands()).toEqual([
      'git pull',
      'npm install',
      'npm run build'
    ]);
  });
  
  it('should handle deployment failure', async () => {
    const deployTask = task('deploy')
      .run(async ({ $ }) => {
        await $`npm run build`;
      })
      .onError(async (error) => {
        return { fallback: true };
      })
      .build();
    
    // Mock failed command
    tester.mockCommand('npm run build', { 
      exitCode: 1,
      stderr: 'Build failed'
    });
    
    const result = await tester.run(deployTask);
    
    expect(result.success).toBe(true);
    expect(result.output.fallback).toBe(true);
  });
});
```

### Testing Conditions and Context

```typescript
describe('Conditional Task', () => {
  it('should skip task when condition is false', async () => {
    const conditionalTask = task('conditional')
      .when(ctx => ctx.environment === 'production')
      .run(async ({ $ }) => {
        await $`deploy-prod`;
      })
      .build();
    
    const tester = new TaskTester({
      context: { environment: 'development' }
    });
    
    const result = await tester.run(conditionalTask);
    
    expect(result.skipped).toBe(true);
    expect(tester.getExecutedCommands()).toHaveLength(0);
  });
  
  it('should execute task with correct context', async () => {
    const contextTask = task('use-context')
      .run(async ({ vars, secrets }) => {
        const apiKey = secrets.get('API_KEY');
        const env = vars.get('environment');
        
        return { apiKey: apiKey.length, env };
      })
      .build();
    
    const tester = new TaskTester({
      variables: { environment: 'staging' },
      secrets: { API_KEY: 'test-key-12345' }
    });
    
    const result = await tester.run(contextTask);
    
    expect(result.output.apiKey).toBe(14);
    expect(result.output.env).toBe('staging');
  });
});
```

### Testing State Management

```typescript
import { StateTester } from '@xec-js/testing';

describe('State Management', () => {
  let stateTester: StateTester;
  
  beforeEach(() => {
    stateTester = new StateTester();
  });
  
  it('should persist state between tasks', async () => {
    const task1 = task('save-state')
      .run(async ({ setState }) => {
        await setState('deployment.version', '2.0.0');
        await setState('deployment.timestamp', Date.now());
      })
      .build();
    
    const task2 = task('read-state')
      .run(async ({ getState }) => {
        const version = await getState('deployment.version');
        return { version };
      })
      .build();
    
    await stateTester.run(task1);
    const result = await stateTester.run(task2);
    
    expect(result.output.version).toBe('2.0.0');
    expect(stateTester.getState('deployment.timestamp')).toBeDefined();
  });
});
```

## Integration Testing

### Testing Recipes

```typescript
import { recipe } from '@xec-js/core';
import { RecipeTester } from '@xec-js/testing';

describe('Deployment Recipe', () => {
  let tester: RecipeTester;
  
  beforeEach(() => {
    tester = new RecipeTester({
      mockIntegrations: ['kubernetes', 'aws']
    });
  });
  
  it('should execute deployment recipe', async () => {
    const deployRecipe = recipe('full-deploy')
      .phase('prepare', phase()
        .task('backup', task()
          .run(async ({ $ }) => {
            await $`backup-db`;
          })
        )
      )
      .phase('deploy', phase()
        .task('update-k8s', task()
          .run(async ({ k8s }) => {
            await k8s.apply({ manifest: 'app.yaml' });
          })
        )
      )
      .phase('verify', phase()
        .task('health-check', task()
          .run(async ({ http }) => {
            const response = await http.get('/health');
            return { healthy: response.status === 200 };
          })
        )
      )
      .build();
    
    // Mock integrations
    tester.mockCommand('backup-db', { exitCode: 0 });
    tester.mockIntegration('kubernetes', 'apply', { success: true });
    tester.mockHttp('GET', '/health', { status: 200 });
    
    // Execute recipe
    const result = await tester.run(deployRecipe);
    
    // Check results
    expect(result.success).toBe(true);
    expect(result.phases).toHaveLength(3);
    expect(result.phases[2].tasks[0].output.healthy).toBe(true);
    
    // Check execution order
    const timeline = tester.getExecutionTimeline();
    expect(timeline).toEqual([
      { type: 'phase', name: 'prepare' },
      { type: 'task', name: 'backup' },
      { type: 'command', command: 'backup-db' },
      { type: 'phase', name: 'deploy' },
      { type: 'task', name: 'update-k8s' },
      { type: 'integration', name: 'kubernetes', method: 'apply' },
      { type: 'phase', name: 'verify' },
      { type: 'task', name: 'health-check' },
      { type: 'http', method: 'GET', url: '/health' }
    ]);
  });
});
```

### Testing Integration Adapters

```typescript
import { IntegrationTester } from '@xec-js/testing';
import { MyCustomAdapter } from '../src/integrations/my-adapter';

describe('Custom Integration Adapter', () => {
  let tester: IntegrationTester;
  let adapter: MyCustomAdapter;
  
  beforeEach(() => {
    adapter = new MyCustomAdapter();
    tester = new IntegrationTester(adapter);
  });
  
  it('should connect successfully', async () => {
    tester.mockResponse('connect', { connected: true });
    
    await adapter.connect({
      host: 'localhost',
      port: 8080
    });
    
    expect(adapter.isConnected()).toBe(true);
  });
  
  it('should execute operations', async () => {
    tester.mockResponse('deploy', {
      id: 'deploy-123',
      status: 'success'
    });
    
    const result = await adapter.execute('deploy', {
      version: '2.0.0'
    });
    
    expect(result.id).toBe('deploy-123');
    expect(result.status).toBe('success');
    
    // Check calls
    expect(tester.getCalls()).toEqual([{
      operation: 'deploy',
      params: { version: '2.0.0' }
    }]);
  });
});
```

## End-to-End Testing

### Testing Complete Workflows

```typescript
import { XecTester } from '@xec-js/testing';
import { Xec } from '@xec-js/core';

describe('E2E Deployment Workflow', () => {
  let xec: Xec;
  let tester: XecTester;
  
  beforeEach(async () => {
    xec = new Xec({
      config: './test/fixtures/xec.config.js'
    });
    
    tester = new XecTester(xec, {
      realFileSystem: false,
      realNetwork: false,
      timeAcceleration: 100 // 100x time acceleration
    });
    
    await tester.setup();
  });
  
  afterEach(async () => {
    await tester.teardown();
  });
  
  it('should complete full deployment workflow', async () => {
    // Prepare file system
    await tester.createFiles({
      '/app/package.json': JSON.stringify({
        name: 'test-app',
        version: '1.0.0'
      }),
      '/app/src/index.js': 'console.log("Hello");'
    });
    
    // Run workflow
    const result = await tester.runRecipe('deploy-production', {
      variables: {
        version: '2.0.0',
        environment: 'production'
      }
    });
    
    // Assertions
    expect(result.success).toBe(true);
    
    // Check state
    const state = await tester.getState();
    expect(state['deployment.version']).toBe('2.0.0');
    expect(state['deployment.status']).toBe('completed');
    
    // Check files
    const deployedFiles = await tester.listFiles('/dist');
    expect(deployedFiles).toContain('index.js');
    
    // Check logs
    const logs = tester.getLogs();
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'info',
        message: 'Deployment completed successfully'
      })
    );
  });
});
```

### Performance Testing

```typescript
import { PerformanceTester } from '@xec-js/testing';

describe('Performance Tests', () => {
  let perfTester: PerformanceTester;
  
  beforeEach(() => {
    perfTester = new PerformanceTester({
      iterations: 100,
      warmup: 10
    });
  });
  
  it('should execute tasks within performance budget', async () => {
    const simpleTask = task('simple')
      .run(async ({ $ }) => {
        await $`echo "test"`;
      })
      .build();
    
    const metrics = await perfTester.measure(simpleTask);
    
    expect(metrics.median).toBeLessThan(100); // ms
    expect(metrics.p95).toBeLessThan(200); // ms
    expect(metrics.memoryUsage).toBeLessThan(50 * 1024 * 1024); // 50MB
  });
  
  it('should handle concurrent executions', async () => {
    const concurrentTask = task('concurrent')
      .run(async ({ $ }) => {
        await $`sleep 0.1`;
      })
      .build();
    
    const results = await perfTester.measureConcurrent(concurrentTask, {
      concurrency: [1, 10, 50, 100],
      duration: 10000 // 10 seconds
    });
    
    // Check scalability
    const throughput1 = results[1].throughput;
    const throughput10 = results[10].throughput;
    
    expect(throughput10).toBeGreaterThan(throughput1 * 8); // 80% efficiency
  });
});
```

## Mock Utilities

### File System Mocking

```typescript
import { mockFS } from '@xec-js/testing';

describe('File Operations', () => {
  beforeEach(() => {
    mockFS({
      '/etc/config.json': JSON.stringify({ key: 'value' }),
      '/var/log': {
        'app.log': 'Log content',
        'error.log': 'Error content'
      }
    });
  });
  
  afterEach(() => {
    mockFS.restore();
  });
  
  it('should read configuration', async () => {
    const task = task('read-config')
      .run(async ({ file }) => {
        const config = await file.readJSON('/etc/config.json');
        return config;
      })
      .build();
    
    const result = await runTask(task);
    expect(result.output.key).toBe('value');
  });
});
```

### Network Mocking

```typescript
import { mockNetwork } from '@xec-js/testing';

describe('API Integration', () => {
  beforeEach(() => {
    mockNetwork();
  });
  
  it('should call external API', async () => {
    mockNetwork.intercept({
      method: 'POST',
      url: 'https://api.example.com/deploy',
      response: {
        status: 200,
        body: { deploymentId: '123' }
      }
    });
    
    const task = task('call-api')
      .run(async ({ http }) => {
        const response = await http.post('https://api.example.com/deploy', {
          json: { version: '2.0.0' }
        });
        return response.json();
      })
      .build();
    
    const result = await runTask(task);
    expect(result.output.deploymentId).toBe('123');
    
    // Check calls
    const calls = mockNetwork.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ version: '2.0.0' });
  });
});
```

### Time Mocking

```typescript
import { mockTime } from '@xec-js/testing';

describe('Scheduled Tasks', () => {
  beforeEach(() => {
    mockTime();
  });
  
  afterEach(() => {
    mockTime.restore();
  });
  
  it('should execute scheduled task', async () => {
    const results: number[] = [];
    
    const scheduledTask = task('scheduled')
      .schedule('*/5 * * * *') // every 5 minutes
      .run(async () => {
        results.push(Date.now());
      })
      .build();
    
    // Start scheduler
    const scheduler = await startScheduler(scheduledTask);
    
    // Advance time by 30 minutes
    mockTime.advance(30 * 60 * 1000);
    
    // Should be 6 executions
    expect(results).toHaveLength(6);
  });
});
```

## Test Patterns

### Testing Error Scenarios

```typescript
describe('Error Handling', () => {
  it('should retry failed operations', async () => {
    let attempts = 0;
    
    const retryTask = task('retry')
      .retry({ attempts: 3, delay: 100 })
      .run(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { success: true };
      })
      .build();
    
    const result = await runTask(retryTask);
    
    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });
  
  it('should rollback on failure', async () => {
    const rollbackExecuted = jest.fn();
    
    const taskWithRollback = task('with-rollback')
      .run(async () => {
        throw new Error('Deploy failed');
      })
      .rollback(async () => {
        rollbackExecuted();
      })
      .build();
    
    await runTask(taskWithRollback);
    
    expect(rollbackExecuted).toHaveBeenCalled();
  });
});
```

### Testing State Transitions

```typescript
describe('State Transitions', () => {
  it('should maintain state consistency', async () => {
    const stateMachine = new StateMachineTester({
      initial: 'idle',
      states: {
        idle: { deploy: 'deploying' },
        deploying: { 
          success: 'deployed',
          failure: 'failed'
        },
        deployed: { rollback: 'idle' },
        failed: { retry: 'deploying' }
      }
    });
    
    const deployWorkflow = recipe('state-workflow')
      .task('deploy', task()
        .run(async ({ state }) => {
          state.transition('deploy');
          // ... deployment logic
          state.transition('success');
        })
      )
      .build();
    
    await stateMachine.test(deployWorkflow);
    
    expect(stateMachine.getCurrentState()).toBe('deployed');
    expect(stateMachine.getTransitions()).toEqual([
      'idle -> deploying',
      'deploying -> deployed'
    ]);
  });
});
```

## Test Configuration

### Environment-specific Testing

```typescript
// test/environments/production.test.ts
describe('Production Environment', () => {
  const env = new TestEnvironment({
    profile: 'production',
    variables: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'error'
    }
  });
  
  it('should use production configuration', async () => {
    const config = await env.loadConfig();
    expect(config.debug).toBe(false);
    expect(config.optimization).toBe(true);
  });
});
```

### Coverage Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverage: true,
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '/.test.ts$/'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/core/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      
      - run: npm ci
      - run: npm test
      - run: npm run test:integration
      - run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Best Practices

1. **Test Isolation** - Each test should be independent
2. **Mock External Dependencies** - Don't make real network calls
3. **Use Test Fixtures** - Reuse test data
4. **Test Error Cases** - Test more than just happy path
5. **Keep Tests Fast** - Use mocks and parallel execution
6. **Meaningful Assertions** - Test business logic, not implementation
7. **Test Documentation** - Document complex test scenarios

## Conclusion

Testing is a critically important part of development with Xec Core. Using the provided utilities and following best practices, you can create reliable and maintainable automations with high confidence in their correctness.