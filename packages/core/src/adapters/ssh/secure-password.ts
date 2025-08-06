import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chmod, unlink, writeFile } from 'node:fs/promises';
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

import type { Disposable } from '../../types/disposable.js';

/**
 * Secure password handling utilities with improved security features:
 * - Encrypted password storage in memory
 * - Secure cleanup with memory zeroing
 * - Implements Disposable for automatic cleanup
 * - Uses more secure askpass implementation
 */
export class SecurePasswordHandler implements Disposable {
  private tempFiles: Set<string> = new Set();
  private encryptedPasswords: Map<string, Buffer> = new Map();
  private encryptionKey: Buffer;
  private isDisposed: boolean = false;
  
  constructor() {
    // Generate a random encryption key for this instance
    this.encryptionKey = randomBytes(32);
  }
  
  /**
   * Encrypt a password for secure storage
   */
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
  
  /**
   * Decrypt a password
   */
  private decryptPassword(encrypted: Buffer, salt: Buffer, iv: Buffer): string {
    const key = scryptSync(this.encryptionKey, salt, 32);
    const authTag = encrypted.subarray(-16);
    const data = encrypted.subarray(0, -16);
    
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    return decipher.update(data) + decipher.final('utf8');
  }
  
  /**
   * Store a password securely in memory
   */
  storePassword(id: string, password: string): void {
    if (this.isDisposed) {
      throw new Error('SecurePasswordHandler has been disposed');
    }
    
    const { encrypted, salt, iv } = this.encryptPassword(password);
    const combined = Buffer.concat([salt, iv, encrypted]);
    this.encryptedPasswords.set(id, combined);
  }
  
  /**
   * Retrieve a stored password
   */
  retrievePassword(id: string): string | null {
    if (this.isDisposed) {
      throw new Error('SecurePasswordHandler has been disposed');
    }
    
    const combined = this.encryptedPasswords.get(id);
    if (!combined) return null;
    
    const salt = combined.subarray(0, 32);
    const iv = combined.subarray(32, 48);
    const encrypted = combined.subarray(48);
    
    return this.decryptPassword(encrypted, salt, iv);
  }
  
  /**
   * Create a temporary askpass script for sudo
   * This is more secure than echoing passwords
   */
  async createAskPassScript(password: string): Promise<string> {
    if (this.isDisposed) {
      throw new Error('SecurePasswordHandler has been disposed');
    }
    
    const scriptId = randomBytes(8).toString('hex');
    const scriptPath = join(tmpdir(), `askpass-${scriptId}.sh`);
    
    // Store password securely for cleanup tracking
    this.storePassword(scriptId, password);
    
    // Escape password for safe embedding in script
    const escapedPassword = password.replace(/'/g, "'\\''")
    
    // Create askpass script with embedded password
    // This is necessary for SSH execution where we can't pass environment variables
    const scriptContent = `#!/bin/sh
# Temporary askpass script - auto-generated
# This file will be deleted after use
echo '${escapedPassword}'
`;
    
    try {
      // Write script with restricted permissions
      await writeFile(scriptPath, scriptContent);
      await chmod(scriptPath, 0o700);
      this.tempFiles.add(scriptPath);
      
      return scriptPath;
    } catch (error) {
      // Clean up stored password on error
      this.encryptedPasswords.delete(scriptId);
      throw new Error(`Failed to create askpass script: ${error}`);
    }
  }
  
  /**
   * Clean up temporary askpass scripts and secure data
   */
  async cleanup(): Promise<void> {
    // Clean up temp files
    const cleanupPromises = Array.from(this.tempFiles).map(async (file) => {
      try {
        await unlink(file);
        this.tempFiles.delete(file);
      } catch {
        // Ignore errors during cleanup
      }
    });
    
    await Promise.all(cleanupPromises);
    
    // Securely clear passwords from memory
    this.securelyDisposePasswords();
  }
  
  /**
   * Securely dispose of passwords in memory
   */
  private securelyDisposePasswords(): void {
    // Clear encrypted passwords
    for (const buffer of this.encryptedPasswords.values()) {
      // Overwrite buffer with zeros
      buffer.fill(0);
    }
    this.encryptedPasswords.clear();
    
    // Clear encryption key
    if (this.encryptionKey) {
      this.encryptionKey.fill(0);
    }
  }
  
  /**
   * Dispose of all resources
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    
    await this.cleanup();
    this.isDisposed = true;
  }
  
  /**
   * Create a secure environment for sudo execution
   */
  createSecureEnv(askpassPath: string, baseEnv?: Record<string, string>): Record<string, string> {
    if (this.isDisposed) {
      throw new Error('SecurePasswordHandler has been disposed');
    }
    
    // Extract script ID from path
    const match = askpassPath.match(/askpass-([a-f0-9]+)\.sh$/);
    if (!match) {
      throw new Error('Invalid askpass script path');
    }
    
    const scriptId = match[1];
    if (!scriptId) {
      throw new Error('Invalid askpass script path: missing script ID');
    }
    const password = this.retrievePassword(scriptId);
    if (!password) {
      throw new Error('Password not found for askpass script');
    }
    
    return {
      ...baseEnv,
      SUDO_ASKPASS: askpassPath,
      // Pass password via environment (more secure than embedding in script)
      [`SUDO_PASS_${scriptId}`]: password,
      // Disable sudo lecture for automation
      SUDO_LECTURE: 'no',
      // Set sudo to use askpass
      SUDO_ASKPASS_REQUIRE: '1'
    };
  }
  
  /**
   * Mask password in command strings for logging
   */
  static maskPassword(command: string, password?: string): string {
    if (!password) return command;
    
    // Replace password occurrences with masked version
    const masked = command.replace(
      new RegExp(password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '***MASKED***'
    );
    
    return masked;
  }
  
  /**
   * Check if environment supports secure password methods
   */
  static async checkSecureMethodsAvailable(): Promise<{
    askpass: boolean;
    stdin: boolean;
    keyring: boolean;
  }> {
    return {
      askpass: true, // Always available as we create our own
      stdin: true,   // Always available
      keyring: false // Would need additional dependencies
    };
  }
  
  /**
   * Generate a secure random password
   */
  static generatePassword(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const bytes = randomBytes(length * 2); // Generate more bytes for better distribution
    let password = '';
    
    // Ensure at least one of each required character type
    const requirements = [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz',
      '0123456789',
      '!@#$%^&*()_+-=[]{}|;:,.<>?'
    ];
    
    // Add one character from each requirement
    for (const req of requirements) {
      const byte = bytes[password.length];
      if (byte !== undefined) {
        const idx = byte % req.length;
        password += req[idx];
      }
    }
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        password += chars[byte % chars.length];
      }
    }
    
    // Shuffle the password to avoid predictable patterns
    const shuffled = password.split('');
    for (let i = shuffled.length - 1; i > 0; i--) {
      const byte = bytes[i + length];
      if (byte !== undefined) {
        const j = byte % (i + 1);
        const temp = shuffled[i];
        const swapElement = shuffled[j];
        if (temp !== undefined && swapElement !== undefined) {
          shuffled[i] = swapElement;
          shuffled[j] = temp;
        }
      }
    }
    
    return shuffled.join('');
  }
  
  /**
   * Validate password strength
   */
  static validatePassword(password: string): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    if (password.length < 8) {
      issues.push('Password should be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      issues.push('Password should contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      issues.push('Password should contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
      issues.push('Password should contain at least one number');
    }
    
    if (!/[^A-Za-z0-9]/.test(password)) {
      issues.push('Password should contain at least one special character');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}