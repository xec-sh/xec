/**
 * @xec/stdlib-core - Core utilities for Xec
 */

import { task } from '../../dsl/task.js';
import { getVar, setVar, template } from '../../context/globals.js';

import type { Task, Module, Helper } from '../../core/types.js';

// Core Helpers
export const helpers: Record<string, Helper> = {
  // String manipulation
  uppercase: (str: string) => str.toUpperCase(),
  lowercase: (str: string) => str.toLowerCase(),
  capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
  trim: (str: string) => str.trim(),

  // Array operations
  first: <T>(arr: T[]) => arr[0],
  last: <T>(arr: T[]) => arr[arr.length - 1],
  unique: <T>(arr: T[]) => [...new Set(arr)],
  flatten: <T>(arr: T[][]) => arr.flat(),

  // Object operations
  keys: (obj: Record<string, any>) => Object.keys(obj),
  values: (obj: Record<string, any>) => Object.values(obj),
  entries: (obj: Record<string, any>) => Object.entries(obj),
  merge: (...objs: Record<string, any>[]) => Object.assign({}, ...objs),

  // Date/Time
  now: () => new Date(),
  timestamp: () => Date.now(),
  formatDate: (date: Date, format: string = 'YYYY-MM-DD') => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day);
  },

  // Math
  random: (min: number = 0, max: number = 1) => Math.random() * (max - min) + min,
  round: (num: number, decimals: number = 0) => Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals),

  // Type checking
  isString: (val: any): val is string => typeof val === 'string',
  isNumber: (val: any): val is number => typeof val === 'number',
  isBoolean: (val: any): val is boolean => typeof val === 'boolean',
  isArray: (val: any): val is any[] => Array.isArray(val),
  isObject: (val: any): val is object => val !== null && typeof val === 'object' && !Array.isArray(val),

  // JSON operations
  toJSON: (obj: any) => JSON.stringify(obj, null, 2),
  fromJSON: (str: string) => JSON.parse(str),

  // Environment
  env: (key: string, defaultValue?: string) => process.env[key] || defaultValue,
  platform: () => process.platform,
  arch: () => process.arch,

  // Utility
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  retry: async <T>(fn: () => Promise<T>, attempts: number = 3, delay: number = 1000): Promise<T> => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Retry failed');
  }
};

// Core Tasks
export const tasks: Record<string, Task> = {
  // Variable management
  setVar: task('set-var')
    .description('Set a variable value')
    .vars({ name: { required: true }, value: { required: true } })
    .handler(async (context) => {
      const { name, value } = context.vars;
      setVar(name, value);
      return { set: { [name]: value } };
    })
    .build(),

  getVar: task('get-var')
    .description('Get a variable value')
    .vars({ name: { required: true } })
    .handler(async (context) => {
      const { name } = context.vars;
      const value = getVar(name);
      return { [name]: value };
    })
    .build(),

  // Logging tasks
  debug: task('debug')
    .description('Log debug message')
    .vars({ message: { required: true } })
    .handler(async (context) => {
      context.logger.debug(context.vars.message);
      return { logged: 'debug' };
    })
    .build(),

  info: task('info')
    .description('Log info message')
    .vars({ message: { required: true } })
    .handler(async (context) => {
      context.logger.info(context.vars.message);
      return { logged: 'info' };
    })
    .build(),

  warn: task('warn')
    .description('Log warning message')
    .vars({ message: { required: true } })
    .handler(async (context) => {
      context.logger.warn(context.vars.message);
      return { logged: 'warn' };
    })
    .build(),

  error: task('error')
    .description('Log error message')
    .vars({ message: { required: true } })
    .handler(async (context) => {
      context.logger.error(context.vars.message);
      return { logged: 'error' };
    })
    .build(),

  // Control flow
  delay: task('delay')
    .description('Wait for specified time')
    .vars({ ms: { required: true, type: 'number' } })
    .handler(async (context) => {
      const ms = context.vars.ms;
      await new Promise(resolve => setTimeout(resolve, ms));
      return { delayed: ms };
    })
    .build(),

  // Template rendering
  template: task('template')
    .description('Render a template string')
    .vars({ template: { required: true }, data: {} })
    .handler(async (context) => {
      const { template: tpl, data } = context.vars;
      const result = template(tpl, data || context.vars);
      return { rendered: result };
    })
    .build()
};

// Core Module
export const coreModule: Module = {
  name: '@xec/stdlib-core',
  version: '1.0.0',
  description: 'Core utilities and tasks for Xec',
  exports: {
    tasks,
    helpers,
    patterns: {},
    integrations: {}
  },
  dependencies: [],
  metadata: {
    category: 'stdlib',
    tags: ['core', 'utilities'],
    author: 'Xec Team'
  }
};

export default coreModule;