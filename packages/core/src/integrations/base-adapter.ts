import { z } from 'zod';
import { EventEmitter } from 'events';

export interface AdapterConfig {
  name: string;
  type: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
}

export interface AdapterEvent {
  type: 'connected' | 'disconnected' | 'error' | 'data' | 'status';
  timestamp: number;
  data?: any;
  error?: Error;
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  error?: Error;
  duration: number;
  metadata?: Record<string, any>;
}

export abstract class BaseAdapter extends EventEmitter {
  protected config: AdapterConfig;
  protected connected: boolean = false;
  protected lastError: Error | null = null;
  protected connectionTime: number = 0;

  constructor(config: AdapterConfig) {
    super();
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract execute(command: string, options?: any): Promise<ExecutionResult>;
  abstract healthCheck(): Promise<boolean>;
  abstract validateConfig(config: any): boolean;

  isConnected(): boolean {
    return this.connected;
  }

  getLastError(): Error | null {
    return this.lastError;
  }

  getConnectionTime(): number {
    return this.connectionTime;
  }

  protected emitEvent(event: AdapterEvent): void {
    this.emit(event.type, event);
    this.emit('event', event);
  }

  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    retries: number = this.config.retries || 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          await this.sleep(Math.pow(2, i) * 1000);
        }
      }
    }
    
    throw lastError;
  }

  protected async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number = this.config.timeout || 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
      
      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (this.config.debug || level === 'error' || level === 'warn') {
      const timestamp = new Date().toISOString();
      console[level](`[${timestamp}] [${this.config.name}] ${message}`, data || '');
    }
  }
}

export const AdapterConfigSchema = z.object({
  name: z.string(),
  type: z.string(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  debug: z.boolean().optional(),
});