---
title: SSH Authentication
description: SSH authentication methods, key management, and security best practices
keywords: [ssh, authentication, keys, passwords, agent, security]
source_files:
  - packages/core/src/ssh/auth.ts
  - packages/core/src/ssh/ssh-client.ts
  - packages/core/src/utils/crypto.ts
key_functions:
  - authenticateSSH()
  - loadPrivateKey()
  - decryptKey()
  - tryAuthMethods()
verification_date: 2025-08-03
---

# SSH Authentication

## Implementation Reference

**Source Files:**
- `packages/core/src/ssh/auth.ts` - Authentication logic
- `packages/core/src/ssh/ssh-client.ts` - Client authentication (lines 70-150)
- `packages/core/src/utils/crypto.ts` - Key handling utilities
- `packages/core/src/utils/secrets.ts` - Secret management

**Key Functions:**
- `authenticateSSH()` - Main authentication flow
- `loadPrivateKey()` - Load and parse private keys
- `decryptKey()` - Decrypt encrypted keys
- `tryAuthMethods()` - Try multiple auth methods
- `getSSHAgent()` - Connect to SSH agent

## Authentication Methods

### Method Priority

Authentication methods are tried in this order (from `auth.ts`):

1. **SSH Agent** - If available and not disabled
2. **Private Key** - If provided
3. **Password** - If provided
4. **Keyboard Interactive** - If server requires

### Private Key Authentication

#### Basic Key Authentication

```yaml
targets:
  server:
    type: ssh
    host: example.com
    user: deploy
    privateKey: ~/.ssh/id_rsa  # Path to key file
```

```typescript
// Programmatic key auth
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  privateKey: '/Users/user/.ssh/id_rsa'
})`command`;

// Key from string
const keyContent = await fs.readFile('~/.ssh/id_rsa', 'utf8');
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  privateKey: keyContent
})`command`;
```

#### Encrypted Keys

```yaml
targets:
  secure:
    type: ssh
    host: secure.example.com
    user: admin
    privateKey: ~/.ssh/id_rsa_encrypted
    passphrase: ${SSH_KEY_PASSPHRASE}  # From environment
```

```typescript
// With passphrase
await $.ssh({
  host: 'secure.example.com',
  user: 'admin',
  privateKey: '~/.ssh/id_rsa_encrypted',
  passphrase: process.env.SSH_KEY_PASSPHRASE
})`command`;

// Interactive passphrase
const passphrase = await question({
  message: 'Enter SSH key passphrase:',
  type: 'password'
});

await $.ssh({
  host: 'secure.example.com',
  privateKey: '~/.ssh/id_rsa_encrypted',
  passphrase
})`command`;
```

#### Multiple Keys

```typescript
// Try multiple keys
const keys = [
  '~/.ssh/id_ed25519',
  '~/.ssh/id_rsa',
  '~/.ssh/deploy_key'
];

for (const key of keys) {
  try {
    await $.ssh({
      host: 'example.com',
      user: 'deploy',
      privateKey: key
    })`command`;
    break;  // Success
  } catch (error) {
    if (error.code !== 'EAUTH') throw error;
    // Try next key
  }
}
```

### SSH Agent Authentication

#### Using SSH Agent

```yaml
targets:
  agent-auth:
    type: ssh
    host: example.com
    user: deploy
    agent: true  # Use SSH agent (default if available)
```

```typescript
// Explicit agent usage
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  agent: true  // Will use $SSH_AUTH_SOCK
})`command`;

// Custom agent socket
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  agent: '/tmp/ssh-agent.sock'
})`command`;

// Disable agent
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  agent: false,  // Don't use agent even if available
  privateKey: '~/.ssh/id_rsa'
})`command`;
```

#### Agent Forwarding

```yaml
targets:
  jump:
    type: ssh
    host: bastion.example.com
    user: jump
    agentForward: true  # Forward agent to remote
```

```typescript
// Enable agent forwarding
await $.ssh({
  host: 'bastion.example.com',
  user: 'jump',
  agent: true,
  agentForward: true
})`ssh deploy@internal-server`;  // Uses forwarded agent
```

### Password Authentication

#### Basic Password Auth

```yaml
targets:
  password-server:
    type: ssh
    host: example.com
    user: admin
    password: ${SSH_PASSWORD}  # From environment
```

```typescript
// Password from environment
await $.ssh({
  host: 'example.com',
  user: 'admin',
  password: process.env.SSH_PASSWORD
})`command`;

// Interactive password
const password = await question({
  message: 'Enter SSH password:',
  type: 'password'
});

await $.ssh({
  host: 'example.com',
  user: 'admin',
  password
})`command`;
```

#### Keyboard-Interactive

```typescript
// Handle keyboard-interactive auth
await $.ssh({
  host: 'example.com',
  user: 'admin',
  tryKeyboard: true,
  onKeyboard: async (name, instructions, prompts) => {
    const responses = [];
    for (const prompt of prompts) {
      if (prompt.prompt.includes('Password')) {
        responses.push(process.env.SSH_PASSWORD);
      } else if (prompt.prompt.includes('OTP')) {
        const otp = await question({ message: prompt.prompt });
        responses.push(otp);
      }
    }
    return responses;
  }
})`command`;
```

## Key Management

### Key File Formats

Supported key formats (auto-detected):

- **OpenSSH** - Default format (BEGIN OPENSSH PRIVATE KEY)
- **PEM** - Traditional format (BEGIN RSA PRIVATE KEY)
- **PPK** - PuTTY format (converted automatically)

```typescript
// Auto-detect key format
const keyTypes = [
  '~/.ssh/id_rsa',        // PEM or OpenSSH
  '~/.ssh/id_ed25519',    // Ed25519 (OpenSSH)
  '~/.ssh/id_ecdsa',      // ECDSA
  '~/.ssh/key.ppk'        // PuTTY (converted)
];

for (const keyPath of keyTypes) {
  await $.ssh({
    host: 'example.com',
    privateKey: keyPath  // Format auto-detected
  })`command`;
}
```

### Key Generation

```bash
# Generate Ed25519 key (recommended)
ssh-keygen -t ed25519 -C "deploy@example.com" -f ~/.ssh/deploy_key

# Generate RSA key (compatibility)
ssh-keygen -t rsa -b 4096 -C "deploy@example.com" -f ~/.ssh/deploy_key

# Generate with passphrase
ssh-keygen -t ed25519 -N "passphrase" -f ~/.ssh/secure_key
```

### Key Storage

```typescript
// Secure key storage patterns
class KeyManager {
  // Load key from encrypted storage
  async loadKey(keyName: string): Promise<string> {
    const encrypted = await fs.readFile(`~/.ssh/keys/${keyName}.enc`);
    const passphrase = await this.getPassphrase(keyName);
    return decrypt(encrypted, passphrase);
  }
  
  // Cache decrypted keys in memory
  private keyCache = new Map<string, string>();
  
  async getKey(keyName: string): Promise<string> {
    if (!this.keyCache.has(keyName)) {
      const key = await this.loadKey(keyName);
      this.keyCache.set(keyName, key);
      
      // Clear after timeout
      setTimeout(() => {
        this.keyCache.delete(keyName);
      }, 300000);  // 5 minutes
    }
    return this.keyCache.get(keyName)!;
  }
}
```

## Certificate Authentication

### SSH Certificates

```yaml
targets:
  cert-auth:
    type: ssh
    host: example.com
    user: deploy
    privateKey: ~/.ssh/id_rsa
    certificate: ~/.ssh/id_rsa-cert.pub  # SSH certificate
```

```typescript
// Certificate-based auth
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  privateKey: '~/.ssh/id_rsa',
  certificate: '~/.ssh/id_rsa-cert.pub'
})`command`;
```

### Certificate Validation

```typescript
// Custom certificate validation
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  privateKey: '~/.ssh/id_rsa',
  certificate: '~/.ssh/id_rsa-cert.pub',
  onCertificate: (cert) => {
    // Validate certificate
    if (cert.validBefore < Date.now()) {
      throw new Error('Certificate expired');
    }
    if (!cert.principals.includes('deploy')) {
      throw new Error('Invalid principal');
    }
    return true;
  }
})`command`;
```

## Multi-Factor Authentication

### TOTP/OTP Support

```typescript
// Handle OTP authentication
import { authenticator } from 'otplib';

await $.ssh({
  host: 'mfa.example.com',
  user: 'admin',
  password: process.env.SSH_PASSWORD,
  tryKeyboard: true,
  onKeyboard: async (name, instructions, prompts) => {
    const responses = [];
    for (const prompt of prompts) {
      if (prompt.prompt.includes('Verification code')) {
        // Generate TOTP code
        const token = authenticator.generate(process.env.TOTP_SECRET);
        responses.push(token);
      } else {
        responses.push(process.env.SSH_PASSWORD);
      }
    }
    return responses;
  }
})`command`;
```

### Hardware Token Support

```typescript
// YubiKey or similar hardware token
await $.ssh({
  host: 'secure.example.com',
  user: 'admin',
  tryKeyboard: true,
  onKeyboard: async (name, instructions, prompts) => {
    for (const prompt of prompts) {
      if (prompt.prompt.includes('YubiKey')) {
        console.log('Touch your YubiKey...');
        // Wait for hardware token input
        const token = await waitForHardwareToken();
        return [token];
      }
    }
    return [];
  }
})`command`;
```

## Credential Management

### Environment Variables

```bash
# Set credentials in environment
export SSH_KEY_PATH=~/.ssh/deploy_key
export SSH_KEY_PASSPHRASE=secret
export SSH_PASSWORD=password
```

```typescript
// Use environment credentials
await $.ssh({
  host: 'example.com',
  user: 'deploy',
  privateKey: process.env.SSH_KEY_PATH,
  passphrase: process.env.SSH_KEY_PASSPHRASE
})`command`;
```

### Secure Credential Storage

```typescript
// Using system keychain (macOS)
import { execSync } from 'child_process';

async function getPassword(service: string, account: string): Promise<string> {
  const result = execSync(
    `security find-generic-password -s "${service}" -a "${account}" -w`
  );
  return result.toString().trim();
}

// Usage
const password = await getPassword('ssh', 'admin@example.com');
await $.ssh({
  host: 'example.com',
  user: 'admin',
  password
})`command`;
```

### Credential Rotation

```typescript
// Automatic key rotation
class CredentialRotator {
  async rotateKey(target: string) {
    // Generate new key
    await $`ssh-keygen -t ed25519 -N "" -f ~/.ssh/${target}_new`;
    
    // Deploy new public key
    const newPubKey = await fs.readFile(`~/.ssh/${target}_new.pub`, 'utf8');
    await $.ssh({
      host: target,
      privateKey: `~/.ssh/${target}_old`
    })`echo "${newPubKey}" >> ~/.ssh/authorized_keys`;
    
    // Test new key
    await $.ssh({
      host: target,
      privateKey: `~/.ssh/${target}_new`
    })`echo "New key works"`;
    
    // Rotate keys
    await fs.rename(`~/.ssh/${target}_new`, `~/.ssh/${target}_old`);
  }
}
```

## Security Best Practices

### Key Security

1. **Use Ed25519 keys** when possible (smaller, faster, more secure)
2. **Always use passphrases** for private keys
3. **Set correct permissions**: `chmod 600 ~/.ssh/id_*`
4. **Don't share private keys** between systems
5. **Rotate keys regularly** (every 3-6 months)

### Authentication Security

```typescript
// Secure authentication configuration
const secureConfig = {
  // Prefer key-based auth
  agent: true,
  privateKey: process.env.SSH_KEY_PATH,
  
  // Avoid passwords
  password: undefined,
  
  // Strict host checking
  strictHostKeyChecking: true,
  
  // Strong algorithms only
  algorithms: {
    serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256'],
    kex: ['curve25519-sha256', 'ecdh-sha2-nistp256'],
    cipher: ['aes256-gcm@openssh.com', 'aes128-gcm@openssh.com']
  },
  
  // Disable weak methods
  disablePasswordAuth: true,
  disableKbdInteractive: false  // May be needed for MFA
};
```

### Audit Logging

```typescript
// Log authentication attempts
const auditLog = [];

await $.ssh({
  host: 'example.com',
  user: 'deploy',
  onAuthenticate: (method, success) => {
    auditLog.push({
      timestamp: new Date(),
      host: 'example.com',
      user: 'deploy',
      method,
      success,
      ip: process.env.SSH_CLIENT_IP
    });
    
    if (!success) {
      console.error(`Authentication failed: ${method}`);
      // Alert on failures
    }
  }
})`command`;
```

## Troubleshooting

### Common Authentication Issues

#### Permission Denied

```bash
# Check key permissions
ls -la ~/.ssh/
# Should be 600 for private keys, 644 for public keys

# Fix permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
```

#### Agent Not Working

```bash
# Check agent is running
echo $SSH_AUTH_SOCK
ssh-add -l

# Start agent if needed
eval $(ssh-agent)
ssh-add ~/.ssh/id_rsa
```

#### Wrong Key Type

```typescript
// Try different key types
const keyTypes = ['ed25519', 'rsa', 'ecdsa'];

for (const type of keyTypes) {
  try {
    await $.ssh({
      host: 'example.com',
      privateKey: `~/.ssh/id_${type}`
    })`command`;
    console.log(`Success with ${type} key`);
    break;
  } catch (error) {
    console.log(`${type} key failed:`, error.message);
  }
}
```

### Debug Authentication

```typescript
// Enable auth debugging
process.env.DEBUG = 'ssh2:*';

await $.ssh({
  host: 'example.com',
  debug: (msg) => {
    if (msg.includes('auth')) {
      console.log(`AUTH: ${msg}`);
    }
  }
})`command`;
```

## Best Practices

1. **Use SSH agent** for interactive sessions
2. **Use key-based auth** for automation
3. **Never hardcode passwords** in code
4. **Implement MFA** for sensitive systems
5. **Monitor auth failures** for security
6. **Rotate credentials** regularly
7. **Use certificates** for large deployments

## Related Documentation

- [SSH Overview](./overview.md) - SSH fundamentals
- [Connection Config](./connection-config.md) - Connection setup
- [Security Guide](../../guides/advanced/security.md) - Security best practices
- [Secrets Management](../../commands/built-in/secrets.md) - Managing secrets