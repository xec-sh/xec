/**
 * Audit logging for Xec Core
 * Provides tamper-proof audit trail for security and compliance
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

import { hash } from './encryption.js';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  actor: string;
  resource: string;
  action: string;
  result: 'success' | 'failure';
  details?: Record<string, any>;
  metadata?: AuditMetadata;
  hash?: string;
  previousHash?: string;
}

export interface AuditMetadata {
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  correlationId?: string;
  source?: string;
}

export enum AuditEventType {
  // Authentication & Authorization
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_FAILED = 'auth.failed',
  AUTH_TOKEN_CREATED = 'auth.token.created',
  AUTH_TOKEN_REVOKED = 'auth.token.revoked',

  // Secret Management
  SECRET_CREATED = 'secret.created',
  SECRET_READ = 'secret.read',
  SECRET_UPDATED = 'secret.updated',
  SECRET_DELETED = 'secret.deleted',

  // Recipe Execution
  RECIPE_STARTED = 'recipe.started',
  RECIPE_COMPLETED = 'recipe.completed',
  RECIPE_FAILED = 'recipe.failed',

  // Task Execution
  TASK_STARTED = 'task.started',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',

  // System Operations
  SYSTEM_CONFIG_CHANGED = 'system.config.changed',
  SYSTEM_MODULE_LOADED = 'system.module.loaded',
  SYSTEM_ERROR = 'system.error',

  // Data Access
  DATA_READ = 'data.read',
  DATA_WRITE = 'data.write',
  DATA_DELETE = 'data.delete'
}

export interface AuditLogOptions {
  logPath?: string;
  rotateSize?: number; // Size in MB
  retentionDays?: number;
  tamperProtection?: boolean;
}

export class AuditLogger {
  private logPath: string;
  private rotateSize: number;
  private retentionDays: number;
  private tamperProtection: boolean;
  private currentLogFile: string;
  private previousHash: string | null = null;
  private eventCount = 0;

  constructor(options: AuditLogOptions = {}) {
    this.logPath = options.logPath || path.join(os.homedir(), '.xec', 'audit');
    this.rotateSize = (options.rotateSize || 100) * 1024 * 1024; // Convert MB to bytes
    this.retentionDays = options.retentionDays || 90;
    this.tamperProtection = options.tamperProtection !== false;
    this.currentLogFile = this.getLogFileName();
  }

  /**
   * Initialize audit logger
   */
  async initialize(): Promise<void> {
    // Create audit directory
    await fs.mkdir(this.logPath, { recursive: true, mode: 0o700 });

    // Load previous hash if exists
    if (this.tamperProtection) {
      await this.loadPreviousHash();
    }

    // Clean old logs
    await this.cleanOldLogs();
  }

  /**
   * Log audit event
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp' | 'hash' | 'previousHash'>): Promise<string> {
    const auditEvent: AuditEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date()
    };

    // Add tamper protection hash
    if (this.tamperProtection) {
      auditEvent.previousHash = this.previousHash || 'GENESIS';
      auditEvent.hash = this.calculateHash(auditEvent);
      this.previousHash = auditEvent.hash;
    }

    // Write to log file
    await this.writeEvent(auditEvent);

    // Check if rotation needed
    await this.checkRotation();

    return auditEvent.id;
  }

  /**
   * Quick logging methods for common events
   */
  async logSuccess(
    eventType: AuditEventType,
    actor: string,
    resource: string,
    action: string,
    details?: Record<string, any>
  ): Promise<string> {
    return this.log({
      eventType,
      actor,
      resource,
      action,
      result: 'success',
      details
    });
  }

  async logFailure(
    eventType: AuditEventType,
    actor: string,
    resource: string,
    action: string,
    details?: Record<string, any>
  ): Promise<string> {
    return this.log({
      eventType,
      actor,
      resource,
      action,
      result: 'failure',
      details
    });
  }

  /**
   * Search audit logs
   */
  async search(criteria: {
    startDate?: Date;
    endDate?: Date;
    eventType?: AuditEventType;
    actor?: string;
    resource?: string;
    result?: 'success' | 'failure';
  }): Promise<AuditEvent[]> {
    const results: AuditEvent[] = [];
    const files = await this.getLogFiles();

    for (const file of files) {
      const content = await fs.readFile(path.join(this.logPath, file), 'utf8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line) continue;

        try {
          const event = JSON.parse(line) as AuditEvent;

          // Apply filters
          if (criteria.startDate && new Date(event.timestamp) < criteria.startDate) continue;
          if (criteria.endDate && new Date(event.timestamp) > criteria.endDate) continue;
          if (criteria.eventType && event.eventType !== criteria.eventType) continue;
          if (criteria.actor && event.actor !== criteria.actor) continue;
          if (criteria.resource && event.resource !== criteria.resource) continue;
          if (criteria.result && event.result !== criteria.result) continue;

          results.push(event);
        } catch {
          // Skip malformed lines
        }
      }
    }

    return results.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Verify log integrity
   */
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.tamperProtection) {
      return { valid: true, errors: ['Tamper protection not enabled'] };
    }

    const errors: string[] = [];
    const files = await this.getLogFiles();
    let previousHash: string | null = null;

    for (const file of files) {
      const content = await fs.readFile(path.join(this.logPath, file), 'utf8');
      const lines = content.trim().split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;

        try {
          const line = lines[i];
          if (!line) continue;
          const event = JSON.parse(line) as AuditEvent;

          // Verify hash chain
          if (event.previousHash !== (previousHash || 'GENESIS')) {
            errors.push(
              `Hash chain broken at ${file}:${i + 1} - ` +
              `expected previousHash: ${previousHash || 'GENESIS'}, ` +
              `got: ${event.previousHash}`
            );
          }

          // Verify event hash
          const calculatedHash = this.calculateHash(event);
          if (calculatedHash !== event.hash) {
            errors.push(
              `Invalid hash at ${file}:${i + 1} - ` +
              `expected: ${calculatedHash}, got: ${event.hash}`
            );
          }

          previousHash = event.hash || null;
        } catch (error: any) {
          errors.push(`Failed to parse event at ${file}:${i + 1}: ${error.message}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export audit logs
   */
  async export(format: 'json' | 'csv' = 'json'): Promise<string> {
    const events = await this.search({});

    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    } else {
      // CSV format
      const headers = [
        'ID', 'Timestamp', 'Event Type', 'Actor', 'Resource',
        'Action', 'Result', 'Details'
      ];

      const rows = events.map(e => [
        e.id,
        e.timestamp.toString(),
        e.eventType,
        e.actor,
        e.resource,
        e.action,
        e.result,
        JSON.stringify(e.details || {})
      ]);

      return [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${this.eventCount++}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate hash for tamper protection
   */
  private calculateHash(event: AuditEvent): string {
    const data = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      eventType: event.eventType,
      actor: event.actor,
      resource: event.resource,
      action: event.action,
      result: event.result,
      details: event.details,
      previousHash: event.previousHash
    });

    return hash(data);
  }

  /**
   * Write event to log file
   */
  private async writeEvent(event: AuditEvent): Promise<void> {
    const line = JSON.stringify(event) + '\n';
    await fs.appendFile(this.currentLogFile, line, { mode: 0o600 });
  }

  /**
   * Check if log rotation is needed
   */
  private async checkRotation(): Promise<void> {
    try {
      const stats = await fs.stat(this.currentLogFile);

      if (stats.size >= this.rotateSize) {
        // Rotate log file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`);

        await fs.rename(this.currentLogFile, rotatedFile);
        this.currentLogFile = this.getLogFileName();

        // Reset hash chain for new file
        if (this.tamperProtection) {
          await this.savePreviousHash();
        }
      }
    } catch {
      // File doesn't exist yet, will be created on next write
    }
  }

  /**
   * Get current log file name
   */
  private getLogFileName(): string {
    return path.join(this.logPath, 'audit.log');
  }

  /**
   * Get all log files
   */
  private async getLogFiles(): Promise<string[]> {
    const files = await fs.readdir(this.logPath);
    return files
      .filter(f => f.endsWith('.log'))
      .sort((a, b) => {
        // audit.log should be last (newest)
        if (a === 'audit.log') return 1;
        if (b === 'audit.log') return -1;
        // Sort rotated files chronologically
        return a.localeCompare(b);
      });
  }

  /**
   * Load previous hash from state file
   */
  private async loadPreviousHash(): Promise<void> {
    try {
      const hashFile = path.join(this.logPath, '.hash');
      this.previousHash = await fs.readFile(hashFile, 'utf8');
    } catch {
      // No previous hash
      this.previousHash = null;
    }
  }

  /**
   * Save previous hash to state file
   */
  private async savePreviousHash(): Promise<void> {
    if (this.previousHash) {
      const hashFile = path.join(this.logPath, '.hash');
      await fs.writeFile(hashFile, this.previousHash, { mode: 0o600 });
    }
  }

  /**
   * Clean old log files
   */
  private async cleanOldLogs(): Promise<void> {
    const files = await this.getLogFiles();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    for (const file of files) {
      if (file === 'audit.log') continue; // Don't delete current log

      const filePath = path.join(this.logPath, file);
      const stats = await fs.stat(filePath);

      if (stats.mtime < cutoffDate) {
        await fs.unlink(filePath);
      }
    }
  }
}

// Global audit logger instance
let globalAuditLogger: AuditLogger | null = null;

/**
 * Get global audit logger instance
 */
export function getAuditLogger(options?: AuditLogOptions): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(options);
  }
  return globalAuditLogger;
}

/**
 * Reset global audit logger (for testing)
 */
export function resetAuditLogger(): void {
  globalAuditLogger = null;
}

/**
 * Helper functions for common audit events
 */
export async function auditLog(
  eventType: AuditEventType,
  actor: string,
  resource: string,
  action: string,
  result: 'success' | 'failure',
  details?: Record<string, any>
): Promise<string> {
  const logger = getAuditLogger();
  await logger.initialize();
  return logger.log({ eventType, actor, resource, action, result, details });
}

export async function auditSuccess(
  eventType: AuditEventType,
  actor: string,
  resource: string,
  action: string,
  details?: Record<string, any>
): Promise<string> {
  const logger = getAuditLogger();
  await logger.initialize();
  return logger.logSuccess(eventType, actor, resource, action, details);
}

export async function auditFailure(
  eventType: AuditEventType,
  actor: string,
  resource: string,
  action: string,
  details?: Record<string, any>
): Promise<string> {
  const logger = getAuditLogger();
  await logger.initialize();
  return logger.logFailure(eventType, actor, resource, action, details);
}