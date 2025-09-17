import { it, expect, describe } from '@jest/globals';

import {
  DockerError,
  CommandError,
  TimeoutError,
  AdapterError,
  ExecutionError,
  ConnectionError
} from '../../../src/core/error.js';

describe('Error classes', () => {
  describe('ExecutionError', () => {
    it('should create with message, code and details', () => {
      const error = new ExecutionError(
        'Test error message',
        'TEST_ERROR',
        { foo: 'bar', count: 42 }
      );

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ foo: 'bar', count: 42 });
      expect(error.name).toBe('ExecutionError');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExecutionError);
    });
  });

  describe('CommandError', () => {
    it('should create with all command details', () => {
      const error = new CommandError(
        'echo "failed"',
        127,
        'SIGTERM',
        'output text',
        'error text',
        1500
      );

      expect(error.message).toBe('Command failed with exit code 127: echo "failed"');
      expect(error.code).toBe('COMMAND_FAILED');
      expect(error.command).toBe('echo "failed"');
      expect(error.exitCode).toBe(127);
      expect(error.signal).toBe('SIGTERM');
      expect(error.stdout).toBe('output text');
      expect(error.stderr).toBe('error text');
      expect(error.duration).toBe(1500);
      expect(error.name).toBe('CommandError');
    });

    it('should handle undefined signal', () => {
      const error = new CommandError('', 1, undefined, '', 'error', 100);
      expect(error.message).toBe('Command failed with exit code 1: ');
    });
  });

  describe('ConnectionError', () => {
    it('should create connection error with host and error', () => {
      const originalError = new Error('Connection refused');
      const error = new ConnectionError('example.com:22', originalError);

      expect(error.message).toBe('Failed to connect to example.com:22: Connection refused');
      expect(error.code).toBe('CONNECTION_FAILED');
      expect(error.host).toBe('example.com:22');
      expect(error.name).toBe('ConnectionError');
    });

    it('should handle error without message', () => {
      const originalError = new Error();
      const error = new ConnectionError('localhost:8080', originalError);
      expect(error.message).toBe('Failed to connect to localhost:8080: ');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error', () => {
      const error = new TimeoutError('ls -la', 5000);

      expect(error.message).toBe('Command timed out after 5000ms: ls -la');
      expect(error.code).toBe('TIMEOUT');
      expect(error.command).toBe('ls -la');
      expect(error.timeout).toBe(5000);
      expect(error.name).toBe('TimeoutError');
    });
  });

  describe('DockerError', () => {
    it('should create docker error', () => {
      const originalError = new Error('Container not found');
      const error = new DockerError('my-container', 'exec', originalError);

      expect(error.message).toBe("Docker operation 'exec' failed for container my-container: Container not found");
      expect(error.code).toBe('DOCKER_ERROR');
      expect(error.container).toBe('my-container');
      expect(error.operation).toBe('exec');
      expect(error.name).toBe('DockerError');
    });
  });

  describe('AdapterError', () => {
    it('should create adapter error with original error', () => {
      const originalError = new Error('SSH adapter not available');
      const error = new AdapterError('ssh', 'connect', originalError);

      expect(error.message).toBe("Adapter 'ssh' failed during 'connect': SSH adapter not available");
      expect(error.code).toBe('ADAPTER_ERROR');
      expect(error.adapter).toBe('ssh');
      expect(error.operation).toBe('connect');
      expect(error.name).toBe('AdapterError');
    });

    it('should create adapter error without original error', () => {
      const error = new AdapterError('docker', 'execute');

      expect(error.message).toBe("Adapter 'docker' failed during 'execute'");
      expect(error.code).toBe('ADAPTER_ERROR');
      expect(error.adapter).toBe('docker');
      expect(error.operation).toBe('execute');
      expect(error.name).toBe('AdapterError');
    });
  });

  describe('Error inheritance', () => {
    it('should all extend ExecutionError', () => {
      const commandError = new CommandError('test', 1, undefined, '', '', 100);
      const connectionError = new ConnectionError('host', new Error());
      const timeoutError = new TimeoutError('cmd', 1000);
      const dockerError = new DockerError('container', 'run', new Error());
      const adapterError = new AdapterError('local', 'execute');

      expect(commandError).toBeInstanceOf(ExecutionError);
      expect(connectionError).toBeInstanceOf(ExecutionError);
      expect(timeoutError).toBeInstanceOf(ExecutionError);
      expect(dockerError).toBeInstanceOf(ExecutionError);
      expect(adapterError).toBeInstanceOf(ExecutionError);
    });

    it('should all extend Error', () => {
      const errors = [
        new ExecutionError('test', 'TEST'),
        new CommandError('cmd', 1, undefined, '', '', 100),
        new ConnectionError('host', new Error()),
        new TimeoutError('cmd', 1000),
        new DockerError('container', 'run', new Error()),
        new AdapterError('local', 'execute')
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(Error);
        expect(error.stack).toBeDefined();
      });
    });
  });
});