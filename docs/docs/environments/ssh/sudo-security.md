---
sidebar_position: 4
title: Secure Sudo Password Handling
description: Best practices for secure sudo password handling in SSH environments
---

# Secure Sudo Password Handling in SSH Adapter

## Overview

The SSH adapter supports multiple methods for providing sudo passwords, with varying levels of security. This document describes best practices for secure sudo password handling.

## Password Methods

### 1. `secure-askpass` (Recommended)

The most secure method that creates a temporary askpass script on the remote machine:

```typescript
await $.ssh('sudo apt update', {
  host: 'server.example.com',
  username: 'user',
  sudo: {
    password: 'mypassword',
    method: 'secure-askpass'
  }
});
```

**Advantages:**
- Password is never visible in process listings
- Temporary script is automatically cleaned up
- Works across all platforms

**How it works:**
1. Creates a temporary shell script on the remote machine
2. Sets appropriate permissions (700)
3. Uses `SUDO_ASKPASS` environment variable
4. Automatically cleans up after execution

### 2. `secure` (Local Secure Handler)

Uses a local secure password handler with temporary files:

```typescript
await $.ssh('sudo apt update', {
  host: 'server.example.com',
  username: 'user',
  sudo: {
    password: 'mypassword',
    method: 'secure'
  }
});
```

**Advantages:**
- Password stored in memory-only temporary file
- Automatic cleanup
- No command-line exposure

### 3. `askpass` (Standard Askpass)

Uses the system's askpass mechanism:

```typescript
await $.ssh('sudo apt update', {
  host: 'server.example.com',
  username: 'user',
  sudo: {
    password: 'mypassword',
    method: 'askpass'
  }
});
```

### 4. `stdin` (Default - Less Secure)

Pipes password via stdin:

```typescript
await $.ssh('sudo apt update', {
  host: 'server.example.com',
  username: 'user',
  sudo: {
    password: 'mypassword',
    method: 'stdin' // or omit for default
  }
});
```

**Warnings:**
- Password may be visible in process listings
- Uses `printf` instead of `echo` for better compatibility
- Should only be used when secure methods are not available

### 5. `echo` (Deprecated - Least Secure)

**⚠️ NOT RECOMMENDED** - Only for backward compatibility:

```typescript
await $.ssh('sudo apt update', {
  host: 'server.example.com',
  username: 'user',
  sudo: {
    password: 'mypassword',
    method: 'echo'
  }
});
```

## Security Considerations

1. **Process Listing Exposure**: Methods like `stdin` and `echo` can expose passwords in process listings (`ps aux`)
2. **Shell History**: Passwords may be logged in shell history files
3. **Memory Safety**: Secure methods minimize time passwords spend in memory
4. **Cleanup**: Always ensure temporary files/scripts are cleaned up

## Best Practices

1. **Always use `secure-askpass`** when sudo passwords are required
2. **Store passwords securely** - Use environment variables or secure credential stores
3. **Rotate passwords regularly**
4. **Use SSH keys** instead of passwords when possible
5. **Enable `NOPASSWD` in sudoers** for automation scenarios when appropriate

## Example: Secure Sudo with Environment Variables

```typescript
// Store password in environment variable (still visible to process)
process.env.SUDO_PASSWORD = 'mypassword';

// Use secure-askpass method
await $.ssh('sudo apt update', {
  host: 'server.example.com',
  username: 'user',
  sudo: {
    password: process.env.SUDO_PASSWORD,
    method: 'secure-askpass'
  }
});

// Clean up
delete process.env.SUDO_PASSWORD;
```

## Example: Custom Secure Handler

```typescript
import { SecurePasswordHandler } from '@xec-sh/core';

const secureHandler = new SecurePasswordHandler();

try {
  await $.ssh('sudo apt update', {
    host: 'server.example.com',
    username: 'user',
    sudo: {
      password: 'mypassword',
      method: 'secure',
      secureHandler
    }
  });
} finally {
  await secureHandler.cleanup();
}
```

## Migration Guide

If you're currently using insecure methods, migrate to secure methods:

```typescript
// Old (insecure)
sudo: {
  password: 'mypassword'
  // defaults to stdin
}

// New (secure)
sudo: {
  password: 'mypassword',
  method: 'secure-askpass'
}
```

## Troubleshooting

1. **"sudo: no askpass program specified"**: Ensure `SUDO_ASKPASS` is supported on the target system
2. **Permission denied on askpass script**: Check that `/tmp` is executable and writable
3. **Cleanup failures**: Temporary scripts are cleaned up automatically, but you can manually check `/tmp/askpass-*.sh`

## Future Improvements

- Support for credential helpers (like git-credential)
- Integration with system keychains
- Support for MFA/2FA sudo authentication
- Encrypted password transmission options

## See Also

- [SSH Authentication](./authentication.md) - SSH authentication methods
- [SSH Setup](./setup.md) - Basic SSH configuration  
- [SSH Tunneling](./tunneling.md) - Port forwarding and tunnels
- [Security Best Practices](../../guides/advanced/security.md) - General security guidance