# @xec-sh/test-utils - Shared Testing Utilities

## 🎯 Package Mission
Provides shared testing utilities, Docker containers, and Kubernetes helpers for consistent testing across the Xec monorepo.

## 🏛 Architecture

```
├── docker/           # Docker test utilities
│   ├── container-manager.ts  # Container lifecycle management
│   └── utils.ts             # Docker API utilities
├── k8s/              # Kubernetes test utilities
│   └── kind-cluster-manager.ts  # Kind cluster management
├── helpers/          # General test helpers
│   ├── ssh-test-helpers.ts    # SSH testing utilities
│   └── docker-ssh-manager.sh  # Shell script for containers
└── index.ts          # Public exports
```

## 🐳 Docker Test Containers

### Available Containers
- `ubuntu-apt` (port 2201) - Ubuntu with APT
- `centos7-yum` (port 2202) - CentOS 7 with YUM
- `fedora-dnf` (port 2203) - Fedora with DNF
- `alpine-apk` (port 2204) - Alpine with APK
- `manjaro-pacman` (port 2205) - Manjaro with Pacman
- `ubuntu-brew` (port 2206) - Ubuntu with Homebrew
- `ubuntu-snap` (port 2207) - Ubuntu with Snap

### Container Management
```typescript
import { dockerManager } from '@xec-sh/test-utils';

// Start specific container
await dockerManager.startContainer('ubuntu-apt');

// Start all containers
await dockerManager.startAllContainers();

// Check if Docker is available
if (dockerManager.isDockerAvailable()) {
  // Run Docker tests
}
```

## 🚢 Kubernetes Testing

### Kind Cluster Management
```typescript
import { KindClusterManager } from '@xec-sh/test-utils';

const cluster = new KindClusterManager({ name: 'test-cluster' });

// Create cluster
await cluster.createCluster();

// Deploy test pod
await cluster.deployTestPod('test-pod', 'test-namespace');

// Run kubectl commands
const pods = cluster.kubectl('get pods -n test');

// Cleanup
await cluster.deleteCluster();
cluster.cleanup();
```

## 🧪 SSH Test Helpers

### Test Suite Wrapper
```typescript
import { describeSSH, getSSHConfig, testEachPackageManager } from '@xec-sh/test-utils';

// Automatically manages Docker containers
describeSSH('SSH Tests', () => {
  testEachPackageManager('should install package', async (container) => {
    const config = getSSHConfig(container.name);
    // Test implementation
  });
});
```

### Configuration
```typescript
interface SSHTestConfig {
  containers?: string[];      // Specific containers to start
  timeout?: number;          // Container operation timeout
  skipIfNoDocker?: boolean;  // Skip if Docker unavailable
}
```

## 🔧 Docker Utilities

### Container Information
```typescript
import { getContainerInfo, waitForContainer } from '@xec-sh/test-utils';

const info = await getContainerInfo('mycontainer');
await waitForContainer('mycontainer', 5000);
```

### Container Execution
```typescript
import { execInContainer } from '@xec-sh/test-utils';

const result = await execInContainer('mycontainer', ['ls', '-la']);
console.log(result.stdout);
```

### Container Logs
```typescript
import { getContainerLogs } from '@xec-sh/test-utils';

const { stdout, stderr } = await getContainerLogs('mycontainer');
```

## 📋 Usage in Tests

### In package.json
```json
{
  "devDependencies": {
    "@xec-sh/test-utils": "workspace:*"
  }
}
```

### In Tests
```typescript
import { 
  dockerManager,
  KindClusterManager,
  describeSSH,
  SSH_TEST_CONFIGS 
} from '@xec-sh/test-utils';

// Use utilities as needed
```

## 🚨 Important Notes

1. **Docker Dependency**: Most utilities require Docker to be installed
2. **Port Conflicts**: Ensure ports 2201-2207 are available for SSH containers
3. **Cleanup**: Containers are automatically cleaned up after tests
4. **CI Optimization**: Minimal container set used in CI environments
5. **Symlink Structure**: Docker images are symlinked from root `/docker` directory

## ⚡ Performance Tips

- Use `startRequiredContainers()` for faster startup
- Containers are reused between test runs when possible
- Kind clusters persist during test session
- SSH connections are pooled and reused

## 🔮 Future Enhancements

- Additional container images (more distros/package managers)
- Podman support alongside Docker
- Test fixture generation utilities
- Mock service containers (databases, message queues)
- Performance benchmarking utilities