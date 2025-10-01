---
title: Command Testing
description: Testing strategies and best practices for Xec commands
keywords: [commands, testing, unit tests, integration tests, mocking]
source_files:
  - apps/xec/test/commands/
  - packages/test-utils/src/
  - apps/xec/src/commands/base-command.ts
key_functions:
  - createTestConfig()
  - createMockTarget()
  - TestCommand.execute()
verification_date: 2025-08-03
---

# Command Testing

## Implementation Reference

**Source Files:**
- `apps/xec/test/commands/*.test.ts` - Command test files
- `packages/test-utils/src/config.ts` - Test configuration utilities
- `packages/test-utils/src/mocks.ts` - Mock objects and helpers
- `apps/xec/src/commands/base-command.ts` - Base command for testing

**Test Utilities:**
- `createTestConfig()` - Creates test configuration
- `createMockTarget()` - Creates mock targets
- `createTestCommand()` - Creates test command instances

## Testing Architecture

### Test Structure

Command tests follow a consistent structure:

```typescript
// apps/xec/test/commands/my-command.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyCommand } from '../../src/commands/my-command';
import { createTestConfig } from '@xec-sh/testing';

describe('MyCommand', () => {
  let command: MyCommand;
  let config: Config;
  
  beforeEach(() => {
    config = createTestConfig({
      // Custom config for tests
    });
    command = new MyCommand(
      config,
      '/test/config.yaml',
      false, // verbose
      false, // dryRun
      false, // quiet
      '/test/cwd'
    );
  });
  
  describe('execute', () => {
    it('should execute successfully with valid arguments', async () => {
      const args = ['arg1', 'arg2'];
      const flags = { flag1: true };
      
      await command.execute(args, flags);
      
      // Assertions
    });
  });
});
```

## Unit Testing

### Testing Command Logic

Test core command logic in isolation:

```typescript
describe('command logic', () => {
  it('should parse targets correctly', () => {
    const command = new TestCommand(config);
    const result = command.parseTargets(['user@host', 'docker:container']);
    
    expect(result.targets).toHaveLength(2);
    expect(result.targets[0].type).toBe('ssh');
    expect(result.targets[1].type).toBe('docker');
  });
  
  it('should validate arguments', async () => {
    const command = new TestCommand(config);
    
    await expect(
      command.execute([], {})
    ).rejects.toThrow(ValidationError);
  });
});
```

### Mocking Dependencies

Mock external dependencies:

```typescript
import { vi } from 'vitest';
import { $ } from '@xec-sh/core';

// Mock the execution engine
vi.mock('@xec-sh/core', () => ({
  $: vi.fn(() => ({
    ssh: vi.fn(() => ({
      execute: vi.fn().mockResolvedValue({ stdout: 'output' })
    })),
    docker: vi.fn(() => ({
      execute: vi.fn().mockResolvedValue({ stdout: 'output' })
    }))
  }))
}));

describe('with mocked execution', () => {
  it('should call execution engine correctly', async () => {
    const command = new OnCommand(config);
    await command.execute(['user@host', 'ls'], {});
    
    expect($).toHaveBeenCalled();
    expect($.ssh).toHaveBeenCalledWith(expect.objectContaining({
      host: 'host',
      user: 'user'
    }));
  });
});
```

## Integration Testing

### Testing with Real Execution

Use test containers for integration tests:

```typescript
import { SSHTestContainer } from '@xec-sh/testing';

describe('integration', () => {
  let container: SSHTestContainer;
  
  beforeAll(async () => {
    container = new SSHTestContainer();
    await container.start();
  });
  
  afterAll(async () => {
    await container.stop();
  });
  
  it('should execute on SSH target', async () => {
    const config = createTestConfig({
      targets: {
        test: {
          type: 'ssh',
          host: container.host,
          port: container.port,
          user: 'test',
          password: 'test'
        }
      }
    });
    
    const command = new OnCommand(config);
    await command.execute(['test', 'echo', 'hello'], {});
    
    // Verify output
  });
});
```

### Testing with Docker

```typescript
import { DockerTestContainer } from '@xec-sh/testing';

describe('docker integration', () => {
  let container: DockerTestContainer;
  
  beforeAll(async () => {
    container = new DockerTestContainer('alpine:latest');
    await container.start();
  });
  
  afterAll(async () => {
    await container.stop();
  });
  
  it('should execute in container', async () => {
    const command = new InCommand(config);
    await command.execute([container.id, 'ls', '/'], {});
    
    // Verify output
  });
});
```

## Test Utilities

### Configuration Helpers

Create test configurations:

```typescript
import { createTestConfig } from '@xec-sh/testing';

const config = createTestConfig({
  targets: {
    local: { type: 'local' },
    ssh1: { type: 'ssh', host: 'host1' },
    docker1: { type: 'docker', container: 'container1' }
  },
  tasks: {
    test: {
      command: 'echo test',
      targets: ['local']
    }
  },
  defaults: {
    shell: '/bin/bash',
    timeout: 30000
  }
});
```

### Mock Targets

Create mock targets:

```typescript
import { createMockTarget } from '@xec-sh/testing';

const sshTarget = createMockTarget('ssh', {
  host: 'test.example.com',
  user: 'testuser',
  port: 22
});

const dockerTarget = createMockTarget('docker', {
  container: 'test-container',
  image: 'alpine:latest'
});
```

### Output Capture

Capture command output:

```typescript
import { captureOutput } from '@xec-sh/testing';

it('should output correct message', async () => {
  const output = await captureOutput(async () => {
    await command.execute(['arg'], {});
  });
  
  expect(output.stdout).toContain('Expected message');
  expect(output.stderr).toBe('');
});
```

## Error Testing

### Testing Error Conditions

Test various error scenarios:

```typescript
describe('error handling', () => {
  it('should handle validation errors', async () => {
    const command = new MyCommand(config);
    
    await expect(
      command.execute(['invalid'], {})
    ).rejects.toThrow(ValidationError);
  });
  
  it('should handle connection errors', async () => {
    const config = createTestConfig({
      targets: {
        unreachable: {
          type: 'ssh',
          host: 'unreachable.invalid'
        }
      }
    });
    
    const command = new OnCommand(config);
    
    await expect(
      command.execute(['unreachable', 'ls'], {})
    ).rejects.toThrow(ConnectionError);
  });
  
  it('should handle timeout errors', async () => {
    const command = new MyCommand(config);
    
    await expect(
      command.execute(['long-running'], { timeout: 1 })
    ).rejects.toThrow(TimeoutError);
  });
});
```

### Exit Code Verification

Verify correct exit codes:

```typescript
import { getExitCode } from '@xec-sh/testing';

it('should exit with correct code', async () => {
  const exitCode = await getExitCode(async () => {
    await command.execute(['bad-arg'], {});
  });
  
  expect(exitCode).toBe(1); // ValidationError
});
```

## Flag Testing

### Testing Command Flags

Test flag handling:

```typescript
describe('flags', () => {
  it('should handle verbose flag', async () => {
    const command = new MyCommand(config, '/config', true); // verbose
    const output = await captureOutput(async () => {
      await command.execute(['arg'], {});
    });
    
    expect(output.stdout).toContain('[DEBUG]');
  });
  
  it('should handle dry-run flag', async () => {
    const command = new MyCommand(config, '/config', false, true); // dryRun
    const spy = vi.spyOn(console, 'log');
    
    await command.execute(['arg'], {});
    
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[DRY-RUN]'));
  });
  
  it('should handle quiet flag', async () => {
    const command = new MyCommand(config, '/config', false, false, true); // quiet
    const output = await captureOutput(async () => {
      await command.execute(['arg'], {});
    });
    
    expect(output.stdout).toBe('');
  });
});
```

## Performance Testing

### Testing Command Performance

Measure execution time:

```typescript
import { measureTime } from '@xec-sh/testing';

describe('performance', () => {
  it('should complete within timeout', async () => {
    const { duration } = await measureTime(async () => {
      await command.execute(['arg'], {});
    });
    
    expect(duration).toBeLessThan(1000); // 1 second
  });
  
  it('should handle parallel execution efficiently', async () => {
    const targets = Array.from({ length: 10 }, (_, i) => `target${i}`);
    
    const { duration } = await measureTime(async () => {
      await command.execute(targets, { parallel: true });
    });
    
    // Should be faster than sequential (10 * 100ms)
    expect(duration).toBeLessThan(500);
  });
});
```

### Memory Usage Testing

Monitor memory usage:

```typescript
import { measureMemory } from '@xec-sh/testing';

it('should not leak memory', async () => {
  const initialMemory = measureMemory();
  
  // Run command multiple times
  for (let i = 0; i < 100; i++) {
    await command.execute(['arg'], {});
  }
  
  const finalMemory = measureMemory();
  const memoryIncrease = finalMemory - initialMemory;
  
  // Should not increase significantly
  expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
});
```

## Test Coverage

### Coverage Requirements

Commands should maintain:
- **Line Coverage**: ≥90%
- **Branch Coverage**: ≥85%
- **Function Coverage**: ≥95%

### Coverage Reports

Generate coverage reports:

```bash
# Run tests with coverage
yarn test:coverage

# View HTML report
open coverage/index.html
```

### Coverage Configuration

```javascript
// vitest.config.ts
export default {
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'test/**',
        '*.config.ts',
        'src/types/**'
      ],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 95,
        statements: 90
      }
    }
  }
};
```

## Best Practices

### Test Organization

1. **Group by functionality** - Related tests together
2. **Clear descriptions** - Describe what is being tested
3. **Isolated tests** - No dependencies between tests
4. **Clean setup/teardown** - Proper resource management
5. **Meaningful assertions** - Test actual behavior

### Test Data

```typescript
// Use factories for test data
const createTestArgs = (overrides = {}) => ({
  targets: ['target1'],
  command: 'echo test',
  flags: { verbose: false },
  ...overrides
});

// Use fixtures for complex data
const loadFixture = (name: string) => {
  return fs.readFileSync(`test/fixtures/${name}`, 'utf-8');
};
```

### Async Testing

```typescript
// Always await async operations
it('should handle async operations', async () => {
  const result = await command.execute(['arg'], {});
  expect(result).toBeDefined();
});

// Use async assertions
it('should reject with error', async () => {
  await expect(command.execute([], {})).rejects.toThrow();
});
```

## Common Testing Patterns

### Parameterized Tests

```typescript
describe.each([
  ['user@host', { type: 'ssh', user: 'user', host: 'host' }],
  ['docker:container', { type: 'docker', container: 'container' }],
  ['k8s:pod', { type: 'kubernetes', pod: 'pod' }]
])('parseTarget(%s)', (input, expected) => {
  it(`should parse ${input} correctly`, () => {
    const result = command.parseTarget(input);
    expect(result).toEqual(expected);
  });
});
```

### Snapshot Testing

```typescript
it('should match output snapshot', async () => {
  const output = await command.execute(['arg'], {});
  expect(output).toMatchSnapshot();
});
```

### Spy and Mock Patterns

```typescript
// Spy on methods
const spy = vi.spyOn(command, 'parseTargets');
await command.execute(['arg'], {});
expect(spy).toHaveBeenCalledWith(['arg']);

// Mock external calls
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('content')
}));
```

## Troubleshooting

### Common Issues

1. **Timeout in CI** - Increase test timeout or use test containers
2. **Flaky tests** - Add retries or improve test isolation
3. **Mock not working** - Check mock scope and imports
4. **Coverage gaps** - Add tests for error paths and edge cases

### Debug Strategies

```typescript
// Enable debug output
DEBUG=xec:* yarn test

// Run single test
yarn test -t "should execute successfully"

// Run with inspector
node --inspect yarn test
```

## Related Topics

- [Command Structure](./command-structure.md) - Command architecture
- [Creating Commands](./creating-commands.md) - Command development
- [CI/CD Integration](../../guides/automation/ci-cd-pipelines.md) - Automated testing