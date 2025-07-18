import ajvFormats from 'ajv-formats';
import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';

import { ValidationError } from './errors.js';

import type { Variables, JSONSchema } from './types.js';

const ajv = new Ajv({
  allErrors: true,
  useDefaults: true,
  coerceTypes: true,
  strict: false
});

ajvFormats(ajv);

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}

export class Validator {
  private static compiledSchemas = new Map<string, ValidateFunction>();

  static compileSchema(schemaId: string, schema: JSONSchema): ValidateFunction {
    if (this.compiledSchemas.has(schemaId)) {
      return this.compiledSchemas.get(schemaId)!;
    }

    const validate = ajv.compile(schema);
    this.compiledSchemas.set(schemaId, validate);
    return validate;
  }

  static validateVariables(
    variables: Variables,
    schema?: JSONSchema
  ): ValidationResult {
    if (!schema) {
      return { valid: true };
    }

    const validate = this.compileSchema('variables', schema);
    const valid = validate(variables);

    if (!valid) {
      const errors = (validate.errors || []).map(error => ({
        field: error.instancePath.replace(/^\//, '') || error.params['missingProperty'] || 'unknown',
        message: error.message || 'Validation failed',
        value: error.data
      }));

      return { valid: false, errors };
    }

    return { valid: true };
  }

  static assertValid(
    data: any,
    schema: JSONSchema,
    contextMessage?: string
  ): void {
    const validate = ajv.compile(schema);
    if (!validate(data)) {
      const errors = (validate.errors || []).map(error => 
        `${error.instancePath || error.params['missingProperty'] || 'root'}: ${error.message}`
      ).join(', ');
      
      throw new ValidationError(
        contextMessage ? `${contextMessage}: ${errors}` : errors,
        undefined,
        data
      );
    }
  }

  static validateTaskVariables(
    taskId: string,
    variables: Variables,
    requiredVars?: string[],
    schema?: JSONSchema
  ): void {
    if (requiredVars && requiredVars.length > 0) {
      const missingVars = requiredVars.filter(v => !(v in variables));
      if (missingVars.length > 0) {
        throw new ValidationError(
          `Task ${taskId} is missing required variables: ${missingVars.join(', ')}`,
          'requiredVars',
          missingVars
        );
      }
    }

    if (schema) {
      const result = this.validateVariables(variables, schema);
      if (!result.valid) {
        const errorMessages = result.errors!.map(e => 
          `${e.field}: ${e.message}`
        ).join(', ');
        
        throw new ValidationError(
          `Task ${taskId} variable validation failed: ${errorMessages}`,
          undefined,
          variables,
          { errors: result.errors }
        );
      }
    }
  }

  static validateInventoryHost(host: Record<string, any>): void {
    const schema: JSONSchemaType<{
      name: string;
      hostname?: string;
      port?: number;
      username?: string;
      tags?: string[];
      vars?: Record<string, any>;
    }> = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        hostname: { type: 'string', nullable: true },
        port: { type: 'number', nullable: true, minimum: 1, maximum: 65535 },
        username: { type: 'string', nullable: true },
        tags: { 
          type: 'array', 
          items: { type: 'string' },
          nullable: true 
        },
        vars: { 
          type: 'object',
          additionalProperties: true,
          nullable: true
        }
      },
      required: ['name'],
      additionalProperties: true
    };

    this.assertValid(host, schema, 'Invalid inventory host');
  }

  static validatePattern(pattern: string, value: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch {
      throw new ValidationError(
        `Invalid regex pattern: ${pattern}`,
        'pattern',
        pattern
      );
    }
  }

  static validateEnum<T>(value: T, validValues: T[], fieldName: string): void {
    if (!validValues.includes(value)) {
      throw new ValidationError(
        `Invalid ${fieldName}: ${value}. Must be one of: ${validValues.join(', ')}`,
        fieldName,
        value
      );
    }
  }

  static validatePositiveNumber(value: number, fieldName: string): void {
    if (typeof value !== 'number' || value <= 0) {
      throw new ValidationError(
        `${fieldName} must be a positive number`,
        fieldName,
        value
      );
    }
  }

  static validateTimeout(timeout?: number): void {
    if (timeout !== undefined) {
      this.validatePositiveNumber(timeout, 'timeout');
      if (timeout > 86400000) {
        throw new ValidationError(
          'Timeout cannot exceed 24 hours (86400000ms)',
          'timeout',
          timeout
        );
      }
    }
  }

  static validateRetryConfig(config?: {
    maxAttempts?: number;
    delay?: number;
    backoffMultiplier?: number;
  }): void {
    if (!config) return;

    if (config.maxAttempts !== undefined) {
      this.validatePositiveNumber(config.maxAttempts, 'maxAttempts');
      if (config.maxAttempts > 10) {
        throw new ValidationError(
          'maxAttempts cannot exceed 10',
          'maxAttempts',
          config.maxAttempts
        );
      }
    }

    if (config.delay !== undefined) {
      this.validatePositiveNumber(config.delay, 'delay');
    }

    if (config.backoffMultiplier !== undefined) {
      this.validatePositiveNumber(config.backoffMultiplier, 'backoffMultiplier');
      if (config.backoffMultiplier > 5) {
        throw new ValidationError(
          'backoffMultiplier cannot exceed 5',
          'backoffMultiplier',
          config.backoffMultiplier
        );
      }
    }
  }

  static sanitizeVariables(variables: Variables): Variables {
    const sanitized: Variables = {};
    
    for (const [key, value] of Object.entries(variables)) {
      if (key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        sanitized[key] = this.sanitizeValue(value);
      }
    }
    
    return sanitized;
  }

  private static sanitizeValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    if (typeof value === 'string') {
      // Remove control characters and DEL character
      // eslint-disable-next-line no-control-regex
      return value.replace(/[\x00-\x1F\x7F]/g, '');
    }
    
    if (Array.isArray(value)) {
      return value.map(v => this.sanitizeValue(v));
    }
    
    if (typeof value === 'object') {
      const sanitized: any = {};
      for (const [k, v] of Object.entries(value)) {
        sanitized[k] = this.sanitizeValue(v);
      }
      return sanitized;
    }
    
    return value;
  }

  static clearCache(): void {
    this.compiledSchemas.clear();
  }
}