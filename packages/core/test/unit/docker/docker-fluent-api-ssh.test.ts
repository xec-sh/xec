import { test, jest, expect, describe, beforeEach } from '@jest/globals';

import { SSHFluentAPI, DockerFluentAPI } from '../../../src/adapters/docker/docker-fluent-api/index.js';

import type { ExecutionEngine } from '../../../src/core/execution-engine.js';

// Mock ExecutionEngine
const createMockProcessPromise = (result = { stdout: '', stderr: '', exitCode: 0, ok: true }): any => {
  const basePromise = Promise.resolve(result);
  const mockPromise: any = Object.assign(basePromise, {
    nothrow: jest.fn(() => createMockProcessPromise(result)),
    timeout: jest.fn(() => createMockProcessPromise(result)),
    quiet: jest.fn(() => createMockProcessPromise(result)),
    signal: jest.fn(() => createMockProcessPromise(result)),
    pipe: jest.fn(() => createMockProcessPromise(result)),
    kill: jest.fn(),
    cwd: jest.fn(() => createMockProcessPromise(result)),
    env: jest.fn(() => createMockProcessPromise(result)),
    shell: jest.fn(() => createMockProcessPromise(result)),
    interactive: jest.fn(() => createMockProcessPromise(result)),
    stdout: jest.fn(() => createMockProcessPromise(result)),
    stderr: jest.fn(() => createMockProcessPromise(result)),
    text: jest.fn(() => Promise.resolve('')),
    lines: jest.fn(() => Promise.resolve([])),
    json: jest.fn(() => Promise.resolve({})),
    stdin: {} as any
  });
  return mockPromise;
};

const mockEngine = {
  run: jest.fn((strings: any, ...values: any[]) => {
    // Reconstruct command from template literal parts
    const cmd = Array.isArray(strings)
      ? strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '')
      : String(strings);

    if (cmd.includes('netstat') || cmd.includes('ss')) {
      // SSH ready check - return success with :22 in output
      return createMockProcessPromise({ stdout: 'tcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN', stderr: '', exitCode: 0, ok: true });
    }
    return createMockProcessPromise();
  }),
  raw: jest.fn((strings: any, ...values: any[]) => {
    // Reconstruct command from template literal parts
    const cmd = Array.isArray(strings)
      ? strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '')
      : String(strings);

    // docker ps | grep checks if container is running - return exit code 1 to indicate NOT running
    if (cmd.includes('docker ps') && cmd.includes('grep')) {
      return createMockProcessPromise({ stdout: '', stderr: '', exitCode: 1, ok: false });
    }

    // All other raw commands succeed
    return createMockProcessPromise();
  })
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

      // Check that raw was called (used for docker run command)
      expect(mockEngine.raw).toHaveBeenCalled();
    });

    test('should configure with Alpine distro', async () => {
      const ssh = docker.ssh({ distro: 'alpine' });
      await ssh.start();

      // Check that raw was called (used for docker run command)
      expect(mockEngine.raw).toHaveBeenCalled();
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

      // Check that run was called with template literal parts
      const lastCall = (mockEngine.run as jest.Mock).mock.calls[
        (mockEngine.run as jest.Mock).mock.calls.length - 1
      ] as any[];
      expect(lastCall).toBeDefined();
      expect(lastCall[0]).toEqual(expect.arrayContaining([expect.stringContaining('sshpass')]));
    });

    test('should copy file to container via SCP', () => {
      const ssh = docker.ssh({
        user: 'admin',
        password: 'secret',
        port: 2222
      });

      ssh.scpTo('/local/file.txt', '/remote/file.txt');

      // Check that run was called
      const lastCall = (mockEngine.run as jest.Mock).mock.calls[
        (mockEngine.run as jest.Mock).mock.calls.length - 1
      ] as any[];
      expect(lastCall).toBeDefined();
      expect(lastCall[0]).toEqual(expect.arrayContaining([expect.stringContaining('scp')]));
    });

    test('should copy file from container via SCP', () => {
      const ssh = docker.ssh({
        user: 'admin',
        password: 'secret',
        port: 2222
      });

      ssh.scpFrom('/remote/file.txt', '/local/file.txt');

      // Check that run was called
      const lastCall = (mockEngine.run as jest.Mock).mock.calls[
        (mockEngine.run as jest.Mock).mock.calls.length - 1
      ] as any[];
      expect(lastCall).toBeDefined();
      expect(lastCall[0]).toEqual(expect.arrayContaining([expect.stringContaining('scp')]));
    });

    test('should stop SSH container', async () => {
      const ssh = docker.ssh({ name: 'test-ssh' });

      // Test that stop() can be called without errors
      await expect(ssh.stop()).resolves.not.toThrow();
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

      // Alpine uses apk - check raw calls for the docker run command
      const rawCalls = (mockEngine.raw as jest.Mock).mock.calls;
      const commands = rawCalls.map(call => {
        if (!Array.isArray(call[0])) return String(call[0]);
        const strings = call[0];
        const values = call.slice(1);
        return strings.reduce((acc:string, str:string, i:number) =>
          acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
        );
      });

      // Check if any command contains 'apk'
      const hasApkCommand = commands.some(cmd => cmd.includes('apk'));

      // If test fails, log the commands for debugging
      if (!hasApkCommand) {
        console.log('Commands executed:', commands);
      }

      expect(hasApkCommand).toBe(true);
    });

    test('should handle Debian/Ubuntu package manager', async () => {
      const ssh = docker.ssh({ distro: 'ubuntu' });
      await ssh.start();

      // Ubuntu uses apt-get - check raw calls for the docker run command
      const rawCalls = (mockEngine.raw as jest.Mock).mock.calls;
      const hasAptCommand = rawCalls.some(call => {
        if (!Array.isArray(call[0])) return false;
        const strings = call[0];
        const values = call.slice(1);
        const cmd = strings.reduce((acc:string, str:string, i:number) =>
          acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
        );
        return cmd.includes('apt-get');
      });
      expect(hasAptCommand).toBe(true);
    });

    test('should handle Fedora/RHEL package manager', async () => {
      const ssh = docker.ssh({ distro: 'fedora' });
      await ssh.start();

      // Fedora uses dnf - check raw calls for the docker run command
      const rawCalls = (mockEngine.raw as jest.Mock).mock.calls;
      const hasDnfCommand = rawCalls.some(call => {
        if (!Array.isArray(call[0])) return false;
        const strings = call[0];
        const values = call.slice(1);
        const cmd = strings.reduce((acc:string, str:string, i:number) =>
          acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
        );
        return cmd.includes('dnf');
      });
      expect(hasDnfCommand).toBe(true);
    });
  });

  describe('Container Persistence', () => {
    test('should create ephemeral container by default', async () => {
      const ssh = docker.ssh();
      await ssh.start();

      const rawCalls = (mockEngine.raw as jest.Mock).mock.calls;
      const hasAutoRemove = rawCalls.some(call => {
        if (!Array.isArray(call[0])) return false;
        const strings = call[0];
        const values = call.slice(1);
        const cmd = strings.reduce((acc:string, str:string, i:number) =>
          acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
        );
        return cmd.includes('--rm');
      });
      expect(hasAutoRemove).toBe(true);
    });

    test('should create persistent container when specified', async () => {
      const ssh = docker.ssh().persistent(true);
      await ssh.start();

      const rawCalls = (mockEngine.raw as jest.Mock).mock.calls;
      const hasAutoRemove = rawCalls.some(call => {
        if (!Array.isArray(call[0])) return false;
        const strings = call[0];
        const values = call.slice(1);
        const cmd = strings.reduce((acc:string, str:string, i:number) =>
          acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
        );
        return cmd.includes('--rm');
      });
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
      (mockEngine.run as jest.Mock).mockImplementation((strings: any, ...values: any[]) => {
        // Reconstruct command from template literal parts
        const cmd = Array.isArray(strings)
          ? strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '')
          : String(strings);

        if (cmd.includes('netstat') || cmd.includes('ss')) {
          // Return empty stdout to indicate SSH not ready
          return createMockProcessPromise({ stdout: '', stderr: '', exitCode: 0, ok: true });
        }
        return createMockProcessPromise();
      });

      const ssh = docker.ssh();
      // The waitForSSH method retries 30 times with 1s delay, so this will take ~30s
      // We expect it to throw after all retries fail
      await expect(ssh.start()).rejects.toThrow('SSH service did not become ready');
    }, 35000); // Increase timeout to 35s to account for 30 retries
  });
});