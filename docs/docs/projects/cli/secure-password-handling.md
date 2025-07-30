---
sidebar_position: 9
---

# Secure Password Handling

The Xec system provides secure password handling capabilities for SSH and sudo operations, ensuring that sensitive credentials are properly protected during command execution.

## Overview

When executing commands that require authentication (such as sudo operations over SSH), Xec provides multiple methods to handle passwords securely:

1. **stdin** - Pipes the password to sudo via standard input
2. **secure-askpass** - Creates a temporary askpass script on the remote machine
3. **echo** - Directly echoes the password (not recommended, logs a warning)

## SSH Adapter with Sudo

### Basic Configuration

```typescript
import { SSHAdapter } from '@xec-sh/core';

const ssh = new SSHAdapter({
  sudo: {
    enabled: true,
    password: 'your-sudo-password',
    method: 'secure-askpass' // Recommended method
  }
});

// Execute a command with sudo
const result = await ssh.execute({
  command: 'apt-get update',
  adapterOptions: {
    type: 'ssh',
    host: '192.168.1.100',
    username: 'user',
    password: 'ssh-password'
  }
});
```

### Sudo Methods

#### 1. Secure Askpass Method (Recommended)

The `secure-askpass` method creates a temporary script on the remote machine that provides the password to sudo:

```typescript
const ssh = new SSHAdapter({
  sudo: {
    enabled: true,
    password: 'sudo-password',
    method: 'secure-askpass'
  }
});
```

**How it works:**
1. Creates a temporary askpass script on the remote machine
2. Sets appropriate permissions (700) on the script
3. Executes the command with `SUDO_ASKPASS` environment variable
4. Automatically cleans up the script after execution

**Advantages:**
- Password is not visible in process listings
- Temporary script is automatically cleaned up
- Works reliably across different systems

#### 2. Stdin Method

The `stdin` method pipes the password directly to sudo:

```typescript
const ssh = new SSHAdapter({
  sudo: {
    enabled: true,
    password: 'sudo-password',
    method: 'stdin'
  }
});
```

**How it works:**
- Executes: `echo 'password' | sudo -S command`

**Advantages:**
- Simple and widely supported
- No temporary files needed

**Disadvantages:**
- Password briefly visible in process listing

#### 3. Echo Method (Not Recommended)

The `echo` method is similar to stdin but logs a warning:

```typescript
const ssh = new SSHAdapter({
  sudo: {
    enabled: true,
    password: 'sudo-password',
    method: 'echo'
  }
});
// Console warning: "Using echo for sudo password is insecure..."
```

## SecurePasswordHandler Utility

For more advanced password handling, use the `SecurePasswordHandler` class:

```typescript
import { SecurePasswordHandler } from '@xec-sh/core';

const handler = new SecurePasswordHandler();

// Store passwords securely in memory (encrypted)
handler.storePassword('prod-sudo', 'production-password');

// Create custom askpass scripts
const askpassPath = await handler.createAskPassScript('password');

// Clean up when done
await handler.dispose();
```

### Password Utilities

#### Generate Secure Passwords

```typescript
// Generate a 32-character password (default)
const password = SecurePasswordHandler.generatePassword();

// Generate a custom length password
const shortPassword = SecurePasswordHandler.generatePassword(16);
```

#### Validate Password Strength

```typescript
const validation = SecurePasswordHandler.validatePassword('MyP@ssw0rd');

if (validation.isValid) {
  console.log('Password is strong');
} else {
  console.log('Issues:', validation.issues);
  // ["Password should contain at least one special character"]
}
```

#### Mask Passwords in Logs

```typescript
const command = 'echo MySecretPass123 | sudo -S apt-get update';
const masked = SecurePasswordHandler.maskPassword(command, 'MySecretPass123');
console.log(masked);
// "echo ***MASKED*** | sudo -S apt-get update"
```

## Integration with $ Helper

When using the `$` helper, combine it with SSHAdapter for sudo operations:

```typescript
import { $, SSHAdapter } from '@xec-sh/core';

// Regular SSH commands without sudo
const $ssh = $.ssh({
  host: '192.168.1.100',
  username: 'user',
  password: 'ssh-password'
});

const regularUser = await $ssh`whoami`;
console.log(regularUser.stdout); // "user"

// SSH commands with sudo
const sshWithSudo = new SSHAdapter({
  sudo: {
    enabled: true,
    password: 'sudo-password',
    method: 'secure-askpass'
  }
});

const rootUser = await sshWithSudo.execute({
  command: 'whoami',
  adapterOptions: {
    type: 'ssh',
    host: '192.168.1.100',
    username: 'user',
    password: 'ssh-password'
  }
});
console.log(rootUser.stdout); // "root"
```

## Best Practices

### 1. Use Environment Variables

Store passwords in environment variables instead of hardcoding:

```typescript
const ssh = new SSHAdapter({
  sudo: {
    enabled: true,
    password: process.env.SUDO_PASSWORD,
    method: 'secure-askpass'
  }
});
```

### 2. Implement Proper Cleanup

Always dispose of resources when done:

```typescript
const ssh = new SSHAdapter({ /* ... */ });
const handler = new SecurePasswordHandler();

try {
  // Your operations
} finally {
  await ssh.dispose();
  await handler.dispose();
}
```

### 3. Use Password Validation

Validate passwords before use:

```typescript
const password = process.env.SUDO_PASSWORD || '';
const validation = SecurePasswordHandler.validatePassword(password);

if (!validation.isValid) {
  throw new Error(`Weak password: ${validation.issues.join(', ')}`);
}
```

### 4. Handle Errors Gracefully

Always handle authentication failures:

```typescript
try {
  const result = await ssh.execute({
    command: 'sensitive-operation',
    nothrow: true,
    adapterOptions: { /* ... */ }
  });
  
  if (result.exitCode !== 0) {
    if (result.stderr?.includes('incorrect password')) {
      console.error('Authentication failed');
    }
  }
} catch (error) {
  console.error('Operation failed:', error.message);
}
```

## Security Considerations

1. **Password Storage**: Passwords are encrypted in memory using AES-256-GCM
2. **Process Visibility**: Use `secure-askpass` to avoid password exposure in process listings
3. **Cleanup**: Temporary askpass scripts are automatically removed
4. **Network Security**: Always use SSH key authentication when possible
5. **Audit Logging**: Be aware that sudo commands are logged in system audit logs

## Troubleshooting

### Common Issues

1. **"sudo: no tty present"**
   - Some systems require a TTY for sudo
   - Try using the `tty: true` option in command execution

2. **"incorrect password attempts"**
   - Verify the sudo password is correct
   - Check if the user requires a different password for sudo
   - Some systems have sudo timeout that might interfere

3. **Askpass script not found**
   - Ensure `/tmp` is writable on the remote system
   - Check for noexec mount option on `/tmp`

### Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
const ssh = new SSHAdapter({
  sudo: {
    enabled: true,
    password: 'password',
    method: 'secure-askpass'
  }
});

// Listen to adapter events
ssh.on('adapter:ssh:execute', (event) => {
  console.log('Executing:', event.command);
});
```

## Examples

### System Update with Sudo

```typescript
async function updateSystem(host: string) {
  const ssh = new SSHAdapter({
    sudo: {
      enabled: true,
      password: process.env.SUDO_PASSWORD,
      method: 'secure-askpass'
    }
  });
  
  try {
    // Update package list
    await ssh.execute({
      command: 'apt-get update',
      adapterOptions: {
        type: 'ssh',
        host,
        username: 'admin',
        privateKey: '~/.ssh/id_rsa'
      }
    });
    
    // Upgrade packages
    await ssh.execute({
      command: 'apt-get upgrade -y',
      adapterOptions: {
        type: 'ssh',
        host,
        username: 'admin',
        privateKey: '~/.ssh/id_rsa'
      }
    });
    
    console.log('System updated successfully');
  } finally {
    await ssh.dispose();
  }
}
```

### Secure Multi-Host Deployment

```typescript
async function deployToHosts(hosts: string[]) {
  const handler = new SecurePasswordHandler();
  const sudoPassword = SecurePasswordHandler.generatePassword();
  
  // Store password securely
  handler.storePassword('deploy-sudo', sudoPassword);
  
  const ssh = new SSHAdapter({
    sudo: {
      enabled: true,
      password: sudoPassword,
      method: 'secure-askpass',
      secureHandler: handler
    }
  });
  
  try {
    for (const host of hosts) {
      console.log(`Deploying to ${host}...`);
      
      await ssh.execute({
        command: 'systemctl restart myapp',
        adapterOptions: {
          type: 'ssh',
          host,
          username: 'deploy',
          privateKey: process.env.DEPLOY_KEY
        }
      });
    }
  } finally {
    await handler.dispose();
    await ssh.dispose();
  }
}
```