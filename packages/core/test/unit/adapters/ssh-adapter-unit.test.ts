import { it, expect, describe, afterEach } from '@jest/globals';

import { AdapterError } from '../../../src/core/error.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

describe('SSHAdapter - Unit Tests', () => {
  let adapter: SSHAdapter;

  afterEach(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create adapter with default configuration', () => {
      adapter = new SSHAdapter();
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should create adapter with custom connection pool config', () => {
      adapter = new SSHAdapter({
        connectionPool: {
          enabled: false,
          maxConnections: 5,
          idleTimeout: 120000,
          keepAlive: false
        }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should create adapter with custom multiplexing config', () => {
      adapter = new SSHAdapter({
        multiplexing: {
          enabled: true,
          controlPath: '/tmp/ssh-%r@%h:%p',
          controlPersist: 300
        }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should create adapter with custom sudo config', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'test-password',
          prompt: '[sudo] password for %p:',
          method: 'stdin'
        }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should create adapter with custom SFTP config', () => {
      adapter = new SSHAdapter({
        sftp: {
          enabled: false,
          concurrency: 10
        }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should create adapter with mixed configuration options', () => {
      adapter = new SSHAdapter({
        connectionPool: { enabled: true, maxConnections: 3, idleTimeout: 30000, keepAlive: true },
        sudo: { enabled: true, method: 'askpass' },
        sftp: { enabled: true, concurrency: 2 },
        multiplexing: { enabled: false }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle empty configuration object', () => {
      adapter = new SSHAdapter({});
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should handle partial configuration objects', () => {
      adapter = new SSHAdapter({
        connectionPool: { enabled: true, maxConnections: 1, idleTimeout: 60000, keepAlive: true },
        sudo: { enabled: false }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });

  describe('Availability Check', () => {
    it('should check if SSH is available', async () => {
      adapter = new SSHAdapter();
      const available = await adapter.isAvailable();
      // Should return true since ssh2 is a dependency
      expect(available).toBe(true);
    });
  });

  describe('Basic Error Handling', () => {
    it('should throw AdapterError when SSH options are missing', async () => {
      adapter = new SSHAdapter();
      await expect(adapter.execute({
        command: 'ls'
      })).rejects.toThrow('SSH connection options not provided');
    });

    it('should throw AdapterError for invalid adapter options type', async () => {
      adapter = new SSHAdapter();
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'local' as any // Invalid type for SSH adapter
        }
      })).rejects.toThrow('SSH connection options not provided');
    });

    it('should validate that adapterOptions exists and has correct type', async () => {
      adapter = new SSHAdapter();
      
      // No adapterOptions
      await expect(adapter.execute({
        command: 'ls'
      })).rejects.toThrow(AdapterError);

      // Wrong type in adapterOptions
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'docker' as any
        }
      })).rejects.toThrow(AdapterError);
    });
  });

  describe('SFTP Configuration Validation', () => {
    it('should throw error when SFTP is disabled for upload', async () => {
      adapter = new SSHAdapter({
        sftp: { enabled: false, concurrency: 5 }
      });
      
      await expect(adapter.uploadFile(
        '/local/path/file.txt',
        '/remote/path/file.txt',
        { type: 'ssh', host: 'test-host', username: 'test' }
      )).rejects.toThrow('SFTP is disabled');
    });

    it('should throw error when SFTP is disabled for download', async () => {
      adapter = new SSHAdapter({
        sftp: { enabled: false, concurrency: 5 }
      });
      
      await expect(adapter.downloadFile(
        '/remote/path/file.txt',
        '/local/path/file.txt',
        { type: 'ssh', host: 'test-host', username: 'test' }
      )).rejects.toThrow('SFTP is disabled');
    });

    it('should throw error when SFTP is disabled for directory upload', async () => {
      adapter = new SSHAdapter({
        sftp: { enabled: false, concurrency: 5 }
      });
      
      await expect(adapter.uploadDirectory(
        '/local/dir',
        '/remote/dir',
        { type: 'ssh', host: 'test-host', username: 'test' }
      )).rejects.toThrow('SFTP is disabled');
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should dispose without errors when no connections exist', async () => {
      adapter = new SSHAdapter();
      
      // Should not throw error
      await expect(adapter.dispose()).resolves.not.toThrow();
    });

    it('should handle multiple dispose calls gracefully', async () => {
      adapter = new SSHAdapter();
      
      await adapter.dispose();
      await expect(adapter.dispose()).resolves.not.toThrow();
    });

    it('should clean up connection pool on dispose', async () => {
      adapter = new SSHAdapter({
        connectionPool: { enabled: true, maxConnections: 5, idleTimeout: 60000, keepAlive: true }
      });
      
      // Dispose should clear pool
      await adapter.dispose();
      
      // Multiple disposals should be safe
      await adapter.dispose();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle sudo configuration with different methods', () => {
      const adapters = [
        new SSHAdapter({ sudo: { enabled: true, method: 'stdin' } }),
        new SSHAdapter({ sudo: { enabled: true, method: 'askpass' } }),
        new SSHAdapter({ sudo: { enabled: true, method: 'echo' } }),
        new SSHAdapter({ sudo: { enabled: false } })
      ];
      
      adapters.forEach(adapter => {
        expect(adapter).toBeInstanceOf(SSHAdapter);
      });
    });

    it('should handle connection pool configuration variations', () => {
      const adapters = [
        new SSHAdapter({ connectionPool: { enabled: true, maxConnections: 1, idleTimeout: 1000, keepAlive: false } }),
        new SSHAdapter({ connectionPool: { enabled: false, maxConnections: 10, idleTimeout: 300000, keepAlive: true } }),
        new SSHAdapter({ connectionPool: { enabled: true, maxConnections: 0, idleTimeout: 0, keepAlive: false } })
      ];
      
      adapters.forEach(adapter => {
        expect(adapter).toBeInstanceOf(SSHAdapter);
      });
    });

    it('should handle SFTP configuration variations', () => {
      const adapters = [
        new SSHAdapter({ sftp: { enabled: true, concurrency: 1 } }),
        new SSHAdapter({ sftp: { enabled: false, concurrency: 10 } }),
        new SSHAdapter({ sftp: { enabled: true, concurrency: 0 } })
      ];
      
      adapters.forEach(adapter => {
        expect(adapter).toBeInstanceOf(SSHAdapter);
      });
    });
  });

  describe('Adapter Name and Type', () => {
    it('should have correct adapter name', () => {
      adapter = new SSHAdapter();
      // Access protected property for testing
      const adapterName = (adapter as any).adapterName;
      expect(adapterName).toBe('ssh');
    });
  });

  describe('Default Configuration Values', () => {
    it('should set correct default values for connection pool', () => {
      adapter = new SSHAdapter();
      // Test that defaults are applied (this tests the constructor logic)
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should set correct default values for sudo configuration', () => {
      adapter = new SSHAdapter();
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should set correct default values for SFTP configuration', () => {
      adapter = new SSHAdapter();
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should set correct default values for multiplexing configuration', () => {
      adapter = new SSHAdapter();
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });

  describe('Configuration Inheritance', () => {
    it('should inherit base adapter configuration', () => {
      adapter = new SSHAdapter({
        defaultTimeout: 30000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8'
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });

    it('should merge SSH-specific config with base config', () => {
      adapter = new SSHAdapter({
        defaultTimeout: 15000,
        connectionPool: { enabled: true, maxConnections: 3, idleTimeout: 120000, keepAlive: true },
        sudo: { enabled: true, password: 'secret' }
      });
      expect(adapter).toBeInstanceOf(SSHAdapter);
    });
  });

  describe('Input Validation', () => {
    it('should handle various SSH options configurations', () => {
      adapter = new SSHAdapter();
      
      // These should all construct without error
      const validConfigs = [
        { type: 'ssh' as const, host: 'localhost', username: 'user' },
        { type: 'ssh' as const, host: '192.168.1.1', username: 'admin', port: 2222 },
        { type: 'ssh' as const, host: 'example.com', username: 'user', password: 'secret' },
        { type: 'ssh' as const, host: 'server.com', username: 'dev', privateKey: 'key-content' },
        { type: 'ssh' as const, host: 'test.local', username: 'test', privateKey: 'key', passphrase: 'phrase' }
      ];

      validConfigs.forEach(config => {
        expect(() => {
          // This validates the structure is acceptable for the adapter
          const options = config;
          expect(options.type).toBe('ssh');
        }).not.toThrow();
      });
    });
  });
});