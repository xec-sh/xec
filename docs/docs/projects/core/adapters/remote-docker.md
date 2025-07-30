---
sidebar_position: 5
---

# Remote Docker Adapter

The Remote Docker Adapter combines SSH and Docker capabilities to execute commands in Docker containers on remote hosts. It's perfect for managing containers on remote servers without exposing the Docker daemon.

## Overview

The Remote Docker Adapter provides:
- Docker container execution on remote hosts via SSH
- Secure container management without Docker daemon exposure
- Full Docker CLI compatibility over SSH
- Container lifecycle management
- Log streaming and file transfers
- Multi-host container management

## Prerequisites

- SSH access to remote hosts
- Docker installed on remote hosts
- SSH key authentication configured
- Appropriate permissions to run Docker commands

## Basic Usage

### Simple Remote Docker Execution

```typescript
import { $ } from '@xec-sh/core';

// Execute in remote container
const remote = $.remoteDocker({
  ssh: {
    host: 'server.example.com',
    username: 'deploy',
    privateKey: '/home/user/.ssh/id_rsa'
  },
  docker: {
    image: 'node:18',
    name: 'my-app'
  }
});

await remote`node --version`;
await remote`npm list`;
```

### Two-Step Configuration

```typescript
// Configure SSH connection
const sshConfig = {
  host: 'prod-server.com',
  username: 'admin',
  privateKey: process.env.SSH_KEY_PATH
};

// Configure Docker options
const dockerConfig = {
  image: 'python:3.9',
  container: 'data-processor'
};

// Combine for remote Docker
const remoteDocker = $.remoteDocker({
  ssh: sshConfig,
  docker: dockerConfig
});

await remoteDocker`python --version`;
```

## Container Management

### Running New Containers

```typescript
// Start a new container on remote host
const remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'user' },
  docker: {
    image: 'nginx:latest',
    name: 'web-server',
    rm: true, // Remove after execution
    detach: false // Run in foreground
  }
});

await remote`nginx -v`;
```

### Existing Container Execution

```typescript
// Execute in existing remote container
const remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'user' },
  docker: {
    container: 'running-app', // Existing container name
    user: 'appuser',
    workdir: '/app'
  }
});

await remote`ps aux`;
await remote`cat /app/config.json`;
```

## Advanced SSH Configuration

### Connection Options

```typescript
const remote = $.remoteDocker({
  ssh: {
    host: 'secure-server.com',
    port: 2222,
    username: 'admin',
    privateKey: fs.readFileSync('/path/to/key'),
    passphrase: process.env.SSH_PASSPHRASE,
    hostVerifier: (hash) => hash === 'expected-hash',
    keepaliveInterval: 10000,
    readyTimeout: 30000
  },
  docker: {
    image: 'alpine:latest'
  }
});
```

### Jump Host (Bastion)

```typescript
// Connect through bastion host
const remote = $.remoteDocker({
  ssh: {
    host: 'internal-server.local',
    username: 'user',
    privateKey: '/home/user/.ssh/id_rsa',
    bastionHost: 'bastion.example.com'
  },
  docker: {
    image: 'postgres:14'
  }
});

await remote`psql --version`;
```

### SSH Agent Forwarding

```typescript
// Use SSH agent for authentication
const remote = $.remoteDocker({
  ssh: {
    host: 'server.com',
    username: 'deploy',
    agent: process.env.SSH_AUTH_SOCK,
    agentForward: true
  },
  docker: {
    image: 'git:latest'
  }
});

// Can use forwarded SSH keys inside container
await remote`git clone git@github.com:private/repo.git`;
```

## Docker Configuration

### Container Options

```typescript
const remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'user' },
  docker: {
    image: 'node:18',
    name: 'app-container',
    env: {
      NODE_ENV: 'production',
      PORT: '3000'
    },
    volumes: {
      '/local/data': '/container/data',
      '/local/config': '/container/config:ro'
    },
    ports: {
      '8080': '80',
      '8443': '443'
    },
    network: 'app-network',
    memory: '512m',
    cpus: '0.5'
  }
});
```

### Docker Run Flags

```typescript
// Custom Docker run flags
const remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'user' },
  docker: {
    image: 'ubuntu:latest',
    dockerRunFlags: [
      '--privileged',
      '--cap-add=SYS_ADMIN',
      '--device=/dev/sda:/dev/xvda',
      '--ulimit', 'nofile=1024:1024'
    ]
  }
});
```

## Deployment Patterns

### Blue-Green Deployment

```typescript
async function blueGreenDeploy(host: string, newVersion: string) {
  const ssh = { host, username: 'deploy' };
  
  // Start new version (green)
  const green = $.remoteDocker({
    ssh,
    docker: {
      image: `myapp:${newVersion}`,
      name: 'app-green',
      ports: { '8081': '80' },
      network: 'app-net'
    }
  });
  
  // Health check
  await green`./healthcheck.sh`;
  
  // Switch load balancer
  const lb = $.ssh(ssh);
  await lb`nginx -s reload`;
  
  // Stop old version (blue)
  await $.ssh(ssh)`docker stop app-blue && docker rm app-blue`;
  
  // Rename green to blue
  await $.ssh(ssh)`docker rename app-green app-blue`;
}
```

### Rolling Updates

```typescript
async function rollingUpdate(hosts: string[], image: string) {
  for (const host of hosts) {
    console.log(`Updating ${host}...`);
    
    const remote = $.remoteDocker({
      ssh: { host, username: 'deploy' },
      docker: {
        image,
        name: 'app',
        ports: { '80': '80' }
      }
    });
    
    // Stop old container
    await $.ssh({ host, username: 'deploy' })`docker stop app || true`;
    
    // Start new container
    await remote`echo "Starting ${image}"`;
    
    // Health check
    const health = await remote`curl -f http://localhost/health`.nothrow();
    if (!health.ok) {
      throw new Error(`Health check failed on ${host}`);
    }
    
    // Remove old container
    await $.ssh({ host, username: 'deploy' })`docker rm app || true`;
  }
}
```

## Multi-Host Operations

### Parallel Container Execution

```typescript
async function runOnAllHosts(hosts: string[], command: string) {
  const remotes = hosts.map(host => 
    $.remoteDocker({
      ssh: { host, username: 'admin' },
      docker: { image: 'alpine:latest' }
    })
  );
  
  // Execute in parallel
  const results = await Promise.all(
    remotes.map(remote => remote`${command}`.nothrow())
  );
  
  // Process results
  results.forEach((result, i) => {
    console.log(`${hosts[i]}: ${result.ok ? 'OK' : 'FAILED'}`);
    if (!result.ok) {
      console.error(`  Error: ${result.stderr}`);
    }
  });
}
```

### Container Synchronization

```typescript
async function syncContainers(primary: string, replicas: string[]) {
  // Get state from primary
  const primaryRemote = $.remoteDocker({
    ssh: { host: primary, username: 'sync' },
    docker: { container: 'app' }
  });
  
  const config = await primaryRemote`cat /app/config.json`.json();
  
  // Apply to replicas
  await Promise.all(
    replicas.map(async (replica) => {
      const remote = $.remoteDocker({
        ssh: { host: replica, username: 'sync' },
        docker: { container: 'app' }
      });
      
      await remote`echo '${JSON.stringify(config)}' > /app/config.json`;
    })
  );
}
```

## File Operations

### Copy Files to Remote Container

```typescript
const remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'user' },
  docker: { container: 'app' }
});

// Upload local file to remote container
const ssh = $.ssh({ host: 'server.com', username: 'user' });

// First copy to remote host
await ssh.uploadFile('./local-config.json', '/tmp/config.json');

// Then copy into container
await ssh`docker cp /tmp/config.json app:/app/config.json`;

// Clean up temp file
await ssh`rm /tmp/config.json`;
```

### Copy Files from Remote Container

```typescript
// Download from remote container
async function downloadFromContainer(host: string, container: string, path: string) {
  const ssh = $.ssh({ host, username: 'user' });
  
  // Copy from container to host
  const tempPath = `/tmp/download-${Date.now()}`;
  await ssh`docker cp ${container}:${path} ${tempPath}`;
  
  // Download to local
  await ssh.downloadFile(tempPath, './downloaded-file');
  
  // Clean up
  await ssh`rm ${tempPath}`;
}
```

## Logging and Monitoring

### Stream Container Logs

```typescript
const ssh = $.ssh({ host: 'server.com', username: 'ops' });

// Stream logs from remote container
await ssh`docker logs -f app-container`.stream({
  stdout: (chunk) => console.log('[APP]', chunk),
  stderr: (chunk) => console.error('[ERROR]', chunk)
});
```

### Container Statistics

```typescript
async function monitorContainer(host: string, container: string) {
  const ssh = $.ssh({ host, username: 'monitor' });
  
  // Get container stats
  const stats = await ssh`docker stats ${container} --no-stream --format json`.json();
  
  console.log('Container Stats:');
  console.log(`  CPU: ${stats.CPUPerc}`);
  console.log(`  Memory: ${stats.MemUsage}`);
  console.log(`  Network: ${stats.NetIO}`);
}
```

## Error Handling

### Connection Failures

```typescript
try {
  const remote = $.remoteDocker({
    ssh: { 
      host: 'unreachable.com',
      username: 'user',
      connectTimeout: 5000
    },
    docker: { image: 'alpine' }
  });
  
  await remote`echo "test"`;
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('Cannot connect to remote host');
  } else if (error.code === 'EAUTH') {
    console.error('SSH authentication failed');
  }
}
```

### Docker Errors

```typescript
const remote = $.remoteDocker({
  ssh: { host: 'server.com', username: 'user' },
  docker: { image: 'nonexistent:latest' }
});

try {
  await remote`echo "test"`;
} catch (error) {
  if (error.stderr?.includes('Unable to find image')) {
    console.error('Docker image not found on remote host');
  }
}
```

## Security Considerations

### Credential Management

```typescript
// Use environment variables for sensitive data
const remote = $.remoteDocker({
  ssh: {
    host: process.env.REMOTE_HOST!,
    username: process.env.REMOTE_USER!,
    privateKey: fs.readFileSync(process.env.SSH_KEY_PATH!),
    passphrase: process.env.SSH_PASSPHRASE
  },
  docker: {
    image: 'secure-app:latest',
    env: {
      API_KEY: process.env.API_KEY!,
      DB_PASSWORD: process.env.DB_PASSWORD!
    }
  }
});
```

### Network Isolation

```typescript
// Run containers in isolated network
const remote = $.remoteDocker({
  ssh: { host: 'secure-host.com', username: 'admin' },
  docker: {
    image: 'sensitive-app:latest',
    network: 'isolated-network',
    dockerRunFlags: [
      '--network-alias=app',
      '--no-new-privileges'
    ]
  }
});
```

## Performance Optimization

### Connection Pooling

```typescript
// Reuse SSH connections for multiple operations
const sshConfig = { host: 'server.com', username: 'user' };

// Multiple containers, same SSH connection
const web = $.remoteDocker({
  ssh: sshConfig,
  docker: { container: 'web' }
});

const api = $.remoteDocker({
  ssh: sshConfig,
  docker: { container: 'api' }
});

const db = $.remoteDocker({
  ssh: sshConfig,
  docker: { container: 'db' }
});

// Operations use pooled SSH connection
await Promise.all([
  web`nginx -s reload`,
  api`npm run migrate`,
  db`pg_dump -c app_db > backup.sql`
]);
```

### Batch Operations

```typescript
// Minimize SSH round trips
async function batchContainerOps(host: string, containers: string[]) {
  const ssh = $.ssh({ host, username: 'batch' });
  
  // Single command to check all containers
  const allStats = await ssh`
    for c in ${containers.join(' ')}; do
      echo "=== $c ==="
      docker inspect $c --format '{{json .State}}'
    done
  `.text();
  
  // Parse results
  const sections = allStats.split('===').filter(s => s.trim());
  return sections.map(section => {
    const [name, ...jsonParts] = section.trim().split('\n');
    return {
      container: name,
      state: JSON.parse(jsonParts.join('\n'))
    };
  });
}
```

## Best Practices

1. **Use SSH key authentication** - Avoid password authentication
2. **Implement health checks** - Verify container state after operations
3. **Handle network failures** - Add retries for transient issues
4. **Clean up resources** - Remove temporary containers and files
5. **Use specific image tags** - Avoid `latest` in production
6. **Log all operations** - Track what changes were made
7. **Implement rollback** - Be able to revert failed deployments

## Common Patterns

### Maintenance Mode

```typescript
async function maintenanceMode(host: string, enable: boolean) {
  const remote = $.remoteDocker({
    ssh: { host, username: 'ops' },
    docker: { container: 'web' }
  });
  
  if (enable) {
    // Enable maintenance mode
    await remote`cp /app/maintenance.html /app/public/index.html`;
    await remote`nginx -s reload`;
  } else {
    // Disable maintenance mode
    await remote`cp /app/index.html /app/public/index.html`;
    await remote`nginx -s reload`;
  }
}
```

### Database Backup

```typescript
async function backupDatabase(host: string) {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const ssh = $.ssh({ host, username: 'backup' });
  
  // Create backup in container
  await ssh`docker exec postgres pg_dump -U postgres mydb > /tmp/backup-${timestamp}.sql`;
  
  // Compress on host
  await ssh`gzip /tmp/backup-${timestamp}.sql`;
  
  // Download backup
  await ssh.downloadFile(
    `/tmp/backup-${timestamp}.sql.gz`,
    `./backups/backup-${timestamp}.sql.gz`
  );
  
  // Clean up
  await ssh`rm /tmp/backup-${timestamp}.sql.gz`;
}
```

## Next Steps

- Learn about [SSH Adapter](./ssh) for remote command execution
- Explore [Docker Adapter](./docker) for local container management
- See [Parallel Execution](../advanced/parallel-execution) for multi-host operations
- Check [Real-world Examples](https://github.com/xec-sh/xec/tree/main/packages/core/examples/06-real-world)