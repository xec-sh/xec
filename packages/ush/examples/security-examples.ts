#!/usr/bin/env node
/**
 * Security Best Practices for @xec/ush
 * 
 * This file demonstrates security considerations and safe practices
 * when executing shell commands with @xec/ush.
 */

import { $ } from '@xec/ush';
import * as crypto from 'crypto';

// ===== 1. Input Validation and Sanitization =====
console.log('=== Input Validation and Sanitization ===\n');

// Validate filenames to prevent directory traversal
function validateFilename(filename: string): string {
  // Check for directory traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename: directory traversal detected');
  }
  
  // Allow only safe characters
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    throw new Error('Invalid filename: contains unsafe characters');
  }
  
  // Limit length
  if (filename.length > 255) {
    throw new Error('Invalid filename: too long');
  }
  
  return filename;
}

// Validate and sanitize user input
async function safeFileOperation(userFilename: string) {
  console.log(`Processing user input: "${userFilename}"`);
  
  try {
    const safeFilename = validateFilename(userFilename);
    console.log(`✓ Validated filename: "${safeFilename}"`);
    
    // Safe to use validated filename
    await $`touch /tmp/${safeFilename}`;
    await $`ls -la /tmp/${safeFilename}`;
    await $`rm /tmp/${safeFilename}`;
  } catch (error: any) {
    console.log(`✗ Rejected unsafe input: ${error.message}`);
  }
}

// Test with various inputs
const testInputs = [
  'safe-file.txt',          // Valid
  'file with spaces.txt',   // Invalid: spaces
  '../../../etc/passwd',    // Invalid: directory traversal
  'file;rm -rf /',         // Invalid: command injection attempt
  'file$(whoami).txt',     // Invalid: command substitution
  'a'.repeat(300)          // Invalid: too long
];

for (const input of testInputs) {
  await safeFileOperation(input);
  console.log('');
}

// ===== 2. Safe Command Construction =====
console.log('\n=== Safe Command Construction ===\n');

// NEVER use string concatenation with user input
async function demonstrateCommandInjection() {
  const maliciousInput = 'test.txt; rm -rf /tmp/important';
  
  console.log('❌ DANGEROUS - String concatenation:');
  console.log(`Would execute: cat ${maliciousInput}`);
  console.log('This would run: cat test.txt; rm -rf /tmp/important\n');
  
  console.log('✅ SAFE - Template literals with automatic escaping:');
  await $`echo "Filename:" ${maliciousInput}`;
  console.log('The semicolon and command are treated as literal text\n');
}

await demonstrateCommandInjection();

// Safe command builder for complex scenarios
class SecureCommandBuilder {
  private command: string;
  private args: string[] = [];
  private allowedCommands = ['ls', 'cat', 'grep', 'echo', 'find'];
  
  constructor(command: string) {
    if (!this.allowedCommands.includes(command)) {
      throw new Error(`Command '${command}' is not allowed`);
    }
    this.command = command;
  }
  
  addArg(arg: string): this {
    // Validate each argument
    if (arg.includes('\0')) {
      throw new Error('Null byte injection detected');
    }
    this.args.push(arg);
    return this;
  }
  
  async execute() {
    // Use array form for maximum safety
    return $`${[this.command, ...this.args]}`;
  }
}

// Example usage
console.log('Using SecureCommandBuilder:');
try {
  const builder = new SecureCommandBuilder('ls')
    .addArg('-la')
    .addArg('/tmp');
  await builder.execute();
} catch (error: any) {
  console.log(`Command rejected: ${error.message}`);
}

// ===== 3. Credential Management =====
console.log('\n=== Secure Credential Management ===\n');

// NEVER hardcode credentials
async function demonstrateCredentialSecurity() {
  console.log('❌ NEVER DO THIS:');
  console.log('const password = "secretpassword123";');
  console.log('await $`mysql -u root -p${password}`;\n');
  
  console.log('✅ SAFE APPROACHES:\n');
  
  // Approach 1: Environment variables
  console.log('1. Using environment variables:');
  if (process.env.DB_PASSWORD) {
    const $db = $.env({ MYSQL_PWD: process.env.DB_PASSWORD });
    console.log('Password loaded from environment variable');
    // await $db`mysql -u root`; // MYSQL_PWD is used automatically
  }
  
  // Approach 2: Secure file with restricted permissions
  console.log('\n2. Using secure credential file:');
  const credFile = '/tmp/.credentials';
  await $`touch ${credFile}`;
  await $`chmod 600 ${credFile}`; // Only owner can read
  await $`echo "DB_PASSWORD=secure123" > ${credFile}`;
  
  const creds = await $`cat ${credFile}`;
  console.log('Credentials loaded from secure file');
  await $`rm -f ${credFile}`;
  
  // Approach 3: Password prompt (for interactive use)
  console.log('\n3. Interactive password prompt:');
  console.log('const password = await $.password("Enter password: ");');
  console.log('// Password input is hidden from terminal');
}

await demonstrateCredentialSecurity();

// ===== 4. Audit Logging =====
console.log('\n=== Security Audit Logging ===\n');

// Custom audit logger for security monitoring
class SecurityAuditLogger {
  private logFile = '/tmp/security-audit.log';
  
  async log(entry: any) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      user: process.env.USER,
      pid: process.pid,
      command: entry.command,
      cwd: entry.cwd,
      exitCode: entry.exitCode,
      duration: entry.duration,
      // Don't log sensitive environment variables
      env: this.sanitizeEnv(entry.env)
    };
    
    const logLine = JSON.stringify(auditEntry) + '\n';
    await $`echo ${logLine} >> ${this.logFile}`;
  }
  
  private sanitizeEnv(env: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveKeys = ['PASSWORD', 'TOKEN', 'KEY', 'SECRET', 'CREDENTIAL'];
    
    for (const [key, value] of Object.entries(env)) {
      if (sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  async query(options: { user?: string; command?: string; since?: Date }) {
    let query = `cat ${this.logFile}`;
    
    if (options.user) {
      query += ` | grep '"user":"${options.user}"'`;
    }
    
    if (options.command) {
      query += ` | grep '"command":".*${options.command}.*"'`;
    }
    
    const result = await $.raw`${query}`.nothrow();
    return result.stdout.trim().split('\n').filter(line => line)
      .map(line => JSON.parse(line));
  }
}

// Configure audit logging
const auditLogger = new SecurityAuditLogger();
$.configure({ auditLogger });

// Execute some commands that will be logged
console.log('Executing audited commands...');
await $`echo "Test command 1"`.env({ API_TOKEN: 'secret123' });
await $`ls /tmp | head -5`;
await $`echo "Sensitive operation"`.env({ DB_PASSWORD: 'hidden' });

// Query audit log
console.log('\nQuerying audit log:');
const auditEntries = await auditLogger.query({ user: process.env.USER });
console.log(`Found ${auditEntries.length} audit entries`);
for (const entry of auditEntries.slice(-3)) {
  console.log(`- ${entry.timestamp}: ${entry.command} (env: ${JSON.stringify(entry.env)})`);
}

// ===== 5. Principle of Least Privilege =====
console.log('\n\n=== Principle of Least Privilege ===\n');

// Run commands with minimal permissions
async function demonstrateLeastPrivilege() {
  console.log('Running with restricted permissions:\n');
  
  // Example 1: Docker with minimal privileges
  console.log('1. Docker container with restrictions:');
  const $restricted = $.docker({
    image: 'alpine:latest',
    rm: true,
    user: 'nobody',              // Non-root user
    readOnly: true,              // Read-only root filesystem
    tmpfs: ['/tmp'],            // Only /tmp is writable
    cpus: '0.5',                // Limit CPU usage
    memory: '100m',             // Limit memory
    network: 'none'             // No network access
  });
  
  console.log('Container configured with:');
  console.log('- Non-root user (nobody)');
  console.log('- Read-only filesystem');
  console.log('- Limited CPU and memory');
  console.log('- No network access\n');
  
  // Example 2: Dropping capabilities
  console.log('2. Checking file permissions before operations:');
  const checkPermissions = async (file: string) => {
    const stats = await $`stat -c "%a %U %G" ${file} 2>/dev/null || stat -f "%Lp %Su %Sg" ${file}`;
    const [perms, owner, group] = stats.stdout.trim().split(' ');
    console.log(`File: ${file}`);
    console.log(`Permissions: ${perms}, Owner: ${owner}, Group: ${group}`);
    
    // Verify we have appropriate access
    if (owner !== process.env.USER) {
      console.log('⚠️  Warning: Not the file owner');
    }
  };
  
  const testFile = '/tmp/test-permissions.txt';
  await $`touch ${testFile}`;
  await checkPermissions(testFile);
  await $`rm ${testFile}`;
}

await demonstrateLeastPrivilege();

// ===== 6. Secure Communication =====
console.log('\n\n=== Secure Communication ===\n');

// Secure SSH configuration
async function demonstrateSecureSSH() {
  console.log('Secure SSH configuration example:\n');
  
  const $secureSSH = $.ssh({
    host: 'secure-server.example.com',
    username: 'admin',
    port: 22,
    privateKey: `${process.env.HOME}/.ssh/id_ed25519`, // Use Ed25519 keys
    passphrase: process.env.SSH_KEY_PASSPHRASE,       // From environment
    strictHostKeyChecking: true,                       // Verify host keys
    compression: true,                                 // Enable compression
    algorithms: {
      serverHostKey: ['ssh-ed25519', 'ssh-rsa'],     // Preferred algorithms
      cipher: ['aes256-gcm', 'aes128-gcm'],
      hmac: ['hmac-sha2-256', 'hmac-sha2-512']
    }
  });
  
  console.log('SSH configured with:');
  console.log('- Ed25519 key authentication');
  console.log('- Strict host key checking');
  console.log('- Strong cipher suites');
  console.log('- HMAC authentication\n');
  
  // Secure file transfer
  console.log('Secure file transfer example:');
  const transferFile = async (localPath: string, remotePath: string) => {
    // Generate checksum before transfer
    const localChecksum = await $`sha256sum ${localPath} | cut -d' ' -f1`;
    console.log(`Local checksum: ${localChecksum.stdout.trim()}`);
    
    // Transfer file
    // await $secureSSH`scp ${localPath} ${remotePath}`;
    
    // Verify checksum after transfer
    // const remoteChecksum = await $secureSSH`sha256sum ${remotePath} | cut -d' ' -f1`;
    // if (localChecksum.stdout === remoteChecksum.stdout) {
    //   console.log('✓ File transferred successfully and verified');
    // } else {
    //   throw new Error('File corruption detected during transfer!');
    // }
  };
  
  console.log('File transfer would include checksum verification');
}

await demonstrateSecureSSH();

// ===== 7. Secrets Detection =====
console.log('\n\n=== Secrets Detection ===\n');

// Simple secrets detector
class SecretsDetector {
  private patterns = [
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
    { name: 'AWS Secret Key', regex: /[0-9a-zA-Z/+=]{40}/ },
    { name: 'GitHub Token', regex: /ghp_[0-9a-zA-Z]{36}/ },
    { name: 'Generic API Key', regex: /api[_-]?key[_-]?[=:]\s*['"]?[0-9a-zA-Z]{32,}['"]?/i },
    { name: 'Generic Secret', regex: /secret[_-]?[=:]\s*['"]?[0-9a-zA-Z]{16,}['"]?/i },
    { name: 'Password', regex: /password[_-]?[=:]\s*['"]?[^\s'"]{8,}['"]?/i }
  ];
  
  scan(text: string): Array<{type: string, match: string}> {
    const findings = [];
    
    for (const pattern of this.patterns) {
      const matches = text.match(pattern.regex);
      if (matches) {
        findings.push({
          type: pattern.name,
          match: this.redact(matches[0])
        });
      }
    }
    
    return findings;
  }
  
  private redact(secret: string): string {
    if (secret.length <= 8) return '*'.repeat(secret.length);
    return secret.substring(0, 4) + '*'.repeat(secret.length - 8) + secret.substring(secret.length - 4);
  }
}

// Test secrets detection
const detector = new SecretsDetector();
const testCommands = [
  'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  'curl -H "Authorization: ghp_1234567890abcdef1234567890abcdef1234"',
  'mysql -u root -pMySecretPassword123',
  'api_key=abcd1234efgh5678ijkl9012mnop3456'
];

console.log('Scanning commands for secrets:');
for (const cmd of testCommands) {
  console.log(`\nCommand: ${cmd.substring(0, 30)}...`);
  const findings = detector.scan(cmd);
  if (findings.length > 0) {
    console.log('⚠️  Secrets detected:');
    for (const finding of findings) {
      console.log(`  - ${finding.type}: ${finding.match}`);
    }
  } else {
    console.log('✓ No secrets detected');
  }
}

// ===== 8. Sandboxing and Isolation =====
console.log('\n\n=== Sandboxing and Isolation ===\n');

// Create isolated execution environment
class Sandbox {
  private sandboxDir: string;
  
  constructor() {
    this.sandboxDir = `/tmp/sandbox-${crypto.randomBytes(8).toString('hex')}`;
  }
  
  async setup() {
    // Create isolated directory structure
    await $`mkdir -p ${this.sandboxDir}/{bin,tmp,data}`;
    await $`chmod 700 ${this.sandboxDir}`;
    console.log(`Sandbox created at: ${this.sandboxDir}`);
  }
  
  async execute(command: string) {
    // Execute in restricted environment
    const $sandboxed = $.cd(this.sandboxDir)
      .env({
        PATH: `${this.sandboxDir}/bin:/usr/bin:/bin`,
        TMPDIR: `${this.sandboxDir}/tmp`,
        HOME: this.sandboxDir
      });
    
    return $sandboxed`${command}`;
  }
  
  async cleanup() {
    await $`rm -rf ${this.sandboxDir}`;
    console.log('Sandbox cleaned up');
  }
}

// Use sandbox for untrusted operations
const sandbox = new Sandbox();
await sandbox.setup();

try {
  console.log('Executing in sandbox:');
  await sandbox.execute('pwd');
  await sandbox.execute('echo "Isolated execution" > data/test.txt');
  await sandbox.execute('ls -la data/');
} finally {
  await sandbox.cleanup();
}

// ===== Summary =====
console.log('\n\n=== Security Best Practices Summary ===\n');
console.log('1. ✓ Always validate and sanitize user input');
console.log('2. ✓ Use template literals for automatic escaping');
console.log('3. ✓ Never hardcode credentials');
console.log('4. ✓ Implement comprehensive audit logging');
console.log('5. ✓ Follow principle of least privilege');
console.log('6. ✓ Use secure communication protocols');
console.log('7. ✓ Scan for accidentally exposed secrets');
console.log('8. ✓ Isolate untrusted operations in sandboxes');
console.log('\nRemember: Security is not a feature, it\'s a mindset! 🔒');

// Cleanup
await $`rm -f /tmp/security-audit.log`.nothrow();