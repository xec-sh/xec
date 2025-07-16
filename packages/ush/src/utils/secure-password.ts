import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';

/**
 * Secure password handling utilities
 */
export class SecurePasswordHandler {
  private tempFiles: Set<string> = new Set();
  
  /**
   * Create a temporary askpass script for sudo
   * This is more secure than echoing passwords
   */
  async createAskPassScript(password: string): Promise<string> {
    const scriptPath = join(tmpdir(), `askpass-${randomBytes(8).toString('hex')}.sh`);
    
    const scriptContent = `#!/bin/sh
# Temporary askpass script - auto-generated
# This file will be deleted after use
echo '${password.replace(/'/g, "'\"'\"'")}'
`;
    
    try {
      // Write script with restricted permissions
      await writeFile(scriptPath, scriptContent, { mode: 0o700 });
      this.tempFiles.add(scriptPath);
      
      return scriptPath;
    } catch (error) {
      throw new Error(`Failed to create askpass script: ${error}`);
    }
  }
  
  /**
   * Clean up temporary askpass scripts
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.tempFiles).map(async (file) => {
      try {
        await unlink(file);
        this.tempFiles.delete(file);
      } catch {
        // Ignore errors during cleanup
      }
    });
    
    await Promise.all(cleanupPromises);
  }
  
  /**
   * Create a secure environment for sudo execution
   */
  createSecureEnv(askpassPath: string, baseEnv?: Record<string, string>): Record<string, string> {
    return {
      ...baseEnv,
      SUDO_ASKPASS: askpassPath,
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
    const bytes = randomBytes(length);
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        password += chars[byte % chars.length];
      }
    }
    
    return password;
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