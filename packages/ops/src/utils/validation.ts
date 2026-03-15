import fs from 'fs';
import { z } from 'zod';
import path from 'path';

export class ValidationError extends Error {
  constructor(message: string, public field?: string, public code?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Common validation schemas
 */
export const schemas = {
  // File path validation
  filePath: z.string().refine(
    (p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    },
    { message: 'File does not exist' }
  ),

  // Directory path validation
  directoryPath: z.string().refine(
    (p) => {
      try {
        return fs.existsSync(p) && fs.lstatSync(p).isDirectory();
      } catch {
        return false;
      }
    },
    { message: 'Directory does not exist' }
  ),

  // Output format validation
  outputFormat: z.enum(['text', 'json', 'yaml', 'csv']),

  // Non-empty string validation
  nonEmptyString: z.string().min(1, 'Value cannot be empty'),

  // Port number validation
  port: z.number().int().min(1).max(65535),

  // URL validation
  url: z.string().url(),

  // JSON string validation
  jsonString: z.string().refine(
    (str) => {
      try {
        JSON.parse(str);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid JSON format' }
  ),

  // Variables object validation
  variables: z.record(z.string(), z.any()),

  // Host selector validation
  hostSelector: z.string().regex(/^[a-zA-Z0-9._-]+$/, 'Invalid host selector format'),

  // Module name validation
  moduleName: z.string().regex(/^[a-zA-Z0-9._-]+$/, 'Invalid module name format'),

  // Task name validation
  taskName: z.string().regex(/^[a-zA-Z0-9._:-]+$/, 'Invalid task name format'),

  // Recipe name validation
  recipeName: z.string().regex(/^[a-zA-Z0-9._-]+$/, 'Invalid recipe name format'),

  // Semver validation
  semver: z.string().regex(/^\d+\.\d+\.\d+/, 'Invalid semantic version format'),

  // Environment name validation
  environmentName: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid environment name format'),
};

/**
 * Validate file extension
 */
export function validateFileExtension(filePath: string, allowedExtensions: string[]): void {
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new ValidationError(
      `File must have one of these extensions: ${allowedExtensions.join(', ')}`,
      'filePath'
    );
  }
}

/**
 * Validate file is readable
 */
export function validateFileReadable(filePath: string): void {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    throw new ValidationError('File is not readable', 'filePath');
  }
}

/**
 * Validate file is writable
 */
export function validateFileWritable(filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    throw new ValidationError('File is not writable', 'filePath');
  }
}

/**
 * Validate directory is writable
 */
export function validateDirectoryWritable(dirPath: string): void {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
  } catch {
    throw new ValidationError('Directory is not writable', 'directoryPath');
  }
}

/**
 * Validate JSON string and parse it
 */
export function validateAndParseJson(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new ValidationError('Invalid JSON format', 'json');
  }
}

/**
 * Validate variables format
 */
export function validateVariables(vars: string): Record<string, any> {
  if (!vars) return {};

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(vars);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    throw new Error('Variables must be an object');
  } catch {
    // Try to parse as key=value pairs
    const result: Record<string, any> = {};
    const pairs = vars.split(',').map(pair => pair.trim());

    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split('=');
      if (!key || valueParts.length === 0) {
        throw new ValidationError('Invalid variable format. Use JSON or key=value format', 'variables');
      }

      const value = valueParts.join('=');
      // Try to parse value as JSON, otherwise use as string
      try {
        result[key.trim()] = JSON.parse(value);
      } catch {
        result[key.trim()] = value;
      }
    }

    return result;
  }
}

/**
 * Validate timeout value
 */
export function validateTimeout(timeout: string | number): number {
  let timeoutMs: number;

  if (typeof timeout === 'string') {
    // Parse timeout with units (e.g., "30s", "5m", "1h")
    const match = timeout.match(/^(\d+)([smh]?)$/);
    if (!match || !match[1]) {
      throw new ValidationError('Invalid timeout format. Use number or format like "30s", "5m", "1h"', 'timeout');
    }

    const value = parseInt(match[1]);
    const unit = match[2] || 's';

    switch (unit) {
      case 's':
        timeoutMs = value * 1000;
        break;
      case 'm':
        timeoutMs = value * 60 * 1000;
        break;
      case 'h':
        timeoutMs = value * 60 * 60 * 1000;
        break;
      default:
        timeoutMs = value;
    }
  } else {
    timeoutMs = timeout;
  }

  if (timeoutMs < 0) {
    throw new ValidationError('Timeout must be positive', 'timeout');
  }

  if (timeoutMs > 24 * 60 * 60 * 1000) {
    throw new ValidationError('Timeout cannot exceed 24 hours', 'timeout');
  }

  return timeoutMs;
}

/**
 * Validate host pattern
 */
export function validateHostPattern(pattern: string): void {
  // Allow wildcards, IP addresses, hostnames
  const validPattern = /^[a-zA-Z0-9.*_-]+$/;
  if (!validPattern.test(pattern)) {
    throw new ValidationError('Invalid host pattern', 'hostPattern');
  }
}

/**
 * Validate tag pattern
 */
export function validateTagPattern(pattern: string): void {
  const validPattern = /^[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(pattern)) {
    throw new ValidationError('Invalid tag pattern', 'tagPattern');
  }
}

/**
 * Common validation function for command options
 */
export function validateOptions(options: any, schema: z.ZodSchema): void {
  try {
    schema.parse(options);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      throw new ValidationError(`Validation failed: ${messages}`);
    }
    throw error;
  }
}

/**
 * Validate project structure
 */
export function validateProjectStructure(projectPath: string): void {
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(projectPath, file);
    if (!fs.existsSync(filePath)) {
      throw new ValidationError(`Missing required file: ${file}`, 'projectStructure');
    }
  }
}

/**
 * Validate xec configuration
 */
export function validateXecConfig(config: any): void {
  const configSchema = z.object({
    version: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    modules: z.array(z.string()).optional(),
    environments: z.record(z.string(), z.any()).optional(),
    defaults: z.record(z.string(), z.any()).optional(),
  });

  try {
    configSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      throw new ValidationError(`Invalid xec configuration: ${messages}`);
    }
    throw error;
  }
}

/**
 * Validate recipe structure
 */
export function validateRecipeStructure(recipe: any): void {
  const recipeSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    version: z.string().optional(),
    author: z.string().optional(),
    tasks: z.array(z.object({
      name: z.string(),
      type: z.string().optional(),
      handler: z.any().optional(),
      command: z.string().optional(),
    })).optional(),
    phases: z.record(z.string(), z.any()).optional(),
    vars: z.record(z.string(), z.any()).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  });

  try {
    recipeSchema.parse(recipe);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      throw new ValidationError(`Invalid recipe structure: ${messages}`);
    }
    throw error;
  }
}