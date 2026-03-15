# @xec-sh/testing

Test utilities for xec packages, providing Docker container management, SSH test helpers, Kubernetes cluster management, and binary detection.

## Install

```bash
pnpm add -D @xec-sh/testing
```

## Quick Start

```typescript
import {
  DockerContainerManager,
  isDockerAvailable,
  findBinary,
} from '@xec-sh/testing';

// Manage Docker containers for integration tests
const manager = new DockerContainerManager();
const container = await manager.start({
  image: 'node:20-alpine',
  name: 'test-node',
});
// ... run tests against container ...
await manager.stop('test-node');
await manager.cleanup();
```

```typescript
import {
  describeSSH,
  getSSHConfigByName,
  SSH_TEST_CONFIGS,
} from '@xec-sh/testing';

// SSH integration tests (auto-skipped when SSH containers unavailable)
describeSSH('SSH operations', () => {
  it('should execute remote command', async () => {
    const config = getSSHConfigByName('ubuntu-apt');
    // config.host, config.port, config.username, config.password
    const result = await sshExec(config, 'echo hello');
    expect(result.stdout).toBe('hello\n');
  });
});

// Test across multiple package managers
// SSH_TEST_CONFIGS includes: ubuntu-apt, centos7-yum, fedora-dnf,
//   alpine-apk, manjaro-pacman, ubuntu-brew, ubuntu-snap
```

```typescript
import { KindClusterManager, isKindAvailable } from '@xec-sh/testing';
import { validateShellName } from '@xec-sh/testing';

// Kubernetes testing with kind
if (await isKindAvailable()) {
  const kind = new KindClusterManager();
  await kind.create('test-cluster');
  // ... run k8s tests ...
  await kind.delete('test-cluster');
}

// Binary detection
const docker = await findBinary('docker');
const available = await isDockerAvailable();

// Shell argument validation
validateShellName('bash');  // ok
validateShellName('rm -rf'); // throws
```

## API

| Export | Description |
|--------|-------------|
| `DockerContainerManager` | Start, stop, and manage Docker containers for tests |
| `docker` / `execInContainer` / `getContainerInfo` / `getContainerLogs` | Docker utility functions |
| `cleanupTestContainers` | Remove all xec test containers |
| `KindClusterManager` | Create and manage kind clusters for K8s testing |
| `describeSSH` | Conditional describe block for SSH tests |
| `getSSHConfigByName` | Get SSH config for a named test container |
| `SSH_TEST_CONFIGS` | Array of SSH connection configs for all test containers |
| `findBinary` | Locate a binary on the system PATH |
| `isDockerAvailable` | Check if Docker daemon is running |
| `isKindAvailable` | Check if kind is installed |
| `validateShellName` | Validate a shell name is safe |

## Features

- DockerContainerManager for lifecycle management of test containers
- SSH test helpers with `describeSSH` (auto-skips when containers unavailable)
- Pre-configured SSH test containers: Ubuntu (apt), CentOS (yum), Fedora (dnf), Alpine (apk), Manjaro (pacman), Ubuntu (brew), Ubuntu (snap)
- KindClusterManager for Kubernetes integration testing
- Binary detection with `findBinary`, `isDockerAvailable`, `isKindAvailable`
- Shell argument validation with `validateShellName`
- `TEST_SSH_PASSWORD` constant for test container authentication
- Docker utility functions: exec, logs, info, cleanup

## License

MIT
