---
title: Command Testing
description: Verify dynamic commands through Vitest, public Xec APIs and the real CLI
keywords: [commands, testing, unit tests, integration tests, Vitest]
source_files:
  - apps/xec/test/globals-parity.test.ts
  - packages/testing/src/index.ts
  - packages/testing/src/helpers/ssh-test-helpers.ts
---

# Command Testing

Test application logic with Vitest, then invoke the installed CLI to verify discovery,
argument parsing, output and exit status. `@xec-sh/testing` supplies disposable SSH
and Kubernetes fixtures and binary detection. It does not export command mocks,
`createTestConfig`, `captureOutput`, or a replacement test runner.

## Implementation Reference

The public exports are in `packages/testing/src/index.ts`. The CLI's own
`apps/xec/test/globals-parity.test.ts` demonstrates testing the built entry point.
Applications should test their public `.xec/commands` contract without importing
private CLI command classes.

## Testing Architecture

### Test Structure

Install the helper package and its required Vitest runner:

```bash
npm install --save-dev @xec-sh/testing vitest
npx vitest run
```

The runner requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`; running Xec CLI also
requires Node 22.18 or newer. Put examples in ordinary `*.test.ts` files.

```typescript
import { describe, expect, it } from 'vitest';
import { validateShellName } from '@xec-sh/testing';

describe('fixture names', () => {
  it('rejects shell syntax in a container name', () => {
    expect(() => validateShellName('fixture; exit 0', 'container')).toThrow();
  });
});
```

## Unit Testing

### Testing Command Logic

Keep parsing and business rules in application functions. Test their observable
result or error; avoid copying the implementation into the assertion.

### Mocking Dependencies

Inject an application dependency when isolation is needed. Mock the actual callable
contract rather than inventing methods on `$` or a fake Xec target.

```typescript
import { expect, it, vi } from 'vitest';

async function readiness(read: () => Promise<string>) {
  return (await read()).trim() === 'ready';
}

it('reports an unavailable service', async () => {
  const read = vi.fn(async () => 'starting');
  expect(await readiness(read)).toBe(false);
  expect(read).toHaveBeenCalledOnce();
});
```

## Integration Testing

### Testing with Real Execution

`describeSSH` selects the named fixture, starts it when necessary and registers
Vitest lifecycle hooks. The example below is an integration test: it requires
Docker and uses the helper's `alpine-apk` fixture.

```typescript
import { expect, it } from 'vitest';
import { $ } from '@xec-sh/core';
import { describeSSH, getSSHConfig } from '@xec-sh/testing';

describeSSH('SSH command', () => {
  it('preserves the remote command result', async () => {
    const target = $.ssh(getSSHConfig('alpine-apk'));
    const result = await target`printf fixture-ready`;
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('fixture-ready');
  });
}, { containers: ['alpine-apk'], skipIfNoDocker: true });
```

### Testing with Docker

`dockerManager` manages the package's named SSH-container fixtures; it is not a
generic `DockerTestContainer` constructor. For application containers, invoke the
ordinary Xec Docker API and own the exact resources created by your test.

A disabled suite or unavailable Docker can be skipped by `describeSSH`. Inspect
runner skip counts: a skipped integration test is not evidence of a working
transport. `SKIP_SSH_DOCKER_TESTS=true` explicitly disables these fixtures.
They are retained for reuse by default; `STOP_CONTAINERS_AFTER_TESTS=true` requests
cleanup of the fixtures started by this manager.

## Test Utilities

### Configuration Helpers

Use the public `Configuration` type for application fixtures. Write a private
`.xec/config.yaml` when exercising the real CLI, and set its working directory to
that private project. Do not point fixture cleanup at a developer's active project.

```typescript
import type { Configuration } from '@xec-sh/ops';

const fixture: Configuration = {
  version: '1.0',
  tasks: { inspect: { command: 'printf fixture-ready' } },
};
```

### Mock Targets

Prefer the public Core mock adapter for execution-policy tests and real isolated
targets for transport behavior. A mock cannot establish SSH host-key verification,
remote cancellation or preservation of actual files.

### Output Capture

Capture a child process's stdout/stderr at the CLI boundary. This example resolves
the CLI installed in the test project and runs only a local expression:

```typescript
import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';

it('exposes the default local target through the real CLI', async () => {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('@xec-sh/cli/package.json')), 'bin/xec');
  const result = await promisify(execFile)(process.execPath, [
    cli, 'run', '-e', 'console.log($targetInfo.type)',
  ]);
  expect(result.stdout.trim()).toBe('local');
  expect(result.stderr).toBe('');
});
```

## Error Testing

### Testing Error Conditions

Assert both the rejection and its reason. For failures that intentionally return
an `ExecutionResult`, inspect `exitCode`, `stderr` and `cause`. `.nothrow()` does not
mean the command succeeded.

### Exit Code Verification

```typescript
import { expect, it } from 'vitest';
import { $ } from '@xec-sh/core';

it('retains a failed command status', async () => {
  const result = await $`${process.execPath} -e ${'process.exitCode = 7'}`.nothrow();
  expect(result.exitCode).toBe(7);
  expect(result.ok).toBe(false);
});
```

## Flag Testing

### Testing Command Flags

Exercise the public command with accepted, missing and invalid arguments. Check
that `--help` describes the registered options. For `--dry-run`, assert that the
application's intended side effect did not happen; printing a plan alone is not
proof of a dry run.

## Performance Testing

### Testing Command Performance

Measure repeated executions with `performance.now()` on an isolated benchmark.
Avoid strict wall-clock thresholds in a concurrently running unit-test suite.

### Memory Usage Testing

Track memory over a sustained workload and await cleanup before comparing retained
resources. One `process.memoryUsage()` difference does not prove a leak.

## Test Coverage

### Coverage Requirements

Cover success, rejected input, command failure and cancellation. Transport tests
also need exact target selection, stream completion and owned-resource cleanup.

### Coverage Reports

```bash
npm install --save-dev @vitest/coverage-v8
npx vitest run --coverage
```

### Coverage Configuration

Use a coverage provider version compatible with your installed Vitest. Keep unit
coverage separate from evidence for real SSH, Docker or Kubernetes behavior.

## Best Practices

### Test Organization

Keep fixtures private to a test run and make all process owners await termination.
Test the standard public path at least once instead of only calling internal code.

### Test Data

Use synthetic credentials and small fixtures. Never reuse production databases,
secrets or container names in a cleanup test.

### Async Testing

Await every operation and cleanup promise. Attach rejection handling to streams
and long-running processes immediately, not after an unrelated operation finishes.

## Common Testing Patterns

### Parameterized Tests

```typescript
import { expect, it } from 'vitest';
import { validateShellName } from '@xec-sh/testing';

it.each(['fixture-one', 'fixture_two'])('accepts fixture %s', name => {
  expect(() => validateShellName(name, 'container')).not.toThrow();
});
```

### Snapshot Testing

Snapshot stable user-visible plans or help text. Exclude random IDs, timestamps and
secrets; assert important status and target fields directly.

### Spy and Mock Patterns

Restore Vitest spies after each test. Use mocks to verify your integration boundary,
then retain a real CLI or transport test for the behavior behind it.

## Troubleshooting

### Common Issues

- Undefined `describe` or `it`: import them from `vitest` in the test file.
- Missing fixture: inspect Docker availability and the runner's skip reason.
- Hanging suite: inspect unawaited streams, child processes and cleanup promises.
- `@xec-sh/testing` imported outside a runner: execute the file with Vitest.

### Debug Strategies

```bash
npx vitest run test/command.test.ts --reporter=verbose
```

## Related Topics

- [Creating Commands](./creating-commands.md)
- [Command Structure](./command-structure.md)
- [CLI Reference](../cli-reference.md)
