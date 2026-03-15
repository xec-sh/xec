# Docker Environment Setup

The Docker adapter enables seamless command execution within Docker containers, supporting both existing containers and ephemeral runs. It provides full lifecycle management, volume mounting, and container orchestration capabilities.

## Installation and Prerequisites

### Docker Installation
Ensure Docker is installed and accessible:

```bash
# Check Docker installation
docker --version
docker info
```

The Docker adapter automatically detects Docker installations in common locations:
- `/usr/local/bin/docker` (Docker Desktop on macOS)
- `/usr/bin/docker` (Linux)
- `/opt/homebrew/bin/docker` (Homebrew on macOS)

### Basic Configuration

```javascript
import { $ } from '@xec-sh/core';

// Basic Docker execution using existing container
const result = await $({
  adapterOptions: {
    type: 'docker',
    container: 'my-container'
  }
})`ls -la /app`;

console.log(result.stdout);
```

## Configuration Options

### Adapter Configuration
Configure the Docker adapter with various options:

```javascript
import { DockerAdapter } from '@xec-sh/core';

const docker = new DockerAdapter({
  // Docker daemon configuration
  socketPath: '/var/run/docker.sock',  // Unix socket path
  host: 'localhost',                   // Docker host
  port: 2376,                         // Docker port
  version: '1.41',                    // API version
  
  // Default execution options
  defaultExecOptions: {
    User: '1000:1000',                // Default user:group
    WorkingDir: '/app',               // Default working directory
    Env: ['NODE_ENV=production'],     // Default environment variables
    Privileged: false,                // Privileged mode
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false
  },
  
  // Auto-creation configuration
  autoCreate: {
    enabled: true,                    // Auto-create containers
    image: 'alpine:latest',           // Default image
    autoRemove: true,                 // Remove after execution
    volumes: ['/tmp:/tmp:rw']         // Default volumes
  }
});

// Use the configured adapter
const result = await docker.execute({
  command: 'whoami',
  adapterOptions: {
    type: 'docker',
    container: 'my-app'
  }
});
```

### Container Options
Specify container-specific execution options:

```javascript
// Execute in existing container
await $({
  adapterOptions: {
    type: 'docker',
    container: 'web-server',
    user: 'www-data',
    workdir: '/var/www/html',
    tty: true
  }
})`npm test`;

// Execute with environment variables
await $({
  env: {
    NODE_ENV: 'development',
    DEBUG: 'app:*'
  },
  adapterOptions: {
    type: 'docker',
    container: 'node-app'
  }
})`node server.js`;
```

## Execution Modes

### Exec Mode
Execute commands in existing containers:

```javascript
// Execute in running container
const logs = await $({
  adapterOptions: {
    type: 'docker',
    container: 'nginx-proxy',
    runMode: 'exec'  // Explicit exec mode
  }
})`tail -f /var/log/nginx/access.log`;
```

### Run Mode  
Create ephemeral containers for command execution:

```javascript
// Run command in new container
const result = await $({
  adapterOptions: {
    type: 'docker',
    container: 'test-runner',  // Container name (optional)
    image: 'node:18-alpine',   // Required for run mode
    runMode: 'run',
    volumes: ['./src:/app/src:ro'],
    workdir: '/app',
    autoRemove: true  // Clean up after execution
  }
})`npm test`;

// Auto-detected run mode (when image is specified)
await $({
  adapterOptions: {
    type: 'docker',
    image: 'ubuntu:22.04',  // Image triggers run mode
    volumes: ['./data:/data']
  }
})`ls -la /data`;
```

## Environment Variables

### Setting Environment Variables
Pass environment variables to containers:

```javascript
// Method 1: Command-level environment
await $({
  env: {
    API_KEY: 'secret-key',
    DB_HOST: 'database.local',
    PORT: '3000'
  },
  adapterOptions: {
    type: 'docker',
    container: 'api-server'
  }
})`printenv | grep -E "API_KEY|DB_HOST|PORT"`;

// Method 2: Adapter default environment
const docker = new DockerAdapter({
  defaultExecOptions: {
    Env: [
      'NODE_ENV=production',
      'LOG_LEVEL=info'
    ]
  }
});
```

### Environment Variable Precedence
Environment variables are merged with the following precedence:
1. Command-level `env` (highest priority)
2. Adapter `defaultExecOptions.Env`
3. Global `defaultEnv` configuration

```javascript
// Demonstrates environment variable precedence
const docker = new DockerAdapter({
  defaultEnv: { GLOBAL: 'global-value' },
  defaultExecOptions: {
    Env: ['ADAPTER=adapter-value']
  }
});

await $({
  env: { COMMAND: 'command-value' },
  adapterOptions: {
    type: 'docker',
    container: 'env-test'
  }
})`printenv | sort`;
// Output includes: GLOBAL=global-value, ADAPTER=adapter-value, COMMAND=command-value
```

## Working Directories

### Setting Working Directory
Configure the working directory for command execution:

```javascript
// Set working directory
await $({
  adapterOptions: {
    type: 'docker',
    container: 'dev-container',
    workdir: '/workspace/project'
  }
})`pwd && ls -la`;

// Relative paths in container
await $({
  adapterOptions: {
    type: 'docker',
    container: 'builder',
    workdir: '/build'
  }
})`
  ./configure --prefix=/usr/local
  make && make install
`;
```

## User and Permissions

### Running as Specific User
Execute commands as different users:

```javascript
// Run as specific user
await $({
  adapterOptions: {
    type: 'docker',
    container: 'app-container',
    user: 'appuser'  // Username or UID
  }
})`whoami && id`;

// Run as user:group
await $({
  adapterOptions: {
    type: 'docker',
    container: 'data-processor',
    user: '1000:1000'  // UID:GID
  }
})`touch /tmp/test-file && ls -la /tmp/test-file`;

// Default user from adapter configuration
const docker = new DockerAdapter({
  defaultExecOptions: {
    User: 'nobody:nogroup'
  }
});
```

## TTY and Interactive Mode

### TTY Configuration
Configure TTY and interactive modes:

```javascript
// Interactive TTY mode
await $({
  stdin: 'echo "Hello from stdin"',
  adapterOptions: {
    type: 'docker',
    container: 'interactive-app',
    tty: true
  }
})`cat`;

// Non-TTY mode for scripting
await $({
  adapterOptions: {
    type: 'docker',
    container: 'batch-processor',
    tty: false
  }
})`
  for i in {1..5}; do
    echo "Processing batch $i"
    sleep 1
  done
`;
```

The adapter automatically detects TTY support and optimizes settings:
- Interactive mode enabled when stdin is provided or TTY requested
- TTY mode only enabled when environment supports it
- Warnings shown when TTY requested but not available

## Container Validation

### Security Validation
The Docker adapter performs security validation on container names:

```javascript
// Valid container names
const validNames = [
  'my-container',
  'web_server',
  'app-v1.2.3',
  'namespace_app'
];

// Invalid container names (will throw errors)
const invalidNames = [
  '',                    // Empty name
  'container; rm -rf /', // Command injection
  '../container',        // Path traversal
  'container|malicious', // Shell metacharacters
  '/absolute/path'       // Absolute path
];

// Container names must match: [a-zA-Z0-9][a-zA-Z0-9_.-]*
try {
  await $({
    adapterOptions: {
      type: 'docker',
      container: 'valid-name'
    }
  })`echo "Safe execution"`;
} catch (error) {
  console.error('Container validation failed:', error.message);
}
```

## Error Handling

### Common Error Scenarios
Handle Docker-specific errors:

```javascript
import { DockerError } from '@xec-sh/core';

try {
  await $({
    adapterOptions: {
      type: 'docker',
      container: 'non-existent'
    }
  })`echo "test"`;
} catch (error) {
  if (error instanceof DockerError) {
    console.error('Docker error:', error.container, error.operation, error.message);
  }
}

// Handle container not found
try {
  await $({
    adapterOptions: {
      type: 'docker',
      container: 'missing-container'
    }
  })`ls /app`;
} catch (error) {
  if (error.message.includes('not found')) {
    console.log('Container does not exist');
    // Auto-create or handle gracefully
  }
}
```

### Auto-Creation Error Handling
Configure automatic container creation:

```javascript
const docker = new DockerAdapter({
  autoCreate: {
    enabled: true,
    image: 'alpine:latest',
    autoRemove: true
  }
});

// Will auto-create container if it doesn't exist
try {
  const result = await docker.execute({
    command: 'echo',
    args: ['Container auto-created'],
    adapterOptions: {
      type: 'docker',
      container: 'auto-created-container'
    }
  });
  console.log('Success:', result.stdout);
} catch (error) {
  console.error('Auto-creation failed:', error.message);
}
```

## Availability Check

### Docker Environment Detection
Check Docker availability before execution:

```javascript
import { DockerAdapter } from '@xec-sh/core';

const docker = new DockerAdapter();

// Check if Docker is available
const isAvailable = await docker.isAvailable();
if (!isAvailable) {
  console.error('Docker is not available');
  process.exit(1);
}

// Check Docker version
const version = await $({
  adapterOptions: { type: 'docker', container: 'temp' }
})`docker --version`.catch(() => null);

if (version?.exitCode === 0) {
  console.log('Docker version:', version.stdout.trim());
}
```

## Resource Cleanup

### Automatic Cleanup
The Docker adapter automatically manages temporary containers:

```javascript
const docker = new DockerAdapter({
  autoCreate: {
    enabled: true,
    autoRemove: true  // Automatically remove temporary containers
  }
});

// Temporary containers are automatically cleaned up
await docker.execute({
  command: 'echo',
  args: ['Temporary execution'],
  adapterOptions: {
    type: 'docker',
    container: 'temp-container'
  }
});

// Manual cleanup
await docker.dispose(); // Cleans up all temporary containers
```

### Event Monitoring
Monitor Docker operations with events:

```javascript
docker.on('docker:run', (event) => {
  console.log('Container run:', event.image, event.container);
});

docker.on('docker:exec', (event) => {
  console.log('Container exec:', event.container, event.command);
});

docker.on('temp:cleanup', (event) => {
  console.log('Cleaning up:', event.path);
});

// Execute command with event monitoring
await $({
  adapterOptions: {
    type: 'docker',
    image: 'alpine',
    container: 'monitored'
  }
})`echo "Monitored execution"`;
```

## Best Practices

### Performance Optimization
- Use existing containers for repeated executions
- Enable connection reuse for multiple operations
- Use appropriate base images (alpine for minimal overhead)
- Configure resource limits appropriately

### Security Considerations
- Always validate container names
- Use non-root users when possible
- Mount volumes with appropriate permissions
- Avoid passing secrets in environment variables
- Use secure secret management systems

### Resource Management
- Enable auto-removal for ephemeral containers
- Monitor container resource usage
- Clean up unused images and containers
- Use multi-stage builds for smaller images

```javascript
// Example of optimized Docker usage
const docker = new DockerAdapter({
  autoCreate: {
    enabled: true,
    image: 'alpine:latest',
    autoRemove: true
  },
  defaultExecOptions: {
    User: '1000:1000',  // Non-root user
    WorkingDir: '/workspace'
  }
});

// Efficient execution pattern
const results = await Promise.all([
  docker.execute({
    command: 'echo',
    args: ['Task 1'],
    adapterOptions: { type: 'docker', container: 'worker-1' }
  }),
  docker.execute({
    command: 'echo', 
    args: ['Task 2'],
    adapterOptions: { type: 'docker', container: 'worker-2' }
  })
]);

// Cleanup
await docker.dispose();
```