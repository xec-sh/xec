import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SSHAdapter } from '../../../src/adapters/ssh-adapter.js';
import { createMockSSHOptions } from '../../helpers/mock-factories.js';

describe('SSHAdapter', () => {
  let adapter: SSHAdapter;

  beforeEach(() => {
    jest.clearAllMocks();

    adapter = new SSHAdapter({
      connectionPool: { enabled: true, maxConnections: 5, idleTimeout: 60000, keepAlive: true }
    });
  });

  afterEach(() => {
    // Clean up adapter
    adapter.dispose();
  });

  describe('Availability', () => {
    it('should check if SSH is available based on ssh2 module', async () => {
      // This will actually check if ssh2 module exists
      const available = await adapter.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Basic command execution', () => {
    it('should fail without SSH options', async () => {
      await expect(adapter.execute({
        command: 'ls'
      })).rejects.toThrow('SSH connection options not provided');
    });

    it('should require valid SSH options', async () => {
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'ssh',
          host: '', // Invalid empty host
          username: ''
        }
      })).rejects.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should handle connection pool configuration', () => {
      const adapterWithPool = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 2,
          idleTimeout: 30000,
          keepAlive: false
        }
      });

      expect(adapterWithPool).toBeDefined();
      adapterWithPool.dispose();
    });

    it('should handle sudo configuration', () => {
      const adapterWithSudo = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'secret'
        }
      });

      expect(adapterWithSudo).toBeDefined();
      adapterWithSudo.dispose();
    });

    it('should handle SFTP configuration', () => {
      const adapterWithSFTP = new SSHAdapter({
        sftp: {
          enabled: false,
          concurrency: 3
        }
      });

      expect(adapterWithSFTP).toBeDefined();
      adapterWithSFTP.dispose();
    });

    it('should throw when SFTP is disabled and file operations are attempted', async () => {
      const adapterNoSFTP = new SSHAdapter({
        sftp: { enabled: false, concurrency: 5 }
      });

      await expect(adapterNoSFTP.uploadFile(
        '/local/file.txt',
        '/remote/file.txt',
        createMockSSHOptions()
      )).rejects.toThrow('SFTP is disabled');

      adapterNoSFTP.dispose();
    });
  });

  describe('Cleanup', () => {
    it('should dispose without errors', async () => {
      const testAdapter = new SSHAdapter();
      await expect(testAdapter.dispose()).resolves.not.toThrow();
    });
  });
});

// Integration tests that require actual SSH connection would go in a separate file
// For unit tests, we focus on testing the adapter's behavior without actual connections