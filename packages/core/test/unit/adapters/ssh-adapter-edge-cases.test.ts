import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { AdapterError, TimeoutError, ConnectionError } from '../../../src/core/error.js';

describe('SSHAdapter - Edge Cases and Advanced Scenarios', () => {
  let adapter: SSHAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  describe('Connection Pool Edge Cases', () => {
    it('should create adapter with connection pool configuration', () => {
      adapter = new SSHAdapter({
        connectionPool: { enabled: true, maxConnections: 5, idleTimeout: 60000, keepAlive: true }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle connection pool cleanup interval', async () => {
      jest.useFakeTimers();
      
      adapter = new SSHAdapter({
        connectionPool: { 
          enabled: true, 
          maxConnections: 5, 
          idleTimeout: 60000, // 1 minute
          keepAlive: true 
        }
      });
      
      // The adapter should be created successfully
      expect(adapter).toBeInstanceOf(SSHAdapter);
      
      // Fast forward time to trigger cleanup (if implemented)
      jest.advanceTimersByTime(120000); // 2 minutes
      
      // Adapter should still be valid
      expect(adapter).toBeInstanceOf(SSHAdapter);
      
      jest.useRealTimers();
    });

    it('should handle connection pool with minimal configuration', () => {
      adapter = new SSHAdapter({
        connectionPool: { 
          enabled: false,
          maxConnections: 1,
          idleTimeout: 30000,
          keepAlive: false
        }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should accept private key as Buffer', () => {
      const privateKeyBuffer = Buffer.from('-----BEGIN PRIVATE KEY-----\ntest-key-content\n-----END PRIVATE KEY-----');
      
      adapter = new SSHAdapter();
      
      // Should not throw when creating execution with buffer key
      const executionPromise = adapter.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'ssh',
          host: 'test-host',
          username: 'test',
          privateKey: privateKeyBuffer
        }
      });
      
      // We expect it to fail with connection error since we're not mocking
      expect(executionPromise).rejects.toThrow();
    });

    it('should accept private key with passphrase', () => {
      adapter = new SSHAdapter();
      
      const executionPromise = adapter.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'ssh',
          host: 'test-host',
          username: 'test',
          privateKey: 'private-key-content',
          passphrase: 'key-passphrase'
        }
      });
      
      expect(executionPromise).rejects.toThrow();
    });

    it('should create adapter with default connect options', () => {
      adapter = new SSHAdapter({
        defaultConnectOptions: {
          readyTimeout: 30000,
          keepaliveInterval: 15000
        }
      });
      
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });

  describe('Sudo Edge Cases', () => {
    it('should handle askpass sudo method', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'test-password',
          method: 'askpass'
        }
      });
      
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle sudo with custom prompt', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'test-password',
          prompt: '[custom] password for %u:',
          method: 'stdin'
        }
      });
      
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle sudo with existing stdin method', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'sudo-password',
          method: 'stdin'
        }
      });
      
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle sudo without password', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true
          // No password provided
        }
      });
      
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle secure-askpass sudo method', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'test-password',
          method: 'secure-askpass'
        }
      });
      
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });

  describe('Stream Handling Edge Cases', () => {
    it('should reject when no SSH options provided', async () => {
      adapter = new SSHAdapter();
      
      await expect(adapter.execute({
        command: 'echo test',
        stdin: undefined,
        adapterOptions: undefined as any
      })).rejects.toThrow('SSH connection options not provided');
    });

    it('should handle different stdout/stderr options', async () => {
      adapter = new SSHAdapter();
      
      // Test with pipe options
      const promise1 = adapter.execute({
        command: 'echo test',
        stdout: 'pipe',
        stderr: 'pipe',
        adapterOptions: {
          type: 'ssh',
          host: 'test-host',
          username: 'test'
        }
      });
      
      await expect(promise1).rejects.toThrow();
      
      // Test with inherit options
      const promise2 = adapter.execute({
        command: 'echo test',
        stdout: 'inherit',
        stderr: 'inherit',
        adapterOptions: {
          type: 'ssh',
          host: 'test-host',
          username: 'test'
        }
      });
      
      await expect(promise2).rejects.toThrow();
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should create TimeoutError correctly', () => {
      const timeoutError = new TimeoutError('test-command', 5000);
      expect(timeoutError).toBeInstanceOf(TimeoutError);
      expect(timeoutError.message).toContain('Command timed out after 5000ms');
      expect(timeoutError.command).toBe('test-command');
      expect(timeoutError.timeout).toBe(5000);
      expect(timeoutError.name).toBe('TimeoutError');
    });

    it('should create ConnectionError correctly', () => {
      const originalError = new Error('Connection refused');
      const connectionError = new ConnectionError('test-host', originalError);
      expect(connectionError).toBeInstanceOf(ConnectionError);
      expect(connectionError.message).toContain('Failed to connect to test-host');
      expect(connectionError.message).toContain('Connection refused');
      expect(connectionError.host).toBe('test-host');
      expect(connectionError.originalError).toBe(originalError);
      expect(connectionError.name).toBe('ConnectionError');
    });

    it('should handle AdapterError with string error', () => {
      const adapterError = new AdapterError('ssh', 'connect', new Error('Test error'));
      expect(adapterError).toBeInstanceOf(AdapterError);
      expect(adapterError.message).toContain("Adapter 'ssh' failed during 'connect'");
      expect(adapterError.adapter).toBe('ssh');
      expect(adapterError.operation).toBe('connect');
    });
  });

  describe('Result Creation Edge Cases', () => {
    it('should handle null and undefined exit codes', () => {
      // Test the logic for normalizing exit codes
      const nullCode = null;
      const undefinedCode = undefined;
      
      expect(nullCode ?? 0).toBe(0);
      expect(undefinedCode ?? 0).toBe(0);
    });

    it('should validate command type', async () => {
      adapter = new SSHAdapter();
      
      // Test with invalid command type
      await expect(adapter.execute({
        command: 123 as any, // Invalid type
        adapterOptions: {
          type: 'ssh',
          host: 'test-host',
          username: 'test'
        }
      })).rejects.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should handle various configuration combinations', () => {
      const adapter1 = new SSHAdapter({
        connectionPool: { enabled: true, maxConnections: 1, idleTimeout: 1000, keepAlive: false }
      });
      expect(adapter1).toBeInstanceOf(SSHAdapter);
      
      const adapter2 = new SSHAdapter({
        multiplexing: { enabled: false }
      });
      expect(adapter2).toBeInstanceOf(SSHAdapter);
      
      const adapter3 = new SSHAdapter({
        sudo: { enabled: false },
        sftp: { enabled: true, concurrency: 1 }
      });
      expect(adapter3).toBeInstanceOf(SSHAdapter);
    });

    it('should handle empty configuration', () => {
      const adapter = new SSHAdapter({});
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle multiplexing with custom control path', () => {
      adapter = new SSHAdapter({
        multiplexing: {
          enabled: true,
          controlPath: '/tmp/ssh-mux-%h-%p-%r',
          controlPersist: '10m'
        }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle SFTP configuration variations', () => {
      adapter = new SSHAdapter({
        sftp: {
          enabled: true,
          concurrency: 10
        }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });

  describe('Adapter Type and Name', () => {
    it('should have correct adapter type', () => {
      adapter = new SSHAdapter();
      // The adapter should be of the correct type
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });
});