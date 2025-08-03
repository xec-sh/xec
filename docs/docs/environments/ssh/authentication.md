# SSH Authentication Methods

Comprehensive guide to SSH authentication including keys, passwords, agents, and multi-factor authentication.

## Authentication Methods Overview

The SSH adapter supports multiple authentication methods:

```javascript
import { $ } from '@xec-sh/core';

// 1. Password authentication
await $.with({ ssh: { host: 'server', username: 'user', password: 'pass' } })`ls`;

// 2. Private key authentication
await $.with({ ssh: { host: 'server', username: 'user', privateKey: '~/.ssh/id_rsa' } })`ls`;

// 3. SSH agent authentication
await $.with({ ssh: { host: 'server', username: 'user', agent: process.env.SSH_AUTH_SOCK } })`ls`;

// 4. Keyboard-interactive authentication
await $.with({ ssh: { 
  host: 'server', 
  username: 'user',
  tryKeyboard: true,
  keyboardInteractive: (name, instructions, prompts, finish) => {
    // Handle prompts
    finish(['response1', 'response2']);
  }
}})`ls`;
```

## Key-Based Authentication

### Using Private Keys
Configure private key authentication:

```javascript
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// From file path
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    privateKey: join(homedir(), '.ssh', 'id_rsa')
  }
})`whoami`;

// From string/buffer
const keyContent = readFileSync('/path/to/key', 'utf8');
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    privateKey: keyContent
  }
})`hostname`;

// Multiple keys (try in order)
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    privateKey: [
      '~/.ssh/id_ed25519',
      '~/.ssh/id_rsa',
      '~/.ssh/id_ecdsa'
    ]
  }
})`pwd`;
```

### Encrypted Keys with Passphrase
Handle passphrase-protected keys:

```javascript
// With passphrase
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    privateKey: '~/.ssh/id_rsa_encrypted',
    passphrase: 'key-passphrase'
  }
})`ls`;

// Secure passphrase handling
import { SecurePasswordHandler } from '@xec-sh/core';

const handler = new SecurePasswordHandler();
const passphrase = await handler.getPassword('ssh-key-passphrase');

await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    privateKey: '~/.ssh/id_rsa_encrypted',
    passphrase
  }
})`secure-command`;

handler.clearPassword();
```

### Key Validation
Validate SSH keys before use:

```javascript
import { SSHKeyValidator } from '@xec-sh/core';

const validator = new SSHKeyValidator();

// Validate key file
const keyPath = '~/.ssh/id_rsa';
const validation = await validator.validate(keyPath);

if (validation.valid) {
  console.log('Key type:', validation.type);
  console.log('Key bits:', validation.bits);
  console.log('Fingerprint:', validation.fingerprint);
  
  await $({
    ssh: {
      host: 'server.com',
      username: 'user',
      privateKey: keyPath
    }
  })`ls`;
} else {
  console.error('Invalid key:', validation.error);
}

// Check key permissions
if (!validation.securePermissions) {
  console.warn('Key has insecure permissions');
  // Fix permissions
  await $`chmod 600 ${keyPath}`;
}
```

## Password Authentication

### Basic Password Authentication
Use password for authentication:

```javascript
// Direct password
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    password: 'mypassword'
  }
})`ls`;

// From environment variable
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    password: process.env.SSH_PASSWORD
  }
})`pwd`;
```

### Secure Password Handling
Handle passwords securely:

```javascript
import { SecurePasswordHandler } from '@xec-sh/core';

class SecureSSH {
  constructor() {
    this.passwordHandler = new SecurePasswordHandler();
  }
  
  async connect(host, username) {
    // Get password from keychain/secure storage
    const password = await this.passwordHandler.getPassword(`ssh:${host}`);
    
    if (!password) {
      // Prompt for password if not stored
      const password = await this.passwordHandler.promptPassword(
        `Enter password for ${username}@${host}: `
      );
      
      // Optionally save to keychain
      await this.passwordHandler.savePassword(`ssh:${host}`, password);
    }
    
    return {
      host,
      username,
      password
    };
  }
  
  async execute(host, username, command) {
    const config = await this.connect(host, username);
    
    try {
      return await $.with({ ssh: config })`${command}`;
    } finally {
      // Clear password from memory
      this.passwordHandler.clearPassword();
    }
  }
}

const ssh = new SecureSSH();
await ssh.execute('server.com', 'user', 'ls -la');
```

## SSH Agent Authentication

### Using SSH Agent
Leverage SSH agent for authentication:

```javascript
// Use default agent socket
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    agent: process.env.SSH_AUTH_SOCK
  }
})`hostname`;

// Custom agent socket
await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    agent: '/tmp/ssh-custom/agent.sock'
  }
})`pwd`;

// With agent forwarding
await $({
  ssh: {
    host: 'jump.server.com',
    username: 'user',
    agent: process.env.SSH_AUTH_SOCK,
    agentForward: true
  }
})`ssh internal.server 'hostname'`;
```

### Managing SSH Agent
Control SSH agent programmatically:

```javascript
// Start SSH agent if not running
async function ensureSSHAgent() {
  if (!process.env.SSH_AUTH_SOCK) {
    const result = await $`ssh-agent -s`;
    const lines = result.stdout.split('\n');
    
    for (const line of lines) {
      const match = line.match(/SSH_AUTH_SOCK=([^;]+)/);
      if (match) {
        process.env.SSH_AUTH_SOCK = match[1];
      }
      const pidMatch = line.match(/SSH_AGENT_PID=(\d+)/);
      if (pidMatch) {
        process.env.SSH_AGENT_PID = pidMatch[1];
      }
    }
  }
  
  return process.env.SSH_AUTH_SOCK;
}

// Add key to agent
async function addKeyToAgent(keyPath, passphrase) {
  if (passphrase) {
    // Use expect or similar for passphrase
    await $`echo "${passphrase}" | ssh-add ${keyPath}`;
  } else {
    await $`ssh-add ${keyPath}`;
  }
}

// List keys in agent
async function listAgentKeys() {
  const result = await $`ssh-add -l`;
  return result.stdout.split('\n').filter(line => line);
}

// Use agent
const socket = await ensureSSHAgent();
await addKeyToAgent('~/.ssh/id_rsa');

await $({
  ssh: {
    host: 'server.com',
    username: 'user',
    agent: socket
  }
})`ls`;
```

## Multi-Factor Authentication

### Keyboard-Interactive Authentication
Handle interactive authentication prompts:

```javascript
// Handle 2FA/MFA prompts
await $({
  ssh: {
    host: 'secure.server.com',
    username: 'user',
    tryKeyboard: true,
    keyboardInteractive: (name, instructions, prompts, finish) => {
      console.log('Authentication:', name);
      console.log('Instructions:', instructions);
      
      const responses = prompts.map(prompt => {
        if (prompt.prompt.includes('Password')) {
          return 'mypassword';
        } else if (prompt.prompt.includes('OTP') || prompt.prompt.includes('token')) {
          // Get OTP from authenticator
          return getOTPToken();
        }
        return '';
      });
      
      finish(responses);
    }
  }
})`secure-command`;

// With async handling
async function handleInteractiveAuth(name, instructions, prompts, finish) {
  const responses = [];
  
  for (const prompt of prompts) {
    if (prompt.prompt.includes('Password')) {
      responses.push(await getPassword());
    } else if (prompt.prompt.includes('Verification code')) {
      const code = await promptUser('Enter 2FA code: ');
      responses.push(code);
    } else {
      responses.push('');
    }
  }
  
  finish(responses);
}

await $({
  ssh: {
    host: 'mfa.server.com',
    username: 'user',
    tryKeyboard: true,
    keyboardInteractive: handleInteractiveAuth
  }
})`ls`;
```

## Certificate-Based Authentication

### Using SSH Certificates
Authenticate with SSH certificates:

```javascript
// With user certificate
await $({
  ssh: {
    host: 'cert.server.com',
    username: 'user',
    privateKey: '~/.ssh/id_rsa',
    certificate: '~/.ssh/id_rsa-cert.pub'
  }
})`hostname`;

// Validate certificate
async function validateCertificate(certPath) {
  const result = await $`ssh-keygen -L -f ${certPath}`;
  const info = result.stdout;
  
  // Parse certificate info
  const validFrom = info.match(/Valid: from ([^ ]+)/)?.[1];
  const validTo = info.match(/to ([^ ]+)/)?.[1];
  const principals = info.match(/Principals:\s+([^\n]+)/)?.[1];
  
  console.log('Certificate valid from:', validFrom);
  console.log('Certificate valid to:', validTo);
  console.log('Principals:', principals);
  
  // Check if certificate is still valid
  const now = new Date();
  const validToDate = new Date(validTo);
  
  if (now > validToDate) {
    throw new Error('Certificate has expired');
  }
  
  return true;
}

// Use certificate after validation
const certPath = '~/.ssh/id_rsa-cert.pub';
if (await validateCertificate(certPath)) {
  await $({
    ssh: {
      host: 'server.com',
      username: 'user',
      privateKey: '~/.ssh/id_rsa',
      certificate: certPath
    }
  })`secure-command`;
}
```

## Authentication Chains

### Try Multiple Methods
Attempt multiple authentication methods:

```javascript
class AuthenticationChain {
  constructor(host, username) {
    this.host = host;
    this.username = username;
    this.methods = [];
  }
  
  addMethod(name, config) {
    this.methods.push({ name, config });
    return this;
  }
  
  async execute(command) {
    const errors = [];
    
    for (const method of this.methods) {
      console.log(`Trying authentication method: ${method.name}`);
      
      try {
        const result = await $({
          ssh: {
            host: this.host,
            username: this.username,
            ...method.config
          }
        })`${command}`;
        
        console.log(`Successfully authenticated with: ${method.name}`);
        return result;
      } catch (error) {
        errors.push({ method: method.name, error: error.message });
        console.log(`Failed with ${method.name}: ${error.message}`);
      }
    }
    
    throw new Error(`All authentication methods failed: ${JSON.stringify(errors)}`);
  }
}

// Configure authentication chain
const auth = new AuthenticationChain('server.com', 'user')
  .addMethod('SSH Agent', { 
    agent: process.env.SSH_AUTH_SOCK 
  })
  .addMethod('Ed25519 Key', { 
    privateKey: '~/.ssh/id_ed25519' 
  })
  .addMethod('RSA Key', { 
    privateKey: '~/.ssh/id_rsa' 
  })
  .addMethod('Password', { 
    password: process.env.SSH_PASSWORD 
  });

await auth.execute('hostname');
```

## Host-Based Authentication

### Configure Host Authentication
Set up host-based authentication:

```javascript
// Host-based authentication
await $({
  ssh: {
    host: 'trusted.server.com',
    username: 'user',
    hostbased: true,
    localHostname: 'client.domain.com',
    localUsername: 'localuser',
    privateKey: '/etc/ssh/ssh_host_rsa_key'
  }
})`whoami`;
```

## Authentication Persistence

### Session Management
Manage authentication sessions:

```javascript
class SSHSessionManager {
  constructor() {
    this.sessions = new Map();
  }
  
  async getSession(host, username) {
    const key = `${username}@${host}`;
    
    if (!this.sessions.has(key)) {
      // Create new session
      const session = await this.authenticate(host, username);
      this.sessions.set(key, {
        config: session,
        created: Date.now(),
        lastUsed: Date.now()
      });
    }
    
    const session = this.sessions.get(key);
    session.lastUsed = Date.now();
    
    // Check if session is still valid
    if (Date.now() - session.created > 3600000) { // 1 hour
      // Re-authenticate
      this.sessions.delete(key);
      return this.getSession(host, username);
    }
    
    return session.config;
  }
  
  async authenticate(host, username) {
    // Your authentication logic
    return {
      host,
      username,
      privateKey: '~/.ssh/id_rsa',
      connectionPool: { enabled: true }
    };
  }
  
  async execute(host, username, command) {
    const config = await this.getSession(host, username);
    return $.with({ ssh: config })`${command}`;
  }
  
  cleanup() {
    // Clean up old sessions
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastUsed > 600000) { // 10 minutes idle
        this.sessions.delete(key);
      }
    }
  }
}

const manager = new SSHSessionManager();
await manager.execute('server.com', 'user', 'ls');
```

## Security Best Practices

### Key Security
Protect SSH keys:

```javascript
// Check key permissions
async function secureKey(keyPath) {
  const stats = await fs.stat(keyPath);
  const mode = (stats.mode & parseInt('777', 8)).toString(8);
  
  if (mode !== '600' && mode !== '400') {
    console.warn(`Insecure key permissions: ${mode}`);
    await $`chmod 600 ${keyPath}`;
  }
  
  // Check key ownership
  if (stats.uid !== process.getuid()) {
    throw new Error('Key not owned by current user');
  }
}

// Rotate keys periodically
async function rotateSSHKey(host, username) {
  // Generate new key
  const newKeyPath = `/tmp/id_rsa_${Date.now()}`;
  await $`ssh-keygen -t rsa -b 4096 -f ${newKeyPath} -N ""`;
  
  // Deploy new public key
  const pubKey = await $`cat ${newKeyPath}.pub`;
  await $({
    ssh: {
      host,
      username,
      privateKey: '~/.ssh/id_rsa' // Use old key
    }
  })`echo "${pubKey}" >> ~/.ssh/authorized_keys`;
  
  // Test new key
  await $({
    ssh: {
      host,
      username,
      privateKey: newKeyPath
    }
  })`hostname`;
  
  // Replace old key
  await $`mv ${newKeyPath} ~/.ssh/id_rsa`;
  await $`mv ${newKeyPath}.pub ~/.ssh/id_rsa.pub`;
}
```

### Audit Logging
Log authentication attempts:

```javascript
class AuthenticationAuditor {
  async logAuth(config, success, error = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      host: config.host,
      username: config.username,
      authMethod: this.detectAuthMethod(config),
      success,
      error: error?.message,
      sourceIP: await this.getSourceIP()
    };
    
    // Log to file
    await fs.appendFile(
      '/var/log/ssh-auth.log',
      JSON.stringify(entry) + '\n'
    );
    
    // Alert on failures
    if (!success) {
      await this.alertAuthFailure(entry);
    }
  }
  
  detectAuthMethod(config) {
    if (config.privateKey) return 'key';
    if (config.password) return 'password';
    if (config.agent) return 'agent';
    return 'unknown';
  }
  
  async alertAuthFailure(entry) {
    // Send alert for authentication failures
    console.error('Authentication failure:', entry);
  }
}
```

## Next Steps

- [SSH Setup](./setup.md) - Basic SSH configuration
- [SSH Tunneling](./tunneling.md) - Port forwarding and tunnels
- [Batch Operations](./batch-operations.md) - Multi-host execution
- [Connection Management](./connection-mgmt.md) - Connection pooling
- [Security Guide](../../core/execution-engine/features/error-handling.md) - Security best practices