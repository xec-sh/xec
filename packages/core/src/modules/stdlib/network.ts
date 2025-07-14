import { z } from 'zod';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import * as dns from 'dns/promises';

import { Module, ModuleMetadata, TaskDefinition } from '../types.js';
import { Task, TaskResult, TaskContext } from '../../tasks/types.js';

export const NetworkTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ping'),
    host: z.string(),
    timeout: z.number().optional().default(5000),
  }),
  z.object({
    type: z.literal('dns_lookup'),
    hostname: z.string(),
    family: z.number().optional(),
  }),
  z.object({
    type: z.literal('tcp_check'),
    host: z.string(),
    port: z.number(),
    timeout: z.number().optional().default(5000),
  }),
  z.object({
    type: z.literal('http_check'),
    url: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD']).optional().default('GET'),
    headers: z.record(z.string()).optional(),
    body: z.any().optional(),
    timeout: z.number().optional().default(10000),
    validateCert: z.boolean().optional().default(true),
  }),
  z.object({
    type: z.literal('wait_for_port'),
    host: z.string(),
    port: z.number(),
    timeout: z.number().optional().default(30000),
    interval: z.number().optional().default(1000),
  }),
]);

export type NetworkTask = z.infer<typeof NetworkTaskSchema>;

export const metadata: ModuleMetadata = {
  name: 'network',
  version: '1.0.0',
  description: 'Network utilities and checks',
  author: 'Xec Team',
  tags: ['network', 'connectivity', 'http', 'tcp', 'dns'],
  dependencies: {},
};

async function ping(host: string, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    // Try to connect to port 80 (HTTP) or 443 (HTTPS)
    socket.connect(80, host);
  });
}

async function tcpCheck(host: string, port: number, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

interface HttpCheckResult {
  success: boolean;
  statusCode?: number;
  statusMessage?: string;
  headers?: any;
  body?: string;
  error?: string;
}

async function httpCheck(
  url: string,
  method: string,
  headers?: Record<string, string>,
  body?: any,
  timeout?: number,
  validateCert?: boolean
): Promise<HttpCheckResult> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const options: http.RequestOptions = {
      method,
      timeout,
      headers: headers || {},
    };

    // Add HTTPS-specific options
    if (isHttps) {
      (options as https.RequestOptions).rejectUnauthorized = validateCert;
    }

    const req = client.request(parsedUrl, options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        resolve({
          success: res.statusCode! >= 200 && res.statusCode! < 300,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: responseBody,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout',
      });
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }

    req.end();
  });
}

async function waitForPort(host: string, port: number, timeout: number, interval: number): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await tcpCheck(host, port, Math.min(interval, timeout - (Date.now() - startTime)))) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return false;
}

const tasks: Record<string, TaskDefinition> = {
  ping: {
    name: 'ping',
    description: 'Check if a host is reachable',
    parameters: z.object({
      host: z.string(),
      timeout: z.number().optional().default(5000),
    }),
    handler: async (params: any) => {
      const success = await ping(params.host, params.timeout || 5000);
      return {
        success,
        changed: false,
        output: success ? `Host ${params.host} is reachable` : `Host ${params.host} is not reachable`,
      };
    },
  },

  dns_lookup: {
    name: 'dns_lookup',
    description: 'Perform DNS lookup',
    parameters: z.object({
      hostname: z.string(),
      family: z.number().optional(),
    }),
    handler: async (params: any) => {
      try {
        const addresses = await dns.lookup(params.hostname, params.family ? { family: params.family } : {});
        return {
          success: true,
          changed: false,
          output: `DNS lookup successful`,
          data: addresses,
        };
      } catch (error) {
        return {
          success: false,
          changed: false,
          error: error as Error,
        };
      }
    },
  },

  tcp_check: {
    name: 'tcp_check',
    description: 'Check if TCP port is open',
    parameters: z.object({
      host: z.string(),
      port: z.number(),
      timeout: z.number().optional().default(5000),
    }),
    handler: async (params: any) => {
      const success = await tcpCheck(params.host, params.port, params.timeout || 5000);
      return {
        success,
        changed: false,
        output: success
          ? `TCP port ${params.port} on ${params.host} is open`
          : `TCP port ${params.port} on ${params.host} is closed or unreachable`,
      };
    },
  },

  http_check: {
    name: 'http_check',
    description: 'Perform HTTP health check',
    parameters: z.object({
      url: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'HEAD']).optional().default('GET'),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      timeout: z.number().optional().default(10000),
      validateCert: z.boolean().optional().default(true),
    }),
    handler: async (params: any) => {
      const result = await httpCheck(
        params.url,
        params.method || 'GET',
        params.headers,
        params.body,
        params.timeout || 10000,
        params.validateCert !== false
      );

      return {
        success: result.success,
        changed: false,
        output: result.success
          ? `HTTP check successful: ${result.statusCode} ${result.statusMessage}`
          : `HTTP check failed: ${result.error}`,
        data: {
          statusCode: result.statusCode,
          statusMessage: result.statusMessage,
          headers: result.headers,
          body: result.body,
        },
      };
    },
  },

  wait_for_port: {
    name: 'wait_for_port',
    description: 'Wait for a port to become available',
    parameters: z.object({
      host: z.string(),
      port: z.number(),
      timeout: z.number().optional().default(30000),
      interval: z.number().optional().default(1000),
    }),
    handler: async (params: any) => {
      const success = await waitForPort(
        params.host,
        params.port,
        params.timeout || 30000,
        params.interval || 1000
      );

      return {
        success,
        changed: false,
        output: success
          ? `Port ${params.port} on ${params.host} became available`
          : `Timeout waiting for port ${params.port} on ${params.host}`,
      };
    },
  },
};

async function execute(task: Task, context: TaskContext): Promise<TaskResult> {
  const taskType = task.definition.type;
  const taskDef = tasks[taskType];

  if (!taskDef) {
    return {
      success: false,
      changed: false,
      error: new Error(`Unknown task type: ${taskType}`),
    };
  }

  try {
    const result = await taskDef.handler(task.definition);
    return result;
  } catch (error) {
    return {
      success: false,
      changed: false,
      error: error as Error,
    };
  }
}

function validate(definition: any): { success: boolean; errors?: string[] } {
  try {
    NetworkTaskSchema.parse(definition);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      errors: error instanceof Error ? [error.message] : ['Validation failed']
    };
  }
}

export const networkModule: Module & { validate: typeof validate; execute: typeof execute } = {
  metadata,
  tasks,
  validate,
  execute,
};