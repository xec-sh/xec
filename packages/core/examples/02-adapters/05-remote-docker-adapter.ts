/**
 * 05. Remote Docker Adapter - Docker via SSH
 * 
 * Demonstrates the use of Docker on remote hosts via SSH.
 * Remote Docker adapter allows executing commands in Docker containers
 * on remote hosts through SSH connection.
 */

import { $, CommandError, ConnectionError } from '@xec-sh/core';

// 1. Simple remote docker usage
// Remote Docker requires SSH parameters and Docker container specification
const $remoteDocker = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
  },
  docker: {
    container: 'my-alpine-container' // Using existing container
  }
});

await $remoteDocker`echo "Running in Docker on remote host"`;
await $remoteDocker`hostname`;

// 2. With user specification in container
const $existingRemote = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
  },
  docker: {
    container: 'my-app',
    user: 'appuser' // Execute commands as appuser
  }
});

await $existingRemote`ps aux`;
await $existingRemote`cat /var/log/app.log`;

// 3. With working directory in container
const $withWorkdir = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
  },
  docker: {
    container: 'node-app',
    workdir: '/app' // Set working directory
  }
});

await $withWorkdir`pwd`; // /app
await $withWorkdir`ls -la`;

// 4. With sudo access for SSH
const $sudoDocker = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa',
    sudo: {
      enabled: true // SSH commands will be executed via sudo
    }
  },
  docker: {
    container: 'ubuntu-container'
  }
});

await $sudoDocker`whoami`; // root (if sudo is configured)

// 5. With non-standard SSH port
const $customPort = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    port: 2222,
    username: 'user',
    privateKey: '/path/to/id_rsa'
  },
  docker: {
    container: 'redis-container'
  }
});

await $customPort`redis-cli ping`;

// 6. Complex configuration with environment variables
const $complex = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'deploy',
    privateKey: process.env['DEPLOY_KEY'] || '/path/to/deploy.key'
  },
  docker: {
    container: 'myapp-production',
    workdir: '/app'
  }
})
  // Add environment variables via env() method
  .env({
    NODE_ENV: 'production',
    API_URL: 'https://api.example.com'
  });

await $complex`echo "Environment: $NODE_ENV"`;
await $complex`npm start`;

// 7. Working with TTY for interactive commands
const $interactive = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'user',
    privateKey: '/path/to/id_rsa'
  },
  docker: {
    container: 'app-container',
    tty: true // Enable TTY for interactive commands
  }
});

await $interactive`top -b -n 1`;
await $interactive`ls --color=auto`;

// 8. Copying files between local host and remote container
// Using docker cp via SSH for file transfer

// First copy file to remote host via SCP
await $`scp /local/data.csv user@docker-host.example.com:/tmp/data.csv`;

// Then copy to container via SSH
const $sshForCopy = $.ssh({
  host: 'docker-host.example.com',
  username: 'user',
  privateKey: '/path/to/id_rsa'
});
await $sshForCopy`docker cp /tmp/data.csv my-container:/container/data.csv`;

// Processing in container
await $remoteDocker`python process_data.py /container/data.csv`;

// Copy result back
await $sshForCopy`docker cp my-container:/container/results.csv /tmp/results.csv`;
await $`scp user@docker-host.example.com:/tmp/results.csv /local/results.csv`;

// 9. Parallel execution on multiple hosts
// Using Promise.all for parallel execution
const hosts = ['host1.example.com', 'host2.example.com', 'host3.example.com'];
const deployTasks = hosts.map(host => {
  const $host = $.remoteDocker({
    ssh: {
      host,
      username: 'deploy',
      privateKey: '/path/to/deploy.key'
    },
    docker: {
      container: 'myapp-container'
    }
  });
  return $host`./deploy.sh`.nothrow(); // Using nothrow() for error handling
});

const deployResults = await Promise.all(deployTasks);
deployResults.forEach((result, i) => {
  console.log(`Deploy on ${hosts[i]}: ${result.ok ? 'SUCCESS' : 'FAILED'}`);
});

// 10. Cleaning old containers via SSH
// For administrative tasks use SSH adapter directly
const $sshForAdmin = $.ssh({
  host: 'docker-host.example.com',
  username: 'admin',
  privateKey: '/path/to/admin.key',
  sudo: {
    enabled: true // Enable sudo for Docker commands
  }
});

// Remove stopped containers
await $sshForAdmin`docker container prune -f`;
await $sshForAdmin`docker image prune -f`;

// 11. Health check via remote docker
const $healthCheck = $.remoteDocker({
  ssh: {
    host: 'docker-host.example.com',
    username: 'monitor',
    privateKey: '/path/to/monitor.key'
  },
  docker: {
    container: 'web-app'
  }
});

const health = await $healthCheck`curl -f http://localhost/health || exit 1`.nothrow();
if (!health.ok) {
  console.log('Application unavailable!');
  console.log('Error:', health.stderr);
}

// 12. Connection error handling
try {
  const $fail = $.remoteDocker({
    ssh: {
      host: 'unreachable.example.com',
      username: 'user',
      privateKey: '/path/to/key'
    },
    docker: {
      container: 'test-container'
    }
  }).timeout(5000); // Set timeout for command
  
  await $fail`echo "test"`;
} catch (error: unknown) {
  if (error instanceof ConnectionError) {
    console.log('SSH connection error:', error.message);
  } else if (error instanceof CommandError) {
    console.log('Command execution error:', error.message);
    console.log('Exit code:', error.exitCode);
  } else {
    console.log('Unknown error:', error instanceof Error ? error.message : String(error));
  }
}
