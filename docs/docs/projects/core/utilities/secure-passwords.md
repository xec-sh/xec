---
sidebar_position: 4
---

# Secure Passwords

Safe handling of passwords and sensitive credentials with encryption, secure storage, and automatic cleanup.

## Overview

The SecurePasswordHandler provides enterprise-grade password management:
- **In-memory encryption** using AES-256-GCM
- **Secure cleanup** with memory zeroing
- **Sudo integration** via askpass scripts
- **Password generation** with configurable complexity
- **Password validation** with strength checking
- **Automatic disposal** via Disposable interface

## Basic Usage

### Creating and Using Passwords

```typescript
import { SecurePasswordHandler } from '@xec-sh/core';

// Create handler instance
const handler = new SecurePasswordHandler();

// Store passwords securely
handler.storePassword('db-admin', 'secret123');
handler.storePassword('api-key', 'sk_live_abc123');

// Retrieve when needed
const dbPass = handler.retrievePassword('db-admin');
console.log(dbPass); // 'secret123'

// Always dispose when done
await handler.dispose(); // Securely wipes all passwords
```

### Sudo Integration

```typescript
const handler = new SecurePasswordHandler();

// Create askpass script for sudo
const askpassPath = await handler.createAskPassScript('my-sudo-password');

// Create secure environment
const env = handler.createSecureEnv(askpassPath, process.env);

// Use with sudo
await $`sudo -A command-requiring-root`.env(env);

// Cleanup automatically happens on dispose
await handler.dispose();
```

### Password Generation

```typescript
// Generate secure random password
const password = SecurePasswordHandler.generatePassword(32);
console.log(password); // e.g., "K9#mP2$vL8@nQ5&xR7!tY3*wZ6^aB4"

// Validate password strength
const validation = SecurePasswordHandler.validatePassword('weak123');
console.log(validation);
// {
//   isValid: false,
//   issues: [
//     'Password should contain at least one uppercase letter',
//     'Password should contain at least one special character'
//   ]
// }
```

## API Reference

### SecurePasswordHandler Class

```typescript
class SecurePasswordHandler implements Disposable {
  constructor()
  storePassword(id: string, password: string): void
  retrievePassword(id: string): string | null
  createAskPassScript(password: string): Promise<string>
  createSecureEnv(askpassPath: string, baseEnv?: Record<string, string>): Record<string, string>
  cleanup(): Promise<void>
  dispose(): Promise<void>
  
  static maskPassword(command: string, password?: string): string
  static checkSecureMethodsAvailable(): Promise<{
    askpass: boolean;
    stdin: boolean;
    keyring: boolean;
  }>
  static generatePassword(length?: number): string
  static validatePassword(password: string): {
    isValid: boolean;
    issues: string[];
  }
}
```

## Advanced Usage

### Secure Sudo Execution

```typescript
async function sudoExecute(command: string, password: string) {
  const handler = new SecurePasswordHandler();
  
  try {
    // Create askpass script
    const askpassPath = await handler.createAskPassScript(password);
    
    // Build secure environment
    const env = handler.createSecureEnv(askpassPath);
    
    // Execute with sudo
    const result = await $`sudo -A ${command}`
      .env(env)
      .quiet(); // Suppress password prompts from output
    
    return result;
  } finally {
    // Always cleanup
    await handler.dispose();
  }
}

// Usage
const output = await sudoExecute('apt-get update', 'admin-password');
```

### Password Masking in Logs

```typescript
const password = 'secret123';
const command = `mysql -u root -p${password} -e "SHOW DATABASES"`;

// Mask password before logging
const safeCommand = SecurePasswordHandler.maskPassword(command, password);
console.log('Executing:', safeCommand);
// Output: Executing: mysql -u root -p***MASKED*** -e "SHOW DATABASES"

// Execute the actual command
await $`${command}`.quiet();
```

### Batch Password Management

```typescript
class CredentialManager {
  private handler = new SecurePasswordHandler();
  
  async loadCredentials(config: Record<string, string>) {
    for (const [name, password] of Object.entries(config)) {
      this.handler.storePassword(name, password);
    }
  }
  
  async executeWithCredential(name: string, callback: (password: string) => Promise<void>) {
    const password = this.handler.retrievePassword(name);
    if (!password) {
      throw new Error(`Credential '${name}' not found`);
    }
    
    try {
      await callback(password);
    } finally {
      // Password remains encrypted in memory
    }
  }
  
  async dispose() {
    await this.handler.dispose();
  }
}

// Usage
const manager = new CredentialManager();
await manager.loadCredentials({
  'db-prod': 'prod-password',
  'api-key': 'sk_live_123',
  'sudo-pass': 'admin123'
});

await manager.executeWithCredential('db-prod', async (password) => {
  await $`mysql -u admin -p${password} < backup.sql`.quiet();
});

await manager.dispose();
```

### Integration with SSH

```typescript
async function sshWithPassword(host: string, username: string, password: string) {
  const handler = new SecurePasswordHandler();
  
  try {
    // Store password securely
    handler.storePassword('ssh-login', password);
    
    // Create SSH adapter with password
    const $ssh = $.ssh({
      host,
      username,
      password: handler.retrievePassword('ssh-login')
    });
    
    // Execute commands
    await $ssh`echo "Connected successfully"`;
    
    return $ssh;
  } catch (error) {
    await handler.dispose();
    throw error;
  }
}
```

## Security Patterns

### Temporary Password Scripts

```typescript
// For one-time sudo operations
async function sudoInstall(packages: string[], password: string) {
  const handler = new SecurePasswordHandler();
  
  try {
    const askpass = await handler.createAskPassScript(password);
    const env = handler.createSecureEnv(askpass);
    
    // Install packages
    for (const pkg of packages) {
      await $`sudo -A apt-get install -y ${pkg}`.env(env);
    }
  } finally {
    await handler.dispose(); // Removes askpass script
  }
}
```

### Environment Variable Protection

```typescript
async function secureEnvExecution() {
  const handler = new SecurePasswordHandler();
  
  // Store sensitive values
  handler.storePassword('api-key', process.env.API_KEY || '');
  handler.storePassword('db-pass', process.env.DB_PASSWORD || '');
  
  // Create clean environment without sensitive vars
  const cleanEnv = Object.entries(process.env)
    .filter(([key]) => !key.includes('PASSWORD') && !key.includes('KEY'))
    .reduce((env, [key, value]) => ({ ...env, [key]: value }), {});
  
  // Execute with clean environment
  await $`node app.js`.env(cleanEnv);
  
  await handler.dispose();
}
```

### Password Rotation

```typescript
async function rotatePassword(service: string, generateNew = true) {
  const handler = new SecurePasswordHandler();
  
  try {
    // Generate new password
    const newPassword = generateNew 
      ? SecurePasswordHandler.generatePassword(24)
      : await promptForPassword();
    
    // Validate strength
    const validation = SecurePasswordHandler.validatePassword(newPassword);
    if (!validation.isValid) {
      throw new Error(`Weak password: ${validation.issues.join(', ')}`);
    }
    
    // Store securely
    handler.storePassword(service, newPassword);
    
    // Update service
    await updateServicePassword(service, newPassword);
    
    console.log(`Password rotated for ${service}`);
    return newPassword;
  } finally {
    await handler.dispose();
  }
}
```

## Memory Security

### How It Works

The SecurePasswordHandler uses multiple layers of security:

1. **Encryption at Rest**: Passwords are encrypted with AES-256-GCM immediately upon storage
2. **Unique Keys**: Each handler instance has its own encryption key
3. **Secure Cleanup**: Memory is explicitly zeroed before deallocation
4. **No Plaintext Storage**: Passwords never exist in plaintext in memory for extended periods

```typescript
// Internal encryption process
private encryptPassword(password: string): { encrypted: Buffer; salt: Buffer; iv: Buffer } {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = scryptSync(this.encryptionKey, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(password, 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  
  return { encrypted, salt, iv };
}
```

### Disposal Pattern

```typescript
// Always use try-finally for cleanup
async function secureOperation() {
  const handler = new SecurePasswordHandler();
  
  try {
    // Perform operations
    handler.storePassword('key', 'secret');
    await doWork(handler);
  } finally {
    // Guaranteed cleanup
    await handler.dispose();
  }
}

// Or use a wrapper function
async function withSecurePasswords<T>(
  callback: (handler: SecurePasswordHandler) => Promise<T>
): Promise<T> {
  const handler = new SecurePasswordHandler();
  try {
    return await callback(handler);
  } finally {
    await handler.dispose();
  }
}

// Usage
await withSecurePasswords(async (handler) => {
  handler.storePassword('db', 'password123');
  // Use passwords...
});
```

## Best Practices

### 1. Always Dispose

```typescript
// ✅ Good - automatic cleanup
const handler = new SecurePasswordHandler();
try {
  // Use handler
} finally {
  await handler.dispose();
}

// ❌ Bad - memory leak
const handler = new SecurePasswordHandler();
// Forgot to dispose!
```

### 2. Validate Before Storing

```typescript
// ✅ Good - validate first
const password = generatePassword();
const validation = SecurePasswordHandler.validatePassword(password);

if (!validation.isValid) {
  throw new Error(`Invalid password: ${validation.issues.join(', ')}`);
}

handler.storePassword('service', password);

// ❌ Bad - store without validation
handler.storePassword('service', 'weak');
```

### 3. Use Descriptive IDs

```typescript
// ✅ Good - clear purpose
handler.storePassword('postgres-prod-admin', password);
handler.storePassword('api-stripe-secret', apiKey);

// ❌ Bad - ambiguous
handler.storePassword('pass1', password);
handler.storePassword('key', apiKey);
```

### 4. Mask Sensitive Output

```typescript
// ✅ Good - mask before logging
const command = `curl -H "Authorization: Bearer ${token}" api.example.com`;
console.log('Executing:', SecurePasswordHandler.maskPassword(command, token));

// ❌ Bad - log sensitive data
console.log('Executing:', command); // Exposes token!
```

### 5. Limit Password Lifetime

```typescript
// ✅ Good - scoped lifetime
async function performDatabaseBackup() {
  const handler = new SecurePasswordHandler();
  try {
    handler.storePassword('db', await getDbPassword());
    await backupDatabase(handler.retrievePassword('db'));
  } finally {
    await handler.dispose(); // Password cleared
  }
}

// ❌ Bad - long-lived passwords
class Service {
  private handler = new SecurePasswordHandler();
  // Handler lives for entire service lifetime
}
```

## Common Patterns

### Database Connections

```typescript
async function secureDatabaseConnect(config: DatabaseConfig) {
  const handler = new SecurePasswordHandler();
  
  try {
    handler.storePassword('db-pass', config.password);
    
    const connection = await createConnection({
      ...config,
      password: handler.retrievePassword('db-pass')
    });
    
    // Clear password after connection
    return connection;
  } finally {
    await handler.dispose();
  }
}
```

### API Key Management

```typescript
class ApiKeyManager {
  private handler = new SecurePasswordHandler();
  
  addKey(service: string, key: string) {
    // Validate API key format
    if (!key.startsWith('sk_') && !key.startsWith('pk_')) {
      throw new Error('Invalid API key format');
    }
    
    this.handler.storePassword(`api-${service}`, key);
  }
  
  async makeRequest(service: string, endpoint: string) {
    const key = this.handler.retrievePassword(`api-${service}`);
    if (!key) throw new Error(`No API key for ${service}`);
    
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${key}`
      }
    });
    
    return response.json();
  }
  
  async dispose() {
    await this.handler.dispose();
  }
}
```

### Multi-Factor Authentication

```typescript
async function mfaLogin(username: string, password: string, totpSecret: string) {
  const handler = new SecurePasswordHandler();
  
  try {
    // Store credentials
    handler.storePassword('login-pass', password);
    handler.storePassword('totp-secret', totpSecret);
    
    // First factor - password
    await authenticate(username, handler.retrievePassword('login-pass'));
    
    // Second factor - TOTP
    const totp = generateTOTP(handler.retrievePassword('totp-secret'));
    await verifyTOTP(username, totp);
    
    return { success: true };
  } finally {
    await handler.dispose();
  }
}
```

## Security Considerations

### Password Requirements

Default password validation ensures:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter  
- At least one number
- At least one special character

### Memory Protection

- Passwords are encrypted immediately upon storage
- Encryption keys are zeroed on disposal
- Temporary files are removed automatically
- No passwords in command history

### Audit Trail

```typescript
// Log operations without exposing passwords
function auditPasswordOperation(operation: string, service: string) {
  console.log({
    timestamp: new Date().toISOString(),
    operation,
    service,
    // Never log the actual password
    passwordHash: crypto.createHash('sha256')
      .update(service)
      .digest('hex')
      .substring(0, 8)
  });
}
```

## Troubleshooting

### Common Issues

1. **"SecurePasswordHandler has been disposed"**
   - Handler was used after disposal
   - Create a new instance or avoid disposal until done

2. **"Password not found for askpass script"**
   - Script ID mismatch
   - Ensure using the correct askpass path

3. **Sudo not accepting password**
   - Check SUDO_ASKPASS_REQUIRE environment variable
   - Verify askpass script has execute permissions

4. **Memory not being cleared**
   - Ensure dispose() is called
   - Check for handler reference leaks

### Debugging

```typescript
// Enable debug logging
const handler = new SecurePasswordHandler();

// Track password operations
console.log('Stored passwords:', handler['encryptedPasswords'].size);

// Verify cleanup
await handler.dispose();
console.log('After disposal:', handler['isDisposed']); // true
```