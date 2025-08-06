import { readFile } from 'node:fs/promises';

/**
 * SSH Key validation utilities
 */
export class SSHKeyValidator {
  /**
   * Validate SSH private key format and structure
   */
  static async validatePrivateKey(key: string | Buffer): Promise<{
    isValid: boolean;
    keyType?: string;
    issues: string[];
  }> {
    const issues: string[] = [];
    let keyContent: string;
    
    if (Buffer.isBuffer(key)) {
      keyContent = key.toString('utf8');
    } else {
      keyContent = key;
    }
    
    // Check for empty key
    if (!keyContent.trim()) {
      issues.push('SSH key is empty');
      return { isValid: false, issues };
    }
    
    // Normalize line endings and trim whitespace
    const normalizedKey = keyContent.trim().replace(/\r\n/g, '\n');
    
    // Check for OpenSSH format first
    const opensshRegex = /-----BEGIN OPENSSH PRIVATE KEY-----\s*\n[\s\S]+?\n-----END OPENSSH PRIVATE KEY-----/;
    if (opensshRegex.test(normalizedKey)) {
      // OpenSSH format keys are valid
      return { isValid: true, keyType: 'OPENSSH', issues };
    }
    
    // Check for valid PEM format - more flexible regex that handles multiline
    const pemRegex = /-----BEGIN (.+) PRIVATE KEY-----\s*\n[\s\S]+?\n-----END \1 PRIVATE KEY-----/;
    const match = normalizedKey.match(pemRegex);
    
    if (!match) {
      issues.push('Invalid SSH private key format. Expected PEM or OpenSSH format');
      return { isValid: false, issues };
    }
    
    const keyType = match[1];
    if (!keyType) {
      issues.push('Invalid key format: missing key type');
      return { isValid: false, issues };
    }
    
    // Validate key type
    const validKeyTypes = ['RSA', 'DSA', 'EC', 'ECDSA', 'ED25519'];
    if (!validKeyTypes.includes(keyType.toUpperCase())) {
      issues.push(`Unsupported key type: ${keyType}`);
    }
    
    // Check for encrypted keys (basic check)
    if (normalizedKey.includes('ENCRYPTED')) {
      issues.push('Encrypted private keys require a passphrase');
    }
    
    // Check key content structure
    const keyLines = normalizedKey.split('\n');
    const contentLines = keyLines.slice(1, -1).filter(line => line.trim());
    
    if (contentLines.length < 3) {
      issues.push('Private key content appears to be too short');
    }
    
    // Check for Base64 encoding - remove header lines that might have encryption info
    const base64Lines = contentLines.filter(line => !line.includes(':'));
    const keyData = base64Lines.join('');
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    if (keyData && !base64Regex.test(keyData)) {
      issues.push('Private key content is not properly Base64 encoded');
    }
    
    return {
      isValid: issues.length === 0,
      keyType: keyType ? keyType.toUpperCase() : undefined,
      issues
    };
  }
  
  /**
   * Validate SSH public key format
   */
  static validatePublicKey(key: string): {
    isValid: boolean;
    keyType?: string;
    issues: string[];
  } {
    const issues: string[] = [];
    
    if (!key.trim()) {
      issues.push('SSH public key is empty');
      return { isValid: false, issues };
    }
    
    // Normalize whitespace in the key
    const normalizedKey = key.trim().replace(/\s+/g, ' ');
    
    // Check for OpenSSH public key format
    const opensshPubKeyRegex = /^(ssh-rsa|ssh-dss|ecdsa-sha2-nistp\d+|ssh-ed25519)\s+[A-Za-z0-9+/]+={0,2}(\s+.+)?$/;
    const match = normalizedKey.match(opensshPubKeyRegex);
    
    if (!match) {
      issues.push('Invalid SSH public key format. Expected OpenSSH format');
      return { isValid: false, issues };
    }
    
    const keyType = match[1];
    if (!keyType) {
      issues.push('Invalid SSH public key: missing key type');
      return { isValid: false, issues };
    }
    
    // Map SSH key type to algorithm
    const keyTypeMap: Record<string, string> = {
      'ssh-rsa': 'RSA',
      'ssh-dss': 'DSA',
      'ecdsa-sha2-nistp256': 'ECDSA',
      'ecdsa-sha2-nistp384': 'ECDSA',
      'ecdsa-sha2-nistp521': 'ECDSA',
      'ssh-ed25519': 'ED25519'
    };
    
    return {
      isValid: true,
      keyType: keyTypeMap[keyType] || keyType.toUpperCase(),
      issues
    };
  }
  
  /**
   * Load and validate SSH key from file
   */
  static async validateKeyFile(keyPath: string, passphrase?: string): Promise<{
    isValid: boolean;
    keyType?: string;
    issues: string[];
  }> {
    try {
      const keyContent = await readFile(keyPath, 'utf8');
      const result = await this.validatePrivateKey(keyContent);
      
      // Additional file-specific checks
      if (passphrase && !keyContent.includes('ENCRYPTED')) {
        result.issues.push('Passphrase provided but key does not appear to be encrypted');
      }
      
      return result;
    } catch (error) {
      return {
        isValid: false,
        issues: [`Failed to read key file: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
  
  /**
   * Check if key has proper permissions (Unix-like systems only)
   */
  static async checkKeyFilePermissions(keyPath: string): Promise<{
    isSecure: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      const { stat } = await import('node:fs/promises');
      const stats = await stat(keyPath);
      
      // Check if file is readable only by owner (600 or 400)
      const mode = stats.mode & 0o777;
      if (mode !== 0o600 && mode !== 0o400) {
        issues.push(`SSH key file has insecure permissions: ${mode.toString(8)}. Should be 600 or 400`);
      }
      
      return {
        isSecure: issues.length === 0,
        issues
      };
    } catch (error) {
      return {
        isSecure: false,
        issues: [`Failed to check file permissions: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
  
  /**
   * Validate SSH connection options
   */
  static validateSSHOptions(options: {
    host?: string;
    username?: string;
    port?: number;
    privateKey?: string | Buffer;
    password?: string;
  }): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Required fields
    if (!options.host) {
      issues.push('SSH host is required');
    }
    
    if (!options.username) {
      issues.push('SSH username is required');
    }
    
    // Port validation
    if (options.port !== undefined) {
      if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
        issues.push('SSH port must be a valid port number (1-65535)');
      }
    }
    
    // Authentication method validation
    if (!options.privateKey && !options.password) {
      issues.push('Either privateKey or password must be provided for authentication');
    }
    
    if (options.privateKey && options.password) {
      issues.push('Both privateKey and password provided. Only one authentication method should be used');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}