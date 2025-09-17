import { test, jest, expect, describe, beforeEach } from '@jest/globals';

import { SSHFluentAPI, DockerFluentAPI } from '../../../src/adapters/docker/docker-fluent-api/index.js';

import type { ExecutionEngine } from '../../../src/core/execution-engine.js';

// Mock ExecutionEngine
const mockEngine = {
  run: jest.fn(() => ({
    then: jest.fn(),
    catch: jest.fn(),
    finally: jest.fn(),
    stdout: '',
    stderr: '',
    exitCode: 0,
    ok: true
  }))
} as unknown as ExecutionEngine;

describe('Docker Fluent API - SSH Service', () => {
  let docker: DockerFluentAPI;

  beforeEach(() => {
    jest.clearAllMocks();
    docker = new DockerFluentAPI(mockEngine);
  });

  describe('SSH Service Creation', () => {
    test('should create SSH service with defaults', () => {
      const ssh = docker.ssh();
      expect(ssh).toBeInstanceOf(SSHFluentAPI);
    });

    test('should create SSH service with custom config', () => {
      const ssh = docker.ssh({
        distro: 'alpine',
        port: 2323,
        user: 'admin',
        password: 'secret'
      });
      expect(ssh).toBeInstanceOf(SSHFluentAPI);
    });

    test('should support service method with SSH name', () => {
      const ssh = docker.service('ssh');
      expect(ssh).toBeInstanceOf(SSHFluentAPI);
    });
  });

  describe('SSH Fluent API Methods', () => {
    test('should support fluent chaining', () => {
      const ssh = docker.ssh()
        .withDistro('ubuntu')
        .withCredentials('myuser', 'mypass')
        .withPort(2222)
        .withSudo()
        .persistent();

      expect(ssh).toBeInstanceOf(SSHFluentAPI);
    });

    test('should get connection string', () => {
      const ssh = docker.ssh({ port: 2323, user: 'admin' });
      const connectionString = ssh.getConnectionString();
      expect(connectionString).toBe('ssh admin@localhost -p 2323');
    });

    test('should get connection config', () => {
      const ssh = docker.ssh({
        port: 2323,
        user: 'admin',
        password: 'secret'
      });
      const config = ssh.getConnectionConfig();
      expect(config).toEqual({
        host: 'localhost',
        port: 2323,
        username: 'admin',
        password: 'secret'
      });
    });
  });

  describe('SSH Container Configuration', () => {
    test('should configure with Ubuntu distro', async () => {
      const ssh = docker.ssh({ distro: 'ubuntu' });
      await ssh.start();

      const runCall = (mockEngine.run as jest.Mock).mock.calls.find(
        call => (call[0] as any)?.[0]?.includes?.('docker run')
      );
      expect(runCall).toBeDefined();
    });

    test('should configure with Alpine distro', async () => {
      const ssh = docker.ssh({ distro: 'alpine' });
      await ssh.start();

      const runCall = (mockEngine.run as jest.Mock).mock.calls.find(
        call => (call[0] as any)?.[0]?.includes?.('docker run')
      );
      expect(runCall).toBeDefined();
    });

    test('should configure with custom packages', async () => {
      const ssh = docker.ssh()
        .withPackages('git', 'vim', 'curl')
        .withSetupCommand('echo "Custom setup"');

      await ssh.start();
      expect(mockEngine.run).toHaveBeenCalled();
    });

    test('should configure sudo access', async () => {
      const ssh = docker.ssh()
        .withSudo(false); // No password required

      await ssh.start();
      expect(mockEngine.run).toHaveBeenCalled();
    });
  });

  describe('SSH Operations', () => {
    test('should execute SSH command', () => {
      const ssh = docker.ssh({
        user: 'admin',
        password: 'secret',
        port: 2222
      });

      ssh.ssh('ls -la');

      expect(mockEngine.run).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('sshpass'),
          expect.stringContaining('ssh'),
          expect.stringContaining('admin@localhost'),
          expect.stringContaining('ls -la')
        ])
      );
    });

    test('should copy file to container via SCP', () => {
      const ssh = docker.ssh({
        user: 'admin',
        password: 'secret',
        port: 2222
      });

      ssh.scpTo('/local/file.txt', '/remote/file.txt');

      expect(mockEngine.run).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('sshpass'),
          expect.stringContaining('scp'),
          expect.stringContaining('/local/file.txt'),
          expect.stringContaining('admin@localhost:/remote/file.txt')
        ])
      );
    });

    test('should copy file from container via SCP', () => {
      const ssh = docker.ssh({
        user: 'admin',
        password: 'secret',
        port: 2222
      });

      ssh.scpFrom('/remote/file.txt', '/local/file.txt');

      expect(mockEngine.run).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('sshpass'),
          expect.stringContaining('scp'),
          expect.stringContaining('admin@localhost:/remote/file.txt'),
          expect.stringContaining('/local/file.txt')
        ])
      );
    });

    test('should stop SSH container', async () => {
      const ssh = docker.ssh({ name: 'test-ssh' });
      await ssh.stop();

      expect(mockEngine.run).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('docker stop'),
          expect.stringContaining('test-ssh')
        ])
      );
    });
  });

  describe('Different Linux Distributions', () => {
    const distros = [
      'ubuntu',
      'alpine',
      'debian',
      'fedora',
      'centos',
      'rocky',
      'alma'
    ];

    distros.forEach(distro => {
      test(`should create SSH container with ${distro}`, () => {
        const ssh = docker.ssh({ distro });
        expect(ssh).toBeInstanceOf(SSHFluentAPI);
        expect(ssh.getConnectionString()).toContain('ssh user@localhost');
      });
    });
  });

  describe('SSH Setup Script Generation', () => {
    test('should handle Alpine-specific package manager', async () => {
      const ssh = docker.ssh({ distro: 'alpine' });
      await ssh.start();

      // Alpine uses apk
      const runCalls = (mockEngine.run as jest.Mock).mock.calls;
      const hasApkCommand = runCalls.some(call =>
        (call[0] as any)?.[0]?.includes?.('apk')
      );
      expect(hasApkCommand).toBe(true);
    });

    test('should handle Debian/Ubuntu package manager', async () => {
      const ssh = docker.ssh({ distro: 'ubuntu' });
      await ssh.start();

      // Ubuntu uses apt-get
      const runCalls = (mockEngine.run as jest.Mock).mock.calls;
      const hasAptCommand = runCalls.some(call =>
        (call[0] as any)?.[0]?.includes?.('apt-get')
      );
      expect(hasAptCommand).toBe(true);
    });

    test('should handle Fedora/RHEL package manager', async () => {
      const ssh = docker.ssh({ distro: 'fedora' });
      await ssh.start();

      // Fedora uses dnf
      const runCalls = (mockEngine.run as jest.Mock).mock.calls;
      const hasDnfCommand = runCalls.some(call =>
        (call[0] as any)?.[0]?.includes?.('dnf')
      );
      expect(hasDnfCommand).toBe(true);
    });
  });

  describe('Container Persistence', () => {
    test('should create ephemeral container by default', async () => {
      const ssh = docker.ssh();
      await ssh.start();

      const runCalls = (mockEngine.run as jest.Mock).mock.calls;
      const hasAutoRemove = runCalls.some(call =>
        (call[0] as any)?.[0]?.includes?.('--rm')
      );
      expect(hasAutoRemove).toBe(true);
    });

    test('should create persistent container when specified', async () => {
      const ssh = docker.ssh().persistent(true);
      await ssh.start();

      const runCalls = (mockEngine.run as jest.Mock).mock.calls;
      const hasAutoRemove = runCalls.some(call =>
        (call[0] as any)?.[0]?.includes?.('--rm')
      );
      expect(hasAutoRemove).toBe(false);
    });
  });

  describe('Port Configuration', () => {
    test('should use default port 2222', () => {
      const ssh = docker.ssh();
      const config = ssh.getConnectionConfig();
      expect(config.port).toBe(2222);
    });

    test('should use custom port', () => {
      const ssh = docker.ssh({ port: 3333 });
      const config = ssh.getConnectionConfig();
      expect(config.port).toBe(3333);
    });

    test('should update port with fluent method', () => {
      const ssh = docker.ssh().withPort(4444);
      const config = ssh.getConnectionConfig();
      expect(config.port).toBe(4444);
    });
  });

  describe('Authentication', () => {
    test('should set user credentials', () => {
      const ssh = docker.ssh()
        .withCredentials('myuser', 'mypassword');

      const config = ssh.getConnectionConfig();
      expect(config.username).toBe('myuser');
      expect(config.password).toBe('mypassword');
    });

    test('should support root password', async () => {
      const ssh = docker.ssh()
        .withRootPassword('rootpass');

      await ssh.start();
      expect(mockEngine.run).toHaveBeenCalled();
    });

    test('should add public key authentication', async () => {
      const ssh = docker.ssh()
        .withPubKeyAuth('/home/user/.ssh/id_rsa.pub');

      await ssh.start();

      // Should attempt to copy public key
      const runCalls = (mockEngine.run as jest.Mock).mock.calls;
      const hasCopyCommand = runCalls.some(call =>
        (call[0] as any)?.[0]?.includes?.('docker cp')
      );
      expect(hasCopyCommand).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should throw error if SSH service does not start', async () => {
      (mockEngine.run as jest.Mock).mockImplementation((strings: any) => {
        const cmd = strings?.[0] || '';
        if (cmd.includes('netstat') || cmd.includes('ss')) {
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 1 });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });

      const ssh = docker.ssh();
      await expect(ssh.start()).rejects.toThrow('SSH service did not become ready');
    });
  });
});