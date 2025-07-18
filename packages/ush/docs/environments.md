# Working with Different Environments

@xec/ush allows you to execute commands seamlessly across different environments using a unified API. Whether you're working locally, over SSH, in Docker containers, or Kubernetes pods, the syntax remains consistent.

## SSH Execution

### Basic SSH Connection

```javascript
// Basic SSH connection
const $remote = $.ssh('user@server.com');
await $remote`uname -a`;
await $remote`df -h`;
```

### SSH with Options

```javascript
const $secure = $.ssh({
  host: 'server.com',
  username: 'admin',
  privateKey: '/home/user/.ssh/id_rsa',
  port: 2222,
  connectTimeout: 10000
});

// Using password authentication
const $password = $.ssh({
  host: 'server.com',
  username: 'admin',
  password: 'secret'
});
```

### SSH with Bastion/Jump Host

```javascript
const $bastion = $.ssh({
  host: 'internal-server',
  username: 'user',
  proxy: {
    host: 'bastion.example.com',
    username: 'jump-user',
    privateKey: '/home/user/.ssh/bastion_key'
  }
});

await $bastion`hostname`;
```

### Connection Pooling

SSH connections are automatically pooled for performance:

```javascript
const $srv = $.ssh('user@server.com');
await $srv`echo "First command"`;  // Creates connection
await $srv`echo "Second command"`; // Reuses connection
await $srv`echo "Third command"`;  // Reuses connection

// Explicitly close when done
await $srv.disconnect();
```

### SSH Best Practices

```javascript
// Use SSH agent for authentication
const $agent = $.ssh({
  host: 'server.com',
  username: 'user',
  agent: process.env.SSH_AUTH_SOCK
});

// Set up keepalive for long-running connections
const $persistent = $.ssh({
  host: 'server.com',
  username: 'user',
  keepaliveInterval: 10000,
  keepaliveCountMax: 3
});

// Handle SSH errors gracefully
try {
  await $remote`ls /protected`;
} catch (error) {
  if (error.message.includes('Permission denied')) {
    console.log('Access denied to protected directory');
  }
}
```

## Docker Execution

### Execute in Running Container

```javascript
// Execute in running container
const $container = $.docker('my-app-container');
await $container`ps aux`;
await $container`tail -f /var/log/app.log`;
```

### Execute in Specific Image

```javascript
const $node = $.docker({
  image: 'node:20-alpine',
  rm: true,                        // Remove after execution
  volumes: {
    './app': '/app'                // Mount local dir
  }
});
await $node`cd /app && npm install`;
await $node`cd /app && npm test`;
```

### Docker with Environment Variables

```javascript
const $app = $.docker({
  container: 'my-app',
  env: {
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
  }
});

await $app`node server.js`;
```

### Advanced Docker Options

```javascript
// With user and working directory
const $custom = $.docker({
  container: 'my-app',
  user: 'appuser',
  workdir: '/app/src'
});

// Interactive mode
const $interactive = $.docker({
  container: 'debug-container',
  interactive: true,
  tty: true
});

// With network settings
const $networked = $.docker({
  image: 'nginx',
  network: 'my-network',
  ports: {
    '8080': '80'
  }
});
```

## Kubernetes Execution

### Execute in Pod

```javascript
// Execute in pod
const $pod = $.k8s('my-app-pod', 'production');
await $pod`cat /etc/hostname`;
await $pod`ps aux`;
```

### Specific Container in Pod

```javascript
const $sidecar = $.k8s({
  pod: 'my-app-pod',
  namespace: 'production',
  container: 'sidecar-container'
});

await $sidecar`tail -f /var/log/sidecar.log`;
```

### With kubectl Context

```javascript
const $staging = $.k8s({
  pod: 'test-pod',
  namespace: 'staging',
  context: 'staging-cluster'
});

// Using custom kubeconfig
const $custom = $.k8s({
  pod: 'app-pod',
  namespace: 'default',
  kubeconfig: '/path/to/kubeconfig'
});
```

### Kubernetes Best Practices

```javascript
// Check pod status before executing
const podStatus = await $`kubectl get pod my-app -n prod -o json`;
const status = JSON.parse(podStatus.stdout);

if (status.status.phase === 'Running') {
  const $pod = $.k8s('my-app', 'prod');
  await $pod`./health-check.sh`;
}

// Execute in all pods of a deployment
const pods = await $`kubectl get pods -l app=myapp -o name`;
for (const pod of pods.stdout.trim().split('\n')) {
  const podName = pod.replace('pod/', '');
  const $pod = $.k8s(podName, 'default');
  await $pod`restart-service.sh`;
}
```

## Remote Docker (SSH + Docker)

Execute Docker commands on remote hosts:

```javascript
// Docker commands on remote host
const $remoteDkr = $.remoteDocker({
  ssh: 'user@docker-host.com',
  container: 'app-container'
});

await $remoteDkr`ps aux`;
await $remoteDkr`tail -f /logs/app.log`;

// Managing remote containers
const $host = $.remoteDocker({
  ssh: 'user@docker-host.com'
});
await $host`docker ps`;
await $host`docker logs my-app`;
```

### Advanced Remote Docker

```javascript
// With full SSH and Docker options
const $complex = $.remoteDocker({
  ssh: {
    host: 'docker-host.com',
    username: 'deploy',
    privateKey: fs.readFileSync('./deploy-key')
  },
  docker: {
    container: 'production-app',
    user: 'appuser',
    workdir: '/app'
  }
});

// Execute build on remote host
const $builder = $.remoteDocker({
  ssh: 'build-server.com',
  docker: {
    image: 'golang:1.20',
    volumes: {
      './src': '/go/src/app'
    }
  }
});
await $builder`go build -o app .`;
```

## Environment Switching

### Dynamic Environment Selection

```javascript
// Select environment based on configuration
function getExecutor(env) {
  switch (env.type) {
    case 'local':
      return $;
    case 'ssh':
      return $.ssh(env.connection);
    case 'docker':
      return $.docker(env.container);
    case 'k8s':
      return $.k8s(env.pod, env.namespace);
    default:
      throw new Error(`Unknown environment type: ${env.type}`);
  }
}

// Use the same code for different environments
const executor = getExecutor(config.environment);
await executor`npm test`;
await executor`npm run build`;
```

### Environment Abstraction

```javascript
class MultiEnvironmentExecutor {
  constructor(environments) {
    this.environments = environments;
  }
  
  async runOnAll(command) {
    const results = await Promise.all(
      this.environments.map(env => {
        const executor = this.getExecutor(env);
        return executor`${command}`.nothrow();
      })
    );
    
    return results.map((result, i) => ({
      environment: this.environments[i].name,
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr
    }));
  }
  
  getExecutor(env) {
    // Implementation as above
  }
}

// Run tests across all environments
const executor = new MultiEnvironmentExecutor([
  { name: 'local', type: 'local' },
  { name: 'staging', type: 'ssh', connection: 'staging.example.com' },
  { name: 'prod-docker', type: 'docker', container: 'app-prod' }
]);

const results = await executor.runOnAll('npm test');
```

## Connection Management

### Reusing Connections

```javascript
// SSH connections are automatically pooled
const $srv1 = $.ssh('server.com');
const $srv2 = $.ssh('server.com'); // Reuses connection

// Explicit connection management
const connection = await $.ssh('server.com').connect();
await connection.execute('ls');
await connection.execute('pwd');
await connection.disconnect();
```

### Connection Cleanup

```javascript
// Automatic cleanup with try-finally
const $remote = $.ssh('server.com');
try {
  await $remote`backup-database.sh`;
  await $remote`compress-backup.sh`;
} finally {
  await $remote.disconnect();
}

// Cleanup all connections
await $.cleanup(); // Closes all open connections
```

## Performance Considerations

1. **Connection Pooling**: SSH connections are automatically reused
2. **Parallel Execution**: Run commands in parallel across environments
3. **Resource Limits**: Be mindful of connection limits on remote systems
4. **Timeout Settings**: Set appropriate timeouts for remote operations

```javascript
// Efficient parallel execution across environments
const environments = [
  $.ssh('server1.com'),
  $.ssh('server2.com'),
  $.docker('app1'),
  $.docker('app2')
];

const results = await Promise.all(
  environments.map(env => env`health-check.sh`.nothrow())
);
```

## Next Steps

- Learn about [Advanced Features](./advanced-features.md)
- Explore [Real-world Examples](./examples.md)
- See [Troubleshooting Guide](./troubleshooting.md)