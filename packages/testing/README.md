# @xec-sh/testing

Test infrastructure for the Xec packages: managed SSH test containers, kind
cluster management for Kubernetes tests, binary detection, and conditional
test helpers. Used by the integration suites in this repository; published so
the suites can run from an installed package as well.

```bash
npm install -D @xec-sh/testing vitest
```

Vitest 5.1 is a required peer. Run these helpers inside a Vitest test file, not
with `node test.ts`: Vitest owns their test lifecycle. Use Node 22.12+, Node 24,
or Node 26+ as required by the runner. The Xec CLI itself requires Node 22.18+.

```typescript
// test/shell.test.ts
import { expect, it } from 'vitest';
import { validateShellName } from '@xec-sh/testing';

it('accepts a shell name and rejects shell syntax', () => {
  expect(() => validateShellName('bash', 'shell')).not.toThrow();
  expect(() => validateShellName('bash; echo unsafe', 'shell')).toThrow();
});
```

```bash
npx vitest run test/shell.test.ts
```

## SSH test containers

The package manages a fixed fleet of seven SSH containers, one per package
manager, defined in `DOCKER_CONTAINERS`: `ubuntu-apt`, `centos7-yum`,
`fedora-dnf`, `alpine-apk`, `manjaro-pacman`, `ubuntu-brew`, `ubuntu-snap`
(ports 2201-2207).

```typescript
// test/ssh.test.ts
import { expect, it } from 'vitest';
import { $ } from '@xec-sh/core';
import { getSSHConfig, describeSSH } from '@xec-sh/testing';

describeSSH('SSH operations', () => {
  it('executes on its disposable fixture', async () => {
    const result = await $.ssh(getSSHConfig('ubuntu-apt'))`echo hello`;
    expect(result.stdout).toBe('hello\n');
  });
}, { containers: ['ubuntu-apt'], skipIfNoDocker: true });
```

`describeSSH` starts the requested missing fixture containers in its setup hook
and waits for SSH readiness. It skips when SSH fixtures are disabled or Docker
is unavailable under `skipIfNoDocker`. It does not skip just because a container
has not started yet. Containers remain available for reuse by default; set
`STOP_CONTAINERS_AFTER_TESTS=true` to stop only those this suite started.
Fixture host-key checking is disabled because these disposable containers
regenerate their keys; do not use that policy for production hosts.

`DockerContainerManager` is a singleton — use the exported `dockerManager`
instance or `DockerContainerManager.getInstance()`. It manages the predefined
fixture containers only; it is not a general-purpose container runner.

## Kubernetes via kind

```typescript
import { KindClusterManager, isKindAvailable } from '@xec-sh/testing';

if (isKindAvailable()) {
  const kind = new KindClusterManager({ name: 'xec-test' });
  await kind.createCluster();
  await kind.deployTestPod('test-pod');
  // ... run tests with kind.kubectl(...) ...
  await kind.deleteCluster();
}
```

## Detection and guards

```typescript
import {
  findBinary,
  isDockerAvailable,
  isKindAvailable,
  isKubectlAvailable,
  validateShellName,
  skipInCI,
} from '@xec-sh/testing';

findBinary('docker');       // '/usr/local/bin/docker' or null — synchronous
isDockerAvailable();        // boolean
validateShellName('bash', 'shell');  // ok
validateShellName('rm -rf', 'shell');// throws

skipInCI(() => { /* block that must not run in CI */ });
```

## Exports

| Export | Description |
|--------|-------------|
| `dockerManager` / `DockerContainerManager` | Start/stop the predefined SSH fixture containers, wait for SSH readiness |
| `DOCKER_CONTAINERS` | The seven container definitions (name, port, package manager) |
| `describeSSH` | `describe` that auto-skips when fixtures are unavailable |
| `getSSHConfig` / `getSSHConfigByName` / `SSH_TEST_CONFIGS` | Connection configs for the fixture containers |
| `testEachPackageManager` / `testPackageManagers` | Parameterised tests across the container fleet |
| `KindClusterManager` / `setupKindCluster` / `teardownKindCluster` | kind cluster lifecycle for K8s tests |
| `execInContainer` / `getContainerInfo` / `getContainerLogs` / `waitForContainer` | Docker helpers for arbitrary containers |
| `cleanupTestContainers` | Remove xec test containers |
| `findBinary` / `isBinaryAvailable` / `clearBinaryCache` | Locate binaries on PATH (synchronous, cached) |
| `isDockerAvailable` / `isKindAvailable` / `isKubectlAvailable` / `isSshpassAvailable` | Environment checks |
| `validateShellName` / `shellEscape` | Shell-argument safety helpers |
| `skipInCI` | Skip a block when running in CI |

## Dependencies

Vitest is the required test-runner peer. Docker operations use the Docker CLI;
Kubernetes fixtures also require `kind` and `kubectl`. There is no `dockerode`
runtime dependency or generic mock-container API.

## License

MIT
