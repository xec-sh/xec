import { existsSync } from 'fs';
import * as yaml from 'js-yaml';
import { readFile } from 'fs/promises';

import { errorMessages } from './error-handler.js';

/**
 * Parse variables from different sources
 */
export interface VariableSource {
  vars?: string; // JSON string
  var?: string[]; // Array of key=value pairs
  varsFile?: string; // Path to JSON/YAML file
}

/**
 * Parse variables from command line options
 * Handles --vars (JSON), --var (key=value), and --vars-file
 */
export async function parseVariables(options: VariableSource): Promise<Record<string, any>> {
  const variables: Record<string, any> = {};

  // Parse JSON variables
  if (options.vars) {
    try {
      const parsed = JSON.parse(options.vars);
      Object.assign(variables, parsed);
    } catch (error) {
      throw errorMessages.invalidInput('--vars', 'Must be valid JSON');
    }
  }

  // Parse key=value pairs
  if (options.var && Array.isArray(options.var)) {
    for (const varPair of options.var) {
      const [key, ...valueParts] = varPair.split('=');
      if (!key || valueParts.length === 0) {
        throw errorMessages.invalidInput('--var', 'Must be in key=value format');
      }
      const value = valueParts.join('='); // Handle values with '='
      
      // Try to parse as JSON, otherwise use as string
      try {
        variables[key] = JSON.parse(value);
      } catch {
        variables[key] = value;
      }
    }
  }

  // Parse variables from file
  if (options.varsFile) {
    if (!existsSync(options.varsFile)) {
      throw errorMessages.fileNotFound(options.varsFile);
    }

    const content = await readFile(options.varsFile, 'utf8');
    
    try {
      let parsed: any;
      
      if (options.varsFile.endsWith('.yaml') || options.varsFile.endsWith('.yml')) {
        parsed = yaml.load(content);
      } else {
        parsed = JSON.parse(content);
      }
      
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Variables file must contain an object');
      }
      
      Object.assign(variables, parsed);
    } catch (error: any) {
      throw errorMessages.invalidInput('--vars-file', `Failed to parse: ${error.message}`);
    }
  }

  return variables;
}

/**
 * Parse timeout value from string
 */
export function parseTimeout(value: string, defaultValue?: number): number {
  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
  };

  // Check if it's just a number (assume seconds)
  const numericValue = parseInt(value, 10);
  if (!isNaN(numericValue) && numericValue.toString() === value) {
    return numericValue * 1000; // Convert to milliseconds
  }

  // Check for unit suffix
  const match = value.match(/^(\d+)(ms|s|m|h)$/);
  if (match && match[1] && match[2]) {
    const num = match[1];
    const unit = match[2];
    const unitValue = units[unit as keyof typeof units];
    if (unitValue !== undefined) {
      return parseInt(num, 10) * unitValue;
    }
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw errorMessages.invalidInput('timeout', 'Must be a number or use format: 10s, 5m, 1h');
}

/**
 * Parse memory size from string
 */
export function parseMemorySize(value: string): number {
  const units: Record<string, number> = {
    b: 1,
    k: 1024,
    kb: 1024,
    m: 1024 * 1024,
    mb: 1024 * 1024,
    g: 1024 * 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = value.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|k|kb|m|mb|g|gb)?$/);
  if (!match || !match[1]) {
    throw errorMessages.invalidInput('memory size', 'Must be a number with optional unit (b, k, m, g)');
  }

  const num = match[1];
  const unit = match[2] || 'b';
  const unitValue = units[unit as keyof typeof units];
  
  if (unitValue !== undefined) {
    return Math.floor(parseFloat(num) * unitValue);
  }
  
  throw errorMessages.invalidInput('memory size', `Invalid unit: ${unit}`);
}

/**
 * Parse comma-separated list
 */
export function parseList(value: string, delimiter = ','): string[] {
  if (!value || value.trim() === '') {
    return [];
  }
  
  return value
    .split(delimiter)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Parse key-value pairs from array of strings
 */
export function parseKeyValuePairs(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (!key || valueParts.length === 0) {
      throw errorMessages.invalidInput('key=value', `Invalid format: ${pair}`);
    }
    result[key.trim()] = valueParts.join('=').trim();
  }
  
  return result;
}

/**
 * Parse port number
 */
export function parsePort(value: string): number {
  const port = parseInt(value, 10);
  
  if (isNaN(port) || port < 1 || port > 65535) {
    throw errorMessages.invalidInput('port', 'Must be a number between 1 and 65535');
  }
  
  return port;
}

/**
 * Parse boolean value (handles various formats)
 */
export function parseBoolean(value: string | boolean | undefined, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  const normalizedValue = value.toLowerCase().trim();
  const trueValues = ['true', '1', 'yes', 'y', 'on'];
  const falseValues = ['false', '0', 'no', 'n', 'off'];
  
  if (trueValues.includes(normalizedValue)) {
    return true;
  }
  
  if (falseValues.includes(normalizedValue)) {
    return false;
  }
  
  throw errorMessages.invalidInput('boolean', `Invalid value: ${value}`);
}

/**
 * Parse and validate file path
 */
export async function parseFilePath(path: string, options?: { mustExist?: boolean; type?: 'file' | 'directory' }): Promise<string> {
  const { mustExist = false, type } = options || {};
  
  if (mustExist && !existsSync(path)) {
    throw errorMessages.fileNotFound(path);
  }
  
  if (type && existsSync(path)) {
    const stats = await import('fs/promises').then(fs => fs.stat(path));
    
    if (type === 'file' && !stats.isFile()) {
      throw errorMessages.invalidInput('path', `Expected file but found directory: ${path}`);
    }
    
    if (type === 'directory' && !stats.isDirectory()) {
      throw errorMessages.invalidInput('path', `Expected directory but found file: ${path}`);
    }
  }
  
  return path;
}

/**
 * Common option definitions for reuse across commands
 */
export const commonOptions = {
  verbose: ['-v, --verbose', 'Enable verbose output'] as const,
  quiet: ['-q, --quiet', 'Suppress output'] as const,
  output: ['-o, --output <format>', 'Output format (text|json|yaml|csv)', 'text'] as const,
  dryRun: ['--dry-run', 'Perform a dry run without making changes'] as const,
  force: ['-f, --force', 'Force operation without confirmation'] as const,
  vars: ['--vars <json>', 'Variables as JSON string'] as const,
  var: ['--var <key=value>', 'Set variable (can be used multiple times)'] as const,
  varsFile: ['--vars-file <path>', 'Load variables from JSON/YAML file'] as const,
  timeout: ['--timeout <duration>', 'Operation timeout (e.g., 30s, 5m)', '30s'] as const,
  parallel: ['-p, --parallel <number>', 'Number of parallel operations', '5'] as const,
  config: ['-c, --config <path>', 'Path to configuration file'] as const,
  yes: ['-y, --yes', 'Assume yes to all prompts'] as const,
  wait: ['--wait', 'Wait for operation to complete'] as const,
  watch: ['-w, --watch', 'Watch for changes'] as const,
  filter: ['--filter <pattern>', 'Filter results by pattern'] as const,
  limit: ['--limit <number>', 'Limit number of results'] as const,
  offset: ['--offset <number>', 'Skip first N results'] as const,
  sort: ['--sort <field>', 'Sort results by field'] as const,
  reverse: ['--reverse', 'Reverse sort order'] as const,
};