# SSH Target Configuration

Configure and establish SSH connections for remote command execution with advanced features like connection pooling, tunneling, and secure authentication.

## Installation

The SSH adapter requires the `ssh2` module:

```bash
npm install @xec-sh/core ssh2
# or
yarn add @xec-sh/core ssh2
```

## Basic Configuration

### Simple SSH Connection
Connect to a remote server with basic authentication:

```javascript
import { $ } from '@xec-sh/core';

// Password authentication
const result = await $({
  ssh: {
    host: 'server.example.com',
    username: 'user',
    password: 'password'
  }
})`uname -a`;

// Key-based authentication
const output = await $({
  ssh: {
    host: 'server.example.com',
    username: 'user',
    privateKey: '/home/user/.ssh/id_rsa'
  }
})`ls -la`;

// With passphrase-protected key
const data = await $({
  ssh: {
    host: 'server.example.com',
    username: 'user',
    privateKey: '/home/user/.ssh/id_ed25519',
    passphrase: 'key-passphrase'
  }
})`cat /etc/hostname`;
```

### Advanced SSH Options
Configure detailed SSH connection parameters:

```javascript
import { createExecutionEngine } from '@xec-sh/core';

const engine = createExecutionEngine({
  adapters: {
    ssh: {
      // Connection pool settings
      connectionPool: {
        enabled: true,
        maxConnections: 10,
        idleTimeout: 300000, // 5 minutes
        keepAlive: true,
        keepAliveInterval: 30000, // 30 seconds
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelay: 1000
      },
      
      // Default SSH connection options
      defaultConnectOptions: {
        port: 22,
        readyTimeout: 20000,
        strictHostKeyChecking: true,
        algorithms: {
          kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384'],
          cipher: ['aes128-gcm', 'aes256-gcm'],
          serverHostKey: ['ssh-rsa', 'ssh-ed25519']
        }
      },
      
      // Sudo configuration
      sudo: {
        enabled: false,
        password: 'sudo-password',
        prompt: '[sudo] password',
        method: 'stdin'
      },
      
      // SFTP options
      sftp: {
        enabled: true,
        concurrency: 5
      }
    }
  }
});
```

## Connection Methods

### Direct Connection
Connect directly to SSH servers:

```javascript
// Standard SSH port
await $({
  ssh: {
    host: '192.168.1.100',
    username: 'admin'
  }
})`systemctl status nginx`;

// Custom port
await $({
  ssh: {
    host: 'server.com',
    port: 2222,
    username: 'deploy'
  }
})`docker ps`;

// IPv6 address
await $({
  ssh: {
    host: '2001:db8::1',
    username: 'user'
  }
})`ip addr show`;
```

### Jump Host (Bastion)
Connect through intermediate servers:

```javascript
// Through jump host
const result = await $({
  ssh: {
    host: 'internal.server',
    username: 'user',
    privateKey: '/path/to/key',
    jumpHost: {
      host: 'bastion.example.com',
      username: 'jump-user',
      privateKey: '/path/to/jump-key'
    }
  }
})`hostname`;

// Multiple jump hosts
const output = await $({
  ssh: {
    host: 'target.internal',
    username: 'user',
    jumpHosts: [
      {
        host: 'bastion1.example.com',
        username: 'user1'
      },
      {
        host: 'bastion2.internal',
        username: 'user2'
      }
    ]
  }
})`pwd`;
```

### SSH Agent
Use SSH agent for authentication:

```javascript
// Use SSH agent
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    agent: process.env.SSH_AUTH_SOCK || '/tmp/ssh-agent.sock'
  }
})`ls -la`;

// With agent forwarding
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    agent: process.env.SSH_AUTH_SOCK,
    agentForward: true
  }
})`ssh nested-server 'hostname'`;
```

## Host Configuration

### SSH Config File Integration
Use SSH config file settings:

```javascript
import { readFileSync } from 'fs';
import { SSHConfig } from '@xec-sh/core';

// Parse SSH config
const config = SSHConfig.parse(
  readFileSync(`${process.env.HOME}/.ssh/config`, 'utf8')
);

// Use config for host
const hostConfig = config.compute('myserver');
await $({
  ssh: {
    host: hostConfig.HostName,
    port: hostConfig.Port,
    username: hostConfig.User,
    privateKey: hostConfig.IdentityFile[0]
  }
})`uptime`;
```

### Dynamic Host Configuration
Configure hosts dynamically:

```javascript
// Host configuration factory
function createSSHConfig(environment) {
  const configs = {
    development: {
      host: 'dev.example.com',
      username: 'developer',
      privateKey: '~/.ssh/dev_key'
    },
    staging: {
      host: 'staging.example.com',
      username: 'deploy',
      privateKey: '~/.ssh/staging_key'
    },
    production: {
      host: 'prod.example.com',
      username: 'admin',
      privateKey: '~/.ssh/prod_key',
      strictHostKeyChecking: true
    }
  };
  
  return configs[environment];
}

// Use dynamic config
const env = process.env.NODE_ENV || 'development';
await $({
  ssh: createSSHConfig(env)
})`node --version`;
```

### Host Key Verification
Manage SSH host key verification:

```javascript
// Strict host key checking (default)
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    strictHostKeyChecking: true,
    hostVerifier: (hostkey) => {
      // Custom verification logic
      const knownHosts = loadKnownHosts();
      return knownHosts.includes(hostkey);
    }
  }
})`ls`;

// Skip host key checking (NOT recommended for production)
await $({
  ssh: {
    host: 'test.local',
    username: 'test',
    strictHostKeyChecking: false
  }
})`echo "Test environment"`;

// Add host key hash
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    hostHash: 'sha256',
    hostFingerprint: 'SHA256:1234567890abcdef...'
  }
})`pwd`;
```

## Connection Options

### Timeout Configuration
Set various timeout values:

```javascript
// Connection timeouts
await $({
  ssh: {
    host: 'slow.server.com',
    username: 'user',
    readyTimeout: 30000,      // Connection ready timeout (30s)
    keepaliveInterval: 10000, // Keepalive interval (10s)
    keepaliveCountMax: 3      // Max keepalive attempts
  },
  timeout: 60000 // Command execution timeout (60s)
})`long-running-command`;
```

### Compression
Enable compression for slow connections:

```javascript
// Enable compression
await $({
  ssh: {
    host: 'remote.server.com',
    username: 'user',
    compress: true,
    compression: {
      level: 6  // Compression level (1-9)
    }
  }
})`cat large-file.txt`;
```

### Cipher and Algorithm Selection
Configure encryption algorithms:

```javascript
// Specify preferred algorithms
await $({
  ssh: {
    host: 'secure.server.com',
    username: 'user',
    algorithms: {
      kex: [
        'ecdh-sha2-nistp521',
        'ecdh-sha2-nistp384',
        'ecdh-sha2-nistp256'
      ],
      cipher: [
        'aes256-gcm@openssh.com',
        'aes128-gcm@openssh.com',
        'aes256-ctr'
      ],
      serverHostKey: [
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'ssh-rsa'
      ],
      hmac: [
        'hmac-sha2-512',
        'hmac-sha2-256'
      ]
    }
  }
})`echo "Secure connection"`;
```

## Environment Variables

### Remote Environment Setup
Configure environment variables on remote hosts:

```javascript
// Set remote environment variables
await $({
  ssh: {
    host: 'server.com',
    username: 'user'
  },
  env: {
    NODE_ENV: 'production',
    APP_PORT: '3000',
    DEBUG: 'app:*'
  }
})`node app.js`;

// Export variables in command
await $({
  ssh: sshConfig
})`
  export DB_HOST=localhost
  export DB_PORT=5432
  psql -h $DB_HOST -p $DB_PORT
`;
```

### Path Configuration
Manage remote PATH:

```javascript
// Extend remote PATH
await $({
  ssh: sshConfig,
  env: {
    PATH: '/usr/local/bin:/usr/bin:/bin:/custom/bin'
  }
})`which custom-command`;

// Use specific shell with PATH
await $({
  ssh: sshConfig
})`
  source ~/.bashrc
  export PATH=$PATH:/opt/tools/bin
  tool --version
`;
```

## Working Directory

### Set Remote Working Directory
Execute commands in specific directories:

```javascript
// Change working directory
await $({
  ssh: sshConfig,
  cwd: '/var/www/app'
})`npm install`;

// Create directory if needed
await $({
  ssh: sshConfig
})`
  mkdir -p /tmp/workspace
  cd /tmp/workspace
  pwd
`;
```

## Error Handling

### Connection Errors
Handle various connection failures:

```javascript
async function connectWithRetry(config, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await $.with({ ssh: config })`hostname`;
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      
      if (error.code === 'ECONNREFUSED') {
        console.log('Connection refused - is SSH service running?');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('Connection timeout - check network/firewall');
      } else if (error.code === 'ENOTFOUND') {
        console.log('Host not found - check hostname');
      } else if (error.level === 'client-authentication') {
        console.log('Authentication failed - check credentials');
        break; // Don't retry auth failures
      }
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  throw new Error('Failed to establish SSH connection');
}
```

### Command Execution Errors
Handle remote command failures:

```javascript
try {
  await $.with({ ssh: sshConfig })`false`;
} catch (error) {
  if (error.exitCode === 1) {
    console.log('Command returned false');
  } else if (error.exitCode === 127) {
    console.log('Command not found on remote host');
  } else if (error.signal) {
    console.log(`Command terminated by signal: ${error.signal}`);
  }
  
  // Access error details
  console.log('Remote host:', error.details?.host);
  console.log('Remote stderr:', error.stderr);
}
```

## Security Best Practices

### Key Management
Secure SSH key handling:

```javascript
import { SSHKeyValidator } from '@xec-sh/core';

// Validate SSH key before use
const keyPath = '/home/user/.ssh/id_rsa';
const validator = new SSHKeyValidator();

if (await validator.validate(keyPath)) {
  await $({
    ssh: {
      host: 'server.com',
      username: 'user',
      privateKey: keyPath
    }
  })`ls`;
} else {
  console.error('Invalid or insecure SSH key');
}

// Use encrypted key with passphrase
const passphrase = await getPassphraseSecurely();
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    privateKey: readFileSync('/path/to/encrypted/key'),
    passphrase
  }
})`secure-command`;
```

### Secure Password Handling
Handle passwords securely:

```javascript
import { SecurePasswordHandler } from '@xec-sh/core';

// Create secure password handler
const passwordHandler = new SecurePasswordHandler();

// Get password securely (from keychain, env, or prompt)
const password = await passwordHandler.getPassword('ssh-server');

await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    password
  }
})`ls`;

// Clean up
passwordHandler.clearPassword();
```

### Audit Logging
Log SSH connections for audit:

```javascript
class SSHAuditLogger {
  async execute(sshConfig, command) {
    const audit = {
      timestamp: new Date().toISOString(),
      host: sshConfig.host,
      user: sshConfig.username,
      command,
      sourceIP: await this.getSourceIP()
    };
    
    console.log('SSH Audit:', audit);
    
    try {
      const result = await $.with({ ssh: sshConfig })`${command}`;
      audit.success = true;
      audit.exitCode = result.exitCode;
      await this.logAudit(audit);
      return result;
    } catch (error) {
      audit.success = false;
      audit.error = error.message;
      await this.logAudit(audit);
      throw error;
    }
  }
  
  async logAudit(entry) {
    // Log to secure audit trail
    await fs.appendFile('/var/log/ssh-audit.log', 
      JSON.stringify(entry) + '\n'
    );
  }
}
```

## Performance Optimization

### Connection Pooling
Reuse SSH connections efficiently:

```javascript
// Enable connection pooling
const pooledSSH = {
  host: 'server.com',
  username: 'user',
  connectionPool: {
    enabled: true,
    maxConnections: 5,
    idleTimeout: 600000, // 10 minutes
    keepAlive: true
  }
};

// Multiple commands reuse the same connection
for (let i = 0; i < 100; i++) {
  await $.with({ ssh: pooledSSH })`echo "Command ${i}"`;
}
```

### Multiplexing
Use SSH multiplexing for performance:

```javascript
// Configure multiplexing
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    multiplexing: {
      enabled: true,
      controlPath: '/tmp/ssh-mux-%h-%p-%r',
      controlPersist: 600 // Keep master for 10 minutes
    }
  }
})`ls`;
```

## Troubleshooting

### Debug SSH Connections
Enable debugging for troubleshooting:

```javascript
// Enable SSH debug output
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    debug: true,
    debugLevel: 3 // 1-3, higher = more verbose
  }
})`ls`;

// Custom debug handler
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    debug: (message) => {
      console.log('[SSH Debug]', message);
    }
  }
})`pwd`;
```

### Common Issues

#### Connection Timeout
```javascript
// Increase timeout for slow networks
await $({
  ssh: {
    host: 'distant.server.com',
    username: 'user',
    readyTimeout: 60000, // 60 seconds
    timeout: 120000      // 2 minutes for command
  }
})`slow-command`;
```

#### Host Key Changes
```javascript
// Handle changed host keys
try {
  await $.with({ ssh: config })`ls`;
} catch (error) {
  if (error.message.includes('Host key verification failed')) {
    console.log('Host key has changed!');
    // Update known_hosts or investigate security breach
  }
}
```

#### Authentication Failures
```javascript
// Try multiple authentication methods
const authMethods = [
  { privateKey: '~/.ssh/id_ed25519' },
  { privateKey: '~/.ssh/id_rsa' },
  { password: process.env.SSH_PASSWORD },
  { agent: process.env.SSH_AUTH_SOCK }
];

for (const auth of authMethods) {
  try {
    await $({
      ssh: {
        host: 'server.com',
        username: 'user',
        ...auth
      }
    })`hostname`;
    break;
  } catch (error) {
    console.log(`Auth method failed: ${JSON.stringify(auth)}`);
  }
}
```

## Next Steps

- [Authentication Methods](./authentication.md) - SSH keys, passwords, and agents
- [SSH Tunneling](./tunneling.md) - Port forwarding and SOCKS proxies
- [Batch Operations](./batch-operations.md) - Multi-host command execution
- [Connection Management](./connection-mgmt.md) - Connection pooling and persistence
- [File Transfer](../../core/execution-engine/features/file-operations.md) - SFTP file operations