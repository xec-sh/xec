/**
 * Task parser for Xec configuration
 * Parses and validates task definitions from configuration
 */

import {
  TaskStep,
  TaskConfig,
  TaskParameter,
  TaskDefinition,
  ValidationError,
} from './types.js';

export class TaskParser {
  private errors: ValidationError[] = [];

  /**
   * Parse a task configuration entry
   */
  parseTask(taskName: string, config: TaskConfig): TaskDefinition | null {
    this.errors = [];

    // Handle simple string command
    if (typeof config === 'string') {
      return {
        command: config,
        description: `Execute: ${config}`,
      };
    }

    // Validate task definition
    const task = config as TaskDefinition;
    this.validateTaskDefinition(taskName, task);

    if (this.errors.length > 0) {
      return null;
    }

    return task;
  }

  /**
   * Parse all tasks from configuration
   */
  parseTasks(tasks: Record<string, TaskConfig>): Record<string, TaskDefinition> {
    const parsed: Record<string, TaskDefinition> = {};
    const allErrors: ValidationError[] = [];

    for (const [name, config] of Object.entries(tasks)) {
      const task = this.parseTask(name, config);
      if (task) {
        parsed[name] = task;
      } else {
        allErrors.push(...this.errors);
      }
    }

    if (allErrors.length > 0) {
      throw new TaskParseError('Failed to parse tasks', allErrors);
    }

    return parsed;
  }

  /**
   * Validate a task definition
   */
  private validateTaskDefinition(name: string, task: TaskDefinition): void {
    const path = `tasks.${name}`;

    // Must have either command, steps, or script
    if (!task.command && !task.steps && !task.script) {
      this.addError(path, 'Task must have either command, steps, or script');
    }

    // Cannot have both command and steps
    if (task.command && task.steps) {
      this.addError(path, 'Task cannot have both command and steps');
    }

    // Validate parameters
    if (task.params) {
      this.validateParameters(path, task.params);
    }

    // Validate steps
    if (task.steps) {
      this.validateSteps(path, task.steps);
    }

    // Validate parallel execution options
    if (task.parallel && task.maxConcurrent !== undefined) {
      if (task.maxConcurrent < 1) {
        this.addError(`${path}.maxConcurrent`, 'Must be at least 1');
      }
    }

    // Validate cache configuration
    if (task.cache) {
      if (!task.cache.key) {
        this.addError(`${path}.cache`, 'Cache key is required');
      }
      if (task.cache.ttl !== undefined && task.cache.ttl < 0) {
        this.addError(`${path}.cache.ttl`, 'TTL must be positive');
      }
    }

    // Validate timeout
    if (task.timeout !== undefined) {
      const timeout = this.parseTimeout(task.timeout);
      if (timeout < 0) {
        this.addError(`${path}.timeout`, 'Timeout must be positive');
      }
    }
  }

  /**
   * Validate task parameters
   */
  private validateParameters(path: string, params: TaskParameter[]): void {
    const names = new Set<string>();

    params.forEach((param, index) => {
      const paramPath = `${path}.params[${index}]`;

      // Check for duplicate names
      if (names.has(param.name)) {
        this.addError(paramPath, `Duplicate parameter name: ${param.name}`);
      }
      names.add(param.name);

      // Validate parameter type
      if (param.type) {
        const validTypes = ['string', 'number', 'boolean', 'array', 'enum'];
        if (!validTypes.includes(param.type)) {
          this.addError(`${paramPath}.type`, `Invalid type: ${param.type}`);
        }
      }

      // Validate enum values
      if (param.type === 'enum' && !param.values) {
        this.addError(paramPath, 'Enum type requires values array');
      }

      // Validate pattern for string type
      if (param.pattern && param.type && param.type !== 'string') {
        this.addError(paramPath, 'Pattern can only be used with string type');
      }

      // Validate min/max for number type
      if ((param.min !== undefined || param.max !== undefined) && param.type !== 'number') {
        this.addError(paramPath, 'Min/max can only be used with number type');
      }

      // Validate array constraints
      if ((param.minItems !== undefined || param.maxItems !== undefined) && param.type !== 'array') {
        this.addError(paramPath, 'minItems/maxItems can only be used with array type');
      }

      // Validate default value type
      if (param.default !== undefined && param.type) {
        this.validateDefaultValue(paramPath, param);
      }
    });
  }

  /**
   * Validate task steps
   */
  private validateSteps(path: string, steps: TaskStep[]): void {
    steps.forEach((step, index) => {
      const stepPath = `${path}.steps[${index}]`;

      // Must have command, task, or script
      if (!step.command && !step.task && !step.script) {
        this.addError(stepPath, 'Step must have command, task, or script');
      }

      // Cannot have multiple execution types
      const execTypes = [step.command, step.task, step.script].filter(Boolean).length;
      if (execTypes > 1) {
        this.addError(stepPath, 'Step can only have one of: command, task, or script');
      }

      // Validate targets
      if (step.target && step.targets) {
        this.addError(stepPath, 'Step cannot have both target and targets');
      }

      // Validate error handling
      if (step.onFailure && typeof step.onFailure === 'object') {
        const handler = step.onFailure as any;
        if (handler.retry !== undefined && handler.retry < 0) {
          this.addError(`${stepPath}.onFailure.retry`, 'Retry count must be positive');
        }
      }

      // Validate conditional execution
      if (step.when) {
        // Basic validation - just check it's not empty
        if (step.when.trim() === '') {
          this.addError(`${stepPath}.when`, 'Condition cannot be empty');
        }
      }
    });
  }

  /**
   * Validate parameter default value matches type
   */
  private validateDefaultValue(path: string, param: TaskParameter): void {
    const { type, default: defaultValue } = param;

    switch (type) {
      case 'string':
        if (typeof defaultValue !== 'string') {
          this.addError(`${path}.default`, 'Default must be a string');
        }
        break;

      case 'number':
        if (typeof defaultValue !== 'number') {
          this.addError(`${path}.default`, 'Default must be a number');
        }
        break;

      case 'boolean':
        if (typeof defaultValue !== 'boolean') {
          this.addError(`${path}.default`, 'Default must be a boolean');
        }
        break;

      case 'array':
        if (!Array.isArray(defaultValue)) {
          this.addError(`${path}.default`, 'Default must be an array');
        }
        break;

      case 'enum':
        if (param.values && !param.values.includes(defaultValue)) {
          this.addError(`${path}.default`, 'Default must be one of the allowed values');
        }
        break;
    }
  }

  /**
   * Parse timeout string to milliseconds
   */
  private parseTimeout(timeout: string | number): number {
    if (typeof timeout === 'number') {
      return timeout;
    }

    const match = timeout.match(/^(\d+)(ms|s|m|h)?$/);
    if (!match) {
      return -1;
    }

    const value = parseInt(match[1] || '0', 10);
    const unit = match[2] || 'ms';

    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        return -1;
    }
  }

  /**
   * Add validation error
   */
  private addError(path: string, message: string, value?: any): void {
    this.errors.push({ path, message, value });
  }

  /**
   * Get validation errors
   */
  getErrors(): ValidationError[] {
    return [...this.errors];
  }

  /**
   * Validate parameters provided for task execution
   * Returns array of error messages
   */
  validateParams(task: TaskDefinition, providedParams: Record<string, any>): string[] {
    const errors: string[] = [];

    if (!task.params) {
      return errors;
    }

    for (const param of task.params) {
      // Check required parameters
      if (param.required && !(param.name in providedParams)) {
        errors.push(`Required parameter '${param.name}' is missing`);
      }

      // Validate provided parameters
      if (param.name in providedParams) {
        const value = providedParams[param.name];

        // Type validation
        if (param.type === 'number' && typeof value !== 'number' && typeof value !== 'string') {
          errors.push(`Parameter '${param.name}' must be a number`);
        }

        if (param.type === 'boolean' && typeof value !== 'boolean' && typeof value !== 'string') {
          errors.push(`Parameter '${param.name}' must be a boolean`);
        }

        if (param.type === 'array' && !Array.isArray(value) && typeof value !== 'string') {
          errors.push(`Parameter '${param.name}' must be an array`);
        }

        if (param.type === 'enum' && param.values) {
          const strValue = String(value);
          if (!param.values.includes(strValue)) {
            errors.push(`Parameter '${param.name}' must be one of: ${param.values.join(', ')}`);
          }
        }
      }
    }

    return errors;
  }

  /**
   * Parse and coerce parameter values for task execution
   * Returns parsed parameters with proper types
   */
  parseParams(task: TaskDefinition, providedParams: Record<string, any>): Record<string, any> {
    const parsed: Record<string, any> = {};

    if (!task.params) {
      return providedParams;
    }

    // First, apply defaults for missing parameters
    for (const param of task.params) {
      if (!(param.name in providedParams) && param.default !== undefined) {
        parsed[param.name] = param.default;
      }
    }

    // Then, parse provided parameters
    for (const [name, value] of Object.entries(providedParams)) {
      const param = task.params.find(p => p.name === name);

      if (!param || !param.type) {
        parsed[name] = value;
        continue;
      }

      // Coerce types
      switch (param.type) {
        case 'number':
          if (typeof value === 'string') {
            parsed[name] = parseFloat(value);
          } else {
            parsed[name] = value;
          }
          break;

        case 'boolean':
          if (typeof value === 'string') {
            parsed[name] = value === 'true' || value === '1' || value === 'yes';
          } else {
            parsed[name] = !!value;
          }
          break;

        case 'array':
          if (typeof value === 'string') {
            parsed[name] = value.split(',').map(v => v.trim());
          } else if (Array.isArray(value)) {
            parsed[name] = value;
          } else {
            parsed[name] = [value];
          }
          break;

        default:
          parsed[name] = value;
      }
    }

    return parsed;
  }
}

/**
 * Task parse error with validation details
 */
export class TaskParseError extends Error {
  constructor(message: string, public errors: ValidationError[]) {
    super(message);
    this.name = 'TaskParseError';
  }
}

/**
 * Create a task parser instance
 */
export function createTaskParser(): TaskParser {
  return new TaskParser();
}