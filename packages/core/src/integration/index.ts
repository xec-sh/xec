/**
 * Integration Framework for Xec Core
 * Provides unified interfaces for external system integration
 */

// External API Client
export {
  APIResponse,
  RequestConfig,
  APIClientConfig,
  createAPIClient,
  ExternalAPIClient,
  RequestInterceptor,
  ResponseInterceptor,
  createCommonAPIClient
} from './external-api-client.js';

// Webhook Processor
export {
  WebhookEvent,
  WebhookConfig,
  WebhookFilter,
  WebhookHandler,
  WebhookProcessor,
  WebhookValidator,
  WebhookTransformer,
  getWebhookProcessor,
  createIncomingWebhook,
  createOutgoingWebhook
} from './webhook-processor.js';

// Message Queue Adapter
export {
  Message,
  QueueType,
  SQSAdapter,
  QueueConfig,
  QueueOptions,
  KafkaAdapter,
  QueueManager,
  queueManager,
  PublishOptions,
  ConsumeOptions,
  MessageHandler,
  RabbitMQAdapter,
  MessageQueueAdapter,
  createMessageQueueAdapter
} from './message-queue-adapter.js';

// Database Connector
export {
  QueryResult,
  poolManager,
  DatabaseType,
  DatabaseConfig,
  MySQLConnector,
  RedisConnector,
  MongoDBConnector,
  DatabaseConnector,
  PostgresConnector,
  ConnectionPoolManager,
  createDatabaseConnector,
  Transaction as DatabaseTransaction // Renamed to avoid conflict
} from './database-connector.js';

// Integration utilities
import { task } from '../dsl/task.js';
import { ExternalAPIClient } from './external-api-client.js';
import { poolManager, DatabaseConfig } from './database-connector.js';
import { QueueConfig, queueManager } from './message-queue-adapter.js';
import { WebhookConfig, getWebhookProcessor } from './webhook-processor.js';

/**
 * Integration-related tasks
 */
export const integrationTasks = {
  // API tasks
  callAPI: task('call-api')
    .description('Call external API')
    .vars({
      url: { required: true },
      method: { default: 'GET' },
      headers: { type: 'object', default: {} },
      data: { type: 'object' },
      auth: { type: 'object' }
    })
    .handler(async (context) => {
      const { url, method, headers, data, auth } = context.vars;
      
      const client = new ExternalAPIClient({
        baseUrl: '',
        headers,
        auth
      });

      const response = await client.request({
        url,
        method,
        data
      });

      context.logger.info(`API call successful: ${method} ${url} - Status: ${response.status}`);
      return response.data;
    })
    .build(),

  // Database tasks
  queryDatabase: task('query-database')
    .description('Execute database query')
    .vars({
      connection: { required: true },
      query: { required: true },
      params: { type: 'array', default: [] }
    })
    .handler(async (context) => {
      const { connection, query, params } = context.vars;
      
      const db = await poolManager.getPool(connection.name || 'default', connection);
      const result = await db.query(query, params);

      context.logger.info(`Query executed: ${result.rowCount} rows returned`);
      return result.rows;
    })
    .build(),

  // Message queue tasks
  sendMessage: task('send-message')
    .description('Send message to queue')
    .vars({
      queue: { required: true },
      message: { required: true },
      options: { type: 'object', default: {} }
    })
    .handler(async (context) => {
      const { queue, message, options } = context.vars;
      
      const adapter = await queueManager.getAdapter(queue.name || 'default', queue);
      
      const msg = adapter.createMessage(message, options);
      await adapter.sendToQueue(queue.queueName, msg);

      context.logger.info(`Message sent to queue: ${queue.queueName}`);
      return { messageId: msg.id };
    })
    .build(),

  // Webhook tasks
  sendWebhook: task('send-webhook')
    .description('Send outgoing webhook')
    .vars({
      webhookId: { required: true },
      data: { required: true },
      metadata: { type: 'object' }
    })
    .handler(async (context) => {
      const { webhookId, data, metadata } = context.vars;
      
      const processor = getWebhookProcessor();
      const event = await processor.sendOutgoing(webhookId, data, metadata);

      context.logger.info(`Webhook sent: ${webhookId} - Status: ${event.status}`);
      return event;
    })
    .build(),

  registerWebhook: task('register-webhook')
    .description('Register webhook configuration')
    .vars({
      config: { required: true }
    })
    .handler(async (context) => {
      const { config } = context.vars;
      
      const processor = getWebhookProcessor();
      processor.registerWebhook(config);

      context.logger.info(`Webhook registered: ${config.name} (${config.id})`);
      return { registered: config.id };
    })
    .build()
};

/**
 * Integration patterns
 */
export const integrationPatterns = {
  /**
   * Polling pattern - periodically check external system
   */
  createPoller: (config: {
    name: string;
    interval: number;
    source: () => Promise<any>;
    handler: (data: any) => Promise<void>;
  }) => {
    let intervalId: NodeJS.Timeout | null = null;
    
    return {
      start: () => {
        if (intervalId) return;
        
        intervalId = setInterval(async () => {
          try {
            const data = await config.source();
            await config.handler(data);
          } catch (error) {
            console.error(`Polling error for ${config.name}:`, error);
          }
        }, config.interval);
      },
      
      stop: () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };
  },

  /**
   * Circuit breaker pattern for external calls
   */
  createCircuitBreaker: (config: {
    failureThreshold: number;
    resetTimeout: number;
    timeout?: number;
  }) => {
    let failures = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';
    let nextAttempt = Date.now();

    return async <T>(operation: () => Promise<T>): Promise<T> => {
      if (state === 'open') {
        if (Date.now() < nextAttempt) {
          throw new Error('Circuit breaker is open');
        }
        state = 'half-open';
      }

      try {
        const result = await operation();
        if (state === 'half-open') {
          state = 'closed';
          failures = 0;
        }
        return result;
      } catch (error) {
        failures++;
        if (failures >= config.failureThreshold) {
          state = 'open';
          nextAttempt = Date.now() + config.resetTimeout;
        }
        throw error;
      }
    };
  },

  /**
   * Retry pattern with backoff
   */
  createRetryHandler: (config: {
    maxAttempts: number;
    backoff: 'fixed' | 'exponential';
    delay: number;
    shouldRetry?: (error: Error) => boolean;
  }) => async <T>(operation: () => Promise<T>): Promise<T> => {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
          return await operation();
        } catch (error: any) {
          lastError = error;
          
          if (config.shouldRetry && !config.shouldRetry(error)) {
            throw error;
          }

          if (attempt < config.maxAttempts) {
            const delay = config.backoff === 'exponential'
              ? config.delay * Math.pow(2, attempt - 1)
              : config.delay;
            
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError || new Error('Retry failed');
    }
};

/**
 * Initialize integration subsystem
 */
export async function initializeIntegration(options?: {
  webhooks?: WebhookConfig[];
  databases?: Array<{ name: string; config: DatabaseConfig }>;
  queues?: Array<{ name: string; config: QueueConfig }>;
}): Promise<void> {
  // Register webhooks
  if (options?.webhooks) {
    const processor = getWebhookProcessor();
    for (const webhook of options.webhooks) {
      processor.registerWebhook(webhook);
    }
  }

  // Initialize database connections
  if (options?.databases) {
    for (const { name, config } of options.databases) {
      await poolManager.getPool(name, config);
    }
  }

  // Initialize message queues
  if (options?.queues) {
    for (const { name, config } of options.queues) {
      await queueManager.getAdapter(name, config);
    }
  }
}

/**
 * Cleanup integration resources
 */
export async function cleanupIntegration(): Promise<void> {
  await poolManager.closeAll();
  await queueManager.closeAll();
}