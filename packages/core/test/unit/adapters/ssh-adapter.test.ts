import { join } from 'path';
import { tmpdir } from 'os';
import { it, jest, expect, afterEach, beforeEach } from '@jest/globals';
import { rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { describeSSH, getSSHConfig, testEachPackageManager } from '@xec-sh/testing';

import { $ } from '../../../src/index.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

describeSSH('SSHAdapter - Real SSH Tests', () => {
  let adapter: SSHAdapter;
  let testDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a unique test directory for each test
    testDir = join(tmpdir(), `ssh-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up adapter
    if (adapter) {
      await adapter.dispose();
    }
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Availability', () => {
    it('should check if SSH is available', async () => {
      adapter = new SSHAdapter();
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('Basic command execution', () => {
    it('should fail without SSH options', async () => {
      adapter = new SSHAdapter();
      await expect(adapter.execute({
        command: 'ls'
      })).rejects.toThrow('SSH connection options not provided');
    });

    it('should require valid SSH options', async () => {
      adapter = new SSHAdapter();
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'ssh',
          host: '', // Invalid empty host
          username: ''
        }
      })).rejects.toThrow();
    });

    testEachPackageManager('should execute commands successfully', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const result = await adapter.execute({
        command: 'echo "Hello from SSH"',
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello from SSH');
      expect(result.adapter).toBe('ssh');
      expect(result.host).toBe(`${sshConfig.host}:${sshConfig.port}`);
    });

    testEachPackageManager('should handle command with exit code', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const result = await adapter.execute({
        command: 'exit 42',
        shell: true,
        nothrow: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(42);
    });

    testEachPackageManager('should capture stderr', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const result = await adapter.execute({
        command: 'echo "Error message" >&2',
        shell: true,
        nothrow: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      // CentOS may include locale warnings in stderr
      expect(result.stderr).toContain('Error message');
    });
  });

  describe('Working Directory', () => {
    testEachPackageManager('should execute commands in specified directory', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      // First create a directory
      await adapter.execute({
        command: 'mkdir -p /tmp/test-dir && echo "test content" > /tmp/test-dir/test.txt',
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      // Then execute command in that directory
      const result = await adapter.execute({
        command: 'pwd && cat test.txt',
        shell: true,
        cwd: '/tmp/test-dir',
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('/tmp/test-dir');
      expect(result.stdout).toContain('test content');
    });
  });

  describe('Environment Variables', () => {
    testEachPackageManager('should pass environment variables', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const result = await adapter.execute({
        command: 'echo "VAR1=$VAR1 VAR2=$VAR2"',
        shell: true,
        env: {
          VAR1: 'value1',
          VAR2: 'value2'
        },
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('VAR1=value1 VAR2=value2');
    });
  });

  describe('Timeout Handling', () => {
    testEachPackageManager('should timeout long-running commands', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const startTime = Date.now();
      const result = await adapter.execute({
        command: 'sleep 10',
        timeout: 1000, // 1 second timeout
        nothrow: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(2000); // Should timeout in ~1 second
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('File Operations', () => {
    testEachPackageManager('should upload files via SFTP', async (container) => {
      adapter = new SSHAdapter({
        sftp: { enabled: true, concurrency: 3 }
      });
      const sshConfig = getSSHConfig(container.name);

      // Create a local test file
      const localFile = join(testDir, 'upload-test.txt');
      const content = 'This is a test file for upload';
      writeFileSync(localFile, content);

      // Upload file
      const remoteFile = '/tmp/uploaded-file.txt';
      await adapter.uploadFile(localFile, remoteFile, {
        type: 'ssh',
        ...sshConfig
      });

      // Verify file was uploaded
      const result = await adapter.execute({
        command: `cat ${remoteFile}`,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(content);
    });

    testEachPackageManager('should download files via SFTP', async (container) => {
      adapter = new SSHAdapter({
        sftp: { enabled: true, concurrency: 3 }
      });
      const sshConfig = getSSHConfig(container.name);

      // Create a remote test file
      const content = 'This is a test file for download';
      const remoteFile = '/tmp/download-test.txt';
      await adapter.execute({
        command: `echo "${content}" > ${remoteFile}`,
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      // Download file
      const localFile = join(testDir, 'downloaded-file.txt');
      await adapter.downloadFile(remoteFile, localFile, {
        type: 'ssh',
        ...sshConfig
      });

      // Verify file was downloaded
      const downloadedContent = readFileSync(localFile, 'utf-8');
      expect(downloadedContent.trim()).toBe(content);
    });

    testEachPackageManager('should check if remote file exists', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      // Create a test file
      const remoteFile = '/tmp/exists-test.txt';
      await adapter.execute({
        command: `echo "test" > ${remoteFile}`,
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      // Check existence using test command
      const existsResult = await adapter.execute({
        command: `test -f ${remoteFile} && echo "exists" || echo "not exists"`,
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });
      expect(existsResult.stdout.trim()).toBe('exists');

      // Check non-existent file
      const notExistsResult = await adapter.execute({
        command: `test -f /tmp/non-existent-file.txt && echo "exists" || echo "not exists"`,
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });
      expect(notExistsResult.stdout.trim()).toBe('not exists');
    });
  });

  describe('Connection Pool', () => {
    it('should reuse connections with connection pooling', async () => {
      adapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 2,
          idleTimeout: 60000,
          keepAlive: true
        }
      });

      const sshConfig = getSSHConfig('ubuntu-apt');
      const startTime = Date.now();

      // Execute multiple commands
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          adapter.execute({
            command: `echo "Command ${i}"`,
            adapterOptions: {
              type: 'ssh',
              ...sshConfig
            }
          })
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All commands should succeed
      results.forEach((result, i) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(`Command ${i}`);
      });

      // Should be faster due to connection reuse
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Error Handling', () => {
    testEachPackageManager('should handle non-existent commands', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const result = await adapter.execute({
        command: 'this-command-does-not-exist',
        nothrow: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    testEachPackageManager('should handle syntax errors', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const result = await adapter.execute({
        command: 'echo "unclosed quote',
        shell: true,
        nothrow: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Stream Handling', () => {
    testEachPackageManager('should handle large output', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      // Generate large output (using seq for portability)
      const result = await adapter.execute({
        command: 'for i in $(seq 1 1000); do echo "Line $i"; done',
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trim().split('\n');
      expect(lines.length).toBe(1000);
      expect(lines[0]).toBe('Line 1');
      expect(lines[999]).toBe('Line 1000');
    });
  });

  describe('Special Characters', () => {
    testEachPackageManager('should handle special characters in commands', async (container) => {
      adapter = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      const specialChars = `$&*()[]{}|;<>?'"\\\``;
      const result = await adapter.execute({
        command: `printf '%s' '${specialChars.replace(/'/g, "'\"'\"'")}'`,
        shell: true,
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(specialChars);
    });
  });

  describe('Sudo Operations', () => {
    testEachPackageManager('should execute commands with sudo', async (container) => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'password', // Same as user password in test containers
          method: 'stdin'
        }
      });
      const sshConfig = getSSHConfig(container.name);

      const result = await adapter.execute({
        command: 'whoami', // Don't use 'sudo' prefix - adapter will add it
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('root');
    });
  });

  describe('$ Helper Integration', () => {
    testEachPackageManager('should work with $ helper', async (container) => {
      const sshConfig = getSSHConfig(container.name);
      const $ssh = $.ssh(sshConfig);

      const result = await $ssh`echo "Hello from $ helper"`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello from $ helper');
    });

    testEachPackageManager('should handle template literals with interpolation', async (container) => {
      const sshConfig = getSSHConfig(container.name);
      const $ssh = $.ssh(sshConfig);

      const name = 'World';
      const number = 42;
      const result = await $ssh`echo "Hello ${name}, the answer is ${number}"`;

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello World, the answer is 42');
    });
  });

  describe('Cleanup', () => {
    it('should dispose without errors', async () => {
      const testAdapter = new SSHAdapter();
      await expect(testAdapter.dispose()).resolves.not.toThrow();
    });

    it('should close all connections on dispose', async () => {
      adapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 5,
          idleTimeout: 60000,
          keepAlive: true
        }
      });

      const sshConfig = getSSHConfig('ubuntu-apt');

      // Create multiple connections
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          adapter.execute({
            command: 'echo "test"',
            adapterOptions: {
              type: 'ssh',
              ...sshConfig
            }
          })
        );
      }

      await Promise.all(promises);

      // Dispose should close all connections
      await adapter.dispose();

      // After dispose, adapter should still work (creates new connections)
      const afterDispose = await adapter.execute({
        command: 'echo "after dispose"',
        adapterOptions: {
          type: 'ssh',
          ...sshConfig
        }
      });

      expect(afterDispose.exitCode).toBe(0);
      expect(afterDispose.stdout.trim()).toBe('after dispose');
    });
  });
});