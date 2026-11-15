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
      if (!config.trim()) {
        this.addError(`tasks.${taskName}`, 'Command must be a non-empty string');
        return null;
      }
      return {
        command: config,
        description: `Execute: ${config}`,
      };
    }

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      this.addError(`tasks.${taskName}`, 'Task must be a command string or an object');
      return null;
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

    for (const [name, task] of Object.entries(tasks)) {
      if (typeof task !== 'object' || !Array.isArray(task?.steps)) continue;
      task.steps?.forEach((step, index) => {
        if (step?.task && !Object.hasOwn(tasks, step.task)) {
          allErrors.push({ path: `tasks.${name}.steps[${index}].task`, message: `Task '${step.task}' not found`, rule: 'error' });
        }
      });
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
    const known = new Set(['command', 'script', 'description', 'target', 'targets', 'params', 'steps',
      'env', 'workdir', 'timeout', 'parallel', 'failFast', 'maxConcurrent', 'onSuccess', 'onError', 'private',
      'hooks', 'emits', 'on', 'cache', 'schedule', 'template', 'dependsOn']);
    for (const key of Object.keys(task)) if (!known.has(key)) this.addError(`${path}.${key}`, 'Unknown task option');
    for (const key of ['parallel', 'failFast', 'private'] as const) {
      if (task[key] !== undefined && typeof task[key] !== 'boolean') this.addError(`${path}.${key}`, 'Must be a boolean');
    }
    this.validateEnvironment(`${path}.env`, task.env);
    this.validateString(`${path}.workdir`, task.workdir);
    this.validateTaskHandler(`${path}.onSuccess`, task.onSuccess);
    this.validateTaskHandler(`${path}.onError`, task.onError);
    if (task.parallel !== undefined && !task.steps) this.addError(`${path}.parallel`, 'parallel requires a pipeline task');
    if (task.failFast !== undefined && !task.steps) this.addError(`${path}.failFast`, 'failFast requires a pipeline task');
    if (task.maxConcurrent !== undefined && !task.parallel && !task.targets) this.addError(`${path}.maxConcurrent`, 'maxConcurrent requires parallel steps or command targets');


    for (const key of ['hooks', 'emits', 'on', 'cache', 'schedule', 'template', 'dependsOn'] as const) {
      if (Object.getOwnPropertyDescriptor(task, key)?.value !== undefined) this.addError(`${path}.${key}`, 'Unsupported task capability; use an explicit script or operation API');
    }
    for (const key of ['command', 'script'] as const) {
      if (task[key] !== undefined && (typeof task[key] !== 'string' || !task[key]!.trim())) {
        this.addError(`${path}.${key}`, 'Must be a non-empty string');
      }
    }
    if ([task.command, task.steps, task.script].filter(value => value !== undefined).length !== 1) {
      this.addError(path, 'Task must define exactly one of command, steps, or script');
    }
    this.validateTargets(path, task);
    if (task.targets && !task.command) this.addError(`${path}.targets`, 'Multiple targets require a command task');
    if (task.steps !== undefined && (!Array.isArray(task.steps) || task.steps.length === 0)) {
      this.addError(`${path}.steps`, 'Must be a non-empty array');
      return;
    }

    // Validate parameters
    if (task.params !== undefined) {
      if (!Array.isArray(task.params)) this.addError(`${path}.params`, 'Parameters must be an array');
      else this.validateParameters(path, task.params);
    }

    // Validate steps
    if (task.steps) {
      this.validateSteps(path, task.steps);
      if (task.parallel) {
        task.steps.forEach((step, index) => {
          if (!step || typeof step !== 'object') return;
          if (step.register) this.addError(`${path}.steps[${index}].register`, 'Parallel steps cannot register outputs for dependent steps');
          if (step.script) this.addError(`${path}.steps[${index}].script`, 'In-process scripts cannot run as parallel steps; use command tasks for process isolation');
        });
      }
    }

    // Validate parallel execution options
    if (task.maxConcurrent !== undefined) {
      if (!Number.isSafeInteger(task.maxConcurrent) || task.maxConcurrent < 1) {
        this.addError(`${path}.maxConcurrent`, 'Must be at least 1');
      }
    }

    // Validate timeout
    if (task.timeout !== undefined) {
      const timeout = this.parseTimeout(task.timeout);
      if (!Number.isSafeInteger(timeout) || timeout < 0) {
        this.addError(`${path}.timeout`, 'Timeout must be a non-negative integer in milliseconds');
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
      if (!param || typeof param !== 'object' || typeof param.name !== 'string' || !param.name) {
        this.addError(paramPath, 'Parameter must be an object with a non-empty name');
        return;
      }

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

      if (param.pattern) {
        try { new RegExp(param.pattern); }
        catch { this.addError(`${paramPath}.pattern`, 'Invalid regular expression'); }
      }
      if (param.min !== undefined && param.max !== undefined && param.min > param.max) {
        this.addError(paramPath, 'min cannot be greater than max');
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
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        this.addError(stepPath, 'Step must be an object');
        return;
      }
      const known = new Set(['name', 'command', 'task', 'script', 'target', 'targets', 'args', 'env',
        'when', 'onSuccess', 'onFailure', 'alwaysRun', 'register', 'parallel']);
      for (const key of Object.keys(step)) if (!known.has(key)) this.addError(`${stepPath}.${key}`, 'Unknown step option');
      if (step.onSuccess !== undefined && !['continue', 'abort'].includes(step.onSuccess)) this.addError(`${stepPath}.onSuccess`, 'Expected continue or abort');
      if (step.onFailure !== undefined && !(typeof step.onFailure === 'string' && ['continue', 'abort', 'ignore'].includes(step.onFailure)) &&
        (!step.onFailure || typeof step.onFailure !== 'object' || Array.isArray(step.onFailure))) {
        this.addError(`${stepPath}.onFailure`, 'Expected continue, abort, ignore, or a recovery object');
      }
      for (const key of ['command', 'task', 'script', 'register'] as const) this.validateString(`${stepPath}.${key}`, step[key]);
      this.validateEnvironment(`${stepPath}.env`, step.env);
      if (step.alwaysRun !== undefined && typeof step.alwaysRun !== 'boolean') this.addError(`${stepPath}.alwaysRun`, 'Must be a boolean');


      if (step.script && step.register) this.addError(`${stepPath}.register`, 'Script console output is not captured; register a command or nested command task');
      if (Object.getOwnPropertyDescriptor(step, 'parallel')?.value !== undefined) this.addError(`${stepPath}.parallel`, 'Set parallel on the containing task, not a step');
      this.validateTargets(stepPath, step);
      if (step.targets && !step.command) this.addError(`${stepPath}.targets`, 'Multiple targets require a command step');
      if (step.args !== undefined && (!step.script || !Array.isArray(step.args) || !step.args.every(arg => typeof arg === 'string'))) {
        this.addError(`${stepPath}.args`, 'args is an array of strings for a script step');
      }

      // Must have command, task, or script
      if (!step.command && !step.task && !step.script) {
        this.addError(stepPath, 'Step must have command, task, or script');
      }

      // Cannot have multiple execution types
      const execTypes = [step.command, step.task, step.script].filter(Boolean).length;
      if (execTypes > 1) {
        this.addError(stepPath, 'Step can only have one of: command, task, or script');
      }

      // Validate error handling
      if (step.onFailure && typeof step.onFailure === 'object' && !Array.isArray(step.onFailure)) {
        const handler = step.onFailure;
        if (step.targets) this.addError(`${stepPath}.onFailure`, 'Fan-out recovery needs explicit per-target tasks; it cannot fall back to local execution');
        for (const key of Object.keys(handler)) if (!['retry', 'delay', 'task', 'command'].includes(key)) this.addError(`${stepPath}.onFailure.${key}`, 'Unknown recovery option');
        if (handler.retry !== undefined && (!Number.isSafeInteger(handler.retry) || handler.retry < 0)) {
          this.addError(`${stepPath}.onFailure.retry`, 'Retry count must be a non-negative integer');
        }
        if (handler.retry && (!step.command || step.targets)) {
          this.addError(`${stepPath}.onFailure.retry`, 'Automatic retry requires one command on one target');
        }
        for (const key of ['task', 'command'] as const) this.validateString(`${stepPath}.onFailure.${key}`, handler[key]);
        const delay = handler.delay === undefined ? 0 : this.parseTimeout(handler.delay);
        if (!Number.isSafeInteger(delay) || delay < 0) {
          this.addError(`${stepPath}.onFailure.delay`, 'Invalid retry delay');
        }
        if (handler.task && handler.command) this.addError(`${stepPath}.onFailure`, 'Choose either a recovery task or command');
        if (handler.retry === undefined && !handler.command && !handler.task) this.addError(`${stepPath}.onFailure`, 'Empty error handler');
      }

      // Validate conditional execution
      if (step.when !== undefined && !['string', 'number', 'boolean'].includes(typeof step.when)) {
        this.addError(`${stepPath}.when`, 'Condition must be a boolean, number or expression string');
      }
      if (typeof step.when === 'string') {
        // Basic validation - just check it's not empty
        if (step.when.trim() === '') {
          this.addError(`${stepPath}.when`, 'Condition cannot be empty');
        }
      }
    });
  }

  private validateString(path: string, value: unknown): void {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) this.addError(path, 'Must be a non-empty string');
  }

  private validateEnvironment(path: string, value: unknown): void {
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.values(value).some(item => typeof item !== 'string'))) this.addError(path, 'Environment must be an object of string values');
  }

  private validateTaskHandler(path: string, value: unknown): void {
    if (value === undefined) return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.addError(path, 'Task handler must be an object with emit or command');
      return;
    }
    const handler = value as Record<string, unknown>;
    for (const key of Object.keys(handler)) if (!['emit', 'command'].includes(key)) this.addError(`${path}.${key}`, 'Unknown task handler option');
    if (handler['emit'] === undefined && handler['command'] === undefined) this.addError(path, 'Task handler must define emit or command');
    this.validateString(`${path}.emit`, handler['emit']);
    this.validateString(`${path}.command`, handler['command']);
  }

  /**
   * Validate explicit target selection before execution
   */
  private validateTargets(path: string, value: { target?: string; targets?: string[] }): void {
    if (value.target !== undefined && (typeof value.target !== 'string' || !value.target.trim())) {
      this.addError(`${path}.target`, 'Target must be a non-empty string');
    }
    if (value.target !== undefined && value.targets !== undefined) this.addError(path, 'Step or task cannot have both target and targets');
    if (value.targets !== undefined && (!Array.isArray(value.targets) || value.targets.length === 0 ||
      value.targets.some(ref => typeof ref !== 'string' || !ref.trim()) || new Set(value.targets).size !== value.targets.length)) {
      this.addError(`${path}.targets`, 'Targets must be a non-empty list of distinct target references');
    }
  }

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

      // The parameter type itself is validated separately; an unknown type is
      // already reported there, so it is not re-reported here.
      // no default
    }
  }

  /**
   * Parse timeout string to milliseconds
   */
  private parseTimeout(timeout: string | number): number {
    if (typeof timeout === 'number') {
      return timeout;
    }

    if (typeof timeout !== 'string') return -1;
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