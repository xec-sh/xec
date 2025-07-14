export class XecError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class TaskError extends XecError {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly phase?: string,
    details?: Record<string, any>
  ) {
    super(message, 'TASK_ERROR', { ...details, taskId, phase });
  }
}

export class ValidationError extends XecError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any,
    details?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', { ...details, field, value });
  }
}

export class ExecutionError extends XecError {
  constructor(
    message: string,
    public readonly command?: string,
    public readonly exitCode?: number,
    public readonly stderr?: string,
    details?: Record<string, any>
  ) {
    super(message, 'EXECUTION_ERROR', { ...details, command, exitCode, stderr });
  }
}

export class ContextError extends XecError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'CONTEXT_ERROR', details);
  }
}

export class DependencyError extends XecError {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly missingDependencies: string[],
    details?: Record<string, any>
  ) {
    super(message, 'DEPENDENCY_ERROR', { ...details, taskId, missingDependencies });
  }
}

export class TimeoutError extends XecError {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly timeout: number,
    details?: Record<string, any>
  ) {
    super(message, 'TIMEOUT_ERROR', { ...details, taskId, timeout });
  }
}

export class InventoryError extends XecError {
  constructor(
    message: string,
    public readonly host?: string,
    details?: Record<string, any>
  ) {
    super(message, 'INVENTORY_ERROR', { ...details, host });
  }
}

export class ModuleError extends XecError {
  constructor(
    message: string,
    public readonly moduleName: string,
    details?: Record<string, any>
  ) {
    super(message, 'MODULE_ERROR', { ...details, moduleName });
  }
}

export class StateError extends XecError {
  constructor(
    message: string,
    public readonly operation?: string,
    details?: Record<string, any>
  ) {
    super(message, 'STATE_ERROR', { ...details, operation });
  }
}

export class LockError extends XecError {
  constructor(
    message: string,
    public readonly lockId: string,
    public readonly holder?: string,
    details?: Record<string, any>
  ) {
    super(message, 'LOCK_ERROR', { ...details, lockId, holder });
  }
}

export class NotificationError extends XecError {
  constructor(
    message: string,
    public readonly service: string,
    details?: Record<string, any>
  ) {
    super(message, 'NOTIFICATION_ERROR', { ...details, service });
  }
}

export class PatternError extends XecError {
  constructor(
    message: string,
    public readonly pattern: string,
    details?: Record<string, any>
  ) {
    super(message, 'PATTERN_ERROR', { ...details, pattern });
  }
}

export class ConfigurationError extends XecError {
  constructor(
    message: string,
    public readonly configPath?: string,
    details?: Record<string, any>
  ) {
    super(message, 'CONFIGURATION_ERROR', { ...details, configPath });
  }
}

export class NetworkError extends XecError {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number,
    details?: Record<string, any>
  ) {
    super(message, 'NETWORK_ERROR', { ...details, url, statusCode });
  }
}

export class SecurityError extends XecError {
  constructor(
    message: string,
    public readonly resource?: string,
    public readonly action?: string,
    details?: Record<string, any>
  ) {
    super(message, 'SECURITY_ERROR', { ...details, resource, action });
  }
}

export function isXecError(error: unknown): error is XecError {
  return error instanceof XecError;
}

export function isTaskError(error: unknown): error is TaskError {
  return error instanceof TaskError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isExecutionError(error: unknown): error is ExecutionError {
  return error instanceof ExecutionError;
}