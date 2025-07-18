/**
 * External API Client for Xec Core
 * Provides a flexible HTTP client for integrating with external APIs
 */

import { EventEmitter } from 'events';
import fetch, { Response, RequestInit } from 'node-fetch';

import { createModuleLogger } from '../utils/logger.js';
import { SecretManager, getSecretManager } from '../security/secrets.js';

const logger = createModuleLogger('external-api-client');

export interface APIClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  auth?: {
    type: 'basic' | 'bearer' | 'api-key' | 'oauth2' | 'custom';
    credentials?: {
      username?: string;
      password?: string;
      token?: string;
      apiKey?: string;
      headerName?: string;
    };
    secretRef?: string; // Reference to secret in SecretManager
  };
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  rateLimit?: {
    requests: number;
    window: number; // milliseconds
  };
  interceptors?: {
    request?: RequestInterceptor[];
    response?: ResponseInterceptor[];
  };
  hooks?: {
    beforeRequest?: (config: RequestConfig) => Promise<void>;
    afterResponse?: (response: APIResponse) => Promise<void>;
    onError?: (error: Error) => Promise<void>;
  };
}

export interface RequestConfig extends RequestInit {
  url?: string;
  params?: Record<string, any>;
  data?: any;
  json?: boolean;
  responseType?: 'json' | 'text' | 'blob' | 'stream';
  timeout?: number;
}

export interface APIResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: RequestConfig;
  request?: any;
}

export interface RequestInterceptor {
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
  onRequestError?: (error: Error) => Promise<Error>;
}

export interface ResponseInterceptor {
  onResponse?: (response: APIResponse) => APIResponse | Promise<APIResponse>;
  onResponseError?: (error: Error) => Promise<Error>;
}

export class ExternalAPIClient extends EventEmitter {
  private config: APIClientConfig;
  private rateLimitTokens: number;
  private rateLimitWindow: number;
  private lastRequestTime: number;
  private secretManager: SecretManager;

  constructor(config: APIClientConfig) {
    super();
    this.config = config;
    this.rateLimitTokens = config.rateLimit?.requests || Infinity;
    this.rateLimitWindow = config.rateLimit?.window || 0;
    this.lastRequestTime = Date.now();
    this.secretManager = getSecretManager();
  }

  /**
   * Perform GET request
   */
  async get<T = any>(url: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  /**
   * Perform POST request
   */
  async post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  /**
   * Perform PUT request
   */
  async put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  /**
   * Perform PATCH request
   */
  async patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH', url, data });
  }

  /**
   * Perform DELETE request
   */
  async delete<T = any>(url: string, config?: RequestConfig): Promise<APIResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }

  /**
   * Perform HEAD request
   */
  async head(url: string, config?: RequestConfig): Promise<APIResponse<void>> {
    return this.request<void>({ ...config, method: 'HEAD', url });
  }

  /**
   * Main request method
   */
  async request<T = any>(config: RequestConfig): Promise<APIResponse<T>> {
    // Apply rate limiting
    await this.enforceRateLimit();

    // Build full URL
    const fullUrl = this.buildUrl(config.url || '', config.params);

    // Prepare request config
    let requestConfig: RequestConfig = {
      ...config,
      headers: {
        ...this.config.headers,
        ...config.headers
      }
    };

    // Apply authentication
    requestConfig = await this.applyAuth(requestConfig);

    // Apply request interceptors
    requestConfig = await this.applyRequestInterceptors(requestConfig);

    // Hook: beforeRequest
    if (this.config.hooks?.beforeRequest) {
      await this.config.hooks.beforeRequest(requestConfig);
    }

    // Prepare body
    if (requestConfig.data) {
      if (requestConfig.json !== false) {
        requestConfig.body = JSON.stringify(requestConfig.data);
        requestConfig.headers = {
          ...requestConfig.headers,
          'Content-Type': 'application/json'
        };
      } else {
        requestConfig.body = requestConfig.data;
      }
      delete requestConfig.data;
    }

    // Set timeout
    const timeout = requestConfig.timeout || this.config.timeout || 30000;

    try {
      // Perform request with retries
      const response = await this.performRequestWithRetries(fullUrl, requestConfig, timeout);

      // Parse response
      const apiResponse = await this.parseResponse<T>(response, requestConfig);

      // Apply response interceptors
      const finalResponse = await this.applyResponseInterceptors(apiResponse);

      // Hook: afterResponse
      if (this.config.hooks?.afterResponse) {
        await this.config.hooks.afterResponse(finalResponse);
      }

      this.emit('response', finalResponse);
      return finalResponse;

    } catch (error: any) {
      // Hook: onError
      if (this.config.hooks?.onError) {
        await this.config.hooks.onError(error);
      }

      logger.error(`API request failed: ${error.message}`, {
        url: fullUrl,
        method: requestConfig.method
      });

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, any>): string {
    const url = new URL(path.startsWith('http') ? path : `${this.config.baseUrl}${path}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Apply authentication to request
   */
  private async applyAuth(config: RequestConfig): Promise<RequestConfig> {
    if (!this.config.auth) return config;

    const { type, credentials, secretRef } = this.config.auth;

    // Get credentials from secret if needed
    let authCreds = credentials;
    if (secretRef) {
      const secret = await this.secretManager.get(secretRef);
      if (typeof secret === 'object') {
        authCreds = secret as any;
      }
    }

    switch (type) {
      case 'basic':
        if (authCreds?.username && authCreds?.password) {
          const auth = Buffer.from(`${authCreds.username}:${authCreds.password}`).toString('base64');
          config.headers = {
            ...config.headers,
            'Authorization': `Basic ${auth}`
          };
        }
        break;

      case 'bearer':
        if (authCreds?.token) {
          config.headers = {
            ...config.headers,
            'Authorization': `Bearer ${authCreds.token}`
          };
        }
        break;

      case 'api-key':
        if (authCreds?.apiKey) {
          const headerName = authCreds.headerName || 'X-API-Key';
          config.headers = {
            ...config.headers,
            [headerName]: authCreds.apiKey
          };
        }
        break;

      case 'oauth2':
        if (authCreds?.token) {
          config.headers = {
            ...config.headers,
            'Authorization': `Bearer ${authCreds.token}`
          };
        }
        break;
    }

    return config;
  }

  /**
   * Apply request interceptors
   */
  private async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    if (!this.config.interceptors?.request) return config;

    let currentConfig = config;
    for (const interceptor of this.config.interceptors.request) {
      if (interceptor.onRequest) {
        currentConfig = await interceptor.onRequest(currentConfig);
      }
    }

    return currentConfig;
  }

  /**
   * Apply response interceptors
   */
  private async applyResponseInterceptors(response: APIResponse): Promise<APIResponse> {
    if (!this.config.interceptors?.response) return response;

    let currentResponse = response;
    for (const interceptor of this.config.interceptors.response) {
      if (interceptor.onResponse) {
        currentResponse = await interceptor.onResponse(currentResponse);
      }
    }

    return currentResponse;
  }

  /**
   * Perform request with retries
   */
  private async performRequestWithRetries(
    url: string,
    config: RequestConfig,
    timeout: number
  ): Promise<Response> {
    const maxRetries = this.config.retries || 0;
    const retryDelay = this.config.retryDelay || 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...config,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Don't retry on success or client errors
        if (response.ok || response.status < 500) {
          return response;
        }

        // Server error, might retry
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

      } catch (error: any) {
        lastError = error;
        logger.warn(`Request attempt ${attempt + 1} failed: ${error.message}`);
      }

      // Wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }

    throw lastError || new Error('Request failed');
  }

  /**
   * Parse response based on content type
   */
  private async parseResponse<T>(response: Response, config: RequestConfig): Promise<APIResponse<T>> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const responseType = config.responseType || this.detectResponseType(headers);
    let data: any;

    switch (responseType) {
      case 'json':
        try {
          data = await response.json();
        } catch {
          data = await response.text();
        }
        break;

      case 'text':
        data = await response.text();
        break;

      case 'blob':
        data = await response.blob();
        break;

      case 'stream':
        data = response.body;
        break;

      default:
        data = await response.text();
    }

    // Check for error status
    if (!response.ok) {
      const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.response = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers
      };
      throw error;
    }

    return {
      data: data as T,
      status: response.status,
      statusText: response.statusText,
      headers,
      config
    };
  }

  /**
   * Detect response type from headers
   */
  private detectResponseType(headers: Record<string, string>): string {
    const contentType = headers['content-type'] || '';
    
    if (contentType.includes('application/json')) {
      return 'json';
    } else if (contentType.includes('text/')) {
      return 'text';
    } else if (contentType.includes('application/octet-stream') || contentType.includes('image/')) {
      return 'blob';
    }

    return 'text';
  }

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    if (!this.config.rateLimit) return;

    const now = Date.now();
    const timePassed = now - this.lastRequestTime;

    // Reset tokens if window has passed
    if (timePassed >= this.rateLimitWindow) {
      this.rateLimitTokens = this.config.rateLimit.requests;
      this.lastRequestTime = now;
    }

    // Check if we have tokens
    if (this.rateLimitTokens <= 0) {
      const waitTime = this.rateLimitWindow - timePassed;
      logger.info(`Rate limit exceeded, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimitTokens = this.config.rateLimit.requests;
      this.lastRequestTime = Date.now();
    }

    this.rateLimitTokens--;
  }

  /**
   * Create a new instance with extended config
   */
  create(config: Partial<APIClientConfig>): ExternalAPIClient {
    return new ExternalAPIClient({
      ...this.config,
      ...config,
      headers: {
        ...this.config.headers,
        ...config.headers
      }
    });
  }

  /**
   * Set default headers
   */
  setHeaders(headers: Record<string, string>): void {
    this.config.headers = {
      ...this.config.headers,
      ...headers
    };
  }

  /**
   * Set authentication
   */
  setAuth(auth: APIClientConfig['auth']): void {
    this.config.auth = auth;
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    if (!this.config.interceptors) {
      this.config.interceptors = { request: [], response: [] };
    }
    if (!this.config.interceptors.request) {
      this.config.interceptors.request = [];
    }
    this.config.interceptors.request.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    if (!this.config.interceptors) {
      this.config.interceptors = { request: [], response: [] };
    }
    if (!this.config.interceptors.response) {
      this.config.interceptors.response = [];
    }
    this.config.interceptors.response.push(interceptor);
  }
}

// Convenience function to create API client
export function createAPIClient(config: APIClientConfig): ExternalAPIClient {
  return new ExternalAPIClient(config);
}

// Helper function for common APIs
export function createCommonAPIClient(type: 'github' | 'gitlab' | 'slack' | 'discord', token: string): ExternalAPIClient {
  const configs: Record<string, APIClientConfig> = {
    github: {
      baseUrl: 'https://api.github.com',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Xec-Integration'
      },
      auth: {
        type: 'bearer',
        credentials: { token }
      }
    },
    gitlab: {
      baseUrl: 'https://gitlab.com/api/v4',
      headers: {
        'Accept': 'application/json'
      },
      auth: {
        type: 'bearer',
        credentials: { token }
      }
    },
    slack: {
      baseUrl: 'https://slack.com/api',
      headers: {
        'Accept': 'application/json'
      },
      auth: {
        type: 'bearer',
        credentials: { token }
      }
    },
    discord: {
      baseUrl: 'https://discord.com/api/v10',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Xec-Integration'
      },
      auth: {
        type: 'bearer',
        credentials: { token }
      }
    }
  };

  const config = configs[type];
  if (!config) {
    throw new Error(`Unknown API type: ${type}`);
  }

  return new ExternalAPIClient(config);
}