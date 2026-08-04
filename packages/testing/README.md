# @xec-sh/testing

Test infrastructure for the Xec packages: managed SSH test containers, kind
cluster management for Kubernetes tests, binary detection, and conditional
test helpers. Used by the integration suites in this repository; published so
the suites can run from an installed package as well.

```bash
npm install -D @xec-sh/testing
```

## SSH test containers

The package manages a fixed fleet of seven SSH containers, one per package
manager, defined in `DOCKER_CONTAINERS`: `ubuntu-apt`, `centos7-yum`,
`fedora-dnf`, `alpine-apk`, `manjaro-pacman`, `ubuntu-brew`, `ubuntu-snap`
(ports 2201-2207).

```typescript
import { $ } from '@xec-sh/core';
import { dockerManager, getSSHConfigByName, describeSSH } from '@xec-sh/testing';

// Start fixtures (or run `pnpm --filter @xec-sh/core docker:start` once)
await dockerManager.startContainer('ubuntu-apt');   // or startAllContainers()
dockerManager.getStatus();

// Connection details for a test
const config = getSSHConfigByName('ubuntu-apt');
// { host: 'localhost', port: 2201, username: 'user', password: 'password', ... }

// describeSSH auto-skips the block when the containers are not running
describeSSH('SSH operations', () => {
  it('executes a remote command', async () => {
    const ssh = $.ssh({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
    });
    const result = await ssh`echo hello`;
    expect(result.stdout).toBe('hello\n');
  });
});

await dockerManager.stopAllContainers();
```

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
validateShellName('bash');  // ok
validateShellName('rm -rf');// throws

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
| `docker` / `execInContainer` / `getContainerInfo` / `getContainerLogs` / `waitForContainer` | Docker helpers for arbitrary containers |
| `cleanupTestContainers` | Remove xec test containers |
| `findBinary` / `isBinaryAvailable` / `clearBinaryCache` | Locate binaries on PATH (synchronous, cached) |
| `isDockerAvailable` / `isKindAvailable` / `isKubectlAvailable` / `isSshpassAvailable` | Environment checks |
| `validateShellName` / `shellEscape` | Shell-argument safety helpers |
| `skipInCI` | Skip a block when running in CI |

## Dependencies

One production dependency: `dockerode`, used by the Docker helper functions.
Container lifecycle for the SSH fixtures shells out to the `docker` CLI.

## License

MIT
