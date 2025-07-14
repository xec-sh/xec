import { it, expect, describe } from 'vitest';

import {
  XecError,
  TaskError,
  LockError,
  StateError,
  ModuleError,
  isXecError,
  isTaskError,
  ContextError,
  TimeoutError,
  PatternError,
  NetworkError,
  ExecutionError,
  InventoryError,
  ValidationError,
  DependencyError,
  isExecutionError,
  NotificationError,
  isValidationError,
  ConfigurationError
} from '../../../src/core/errors.js';

describe('XecError', () => {
  it('should create a base error with code and details', () => {
    const error = new XecError('Test error', 'TEST_CODE', { foo: 'bar' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(XecError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.name).toBe('XecError');
  });

  it('should work without details', () => {
    const error = new XecError('Test error', 'TEST_CODE');

    expect(error.details).toBeUndefined();
  });

  it('should have proper stack trace', () => {
    const error = new XecError('Test error', 'TEST_CODE');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('XecError');
  });
});

describe('TaskError', () => {
  it('should create a task error with all properties', () => {
    const error = new TaskError('Task failed', 'task-123', 'execution', { attempts: 3 });

    expect(error).toBeInstanceOf(XecError);
    expect(error.code).toBe('TASK_ERROR');
    expect(error.taskId).toBe('task-123');
    expect(error.phase).toBe('execution');
    expect(error.details).toEqual({ taskId: 'task-123', phase: 'execution', attempts: 3 });
  });

  it('should work without phase and details', () => {
    const error = new TaskError('Task failed', 'task-123');

    expect(error.phase).toBeUndefined();
    expect(error.details).toEqual({ taskId: 'task-123', phase: undefined });
  });
});

describe('ValidationError', () => {
  it('should create validation error with field and value', () => {
    const error = new ValidationError('Invalid value', 'email', 'not-an-email');

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.field).toBe('email');
    expect(error.value).toBe('not-an-email');
    expect(error.details).toEqual({ field: 'email', value: 'not-an-email' });
  });

  it('should handle complex values', () => {
    const complexValue = { nested: { data: [1, 2, 3] } };
    const error = new ValidationError('Invalid structure', 'config', complexValue);

    expect(error.value).toEqual(complexValue);
  });

  it('should work without field and value', () => {
    const error = new ValidationError('General validation error');

    expect(error.field).toBeUndefined();
    expect(error.value).toBeUndefined();
  });
});

describe('ExecutionError', () => {
  it('should create execution error with all properties', () => {
    const error = new ExecutionError(
      'Command failed',
      'npm install',
      1,
      'Package not found',
      { duration: 1500 }
    );

    expect(error.code).toBe('EXECUTION_ERROR');
    expect(error.command).toBe('npm install');
    expect(error.exitCode).toBe(1);
    expect(error.stderr).toBe('Package not found');
    expect(error.details).toEqual({
      command: 'npm install',
      exitCode: 1,
      stderr: 'Package not found',
      duration: 1500
    });
  });

  it('should handle missing optional properties', () => {
    const error = new ExecutionError('Execution failed');

    expect(error.command).toBeUndefined();
    expect(error.exitCode).toBeUndefined();
    expect(error.stderr).toBeUndefined();
  });
});

describe('ContextError', () => {
  it('should create context error', () => {
    const error = new ContextError('Context not found', { contextId: 'ctx-123' });

    expect(error.code).toBe('CONTEXT_ERROR');
    expect(error.details).toEqual({ contextId: 'ctx-123' });
  });
});

describe('DependencyError', () => {
  it('should create dependency error with missing dependencies', () => {
    const error = new DependencyError(
      'Dependencies not met',
      'task-456',
      ['task-123', 'task-789'],
      { phase: 'pre-execution' }
    );

    expect(error.code).toBe('DEPENDENCY_ERROR');
    expect(error.taskId).toBe('task-456');
    expect(error.missingDependencies).toEqual(['task-123', 'task-789']);
    expect(error.details).toEqual({
      taskId: 'task-456',
      missingDependencies: ['task-123', 'task-789'],
      phase: 'pre-execution'
    });
  });

  it('should handle empty dependencies array', () => {
    const error = new DependencyError('No dependencies', 'task-1', []);

    expect(error.missingDependencies).toEqual([]);
  });
});

describe('TimeoutError', () => {
  it('should create timeout error', () => {
    const error = new TimeoutError('Task timed out', 'task-999', 30000, { retries: 2 });

    expect(error.code).toBe('TIMEOUT_ERROR');
    expect(error.taskId).toBe('task-999');
    expect(error.timeout).toBe(30000);
    expect(error.details).toEqual({
      taskId: 'task-999',
      timeout: 30000,
      retries: 2
    });
  });
});

describe('InventoryError', () => {
  it('should create inventory error with host', () => {
    const error = new InventoryError('Host not found', 'web-server-01', { group: 'web' });

    expect(error.code).toBe('INVENTORY_ERROR');
    expect(error.host).toBe('web-server-01');
    expect(error.details).toEqual({ host: 'web-server-01', group: 'web' });
  });

  it('should work without host', () => {
    const error = new InventoryError('Invalid inventory file');

    expect(error.host).toBeUndefined();
  });
});

describe('ModuleError', () => {
  it('should create module error', () => {
    const error = new ModuleError('Module not found', 'custom-module', { path: '/modules' });

    expect(error.code).toBe('MODULE_ERROR');
    expect(error.moduleName).toBe('custom-module');
    expect(error.details).toEqual({ moduleName: 'custom-module', path: '/modules' });
  });
});

describe('StateError', () => {
  it('should create state error with operation', () => {
    const error = new StateError('State corrupted', 'save', { stateId: 'state-123' });

    expect(error.code).toBe('STATE_ERROR');
    expect(error.operation).toBe('save');
    expect(error.details).toEqual({ operation: 'save', stateId: 'state-123' });
  });

  it('should work without operation', () => {
    const error = new StateError('Invalid state');

    expect(error.operation).toBeUndefined();
  });
});

describe('LockError', () => {
  it('should create lock error with all properties', () => {
    const error = new LockError(
      'Lock already held',
      'resource-lock-123',
      'process-456',
      { timeout: 5000 }
    );

    expect(error.code).toBe('LOCK_ERROR');
    expect(error.lockId).toBe('resource-lock-123');
    expect(error.holder).toBe('process-456');
    expect(error.details).toEqual({
      lockId: 'resource-lock-123',
      holder: 'process-456',
      timeout: 5000
    });
  });

  it('should work without holder', () => {
    const error = new LockError('Lock failed', 'lock-789');

    expect(error.holder).toBeUndefined();
  });
});

describe('NotificationError', () => {
  it('should create notification error', () => {
    const error = new NotificationError(
      'Failed to send notification',
      'slack',
      { channel: '#alerts' }
    );

    expect(error.code).toBe('NOTIFICATION_ERROR');
    expect(error.service).toBe('slack');
    expect(error.details).toEqual({ service: 'slack', channel: '#alerts' });
  });
});

describe('PatternError', () => {
  it('should create pattern error', () => {
    const error = new PatternError(
      'Pattern execution failed',
      'blue-green-deploy',
      { stage: 'rollback' }
    );

    expect(error.code).toBe('PATTERN_ERROR');
    expect(error.pattern).toBe('blue-green-deploy');
    expect(error.details).toEqual({ pattern: 'blue-green-deploy', stage: 'rollback' });
  });
});

describe('ConfigurationError', () => {
  it('should create configuration error with path', () => {
    const error = new ConfigurationError(
      'Invalid configuration',
      '/etc/xec/config.yaml',
      { line: 42 }
    );

    expect(error.code).toBe('CONFIGURATION_ERROR');
    expect(error.configPath).toBe('/etc/xec/config.yaml');
    expect(error.details).toEqual({ configPath: '/etc/xec/config.yaml', line: 42 });
  });

  it('should work without config path', () => {
    const error = new ConfigurationError('Missing required configuration');

    expect(error.configPath).toBeUndefined();
  });
});

describe('NetworkError', () => {
  it('should create network error with all properties', () => {
    const error = new NetworkError(
      'Request failed',
      'https://api.example.com/deploy',
      500,
      { method: 'POST' }
    );

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.url).toBe('https://api.example.com/deploy');
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({
      url: 'https://api.example.com/deploy',
      statusCode: 500,
      method: 'POST'
    });
  });

  it('should handle missing optional properties', () => {
    const error = new NetworkError('Network timeout');

    expect(error.url).toBeUndefined();
    expect(error.statusCode).toBeUndefined();
  });
});

describe('Error type guards', () => {
  describe('isXecError', () => {
    it('should correctly identify XecError instances', () => {
      const xecError = new XecError('test', 'TEST');
      const taskError = new TaskError('test', 'task-1');
      const regularError = new Error('test');

      expect(isXecError(xecError)).toBe(true);
      expect(isXecError(taskError)).toBe(true);
      expect(isXecError(regularError)).toBe(false);
      expect(isXecError(null)).toBe(false);
      expect(isXecError(undefined)).toBe(false);
      expect(isXecError('string')).toBe(false);
    });
  });

  describe('isTaskError', () => {
    it('should correctly identify TaskError instances', () => {
      const taskError = new TaskError('test', 'task-1');
      const xecError = new XecError('test', 'TEST');
      const regularError = new Error('test');

      expect(isTaskError(taskError)).toBe(true);
      expect(isTaskError(xecError)).toBe(false);
      expect(isTaskError(regularError)).toBe(false);
      expect(isTaskError(null)).toBe(false);
    });
  });

  describe('isValidationError', () => {
    it('should correctly identify ValidationError instances', () => {
      const validationError = new ValidationError('test');
      const xecError = new XecError('test', 'TEST');

      expect(isValidationError(validationError)).toBe(true);
      expect(isValidationError(xecError)).toBe(false);
      expect(isValidationError(new Error())).toBe(false);
    });
  });

  describe('isExecutionError', () => {
    it('should correctly identify ExecutionError instances', () => {
      const executionError = new ExecutionError('test');
      const xecError = new XecError('test', 'TEST');

      expect(isExecutionError(executionError)).toBe(true);
      expect(isExecutionError(xecError)).toBe(false);
      expect(isExecutionError({})).toBe(false);
    });
  });
});

describe('Error inheritance', () => {
  it('all error types should inherit from XecError', () => {
    const errors = [
      new TaskError('test', 'task-1'),
      new ValidationError('test'),
      new ExecutionError('test'),
      new ContextError('test'),
      new DependencyError('test', 'task-1', []),
      new TimeoutError('test', 'task-1', 1000),
      new InventoryError('test'),
      new ModuleError('test', 'module'),
      new StateError('test'),
      new LockError('test', 'lock-1'),
      new NotificationError('test', 'service'),
      new PatternError('test', 'pattern'),
      new ConfigurationError('test'),
      new NetworkError('test')
    ];

    errors.forEach(error => {
      expect(error).toBeInstanceOf(XecError);
      expect(error).toBeInstanceOf(Error);
      expect(isXecError(error)).toBe(true);
    });
  });
});

describe('Error serialization', () => {
  it('should be serializable to JSON', () => {
    const error = new TaskError('Task failed', 'task-123', 'execution', {
      attempts: 3,
      metadata: { user: 'admin' }
    });

    const serialized = JSON.stringify({
      message: error.message,
      code: error.code,
      taskId: error.taskId,
      phase: error.phase,
      details: error.details,
      name: error.name
    });

    const parsed = JSON.parse(serialized);

    expect(parsed.message).toBe('Task failed');
    expect(parsed.code).toBe('TASK_ERROR');
    expect(parsed.taskId).toBe('task-123');
    expect(parsed.phase).toBe('execution');
    expect(parsed.details.attempts).toBe(3);
    expect(parsed.details.metadata.user).toBe('admin');
  });
});