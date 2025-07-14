import { z } from 'zod';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';

import { Module, ModuleMetadata, TaskDefinition } from '../types.js';
import { Task, TaskResult, TaskContext } from '../../tasks/types.js';

const sleep = promisify(setTimeout);

export const UtilsTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sleep'),
    duration: z.number().min(0),
  }),
  z.object({
    type: z.literal('random'),
    min: z.number().optional().default(0),
    max: z.number().optional().default(1),
    integer: z.boolean().optional().default(false),
  }),
  z.object({
    type: z.literal('uuid'),
    version: z.enum(['v4', 'v1']).optional().default('v4'),
  }),
  z.object({
    type: z.literal('hash'),
    algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).default('sha256'),
    data: z.string(),
    encoding: z.enum(['hex', 'base64', 'base64url']).optional().default('hex'),
  }),
  z.object({
    type: z.literal('template'),
    template: z.string(),
    variables: z.record(z.any()),
  }),
  z.object({
    type: z.literal('parse_json'),
    json: z.string(),
  }),
  z.object({
    type: z.literal('stringify_json'),
    data: z.any(),
    pretty: z.boolean().optional().default(false),
  }),
  z.object({
    type: z.literal('base64_encode'),
    data: z.string(),
  }),
  z.object({
    type: z.literal('base64_decode'),
    data: z.string(),
  }),
  z.object({
    type: z.literal('timestamp'),
    format: z.enum(['unix', 'iso', 'date']).optional().default('unix'),
  }),
  z.object({
    type: z.literal('path_join'),
    parts: z.array(z.string()),
  }),
  z.object({
    type: z.literal('path_parse'),
    path: z.string(),
  }),
  z.object({
    type: z.literal('retry'),
    task: z.any(), // This would be another task definition
    maxAttempts: z.number().min(1).default(3),
    delay: z.number().min(0).default(1000),
    backoff: z.enum(['constant', 'linear', 'exponential']).optional().default('constant'),
  }),
]);

export type UtilsTask = z.infer<typeof UtilsTaskSchema>;

export const metadata: ModuleMetadata = {
  name: 'utils',
  version: '1.0.0',
  description: 'Utility functions and helpers',
  author: 'Xec Team',
  tags: ['utils', 'helpers', 'crypto', 'string', 'time'],
  dependencies: {},
};

function renderTemplate(template: string, variables: Record<string, any>): string {
  return template.replace(/\{\{(\s*[^}]+\s*)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    const keys = trimmedKey.split('.');
    let value: any = variables;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return match;
      }
    }

    return String(value);
  });
}

const tasks: Record<string, TaskDefinition> = {
  sleep: {
    name: 'sleep',
    description: 'Sleep for a specified duration',
    parameters: z.object({
      duration: z.number().min(0),
    }),
    handler: async (params: any) => {
      await sleep(params.duration);
      return {
        success: true,
        changed: false,
        output: `Slept for ${params.duration}ms`,
      };
    },
  },

  random: {
    name: 'random',
    description: 'Generate a random number',
    parameters: z.object({
      min: z.number().optional().default(0),
      max: z.number().optional().default(1),
      integer: z.boolean().optional().default(false),
    }),
    handler: async (params: any) => {
      const range = params.max - params.min;
      let value = Math.random() * range + params.min;

      if (params.integer) {
        value = Math.floor(value);
      }

      return {
        success: true,
        changed: false,
        output: `Generated random value: ${value}`,
        data: value,
      };
    },
  },

  uuid: {
    name: 'uuid',
    description: 'Generate a UUID',
    parameters: z.object({
      version: z.enum(['v4', 'v1']).optional().default('v4'),
    }),
    handler: async (params: any) => {
      const uuid = params.version === 'v4'
        ? crypto.randomUUID()
        : crypto.randomBytes(16).toString('hex');

      return {
        success: true,
        changed: false,
        output: `Generated UUID: ${uuid}`,
        data: uuid,
      };
    },
  },

  hash: {
    name: 'hash',
    description: 'Generate a hash of data',
    parameters: z.object({
      algorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).default('sha256'),
      data: z.string(),
      encoding: z.enum(['hex', 'base64', 'base64url']).optional().default('hex'),
    }),
    handler: async (params: any) => {
      const hash = crypto
        .createHash(params.algorithm)
        .update(params.data)
        .digest(params.encoding as any);

      return {
        success: true,
        changed: false,
        output: `Generated ${params.algorithm} hash`,
        data: hash,
      };
    },
  },

  template: {
    name: 'template',
    description: 'Render a template with variables',
    parameters: z.object({
      template: z.string(),
      variables: z.record(z.any()),
    }),
    handler: async (params: any) => {
      try {
        const rendered = renderTemplate(params.template, params.variables);
        return {
          success: true,
          changed: false,
          output: 'Template rendered successfully',
          data: rendered,
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

  parse_json: {
    name: 'parse_json',
    description: 'Parse JSON string',
    parameters: z.object({
      json: z.string(),
    }),
    handler: async (params: any) => {
      try {
        const parsed = JSON.parse(params.json);
        return {
          success: true,
          changed: false,
          output: 'JSON parsed successfully',
          data: parsed,
        };
      } catch (error) {
        return {
          success: false,
          changed: false,
          error: error as Error,
          output: 'Failed to parse JSON',
        };
      }
    },
  },

  stringify_json: {
    name: 'stringify_json',
    description: 'Stringify data to JSON',
    parameters: z.object({
      data: z.any(),
      pretty: z.boolean().optional().default(false),
    }),
    handler: async (params: any) => {
      try {
        const stringified = params.pretty
          ? JSON.stringify(params.data, null, 2)
          : JSON.stringify(params.data);

        return {
          success: true,
          changed: false,
          output: 'JSON stringified successfully',
          data: stringified,
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

  base64_encode: {
    name: 'base64_encode',
    description: 'Encode data to base64',
    parameters: z.object({
      data: z.string(),
    }),
    handler: async (params: any) => {
      const encoded = Buffer.from(params.data).toString('base64');
      return {
        success: true,
        changed: false,
        output: 'Data encoded to base64',
        data: encoded,
      };
    },
  },

  base64_decode: {
    name: 'base64_decode',
    description: 'Decode data from base64',
    parameters: z.object({
      data: z.string(),
    }),
    handler: async (params: any) => {
      try {
        const decoded = Buffer.from(params.data, 'base64').toString();
        return {
          success: true,
          changed: false,
          output: 'Data decoded from base64',
          data: decoded,
        };
      } catch (error) {
        return {
          success: false,
          changed: false,
          error: error as Error,
          output: 'Failed to decode base64',
        };
      }
    },
  },

  timestamp: {
    name: 'timestamp',
    description: 'Get current timestamp',
    parameters: z.object({
      format: z.enum(['unix', 'iso', 'date']).optional().default('unix'),
    }),
    handler: async (params: any) => {
      let timestamp: string | number;
      const now = new Date();

      switch (params.format) {
        case 'unix':
          timestamp = Math.floor(now.getTime() / 1000);
          break;
        case 'iso':
          timestamp = now.toISOString();
          break;
        case 'date':
          timestamp = now.toString();
          break;
        default:
          timestamp = Math.floor(now.getTime() / 1000);
          break;
      }

      return {
        success: true,
        changed: false,
        output: `Current timestamp: ${timestamp}`,
        data: timestamp,
      };
    },
  },

  path_join: {
    name: 'path_join',
    description: 'Join path segments',
    parameters: z.object({
      parts: z.array(z.string()),
    }),
    handler: async (params: any) => {
      const joined = path.join(...params.parts);
      return {
        success: true,
        changed: false,
        output: `Path joined: ${joined}`,
        data: joined,
      };
    },
  },

  path_parse: {
    name: 'path_parse',
    description: 'Parse a path',
    parameters: z.object({
      path: z.string(),
    }),
    handler: async (params: any) => {
      const parsed = path.parse(params.path);
      return {
        success: true,
        changed: false,
        output: 'Path parsed successfully',
        data: parsed,
      };
    },
  },

  retry: {
    name: 'retry',
    description: 'Retry a task with backoff',
    parameters: z.object({
      task: z.any(),
      maxAttempts: z.number().min(1).default(3),
      delay: z.number().min(0).default(1000),
      backoff: z.enum(['constant', 'linear', 'exponential']).optional().default('constant'),
    }),
    handler: async (params: any) =>
    // This is a special case that would need integration with the task runner
    // For now, we'll just return a placeholder
    ({
      success: false,
      changed: false,
      output: 'Retry functionality requires task runner integration',
      error: new Error('Not implemented in standalone module'),
    })
    ,
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
    UtilsTaskSchema.parse(definition);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      errors: error instanceof Error ? [error.message] : ['Validation failed']
    };
  }
}

export const utilsModule: Module & { validate: typeof validate; execute: typeof execute } = {
  metadata,
  tasks,
  validate,
  execute,
};