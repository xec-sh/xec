import { join } from 'node:path';
import { hostname } from 'node:os';
import { promises as fs } from 'node:fs';
import { randomUUID , createHash } from 'node:crypto';

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  hash?: string;
  adapter?: string;
  host?: string;
  error?: string;
}

export interface AuditLoggerConfig {
  enabled: boolean;
  logPath?: string;
  includeHash?: boolean;
  maxFileSize?: number; // bytes
  rotateFiles?: boolean;
  customFormatter?: (entry: AuditEntry) => string;
}

export class AuditLogger {
  private static instance: AuditLogger | null = null;
  private config: Required<AuditLoggerConfig>;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(config: AuditLoggerConfig) {
    this.config = {
      enabled: config.enabled,
      logPath: config.logPath || join(process.cwd(), '.xec', 'audit.log'),
      includeHash: config.includeHash ?? true,
      maxFileSize: config.maxFileSize ?? 100 * 1024 * 1024, // 100MB
      rotateFiles: config.rotateFiles ?? true,
      customFormatter: config.customFormatter || (entry => JSON.stringify(entry))
    };
  }

  static getInstance(config?: AuditLoggerConfig): AuditLogger {
    if (!AuditLogger.instance && config) {
      AuditLogger.instance = new AuditLogger(config);
    }
    if (!AuditLogger.instance) {
      // Default configuration
      AuditLogger.instance = new AuditLogger({ enabled: false });
    }
    return AuditLogger.instance;
  }

  static configure(config: AuditLoggerConfig): void {
    AuditLogger.instance = new AuditLogger(config);
  }

  async log(
    action: string,
    resource: string,
    result: 'success' | 'failure',
    metadata?: Record<string, any> & { adapter?: string; error?: string }
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      user: this.getCurrentUser(),
      action,
      resource,
      result,
      metadata: metadata ? this.sanitizeMetadata(metadata) : undefined,
      adapter: metadata?.adapter,
      host: hostname(),
      error: metadata?.error
    };

    if (this.config.includeHash) {
      entry.hash = this.computeHash(entry);
    }

    // Queue the write operation to prevent concurrent writes
    this.writeQueue = this.writeQueue
      .then(() => this.writeEntry(entry))
      .catch(err => {
        // Log to stderr but don't throw - audit logging should not break the app
        console.error('Audit logging error:', err);
      });

    await this.writeQueue;
  }

  // Convenience methods for common operations
  async logCredentialAccess(
    resource: string,
    result: 'success' | 'failure',
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log('credential_access', resource, result, {
      ...metadata,
      sensitiveOperation: true
    });
  }

  async logFileOperation(
    operation: 'read' | 'write' | 'delete' | 'create',
    path: string,
    result: 'success' | 'failure',
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log(`file_${operation}`, path, result, metadata);
  }

  async logRemoteConnection(
    connectionType: 'ssh' | 'docker' | 'kubernetes',
    target: string,
    result: 'success' | 'failure',
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log(`remote_${connectionType}_connect`, target, result, {
      ...metadata,
      connectionType
    });
  }

  async logCommandExecution(
    command: string,
    adapter: string,
    result: 'success' | 'failure',
    metadata?: Record<string, any>
  ): Promise<void> {
    // Mask sensitive data in command
    const sanitizedCommand = this.sanitizeCommand(command);
    
    await this.log('command_execute', sanitizedCommand, result, {
      ...metadata,
      adapter,
      originalLength: command.length
    });
  }

  private async writeEntry(entry: AuditEntry): Promise<void> {
    const logDir = join(this.config.logPath, '..');
    
    // Ensure log directory exists
    await fs.mkdir(logDir, { recursive: true });

    // Check if rotation is needed
    if (this.config.rotateFiles) {
      await this.rotateIfNeeded();
    }

    // Format and write entry
    const line = this.config.customFormatter(entry) + '\n';
    await fs.appendFile(this.config.logPath, line, 'utf8');
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.config.logPath);
      
      if (stats.size >= this.config.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = `${this.config.logPath}.${timestamp}`;
        
        await fs.rename(this.config.logPath, rotatedPath);
        
        // Create new empty log file
        await fs.writeFile(this.config.logPath, '', 'utf8');
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  }

  private getCurrentUser(): string {
    return process.env['USER'] || process.env['USERNAME'] || 'unknown';
  }

  private computeHash(entry: Omit<AuditEntry, 'hash'>): string {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      user: entry.user,
      action: entry.action,
      resource: entry.resource,
      result: entry.result
    });
    
    return createHash('sha256').update(data).digest('hex');
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      // Skip sensitive keys
      if (key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('key')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private sanitizeCommand(command: string): string {
    // Reuse patterns from sensitive data masking
    const patterns = [
      /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|authentication[_-]?token|private[_-]?key|secret[_-]?key)(\s*[:=]\s*["']?)([a-zA-Z0-9_\-/.]+)(["']?)/gi,
      /(Authorization:\s*)(Bearer\s+[a-zA-Z0-9_\-/.]+|Basic\s+[a-zA-Z0-9+/]+=*)/gi,
      /\b(password|passwd|pwd)(\s*[:=]\s*["']?)([^\s"']+)(["']?)/gi,
    ];
    
    let sanitized = command;
    
    for (const pattern of patterns) {
      sanitized = sanitized.replace(pattern, (match, ...groups) => {
        if (groups.length >= 3) {
          return groups[0] + groups[1] + '[REDACTED]' + (groups[3] || '');
        }
        return '[REDACTED]';
      });
    }
    
    return sanitized;
  }

  // Get current configuration (for testing)
  getConfig(): Readonly<Required<AuditLoggerConfig>> {
    return { ...this.config };
  }
}

// Export singleton getter
export function getAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  return AuditLogger.getInstance(config);
}