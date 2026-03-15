---
sidebar_position: 3
title: Security Best Practices
description: Security patterns and best practices for Xec automation scripts
---

# Security Best Practices

## Problem

Automation scripts often handle sensitive data like passwords, API keys, and certificates while executing across multiple environments. Security vulnerabilities in scripts can expose credentials, allow command injection, or compromise entire infrastructure. Teams need comprehensive security practices that protect sensitive data while maintaining automation efficiency.

## Prerequisites

- Xec CLI installed and configured
- Understanding of basic security concepts
- Access to secret management tools
- Knowledge of environment variables and configuration
- Familiarity with SSH key management

## Solution

### Step 1: Secure Credential Management

Implement secure handling of sensitive data:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';
import crypto from 'crypto';

class SecretManager {
  constructor(options = {}) {
    this.provider = options.provider || 'env';
    this.cache = new Map();
    this.keyring = options.keyring || '.xec/secrets';
  }

  async get(name) {
    // Check cache first (with TTL)
    if (this.cache.has(name)) {
      const cached = this.cache.get(name);
      if (cached.expires > Date.now()) {
        return cached.value;
      }
      this.cache.delete(name);
    }

    // Retrieve from provider
    const value = await this.retrieve(name);
    
    // Cache with expiration
    this.cache.set(name, {
      value,
      expires: Date.now() + 300000 // 5 minutes
    });

    return value;
  }

  async retrieve(name) {
    switch (this.provider) {
      case 'env':
        return this.getFromEnv(name);
      case 'vault':
        return this.getFromVault(name);
      case 'aws-secrets':
        return this.getFromAWS(name);
      case 'keyring':
        return this.getFromKeyring(name);
      default:
        throw new Error(`Unknown secret provider: ${this.provider}`);
    }
  }

  getFromEnv(name) {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Secret ${name} not found in environment`);
    }
    return value;
  }

  async getFromVault(name) {
    // HashiCorp Vault integration
    const token = process.env.VAULT_TOKEN;
    const vaultAddr = process.env.VAULT_ADDR || 'http://localhost:8200';
    
    const result = await $`curl -s -H "X-Vault-Token: ${token}" \
      ${vaultAddr}/v1/secret/data/${name}`;
    
    const data = JSON.parse(result.stdout);
    return data.data.data.value;
  }

  async getFromAWS(name) {
    // AWS Secrets Manager
    const result = await $`aws secretsmanager get-secret-value \
      --secret-id ${name} \
      --query SecretString \
      --output text`;
    
    return result.stdout.trim();
  }

  async getFromKeyring(name) {
    // Local encrypted keyring
    const encryptedFile = `${this.keyring}/${name}.enc`;
    
    if (!await $.exists(encryptedFile)) {
      throw new Error(`Secret ${name} not found in keyring`);
    }

    // Decrypt using system key
    const key = await this.getSystemKey();
    const encrypted = await $.readFile(encryptedFile);
    
    return this.decrypt(encrypted, key);
  }

  async store(name, value) {
    // Store in keyring (encrypted)
    await $.mkdir(this.keyring, { recursive: true });
    
    const key = await this.getSystemKey();
    const encrypted = this.encrypt(value, key);
    
    await $.writeFile(`${this.keyring}/${name}.enc`, encrypted);
    
    // Set restrictive permissions
    await $`chmod 600 ${this.keyring}/${name}.enc`;
  }

  encrypt(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(encrypted, key) {
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async getSystemKey() {
    // Derive key from system properties
    const hostname = await $`hostname`;
    const machineId = await $.readFile('/etc/machine-id').catch(() => 'default');
    
    const combined = `${hostname.stdout}:${machineId}`;
    return crypto.createHash('sha256').update(combined).digest();
  }

  clear() {
    // Clear sensitive data from memory
    this.cache.clear();
  }
}

// Usage
const secrets = new SecretManager({ provider: 'keyring' });

// Store secret securely
await secrets.store('api_key', 'secret-value-123');

// Retrieve and use
const apiKey = await secrets.get('api_key');
await $`curl -H "Authorization: Bearer ${apiKey}" https://api.example.com`;

// Clear when done
secrets.clear();
```

### Step 2: Input Validation and Sanitization

Prevent command injection and validate inputs:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

class InputValidator {
  // Validate and sanitize user input
  static validatePath(path) {
    // Check for path traversal attempts
    if (path.includes('..') || path.includes('~')) {
      throw new Error('Path traversal detected');
    }
    
    // Only allow alphanumeric, dash, underscore, slash, dot
    if (!/^[a-zA-Z0-9\-_\/\.]+$/.test(path)) {
      throw new Error('Invalid characters in path');
    }
    
    // Must be relative or absolute path
    if (!path.startsWith('/') && !path.startsWith('./')) {
      path = `./${path}`;
    }
    
    return path;
  }

  static validateCommand(cmd) {
    // Blocklist dangerous commands
    const dangerous = [
      'rm -rf /',
      'mkfs',
      'dd if=/dev/zero',
      ':(){ :|:& };:',  // Fork bomb
      'chmod -R 777',
      'eval',
      'exec'
    ];
    
    const cmdLower = cmd.toLowerCase();
    for (const danger of dangerous) {
      if (cmdLower.includes(danger.toLowerCase())) {
        throw new Error(`Dangerous command pattern detected: ${danger}`);
      }
    }
    
    return cmd;
  }

  static sanitizeShellArg(arg) {
    // Use Xec's built-in escaping
    return $.quote(arg);
  }

  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
    return email;
  }

  static validatePort(port) {
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error('Invalid port number');
    }
    return portNum;
  }

  static validateHost(host) {
    // Allow IPv4, IPv6, and hostnames
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!ipv4Regex.test(host) && !ipv6Regex.test(host) && !hostnameRegex.test(host)) {
      throw new Error('Invalid host format');
    }
    
    return host;
  }
}

// Safe command execution wrapper
class SafeExecutor {
  async execute(command, args = [], options = {}) {
    // Validate command
    const safeCommand = InputValidator.validateCommand(command);
    
    // Sanitize all arguments
    const safeArgs = args.map(arg => InputValidator.sanitizeShellArg(arg));
    
    // Build command with proper escaping
    const fullCommand = [safeCommand, ...safeArgs].join(' ');
    
    // Execute with restrictions
    const result = await this.restrictedExecute(fullCommand, options);
    
    return result;
  }

  async restrictedExecute(command, options = {}) {
    const {
      timeout = 30000,
      maxOutput = 1024 * 1024, // 1MB
      allowedPaths = [],
      user = null
    } = options;
    
    // Create restricted environment
    const env = {
      ...process.env,
      PATH: '/usr/local/bin:/usr/bin:/bin', // Restricted PATH
      SHELL: '/bin/sh'
    };
    
    // Remove sensitive environment variables
    delete env.AWS_SECRET_ACCESS_KEY;
    delete env.GITHUB_TOKEN;
    delete env.NPM_TOKEN;
    
    // Execute with restrictions
    try {
      const result = await $`timeout ${timeout}ms ${command}`.env(env);
      
      // Check output size
      if (result.stdout.length > maxOutput) {
        throw new Error('Output exceeds maximum allowed size');
      }
      
      return result;
    } catch (error) {
      // Sanitize error messages
      error.message = error.message.replace(/[^\x20-\x7E]/g, '');
      throw error;
    }
  }
}

// Usage example
async function processUserInput(userPath, userCommand) {
  const validator = new InputValidator();
  const executor = new SafeExecutor();
  
  try {
    // Validate inputs
    const safePath = InputValidator.validatePath(userPath);
    
    // Execute safely
    const result = await executor.execute('ls', [safePath], {
      timeout: 5000,
      maxOutput: 10000
    });
    
    return result;
  } catch (error) {
    console.error('Security validation failed:', error.message);
    throw error;
  }
}
```

### Step 3: Secure SSH and Remote Connections

Manage SSH connections securely:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';
import fs from 'fs/promises';

class SecureSSH {
  constructor(options = {}) {
    this.keyPath = options.keyPath || '~/.ssh';
    this.knownHosts = options.knownHosts || '~/.ssh/known_hosts';
    this.configPath = options.configPath || '~/.ssh/config';
  }

  async connect(host, options = {}) {
    // Validate host
    InputValidator.validateHost(host);
    
    // Verify host key
    await this.verifyHostKey(host);
    
    // Use secure options
    const secureOptions = {
      ...options,
      // Force secure defaults
      strictHostKeyChecking: 'yes',
      passwordAuthentication: 'no',
      preferredAuthentications: 'publickey',
      compression: 'yes',
      serverAliveInterval: 60,
      serverAliveCountMax: 3,
      // Limit forwarding
      forwardAgent: false,
      forwardX11: false,
      // Use specific key
      identityFile: options.privateKey || `${this.keyPath}/id_ed25519`
    };
    
    return $.ssh(secureOptions);
  }

  async verifyHostKey(host) {
    // Check known hosts
    try {
      const known = await $.readFile(this.knownHosts);
      if (!known.includes(host)) {
        // Fetch and verify host key
        const key = await $`ssh-keyscan -t ed25519,rsa ${host}`;
        
        // Prompt for verification (in production, implement proper verification)
        console.log(`New host key for ${host}:`);
        console.log(key.stdout);
        
        // Add to known hosts
        await $`echo "${key.stdout}" >> ${this.knownHosts}`;
      }
    } catch (error) {
      throw new Error(`Failed to verify host key: ${error.message}`);
    }
  }

  async generateKeyPair(name = 'id_ed25519') {
    const privatePath = `${this.keyPath}/${name}`;
    const publicPath = `${privatePath}.pub`;
    
    // Check if key exists
    if (await $.exists(privatePath)) {
      throw new Error('Key already exists');
    }
    
    // Generate Ed25519 key (more secure than RSA)
    await $`ssh-keygen -t ed25519 -f ${privatePath} -N "" -C "xec-automation"`;
    
    // Set restrictive permissions
    await $`chmod 600 ${privatePath}`;
    await $`chmod 644 ${publicPath}`;
    
    return {
      private: privatePath,
      public: publicPath
    };
  }

  async rotateKeys(host) {
    // Generate new key pair
    const timestamp = Date.now();
    const newKey = await this.generateKeyPair(`id_ed25519_${timestamp}`);
    
    // Deploy new public key
    const ssh = await this.connect(host);
    const publicKey = await $.readFile(newKey.public);
    
    await ssh`echo "${publicKey}" >> ~/.ssh/authorized_keys`;
    
    // Test new key
    const testSSH = await $.ssh({
      host,
      privateKey: newKey.private
    });
    
    await testSSH`echo "Key rotation successful"`;
    
    // Remove old key from authorized_keys
    await testSSH`sed -i.bak '/xec-automation/d' ~/.ssh/authorized_keys`;
    await testSSH`echo "${publicKey}" >> ~/.ssh/authorized_keys`;
    
    // Archive old key
    const oldKey = `${this.keyPath}/id_ed25519`;
    await $`mv ${oldKey} ${oldKey}.old.${timestamp}`;
    await $`mv ${newKey.private} ${oldKey}`;
    
    console.log('Key rotation completed successfully');
  }

  async auditConnections() {
    // Check SSH configuration
    const config = await $.readFile(this.configPath).catch(() => '');
    
    const issues = [];
    
    // Check for insecure options
    if (config.includes('StrictHostKeyChecking no')) {
      issues.push('StrictHostKeyChecking is disabled');
    }
    
    if (config.includes('PasswordAuthentication yes')) {
      issues.push('Password authentication is enabled');
    }
    
    // Check key permissions
    const keys = await $`ls -la ${this.keyPath}/*.pub | grep -v ".pub"`;
    const keyFiles = keys.stdout.split('\n').filter(Boolean);
    
    for (const keyFile of keyFiles) {
      const perms = keyFile.split(/\s+/)[0];
      if (!perms.startsWith('-rw-------')) {
        issues.push(`Insecure permissions on ${keyFile}`);
      }
    }
    
    return {
      secure: issues.length === 0,
      issues
    };
  }
}

// Usage
const ssh = new SecureSSH();

// Generate secure keys
await ssh.generateKeyPair();

// Connect securely
const connection = await ssh.connect('server.example.com', {
  username: 'deploy',
  port: 22
});

// Rotate keys periodically
await ssh.rotateKeys('server.example.com');

// Audit security
const audit = await ssh.auditConnections();
if (!audit.secure) {
  console.error('Security issues found:', audit.issues);
}
```

### Step 4: Secure File Operations

Handle files securely:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';
import crypto from 'crypto';
import path from 'path';

class SecureFileHandler {
  constructor(options = {}) {
    this.tempDir = options.tempDir || '/tmp/xec-secure';
    this.shredPasses = options.shredPasses || 3;
  }

  async readSensitive(filePath) {
    // Validate path
    const safePath = InputValidator.validatePath(filePath);
    
    // Check permissions
    const stats = await fs.stat(safePath);
    if (stats.mode & 0o077) {
      console.warn(`Warning: ${safePath} has permissive permissions`);
    }
    
    // Read and immediately clear from memory after use
    const content = await $.readFile(safePath);
    
    return {
      data: content,
      clear: () => {
        // Overwrite string in memory (best effort)
        content = crypto.randomBytes(content.length).toString();
      }
    };
  }

  async writeSensitive(filePath, content, options = {}) {
    const safePath = InputValidator.validatePath(filePath);
    
    // Create with restrictive permissions
    await $.writeFile(safePath, content);
    await $`chmod 600 ${safePath}`;
    
    // Set ownership if specified
    if (options.owner) {
      await $`chown ${options.owner} ${safePath}`;
    }
    
    // Verify write
    const verification = await $.readFile(safePath);
    if (verification !== content) {
      throw new Error('File verification failed');
    }
  }

  async secureDelete(filePath) {
    const safePath = InputValidator.validatePath(filePath);
    
    // Overwrite file multiple times before deletion
    const stats = await fs.stat(safePath);
    const size = stats.size;
    
    for (let i = 0; i < this.shredPasses; i++) {
      // Overwrite with random data
      const randomData = crypto.randomBytes(size);
      await $.writeFile(safePath, randomData);
      
      // Sync to disk
      await $`sync`;
    }
    
    // Finally remove
    await $`rm -f ${safePath}`;
  }

  async createSecureTemp(prefix = 'xec') {
    // Create temp directory with restrictive permissions
    await $`mkdir -p ${this.tempDir}`;
    await $`chmod 700 ${this.tempDir}`;
    
    // Generate unique filename
    const random = crypto.randomBytes(16).toString('hex');
    const tempFile = path.join(this.tempDir, `${prefix}-${random}`);
    
    // Create file with restrictive permissions
    await $`touch ${tempFile}`;
    await $`chmod 600 ${tempFile}`;
    
    // Return path and cleanup function
    return {
      path: tempFile,
      cleanup: async () => {
        await this.secureDelete(tempFile);
      }
    };
  }

  async encryptFile(inputPath, outputPath, password) {
    const safeinput = InputValidator.validatePath(inputPath);
    const safeOutput = InputValidator.validatePath(outputPath);
    
    // Use GPG for encryption
    await $`gpg --batch --yes --passphrase "${password}" \
      --cipher-algo AES256 \
      --symmetric \
      --output ${safeOutput} \
      ${safeinput}`;
    
    // Set restrictive permissions
    await $`chmod 600 ${safeOutput}`;
  }

  async decryptFile(inputPath, outputPath, password) {
    const safeInput = InputValidator.validatePath(inputPath);
    const safeOutput = InputValidator.validatePath(outputPath);
    
    // Decrypt with GPG
    await $`gpg --batch --yes --passphrase "${password}" \
      --decrypt \
      --output ${safeOutput} \
      ${safeInput}`;
    
    // Set restrictive permissions
    await $`chmod 600 ${safeOutput}`;
  }

  async verifyIntegrity(filePath, expectedHash) {
    const safePath = InputValidator.validatePath(filePath);
    
    // Calculate hash
    const result = await $`sha256sum ${safePath}`;
    const actualHash = result.stdout.split(' ')[0];
    
    if (actualHash !== expectedHash) {
      throw new Error('File integrity check failed');
    }
    
    return true;
  }
}

// Usage
const fileHandler = new SecureFileHandler();

// Handle sensitive files
const temp = await fileHandler.createSecureTemp('secret');
try {
  await fileHandler.writeSensitive(temp.path, 'sensitive data');
  
  // Encrypt for storage
  await fileHandler.encryptFile(temp.path, 'data.enc', 'strongpassword');
  
  // Verify integrity
  const hash = await $`sha256sum data.enc`;
  await fileHandler.verifyIntegrity('data.enc', hash.stdout.split(' ')[0]);
  
} finally {
  await temp.cleanup();
}
```

### Step 5: Audit Logging and Monitoring

Track security events:

```javascript
#!/usr/bin/env xec

import { $ } from '@xec-sh/core';

class SecurityAuditor {
  constructor(options = {}) {
    this.logFile = options.logFile || '.xec/security-audit.log';
    this.alertThreshold = options.alertThreshold || 5;
    this.events = [];
  }

  async log(event) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: event.type,
      severity: event.severity || 'info',
      user: process.env.USER,
      pid: process.pid,
      ...event
    };
    
    // Add to memory
    this.events.push(entry);
    
    // Write to file
    await this.writeLog(entry);
    
    // Check for alerts
    if (entry.severity === 'critical') {
      await this.sendAlert(entry);
    }
    
    // Check for patterns
    await this.detectAnomalies();
  }

  async writeLog(entry) {
    const line = JSON.stringify(entry) + '\n';
    
    // Append to log file
    await $`echo '${line}' >> ${this.logFile}`;
    
    // Rotate if needed
    const stats = await fs.stat(this.logFile).catch(() => null);
    if (stats && stats.size > 10 * 1024 * 1024) { // 10MB
      await this.rotateLog();
    }
  }

  async rotateLog() {
    const timestamp = Date.now();
    await $`mv ${this.logFile} ${this.logFile}.${timestamp}`;
    await $`gzip ${this.logFile}.${timestamp}`;
  }

  async detectAnomalies() {
    // Check for suspicious patterns
    const recentEvents = this.events.slice(-100);
    
    // Multiple failed authentications
    const failedAuth = recentEvents.filter(e => 
      e.type === 'auth_failed'
    );
    
    if (failedAuth.length > this.alertThreshold) {
      await this.sendAlert({
        type: 'anomaly',
        message: `${failedAuth.length} failed authentication attempts`,
        severity: 'warning'
      });
    }
    
    // Rapid command execution
    const commands = recentEvents.filter(e => 
      e.type === 'command_executed'
    );
    
    const timeWindow = 60000; // 1 minute
    const now = Date.now();
    const recentCommands = commands.filter(e => 
      new Date(e.timestamp).getTime() > now - timeWindow
    );
    
    if (recentCommands.length > 50) {
      await this.sendAlert({
        type: 'anomaly',
        message: 'Unusual command execution rate detected',
        severity: 'warning'
      });
    }
  }

  async sendAlert(event) {
    console.error(`SECURITY ALERT: ${event.message || event.type}`);
    
    // Send to monitoring system
    if (process.env.SECURITY_WEBHOOK) {
      await $`curl -X POST ${process.env.SECURITY_WEBHOOK} \
        -H 'Content-Type: application/json' \
        -d '${JSON.stringify(event)}'`.nothrow();
    }
  }

  async generateReport() {
    const report = {
      period: {
        start: this.events[0]?.timestamp,
        end: this.events[this.events.length - 1]?.timestamp
      },
      summary: {
        total: this.events.length,
        bySeverity: {},
        byType: {}
      },
      criticalEvents: [],
      recommendations: []
    };
    
    // Analyze events
    this.events.forEach(event => {
      // By severity
      report.summary.bySeverity[event.severity] = 
        (report.summary.bySeverity[event.severity] || 0) + 1;
      
      // By type
      report.summary.byType[event.type] = 
        (report.summary.byType[event.type] || 0) + 1;
      
      // Critical events
      if (event.severity === 'critical') {
        report.criticalEvents.push(event);
      }
    });
    
    // Generate recommendations
    if (report.summary.byType.auth_failed > 10) {
      report.recommendations.push('Review authentication mechanisms');
    }
    
    if (report.summary.byType.permission_denied > 5) {
      report.recommendations.push('Audit file permissions');
    }
    
    return report;
  }
}

// Global auditor
const auditor = new SecurityAuditor();

// Wrap command execution with auditing
async function auditedExecute(command, context = {}) {
  await auditor.log({
    type: 'command_executed',
    command: command.substring(0, 100), // Don't log full commands
    context
  });
  
  try {
    return await $`${command}`;
  } catch (error) {
    await auditor.log({
      type: 'command_failed',
      severity: 'warning',
      error: error.message,
      context
    });
    throw error;
  }
}

// Monitor authentication
async function authenticatedAction(action, credentials) {
  try {
    // Verify credentials
    const valid = await verifyCredentials(credentials);
    
    if (!valid) {
      await auditor.log({
        type: 'auth_failed',
        severity: 'warning',
        action
      });
      throw new Error('Authentication failed');
    }
    
    await auditor.log({
      type: 'auth_success',
      action
    });
    
    return await action();
    
  } catch (error) {
    await auditor.log({
      type: 'auth_error',
      severity: 'critical',
      error: error.message
    });
    throw error;
  }
}
```

## Best Practices

1. **Defense in Depth**
   - Multiple security layers
   - Validate at every level
   - Assume breach possibility
   - Regular security audits

2. **Least Privilege**
   - Minimal permissions
   - Separate service accounts
   - Time-limited access
   - Role-based controls

3. **Secure by Default**
   - Restrictive defaults
   - Explicit permission grants
   - Fail securely
   - No hardcoded secrets

4. **Continuous Monitoring**
   - Log security events
   - Detect anomalies
   - Alert on violations
   - Regular reviews

5. **Incident Response**
   - Prepared runbooks
   - Clear escalation
   - Post-mortem analysis
   - Continuous improvement

## Common Pitfalls

1. **Hardcoded Secrets**
   - ❌ Passwords in code
   - ✅ Use secret management systems

2. **Overly Permissive Access**
   - ❌ chmod 777
   - ✅ Use minimal required permissions

3. **Unvalidated Input**
   - ❌ Direct user input in commands
   - ✅ Always validate and sanitize

4. **Unencrypted Transmission**
   - ❌ Plain HTTP/FTP
   - ✅ Use HTTPS/SFTP/SSH

5. **Missing Audit Logs**
   - ❌ No security logging
   - ✅ Comprehensive audit trail

## Troubleshooting

### Issue: Permission Denied Errors
```bash
# Check file permissions
ls -la file.txt

# Fix permissions (restrictive)
chmod 600 sensitive-file
chmod 700 script.sh

# Check effective user
id
whoami
```

### Issue: SSH Key Authentication Failing
```bash
# Check key permissions
ls -la ~/.ssh/

# Fix permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_*
chmod 644 ~/.ssh/*.pub

# Test connection
ssh -vvv user@host
```

### Issue: Secret Not Found
```javascript
// Debug secret retrieval
const secrets = new SecretManager({ provider: 'env' });

// Check available secrets
console.log('Environment:', Object.keys(process.env).filter(k => k.startsWith('SECRET_')));

// Test retrieval
try {
  const value = await secrets.get('MY_SECRET');
} catch (error) {
  console.error('Secret error:', error);
  // Check provider configuration
}
```

### Issue: Audit Log Growing Too Large
```bash
# Rotate logs
logrotate -f /etc/logrotate.d/xec-security

# Compress old logs
gzip .xec/security-audit.log.*

# Archive to backup
tar -czf security-logs-$(date +%Y%m%d).tar.gz .xec/security-audit.log.*
```

## Related Guides

- [Error Handling](./error-handling.md) - Security error handling
- [SSH Management](../infrastructure/server-management.md) - SSH security
- [Container Security](../infrastructure/container-orchestration.md) - Docker/K8s security
- [CI/CD Security](../automation/ci-cd-pipelines.md) - Pipeline security