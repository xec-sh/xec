/**
 * Security module for Xec Core
 * Provides comprehensive security features including encryption, secrets management, and audit logging
 */

// Audit Logging
export * from './audit.js';
// Secrets Management
export * from './secrets.js';

// Encryption
export * from './encryption.js';
export { SecretManager, getSecretManager } from './secrets.js';

export { encryption, EncryptionService } from './encryption.js';
export { AuditLogger, getAuditLogger, AuditEventType } from './audit.js';

import { task } from '../dsl/task.js';
// Security utilities
import { encryption } from './encryption.js';
import { getSecretManager } from './secrets.js';
import { getAuditLogger, AuditEventType } from './audit.js';

/**
 * Security-related tasks
 */
export const securityTasks = {
  // Secret management tasks
  setSecret: task('set-secret')
    .description('Store a secret securely')
    .vars({
      name: { required: true },
      value: { required: true },
      metadata: { type: 'object', default: {} }
    })
    .handler(async (context) => {
      const { name, value, metadata } = context.vars;
      const secrets = getSecretManager();

      await secrets.set(name, value, metadata);

      // Audit log
      await getAuditLogger().logSuccess(
        AuditEventType.SECRET_CREATED,
        context.taskId,
        `secret:${name}`,
        'create',
        { metadata }
      );

      context.logger.info(`Secret '${name}' stored securely`);
      return { stored: name };
    })
    .build(),

  getSecret: task('get-secret')
    .description('Retrieve a secret')
    .vars({
      name: { required: true }
    })
    .handler(async (context) => {
      const { name } = context.vars;
      const secrets = getSecretManager();

      const value = await secrets.get(name);

      // Audit log
      await getAuditLogger().logSuccess(
        AuditEventType.SECRET_READ,
        context.taskId,
        `secret:${name}`,
        'read'
      );

      if (value === undefined) {
        throw new Error(`Secret '${name}' not found`);
      }

      // Don't log the actual value for security
      context.logger.info(`Secret '${name}' retrieved`);
      return { name, value };
    })
    .build(),

  deleteSecret: task('delete-secret')
    .description('Delete a secret')
    .vars({
      name: { required: true }
    })
    .handler(async (context) => {
      const { name } = context.vars;
      const secrets = getSecretManager();

      const deleted = await secrets.delete(name);

      // Audit log
      await getAuditLogger().logSuccess(
        AuditEventType.SECRET_DELETED,
        context.taskId,
        `secret:${name}`,
        'delete',
        { deleted }
      );

      context.logger.info(`Secret '${name}' deleted: ${deleted}`);
      return { deleted };
    })
    .build(),

  listSecrets: task('list-secrets')
    .description('List all secret names')
    .handler(async (context) => {
      const secrets = getSecretManager();
      const names = await secrets.list();

      context.logger.info(`Found ${names.length} secrets`);
      return { secrets: names, count: names.length };
    })
    .build(),

  // Encryption tasks
  encrypt: task('encrypt')
    .description('Encrypt data')
    .vars({
      data: { required: true },
      password: { required: true }
    })
    .handler(async (context) => {
      const { data, password } = context.vars;
      const encrypted = await encryption.encrypt(data, password);

      return { encrypted: JSON.stringify(encrypted) };
    })
    .build(),

  decrypt: task('decrypt')
    .description('Decrypt data')
    .vars({
      encrypted: { required: true },
      password: { required: true }
    })
    .handler(async (context) => {
      const { encrypted, password } = context.vars;
      const encryptedData = JSON.parse(encrypted);
      const decrypted = await encryption.decrypt(encryptedData, password);

      return { decrypted };
    })
    .build(),

  generatePassword: task('generate-password')
    .description('Generate secure password')
    .vars({
      length: { type: 'number', default: 32 }
    })
    .handler(async (context) => {
      const { length } = context.vars;
      const password = encryption.generatePassword(length);

      return { password, length };
    })
    .build(),

  generateToken: task('generate-token')
    .description('Generate secure token')
    .vars({
      length: { type: 'number', default: 32 }
    })
    .handler(async (context) => {
      const { length } = context.vars;
      const token = encryption.generateToken(length);

      return { token, length: token.length };
    })
    .build(),

  // Audit tasks
  verifyAuditLog: task('verify-audit-log')
    .description('Verify audit log integrity')
    .handler(async (context) => {
      const audit = getAuditLogger();
      await audit.initialize();

      const result = await audit.verifyIntegrity();

      if (result.valid) {
        context.logger.info('Audit log integrity verified successfully');
      } else {
        context.logger.error('Audit log integrity check failed');
        for (const error of result.errors) {
          context.logger.error(`  - ${error}`);
        }
      }

      return result;
    })
    .build(),

  exportAuditLog: task('export-audit-log')
    .description('Export audit logs')
    .vars({
      format: { default: 'json', choices: ['json', 'csv'] },
      startDate: { type: 'string', required: false },
      endDate: { type: 'string', required: false }
    })
    .handler(async (context) => {
      const { format, startDate, endDate } = context.vars;
      const audit = getAuditLogger();
      await audit.initialize();

      const criteria: any = {};
      if (startDate) criteria.startDate = new Date(startDate);
      if (endDate) criteria.endDate = new Date(endDate);

      const events = await audit.search(criteria);
      const exported = format === 'json'
        ? JSON.stringify(events, null, 2)
        : await audit.export('csv');

      context.logger.info(`Exported ${events.length} audit events`);
      return {
        format,
        count: events.length,
        data: exported
      };
    })
    .build()
};

/**
 * Initialize security subsystem
 */
export async function initializeSecurity(options?: {
  encryptionKey?: string;
  auditPath?: string;
  secretsPath?: string;
}): Promise<void> {
  // Initialize secrets manager
  const secrets = getSecretManager({
    encryptionKey: options?.encryptionKey,
    storePath: options?.secretsPath
  });
  await secrets.initialize();

  // Initialize audit logger
  const audit = getAuditLogger({
    logPath: options?.auditPath
  });
  await audit.initialize();

  // Log initialization
  await audit.logSuccess(
    AuditEventType.SYSTEM_MODULE_LOADED,
    'system',
    'security',
    'initialize',
    { module: 'security' }
  );
}

/**
 * Security middleware for recipes
 */
export function securityMiddleware(options?: {
  requireAuth?: boolean;
  auditExecution?: boolean;
}): (context: any, next: () => Promise<void>) => Promise<void> {
  return async (context, next) => {
    const audit = getAuditLogger();

    // Log recipe start
    if (options?.auditExecution) {
      await audit.logSuccess(
        AuditEventType.RECIPE_STARTED,
        context.recipeId || 'system',
        `recipe:${context.recipe?.name || 'unknown'}`,
        'execute',
        { vars: Object.keys(context.vars || {}) }
      );
    }

    try {
      // Execute recipe
      await next();

      // Log recipe completion
      if (options?.auditExecution) {
        await audit.logSuccess(
          AuditEventType.RECIPE_COMPLETED,
          context.recipeId || 'system',
          `recipe:${context.recipe?.name || 'unknown'}`,
          'complete'
        );
      }
    } catch (error) {
      // Log recipe failure
      if (options?.auditExecution) {
        await audit.logFailure(
          AuditEventType.RECIPE_FAILED,
          context.recipeId || 'system',
          `recipe:${context.recipe?.name || 'unknown'}`,
          'execute',
          { error: (error as Error).message }
        );
      }
      throw error;
    }
  };
}