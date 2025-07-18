/**
 * Message Queue Adapter for Xec Core
 * Provides unified interface for working with various message queue systems
 */

import { EventEmitter } from 'events';

import { createModuleLogger } from '../utils/logger.js';
import { SecretManager, getSecretManager } from '../security/secrets.js';

const logger = createModuleLogger('message-queue-adapter');

export type QueueType = 'rabbitmq' | 'kafka' | 'sqs' | 'redis-pubsub' | 'mqtt' | 'amqp';

export interface QueueConfig {
  type: QueueType;
  connection: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    secretRef?: string; // Reference to connection details in SecretManager
    // RabbitMQ/AMQP specific
    vhost?: string;
    exchange?: string;
    // Kafka specific
    brokers?: string[];
    clientId?: string;
    groupId?: string;
    // AWS SQS specific
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    queueUrl?: string;
    // MQTT specific
    protocol?: 'mqtt' | 'mqtts' | 'ws' | 'wss';
    keepalive?: number;
  };
  options?: {
    autoAck?: boolean;
    prefetchCount?: number;
    retryAttempts?: number;
    retryDelay?: number;
    deadLetterQueue?: string;
    messageTimeout?: number;
  };
  hooks?: {
    beforeConnect?: () => Promise<void>;
    afterConnect?: () => Promise<void>;
    beforeSend?: (message: Message) => Promise<Message>;
    afterSend?: (message: Message, result: any) => Promise<void>;
    beforeReceive?: () => Promise<void>;
    afterReceive?: (message: Message) => Promise<void>;
    onError?: (error: Error) => Promise<void>;
  };
}

export interface Message<T = any> {
  id?: string;
  data: T;
  headers?: Record<string, any>;
  timestamp?: Date;
  correlationId?: string;
  replyTo?: string;
  expiration?: number;
  priority?: number;
  contentType?: string;
  encoding?: string;
}

export interface QueueOptions {
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: Record<string, any>;
}

export interface PublishOptions {
  persistent?: boolean;
  mandatory?: boolean;
  immediate?: boolean;
  expiration?: number;
  priority?: number;
  headers?: Record<string, any>;
}

export interface ConsumeOptions {
  noAck?: boolean;
  exclusive?: boolean;
  priority?: number;
  arguments?: Record<string, any>;
}

export type MessageHandler<T = any> = (message: Message<T>) => Promise<void> | void;

export abstract class MessageQueueAdapter extends EventEmitter {
  protected config: QueueConfig;
  protected connected: boolean = false;
  protected secretManager: SecretManager;
  protected consumers: Map<string, { handler: MessageHandler; options: ConsumeOptions }> = new Map();

  constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.secretManager = getSecretManager();
  }

  /**
   * Connect to message queue
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from message queue
   */
  abstract disconnect(): Promise<void>;

  /**
   * Create/declare a queue
   */
  abstract createQueue(queueName: string, options?: QueueOptions): Promise<void>;

  /**
   * Delete a queue
   */
  abstract deleteQueue(queueName: string): Promise<void>;

  /**
   * Send message to queue
   */
  abstract sendToQueue<T = any>(queueName: string, message: Message<T>, options?: PublishOptions): Promise<void>;

  /**
   * Publish message to exchange/topic
   */
  abstract publish<T = any>(exchange: string, routingKey: string, message: Message<T>, options?: PublishOptions): Promise<void>;

  /**
   * Subscribe to queue
   */
  abstract subscribe<T = any>(queueName: string, handler: MessageHandler<T>, options?: ConsumeOptions): Promise<void>;

  /**
   * Unsubscribe from queue
   */
  abstract unsubscribe(queueName: string): Promise<void>;

  /**
   * Acknowledge message
   */
  abstract ack(message: Message): Promise<void>;

  /**
   * Reject message (negative acknowledgment)
   */
  abstract nack(message: Message, requeue?: boolean): Promise<void>;

  /**
   * Get queue size/depth
   */
  abstract getQueueSize(queueName: string): Promise<number>;

  /**
   * Purge queue (remove all messages)
   */
  abstract purgeQueue(queueName: string): Promise<void>;

  /**
   * Get connection configuration with secrets resolved
   */
  protected async getConnectionConfig(): Promise<QueueConfig['connection']> {
    const { connection } = this.config;
    let config = { ...connection };

    // Resolve secrets if needed
    if (connection.secretRef) {
      const secret = await this.secretManager.get(connection.secretRef);
      if (typeof secret === 'object' && secret !== null) {
        config = { ...config, ...(secret as QueueConfig['connection']) };
      }
    }

    return config;
  }

  /**
   * Execute with hooks
   */
  protected async executeWithHooks<T>(
    operation: () => Promise<T>,
    beforeHook?: () => Promise<void>,
    afterHook?: (result: T) => Promise<void>
  ): Promise<T> {
    try {
      if (beforeHook) {
        await beforeHook();
      }

      const result = await operation();

      if (afterHook) {
        await afterHook(result);
      }

      return result;
    } catch (error: any) {
      if (this.config.hooks?.onError) {
        await this.config.hooks.onError(error);
      }
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get queue type
   */
  getType(): QueueType {
    return this.config.type;
  }

  /**
   * Create a message
   */
  createMessage<T = any>(data: T, options?: Partial<Message<T>>): Message<T> {
    return {
      id: options?.id || this.generateMessageId(),
      data,
      headers: options?.headers || {},
      timestamp: options?.timestamp || new Date(),
      correlationId: options?.correlationId,
      replyTo: options?.replyTo,
      expiration: options?.expiration,
      priority: options?.priority,
      contentType: options?.contentType || 'application/json',
      encoding: options?.encoding || 'utf-8'
    };
  }

  /**
   * Generate message ID
   */
  protected generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * RabbitMQ Adapter
 */
export class RabbitMQAdapter extends MessageQueueAdapter {
  private channel: any;

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      if (this.config.hooks?.beforeConnect) {
        await this.config.hooks.beforeConnect();
      }

      const config = await this.getConnectionConfig();
      const url = `amqp://${config.username}:${config.password}@${config.host}:${config.port || 5672}/${config.vhost || ''}`;
      
      logger.info(`Connecting to RabbitMQ at ${config.host}:${config.port || 5672}`);
      this.connected = true;

      if (this.config.hooks?.afterConnect) {
        await this.config.hooks.afterConnect();
      }

      this.emit('connected');
    } catch (error: any) {
      logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      logger.info('Disconnecting from RabbitMQ');
      this.connected = false;
      this.emit('disconnected');
    } catch (error: any) {
      logger.error('Failed to disconnect from RabbitMQ', error);
      throw error;
    }
  }

  async createQueue(queueName: string, options?: QueueOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Creating queue: ${queueName}`, options);
    // Mock implementation
  }

  async deleteQueue(queueName: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Deleting queue: ${queueName}`);
    // Mock implementation
  }

  async sendToQueue<T = any>(queueName: string, message: Message<T>, options?: PublishOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    await this.executeWithHooks(
      async () => {
        logger.debug(`Sending message to queue: ${queueName}`, { messageId: message.id });
        // Mock implementation
        return undefined as any;
      },
      async () => {
        if (this.config.hooks?.beforeSend) {
          await this.config.hooks.beforeSend(message);
        }
      },
      async () => {
        if (this.config.hooks?.afterSend) {
          await this.config.hooks.afterSend(message, undefined);
        }
      }
    );
  }

  async publish<T = any>(exchange: string, routingKey: string, message: Message<T>, options?: PublishOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    await this.executeWithHooks(
      async () => {
        logger.debug(`Publishing message to exchange: ${exchange}, routing key: ${routingKey}`, { messageId: message.id });
        // Mock implementation
        return undefined as any;
      },
      async () => {
        if (this.config.hooks?.beforeSend) {
          await this.config.hooks.beforeSend(message);
        }
      },
      async () => {
        if (this.config.hooks?.afterSend) {
          await this.config.hooks.afterSend(message, undefined);
        }
      }
    );
  }

  async subscribe<T = any>(queueName: string, handler: MessageHandler<T>, options?: ConsumeOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    this.consumers.set(queueName, { handler, options: options || {} });
    logger.debug(`Subscribed to queue: ${queueName}`);
    // Mock implementation
  }

  async unsubscribe(queueName: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    this.consumers.delete(queueName);
    logger.debug(`Unsubscribed from queue: ${queueName}`);
    // Mock implementation
  }

  async ack(message: Message): Promise<void> {
    logger.debug(`Acknowledging message: ${message.id}`);
    // Mock implementation
  }

  async nack(message: Message, requeue: boolean = true): Promise<void> {
    logger.debug(`Rejecting message: ${message.id}, requeue: ${requeue}`);
    // Mock implementation
  }

  async getQueueSize(queueName: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Getting queue size: ${queueName}`);
    return 0; // Mock implementation
  }

  async purgeQueue(queueName: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Purging queue: ${queueName}`);
    // Mock implementation
  }
}

/**
 * Kafka Adapter
 */
export class KafkaAdapter extends MessageQueueAdapter {
  private producer: any;
  private consumer: any;

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const config = await this.getConnectionConfig();
      const brokers = config.brokers || [`${config.host}:${config.port || 9092}`];
      
      logger.info(`Connecting to Kafka brokers: ${brokers.join(', ')}`);
      this.connected = true;
      this.emit('connected');
    } catch (error: any) {
      logger.error('Failed to connect to Kafka', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    logger.info('Disconnecting from Kafka');
    this.connected = false;
    this.emit('disconnected');
  }

  async createQueue(topic: string, options?: QueueOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Creating topic: ${topic}`, options);
    // Mock implementation
  }

  async deleteQueue(topic: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Deleting topic: ${topic}`);
    // Mock implementation
  }

  async sendToQueue<T = any>(topic: string, message: Message<T>, options?: PublishOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Sending message to topic: ${topic}`, { messageId: message.id });
    // Mock implementation
  }

  async publish<T = any>(topic: string, key: string, message: Message<T>, options?: PublishOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Publishing message to topic: ${topic}, key: ${key}`, { messageId: message.id });
    // Mock implementation
  }

  async subscribe<T = any>(topic: string, handler: MessageHandler<T>, options?: ConsumeOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    this.consumers.set(topic, { handler, options: options || {} });
    logger.debug(`Subscribed to topic: ${topic}`);
    // Mock implementation
  }

  async unsubscribe(topic: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    this.consumers.delete(topic);
    logger.debug(`Unsubscribed from topic: ${topic}`);
    // Mock implementation
  }

  async ack(message: Message): Promise<void> {
    logger.debug(`Committing offset for message: ${message.id}`);
    // Mock implementation
  }

  async nack(message: Message, requeue: boolean = true): Promise<void> {
    logger.debug(`Not committing offset for message: ${message.id}`);
    // Mock implementation
  }

  async getQueueSize(topic: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Getting lag for topic: ${topic}`);
    return 0; // Mock implementation
  }

  async purgeQueue(topic: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Cannot purge Kafka topic: ${topic}`);
    throw new Error('Kafka does not support purging topics');
  }
}

/**
 * AWS SQS Adapter
 */
export class SQSAdapter extends MessageQueueAdapter {
  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      const config = await this.getConnectionConfig();
      logger.info(`Connecting to AWS SQS in region: ${config.region}`);
      this.connected = true;
      this.emit('connected');
    } catch (error: any) {
      logger.error('Failed to connect to SQS', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    logger.info('Disconnecting from SQS');
    this.connected = false;
    this.emit('disconnected');
  }

  async createQueue(queueName: string, options?: QueueOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Creating SQS queue: ${queueName}`, options);
    // Mock implementation
  }

  async deleteQueue(queueName: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Deleting SQS queue: ${queueName}`);
    // Mock implementation
  }

  async sendToQueue<T = any>(queueUrl: string, message: Message<T>, options?: PublishOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Sending message to SQS queue: ${queueUrl}`, { messageId: message.id });
    // Mock implementation
  }

  async publish<T = any>(topicArn: string, subject: string, message: Message<T>, options?: PublishOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Publishing message to SNS topic: ${topicArn}`, { messageId: message.id });
    // Mock implementation
  }

  async subscribe<T = any>(queueUrl: string, handler: MessageHandler<T>, options?: ConsumeOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    this.consumers.set(queueUrl, { handler, options: options || {} });
    logger.debug(`Polling SQS queue: ${queueUrl}`);
    // Mock implementation
  }

  async unsubscribe(queueUrl: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    this.consumers.delete(queueUrl);
    logger.debug(`Stopped polling SQS queue: ${queueUrl}`);
    // Mock implementation
  }

  async ack(message: Message): Promise<void> {
    logger.debug(`Deleting message from SQS: ${message.id}`);
    // Mock implementation
  }

  async nack(message: Message, requeue: boolean = true): Promise<void> {
    if (!requeue) {
      logger.debug(`Deleting message from SQS: ${message.id}`);
    } else {
      logger.debug(`Making message visible again in SQS: ${message.id}`);
    }
    // Mock implementation
  }

  async getQueueSize(queueUrl: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Getting message count for SQS queue: ${queueUrl}`);
    return 0; // Mock implementation
  }

  async purgeQueue(queueUrl: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to message queue');
    }

    logger.debug(`Purging SQS queue: ${queueUrl}`);
    // Mock implementation
  }
}

/**
 * Message queue adapter factory
 */
export function createMessageQueueAdapter(config: QueueConfig): MessageQueueAdapter {
  switch (config.type) {
    case 'rabbitmq':
    case 'amqp':
      return new RabbitMQAdapter(config);
    case 'kafka':
      return new KafkaAdapter(config);
    case 'sqs':
      return new SQSAdapter(config);
    default:
      throw new Error(`Unsupported queue type: ${config.type}`);
  }
}

/**
 * Queue manager for managing multiple queues
 */
export class QueueManager {
  private adapters: Map<string, MessageQueueAdapter> = new Map();

  /**
   * Get or create queue adapter
   */
  async getAdapter(name: string, config: QueueConfig): Promise<MessageQueueAdapter> {
    let adapter = this.adapters.get(name);

    if (!adapter) {
      adapter = createMessageQueueAdapter(config);
      await adapter.connect();
      this.adapters.set(name, adapter);
    }

    return adapter;
  }

  /**
   * Close adapter
   */
  async closeAdapter(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(name);
    }
  }

  /**
   * Close all adapters
   */
  async closeAll(): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      await adapter.disconnect();
    }
    this.adapters.clear();
  }
}

// Global queue manager
export const queueManager = new QueueManager();