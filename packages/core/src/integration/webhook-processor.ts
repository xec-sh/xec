/**
 * Webhook Processor for Xec Core
 * Handles incoming and outgoing webhooks with security and reliability
 */

import { createHmac } from 'crypto';
import { EventEmitter } from 'events';

import { createModuleLogger } from '../utils/logger.js';
import { SecretManager, getSecretManager } from '../security/secrets.js';
import { createAPIClient, ExternalAPIClient } from './external-api-client.js';

const logger = createModuleLogger('webhook-processor');

export interface WebhookConfig {
  id: string;
  name: string;
  description?: string;
  type: 'incoming' | 'outgoing';
  url?: string; // For outgoing webhooks
  path?: string; // For incoming webhooks
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'hmac' | 'api-key' | 'oauth2';
    credentials?: {
      username?: string;
      password?: string;
      token?: string;
      secret?: string;
      apiKey?: string;
      headerName?: string;
    };
    secretRef?: string; // Reference to secret in SecretManager
  };
  retry?: {
    enabled: boolean;
    maxAttempts: number;
    backoff: 'fixed' | 'exponential';
    delay: number;
  };
  timeout?: number;
  filters?: WebhookFilter[];
  transformers?: WebhookTransformer[];
  validators?: WebhookValidator[];
  enabled: boolean;
}

export interface WebhookFilter {
  type: 'header' | 'body' | 'query';
  field: string;
  operator: 'equals' | 'contains' | 'regex' | 'exists';
  value?: any;
}

export interface WebhookTransformer {
  type: 'jmespath' | 'jsonpath' | 'template' | 'custom';
  expression?: string;
  template?: string;
  transformer?: (data: any) => any;
}

export interface WebhookValidator {
  type: 'schema' | 'signature' | 'custom';
  schema?: any; // JSON Schema
  algorithm?: string; // For signature validation
  validator?: (data: any, headers: Record<string, string>) => boolean;
}

export interface WebhookEvent {
  id: string;
  webhookId: string;
  type: 'incoming' | 'outgoing';
  timestamp: Date;
  url?: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  query?: Record<string, string>;
  status?: number;
  response?: any;
  error?: string;
  attempts?: number;
  metadata?: Record<string, any>;
}

export interface WebhookHandler {
  (event: WebhookEvent): Promise<any> | any;
}

export class WebhookProcessor extends EventEmitter {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private handlers: Map<string, WebhookHandler[]> = new Map();
  private secretManager: SecretManager;
  private apiClient: ExternalAPIClient | null = null;
  private processingEvents: Map<string, WebhookEvent> = new Map();

  constructor() {
    super();
    this.secretManager = getSecretManager();
  }

  /**
   * Register a webhook configuration
   */
  registerWebhook(config: WebhookConfig): void {
    if (this.webhooks.has(config.id)) {
      throw new Error(`Webhook '${config.id}' already registered`);
    }

    this.webhooks.set(config.id, config);
    logger.info(`Registered webhook: ${config.name} (${config.id})`);
    this.emit('webhook:registered', config);
  }

  /**
   * Unregister a webhook
   */
  unregisterWebhook(webhookId: string): boolean {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return false;

    this.webhooks.delete(webhookId);
    this.handlers.delete(webhookId);
    
    logger.info(`Unregistered webhook: ${webhook.name} (${webhookId})`);
    this.emit('webhook:unregistered', webhook);
    return true;
  }

  /**
   * Get webhook configuration
   */
  getWebhook(webhookId: string): WebhookConfig | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * List all webhooks
   */
  listWebhooks(type?: 'incoming' | 'outgoing'): WebhookConfig[] {
    const webhooks = Array.from(this.webhooks.values());
    if (type) {
      return webhooks.filter(w => w.type === type);
    }
    return webhooks;
  }

  /**
   * Enable/disable webhook
   */
  setWebhookEnabled(webhookId: string, enabled: boolean): void {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error(`Webhook '${webhookId}' not found`);
    }

    webhook.enabled = enabled;
    logger.info(`Webhook ${webhookId} ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('webhook:updated', webhook);
  }

  /**
   * Add handler for incoming webhook
   */
  addHandler(webhookId: string, handler: WebhookHandler): void {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || webhook.type !== 'incoming') {
      throw new Error(`Incoming webhook '${webhookId}' not found`);
    }

    const handlers = this.handlers.get(webhookId) || [];
    handlers.push(handler);
    this.handlers.set(webhookId, handlers);

    logger.debug(`Added handler for webhook ${webhookId}, total handlers: ${handlers.length}`);
  }

  /**
   * Remove handler for incoming webhook
   */
  removeHandler(webhookId: string, handler: WebhookHandler): boolean {
    const handlers = this.handlers.get(webhookId);
    if (!handlers) return false;

    const index = handlers.indexOf(handler);
    if (index === -1) return false;

    handlers.splice(index, 1);
    if (handlers.length === 0) {
      this.handlers.delete(webhookId);
    }

    return true;
  }

  /**
   * Process incoming webhook
   */
  async processIncoming(
    webhookId: string,
    request: {
      method: string;
      headers: Record<string, string>;
      body: any;
      query?: Record<string, string>;
      url?: string;
    }
  ): Promise<any> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || webhook.type !== 'incoming') {
      throw new Error(`Incoming webhook '${webhookId}' not found`);
    }

    if (!webhook.enabled) {
      throw new Error(`Webhook '${webhookId}' is disabled`);
    }

    const event: WebhookEvent = {
      id: this.generateEventId(),
      webhookId,
      type: 'incoming',
      timestamp: new Date(),
      method: request.method,
      headers: request.headers,
      body: request.body,
      query: request.query,
      url: request.url
    };

    try {
      // Apply filters
      if (!this.applyFilters(webhook, event)) {
        logger.debug(`Webhook ${webhookId} filtered out`);
        return { filtered: true };
      }

      // Validate request
      if (!await this.validateRequest(webhook, event)) {
        throw new Error('Webhook validation failed');
      }

      // Transform data
      const transformedData = await this.transformData(webhook, event.body);
      event.body = transformedData;

      // Store event for processing
      this.processingEvents.set(event.id, event);

      // Execute handlers
      const handlers = this.handlers.get(webhookId) || [];
      const results = [];

      for (const handler of handlers) {
        try {
          const result = await handler(event);
          results.push(result);
        } catch (error: any) {
          logger.error(`Handler error for webhook ${webhookId}:`, error);
          event.error = error.message;
        }
      }

      event.response = results.length === 1 ? results[0] : results;
      event.status = 200;

      this.emit('webhook:processed', event);
      return event.response;

    } catch (error: any) {
      event.error = error.message;
      event.status = 500;
      
      logger.error(`Failed to process incoming webhook ${webhookId}:`, error);
      this.emit('webhook:error', event);
      throw error;

    } finally {
      this.processingEvents.delete(event.id);
    }
  }

  /**
   * Send outgoing webhook
   */
  async sendOutgoing(webhookId: string, data: any, metadata?: Record<string, any>): Promise<WebhookEvent> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || webhook.type !== 'outgoing') {
      throw new Error(`Outgoing webhook '${webhookId}' not found`);
    }

    if (!webhook.enabled) {
      throw new Error(`Webhook '${webhookId}' is disabled`);
    }

    if (!webhook.url) {
      throw new Error(`Webhook '${webhookId}' has no URL configured`);
    }

    const event: WebhookEvent = {
      id: this.generateEventId(),
      webhookId,
      type: 'outgoing',
      timestamp: new Date(),
      url: webhook.url,
      method: webhook.method || 'POST',
      headers: { ...webhook.headers },
      body: data,
      metadata,
      attempts: 0
    };

    try {
      // Transform data
      const transformedData = await this.transformData(webhook, data);
      event.body = transformedData;

      // Apply authentication
      const authHeaders = await this.getAuthHeaders(webhook);
      event.headers = { ...event.headers, ...authHeaders };

      // Send webhook with retry logic
      const response = await this.sendWithRetry(webhook, event);
      
      event.status = response.status;
      event.response = response.data;

      this.emit('webhook:sent', event);
      return event;

    } catch (error: any) {
      event.error = error.message;
      event.status = error.response?.status || 0;
      
      logger.error(`Failed to send outgoing webhook ${webhookId}:`, error);
      this.emit('webhook:error', event);
      throw error;
    }
  }

  /**
   * Send webhook with retry logic
   */
  private async sendWithRetry(webhook: WebhookConfig, event: WebhookEvent): Promise<any> {
    const retry = webhook.retry;
    const maxAttempts = retry?.enabled ? retry.maxAttempts : 1;
    const backoff = retry?.backoff || 'fixed';
    const baseDelay = retry?.delay || 1000;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        event.attempts = attempt;

        // Create API client if needed
        if (!this.apiClient) {
          this.apiClient = createAPIClient({
            baseUrl: '',
            timeout: webhook.timeout || 30000
          });
        }

        const response = await this.apiClient.request({
          url: webhook.url!,
          method: webhook.method || 'POST',
          headers: event.headers,
          data: event.body,
          json: true
        });

        return response;

      } catch (error: any) {
        lastError = error;
        logger.warn(`Webhook attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxAttempts) {
          const delay = backoff === 'exponential' 
            ? baseDelay * Math.pow(2, attempt - 1)
            : baseDelay;
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Webhook send failed');
  }

  /**
   * Apply filters to webhook event
   */
  private applyFilters(webhook: WebhookConfig, event: WebhookEvent): boolean {
    if (!webhook.filters || webhook.filters.length === 0) {
      return true;
    }

    for (const filter of webhook.filters) {
      if (!this.evaluateFilter(filter, event)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single filter
   */
  private evaluateFilter(filter: WebhookFilter, event: WebhookEvent): boolean {
    let value: any;

    switch (filter.type) {
      case 'header':
        value = event.headers[filter.field];
        break;
      case 'body':
        value = this.getNestedValue(event.body, filter.field);
        break;
      case 'query':
        value = event.query?.[filter.field];
        break;
      default:
        return false;
    }

    switch (filter.operator) {
      case 'equals':
        return value === filter.value;
      case 'contains':
        return String(value).includes(String(filter.value));
      case 'regex':
        return new RegExp(filter.value).test(String(value));
      case 'exists':
        return value !== undefined && value !== null;
      default:
        return false;
    }
  }

  /**
   * Validate webhook request
   */
  private async validateRequest(webhook: WebhookConfig, event: WebhookEvent): Promise<boolean> {
    if (!webhook.validators || webhook.validators.length === 0) {
      return true;
    }

    for (const validator of webhook.validators) {
      if (!await this.runValidator(validator, webhook, event)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Run a single validator
   */
  private async runValidator(
    validator: WebhookValidator,
    webhook: WebhookConfig,
    event: WebhookEvent
  ): Promise<boolean> {
    switch (validator.type) {
      case 'signature':
        return this.validateSignature(validator, webhook, event);
      
      case 'schema':
        // Would validate against JSON schema
        return true;
      
      case 'custom':
        if (validator.validator) {
          return validator.validator(event.body, event.headers);
        }
        return true;
      
      default:
        return true;
    }
  }

  /**
   * Validate webhook signature
   */
  private async validateSignature(
    validator: WebhookValidator,
    webhook: WebhookConfig,
    event: WebhookEvent
  ): Promise<boolean> {
    const algorithm = validator.algorithm || 'sha256';
    const signatureHeader = event.headers['x-webhook-signature'] || 
                           event.headers['x-hub-signature-256'] ||
                           event.headers['x-signature'];

    if (!signatureHeader) {
      logger.warn(`No signature header found for webhook ${webhook.id}`);
      return false;
    }

    // Get secret
    const secret = await this.getWebhookSecret(webhook);
    if (!secret) {
      logger.warn(`No secret configured for webhook ${webhook.id}`);
      return false;
    }

    // Calculate expected signature
    const payload = typeof event.body === 'string' ? event.body : JSON.stringify(event.body);
    const expectedSignature = createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');

    // Compare signatures
    const actualSignature = signatureHeader.replace(/^sha\d+=/, '');
    const valid = actualSignature === expectedSignature;

    if (!valid) {
      logger.warn(`Invalid signature for webhook ${webhook.id}`);
    }

    return valid;
  }

  /**
   * Transform webhook data
   */
  private async transformData(webhook: WebhookConfig, data: any): Promise<any> {
    if (!webhook.transformers || webhook.transformers.length === 0) {
      return data;
    }

    let transformedData = data;

    for (const transformer of webhook.transformers) {
      transformedData = await this.runTransformer(transformer, transformedData);
    }

    return transformedData;
  }

  /**
   * Run a single transformer
   */
  private async runTransformer(transformer: WebhookTransformer, data: any): Promise<any> {
    switch (transformer.type) {
      case 'template':
        // Would use template engine
        return data;
      
      case 'jmespath':
      case 'jsonpath':
        // Would use respective libraries
        return data;
      
      case 'custom':
        if (transformer.transformer) {
          return transformer.transformer(data);
        }
        return data;
      
      default:
        return data;
    }
  }

  /**
   * Get authentication headers
   */
  private async getAuthHeaders(webhook: WebhookConfig): Promise<Record<string, string>> {
    if (!webhook.auth || webhook.auth.type === 'none') {
      return {};
    }

    const auth = webhook.auth;
    const credentials = await this.getAuthCredentials(webhook);

    switch (auth.type) {
      case 'basic':
        if (credentials.username && credentials.password) {
          const authString = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
          return { 'Authorization': `Basic ${authString}` };
        }
        break;

      case 'bearer':
        if (credentials.token) {
          return { 'Authorization': `Bearer ${credentials.token}` };
        }
        break;

      case 'api-key':
        if (credentials.apiKey) {
          const headerName = credentials.headerName || 'X-API-Key';
          return { [headerName]: credentials.apiKey };
        }
        break;

      case 'hmac':
        // HMAC signature will be added when sending
        return {};
    }

    return {};
  }

  /**
   * Get authentication credentials
   */
  private async getAuthCredentials(webhook: WebhookConfig): Promise<any> {
    if (!webhook.auth) return {};

    let credentials = webhook.auth.credentials || {};

    if (webhook.auth.secretRef) {
      const secret = await this.secretManager.get(webhook.auth.secretRef);
      if (typeof secret === 'object' && secret !== null) {
        credentials = { ...credentials, ...(secret as Record<string, any>) };
      }
    }

    return credentials;
  }

  /**
   * Get webhook secret
   */
  private async getWebhookSecret(webhook: WebhookConfig): Promise<string | null> {
    const credentials = await this.getAuthCredentials(webhook);
    return credentials.secret || null;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): WebhookEvent | undefined {
    return this.processingEvents.get(eventId);
  }

  /**
   * Export webhook configuration
   */
  exportConfiguration(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Import webhook configuration
   */
  importConfiguration(configs: WebhookConfig[]): void {
    for (const config of configs) {
      this.registerWebhook(config);
    }
  }
}

// Global webhook processor
let globalWebhookProcessor: WebhookProcessor | null = null;

export function getWebhookProcessor(): WebhookProcessor {
  if (!globalWebhookProcessor) {
    globalWebhookProcessor = new WebhookProcessor();
  }
  return globalWebhookProcessor;
}

// Helper functions
export function createIncomingWebhook(
  id: string,
  name: string,
  path: string,
  options?: Partial<WebhookConfig>
): WebhookConfig {
  return {
    id,
    name,
    type: 'incoming',
    path,
    method: 'POST',
    enabled: true,
    ...options
  };
}

export function createOutgoingWebhook(
  id: string,
  name: string,
  url: string,
  options?: Partial<WebhookConfig>
): WebhookConfig {
  return {
    id,
    name,
    type: 'outgoing',
    url,
    method: 'POST',
    enabled: true,
    retry: {
      enabled: true,
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000
    },
    ...options
  };
}