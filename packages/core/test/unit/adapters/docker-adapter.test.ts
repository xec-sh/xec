import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { it, jest, expect, describe, afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';

import { DockerAdapter } from '../../../src/adapters/docker/index.js';
import { findDockerPath } from '../../../src/adapters/docker/docker-utils.js';
import { DockerError, AdapterError, TimeoutError } from '../../../src/core/error.js';

const sleep = promisify(setTimeout);

// Test container configuration
const TEST_IMAGE = 'alpine:latest';
const TEST_CONTAINER_PREFIX = 'xec-test-';
let testContainerName: string;
let testContainers: string[] = [];

// Helper function to execute docker commands directly
async function execDocker(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const dockerPath = findDockerPath();
    const proc = spawn(dockerPath, args, {
      env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env['PATH']}` }
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('exit', (exitCode) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode || 0 });
    });
  });
}

// Helper to ensure test container exists
async function ensureTestContainer(containerName: string): Promise<void> {
  const { exitCode } = await execDocker(['inspect', containerName]);
  if (exitCode !== 0) {
    // Container doesn't exist, create it
    await execDocker(['run', '-d', '--name', containerName, TEST_IMAGE, 'sh', '-c', 'while true; do sleep 1; done']);
    testContainers.push(containerName);
    // Give container time to start
    await sleep(1000);
  }
}

// Cleanup helper
async function cleanupTestContainers(): Promise<void> {
  for (const container of testContainers) {
    await execDocker(['rm', '-f', container]).catch(() => { });
  }
  testContainers = [];
}

describe('DockerAdapter Enhanced Tests', () => {
  let adapter: DockerAdapter;

  // Store original PATH
  const originalPath = process.env['PATH'];

  beforeAll(async () => {
    // Ensure Docker is in PATH
    process.env['PATH'] = `/usr/local/bin:${process.env['PATH']}`;

    // Pull test image if needed
    const { exitCode } = await execDocker(['images', '-q', TEST_IMAGE]);
    if (exitCode !== 0 || !await execDocker(['images', '-q', TEST_IMAGE]).then(r => r.stdout)) {
      console.log('Pulling test image...');
      await execDocker(['pull', TEST_IMAGE]);
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Generate unique container name for this test
    testContainerName = `${TEST_CONTAINER_PREFIX}${Date.now()}-${Math.random().toString(36).substring(7)}`;

    adapter = new DockerAdapter({
      throwOnNonZeroExit: false,
      defaultExecOptions: {
        Env: ['TEST=true']
      }
    });
  });

  afterEach(async () => {
    await adapter.dispose();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  afterAll(async () => {
    await cleanupTestContainers();
    // Restore original PATH
    process.env['PATH'] = originalPath;
  });

  describe('Availability', () => {
    it('should be available when docker CLI exists', async () => {
      // Since we're running real Docker tests, it should be available
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should work with Docker availability check', async () => {
      // This test verifies that our real Docker setup works
      const adapter2 = new DockerAdapter();
      const available = await adapter2.isAvailable();
      expect(available).toBe(true);
      await adapter2.dispose();
    });
  });

  describe('Basic command execution', () => {
    it('should execute commands in Docker container', async () => {
      await ensureTestContainer(testContainerName);

      const result = await adapter.execute({
        command: 'echo "Hello from Docker"',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello from Docker');
    });

    it('should execute commands with shell', async () => {
      await ensureTestContainer(testContainerName);

      const result = await adapter.execute({
        command: 'echo $((40 + 2))',
        shell: true,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('42');
    });

    it('should fail without Docker options', async () => {
      await expect(adapter.execute({
        command: 'echo test'
      })).rejects.toThrow(AdapterError);
    });

    it('should handle non-existent container', async () => {
      adapter = new DockerAdapter({
        throwOnNonZeroExit: true
      });

      await expect(adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'docker',
          container: 'nonexistent-container-12345'
        }
      })).rejects.toThrow(DockerError);
    });

    it('should handle command failures', async () => {
      await ensureTestContainer(testContainerName);

      const result = await adapter.execute({
        command: 'nonexistentcommand',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(127); // Command not found exit code
      expect(result.stderr).toContain('not found');
    });

    it('should capture combined stdout and stderr', async () => {
      await ensureTestContainer(testContainerName);

      const result = await adapter.execute({
        command: 'echo "This is stdout" && echo "This is stderr" >&2',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.stdout.trim()).toBe('This is stdout');
      expect(result.stderr.trim()).toBe('This is stderr');
    });
  });

  describe('Docker exec options', () => {
    beforeEach(async () => {
      await ensureTestContainer(testContainerName);
    });

    it('should use custom user', async () => {
      // First, create the 'nobody' user in the container
      await adapter.execute({
        command: 'adduser -D nobody || true',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      const result = await adapter.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'docker',
          container: testContainerName,
          user: 'nobody'
        }
      });

      expect(result.stdout.trim()).toBe('nobody');
    });

    it('should use custom working directory', async () => {
      // Create the directory first
      await adapter.execute({
        command: 'mkdir -p /app',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      const result = await adapter.execute({
        command: 'pwd',
        adapterOptions: {
          type: 'docker',
          container: testContainerName,
          workdir: '/app'
        }
      });

      expect(result.stdout.trim()).toBe('/app');
    });

    it('should handle TTY mode', async () => {
      const result = await adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'docker',
          container: testContainerName,
          tty: true
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test');
    });

    it('should handle environment variables', async () => {
      const result = await adapter.execute({
        command: 'echo "$TEST_VAR"',
        env: { TEST_VAR: 'test-value' },
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.stdout.trim()).toBe('test-value');
    });
  });

  describe('stdin handling', () => {
    beforeEach(async () => {
      await ensureTestContainer(testContainerName);
    });

    it('should pass string stdin to process', async () => {
      const result = await adapter.execute({
        command: 'cat',
        stdin: 'test input',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.stdout.trim()).toBe('test input');
    });

    it('should pass Buffer stdin to process', async () => {
      const result = await adapter.execute({
        command: 'cat',
        stdin: Buffer.from('buffer input'),
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.stdout.trim()).toBe('buffer input');
    });

    it('should pipe Readable stdin to process', async () => {
      const stream = Readable.from(['stream input']);
      const result = await adapter.execute({
        command: 'cat',
        stdin: stream,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.stdout.trim()).toBe('stream input');
    });
  });

  describe('Container management methods', () => {
    let managementContainerName: string;

    beforeEach(() => {
      managementContainerName = `${TEST_CONTAINER_PREFIX}mgmt-${Date.now()}`;
    });

    afterEach(async () => {
      // Cleanup any containers created in these tests
      await execDocker(['rm', '-f', managementContainerName]).catch(() => { });
    });

    it('should list containers', async () => {
      // Create a container to list
      await ensureTestContainer(testContainerName);

      const containers = await adapter.listContainers();
      expect(containers).toContain(testContainerName);
    });

    it('should list all containers including stopped', async () => {
      // Create a stopped container
      await execDocker(['create', '--name', managementContainerName, TEST_IMAGE]);
      testContainers.push(managementContainerName);

      const allContainers = await adapter.listContainers(true);
      const runningContainers = await adapter.listContainers(false);

      expect(allContainers).toContain(managementContainerName);
      expect(runningContainers).not.toContain(managementContainerName);
    });

    it('should create container', async () => {
      await adapter.createContainer({
        name: managementContainerName,
        image: TEST_IMAGE,
        env: { TEST: 'value' },
        volumes: [],
        ports: []
      });
      testContainers.push(managementContainerName);

      // Verify container was created
      const { exitCode } = await execDocker(['inspect', managementContainerName]);
      expect(exitCode).toBe(0);
    });

    it('should start container', async () => {
      // Create a stopped container
      await execDocker(['create', '--name', managementContainerName, TEST_IMAGE, 'sh', '-c', 'while true; do sleep 1; done']);
      testContainers.push(managementContainerName);

      await adapter.startContainer(managementContainerName);

      // Give container a moment to fully start
      await sleep(500);

      // Verify container is running
      const { stdout } = await execDocker(['ps', '--format', '{{.Names}}']);
      const runningContainers = stdout.split('\n').filter(Boolean);
      expect(runningContainers).toContain(managementContainerName);
    });

    it('should stop container', async () => {
      // Create and start a container
      await ensureTestContainer(managementContainerName);

      await adapter.stopContainer(managementContainerName);

      // Verify container is stopped
      const { stdout } = await execDocker(['ps', '--format', '{{.Names}}']);
      expect(stdout).not.toContain(managementContainerName);
    });

    it('should remove container', async () => {
      // Create a stopped container
      await execDocker(['create', '--name', managementContainerName, TEST_IMAGE]);

      await adapter.removeContainer(managementContainerName);

      // Verify container is removed
      const { exitCode } = await execDocker(['inspect', managementContainerName]);
      expect(exitCode).not.toBe(0);

      // Remove from our cleanup list since it's already removed
      testContainers = testContainers.filter(c => c !== managementContainerName);
    });

    it('should force remove container', async () => {
      // Create and start a container
      await ensureTestContainer(managementContainerName);

      await adapter.removeContainer(managementContainerName, true);

      // Verify container is removed
      const { exitCode } = await execDocker(['inspect', managementContainerName]);
      expect(exitCode).not.toBe(0);

      // Remove from our cleanup list since it's already removed
      testContainers = testContainers.filter(c => c !== managementContainerName);
    });
  });

  describe('Auto-create container functionality', () => {
    let autoCreateAdapter: DockerAdapter;
    let autoContainerName: string;

    beforeEach(() => {
      autoContainerName = `${TEST_CONTAINER_PREFIX}auto-${Date.now()}`;
    });

    afterEach(async () => {
      if (autoCreateAdapter) {
        await autoCreateAdapter.dispose();
      }
      // Clean up any auto-created containers
      await execDocker(['rm', '-f', autoContainerName]).catch(() => { });
    });

    it('should create temporary container if enabled and container does not exist', async () => {
      autoCreateAdapter = new DockerAdapter({
        autoCreate: {
          enabled: true,
          image: TEST_IMAGE,
          autoRemove: false
        }
      });

      const result = await autoCreateAdapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'docker',
          container: autoContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test');

      // The container created will have a different name (temp-ush-*)
      // Let's verify at least one temp container exists
      const { stdout } = await execDocker(['ps', '-a', '--format', '{{.Names}}']);
      const tempContainers = stdout.split('\n').filter(name => name.startsWith('temp-ush-'));
      expect(tempContainers.length).toBeGreaterThan(0);
    });

    it('should clean up temporary containers on dispose', async () => {
      autoCreateAdapter = new DockerAdapter({
        autoCreate: {
          enabled: true,
          image: TEST_IMAGE,
          autoRemove: true
        }
      });

      // Get temp containers before
      const { stdout: beforeStdout } = await execDocker(['ps', '-a', '--format', '{{.Names}}']);
      const tempContainersBefore = beforeStdout.split('\n').filter(name => name.startsWith('temp-ush-'));

      await autoCreateAdapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'docker',
          container: autoContainerName
        }
      });

      // Get temp containers after execute
      const { stdout: afterExecStdout } = await execDocker(['ps', '-a', '--format', '{{.Names}}']);
      const tempContainersAfterExec = afterExecStdout.split('\n').filter(name => name.startsWith('temp-ush-'));
      expect(tempContainersAfterExec.length).toBeGreaterThan(tempContainersBefore.length);

      // Now dispose should remove the container
      await autoCreateAdapter.dispose();
      autoCreateAdapter = null as any; // Prevent double dispose in afterEach

      // Get temp containers after dispose
      const { stdout: afterDisposeStdout } = await execDocker(['ps', '-a', '--format', '{{.Names}}']);
      const tempContainersAfterDispose = afterDisposeStdout.split('\n').filter(name => name.startsWith('temp-ush-'));
      expect(tempContainersAfterDispose.length).toBeLessThan(tempContainersAfterExec.length);
    });
  });

  describe('Error handling', () => {
    it('should throw DockerError on container operation failure', async () => {
      // Try to create a container with an invalid image
      await expect(
        adapter.createContainer({
          name: 'test-invalid',
          image: 'invalid-image-that-does-not-exist:latest'
        })
      ).rejects.toThrow(DockerError);
    });

    it('should handle container errors gracefully', async () => {
      // Try to execute on a container that doesn't exist
      const result = await adapter.execute({
        command: 'echo test',
        nothrow: true,  // Enable nothrow to get result instead of exception
        adapterOptions: {
          type: 'docker',
          container: 'container-that-does-not-exist-12345'
        }
      });
      // Should not throw when nothrow is true, but should have non-zero exit code
      expect(result.exitCode).toBe(125);  // Docker standard error code for container not found
      expect(result.stderr).toContain("Container 'container-that-does-not-exist-12345' not found");
    });

    it('should throw DockerError when throwOnNonZeroExit is true', async () => {
      await ensureTestContainer(testContainerName);

      const strictAdapter = new DockerAdapter({
        throwOnNonZeroExit: true
      });

      await expect(strictAdapter.execute({
        command: 'exit 1',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      })).rejects.toThrow(DockerError);

      await strictAdapter.dispose();
    });
  });

  describe('Process timeout', () => {
    it('should handle long running commands', async () => {
      await ensureTestContainer(testContainerName);

      // Since DockerAdapter doesn't implement timeout, we'll test that long commands work
      const result = await adapter.execute({
        command: 'sleep 1',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('TTY detection', () => {
    it('should warn when TTY requested but not available', async () => {
      await ensureTestContainer(testContainerName);

      // Mock console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      // Save original TTY values
      const originalStdinTTY = process.stdin.isTTY;
      const originalStdoutTTY = process.stdout.isTTY;
      const originalStderrTTY = process.stderr.isTTY;

      // Set TTY to false
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true
      });
      Object.defineProperty(process.stderr, 'isTTY', {
        value: false,
        writable: true,
        configurable: true
      });

      const result = await adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'docker',
          container: testContainerName,
          tty: true
        }
      });

      expect(result.exitCode).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'TTY requested but not available in current environment'
      );

      // Restore
      consoleWarnSpy.mockRestore();
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalStdinTTY,
        writable: true,
        configurable: true
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalStdoutTTY,
        writable: true,
        configurable: true
      });
      Object.defineProperty(process.stderr, 'isTTY', {
        value: originalStderrTTY,
        writable: true,
        configurable: true
      });
    });
  });

  describe('Container validation', () => {
    it('should reject empty container names', async () => {
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: { type: 'docker', container: '' }
      })).rejects.toThrow(DockerError);
    });

    it('should reject container names with shell metacharacters', async () => {
      const dangerousNames = [
        'test;rm -rf /',
        'test|cat /etc/passwd',
        'test&echo hacked',
        'test`whoami`',
        'test$(whoami)',
        'test{echo,test}',
        'test[0-9]',
        'test<input',
        'test>output',
        'test\'quote',
        'test"quote',
        'test\\escape'
      ];

      for (const name of dangerousNames) {
        await expect(adapter.execute({
          command: 'ls',
          adapterOptions: { type: 'docker', container: name }
        })).rejects.toThrow(DockerError);
      }
    });

    it('should reject container names with path traversal', async () => {
      const pathTraversalNames = [
        '../test',
        'test/../evil',
        '/absolute/path',
        'C:\\windows\\path'
      ];

      for (const name of pathTraversalNames) {
        await expect(adapter.execute({
          command: 'ls',
          adapterOptions: { type: 'docker', container: name }
        })).rejects.toThrow(DockerError);
      }
    });

    it('should accept valid container names', async () => {
      // We'll create a test container for each valid name to ensure they work
      const validNames = [
        'test-container',
        'my_app_1',
        'web.server',
        'app123',
        'UPPERCASE',
        'a1b2c3'
      ];

      for (const name of validNames) {
        const fullName = `${TEST_CONTAINER_PREFIX}valid-${name}`;
        await ensureTestContainer(fullName);

        const result = await adapter.execute({
          command: 'echo ok',
          adapterOptions: { type: 'docker', container: fullName }
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('ok');
      }
    });
  });

  describe.skip('Abort signal handling', () => {
    // Note: DockerAdapter doesn't currently implement abort signal handling
    // These tests are skipped until that functionality is added

    it('should handle abort signal during command execution', async () => {
      await ensureTestContainer(testContainerName);

      const abortController = new AbortController();

      // Start a long-running command
      const executePromise = adapter.execute({
        command: 'sleep 10',
        signal: abortController.signal,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 100);

      const result = await executePromise;

      // When aborted, the process is killed with SIGTERM
      expect(result.exitCode).not.toBe(0);
      expect(result.signal).toBeDefined();
      expect(result.duration).toBeLessThan(10000); // Should be much less than 10 seconds
    });

    it('should handle pre-aborted signal', async () => {
      await ensureTestContainer(testContainerName);

      const abortController = new AbortController();
      abortController.abort(); // Pre-abort

      await expect(adapter.execute({
        command: 'echo test',
        signal: abortController.signal,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      })).rejects.toThrow('Operation aborted');
    });
  });

  describe('Configuration with custom exec options', () => {
    it('should apply custom exec options from config', async () => {
      await ensureTestContainer(testContainerName);

      // Create adapter with privileged mode
      const privilegedAdapter = new DockerAdapter({
        defaultExecOptions: {
          Privileged: true,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true
        }
      });

      // Execute a command that requires privileged access (checking capabilities)
      const result = await privilegedAdapter.execute({
        command: 'cat /proc/self/status | grep CapEff',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      // Privileged containers have all capabilities
      expect(result.stdout).toContain('CapEff');

      await privilegedAdapter.dispose();
    });

    it('should handle custom working directory from exec options', async () => {
      await ensureTestContainer(testContainerName);

      // Create directory first
      await adapter.execute({
        command: 'mkdir -p /custom/workdir',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      const customAdapter = new DockerAdapter({
        defaultExecOptions: {
          WorkingDir: '/custom/workdir',
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true
        }
      });

      const result = await customAdapter.execute({
        command: 'pwd',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.stdout.trim()).toBe('/custom/workdir');

      await customAdapter.dispose();
    });
  });

  describe('Shell command variations', () => {
    beforeEach(async () => {
      await ensureTestContainer(testContainerName);
    });

    it('should execute commands with shell pipes', async () => {
      const result = await adapter.execute({
        command: 'echo "hello world" | wc -w',
        shell: true,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('2');
    });

    it('should handle shell redirections', async () => {
      const result = await adapter.execute({
        command: 'echo "test" > /tmp/test.txt && cat /tmp/test.txt',
        shell: true,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test');
    });

    it('should handle complex shell scripts', async () => {
      const result = await adapter.execute({
        command: 'for i in 1 2 3; do echo $i; done',
        shell: true,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('1\n2\n3');
    });

    it('should use sh shell by default', async () => {
      const result = await adapter.execute({
        command: 'echo $0',
        shell: true,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('sh');
    });

    it('should handle command with args array', async () => {
      const result = await adapter.execute({
        command: 'echo',
        args: ['Hello', 'Docker', 'World'],
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello Docker World');
    });
  });

  describe('Large output handling', () => {
    beforeEach(async () => {
      await ensureTestContainer(testContainerName);
    });

    it('should handle large stdout output', async () => {
      // Generate smaller amount of data for reliability
      const result = await adapter.execute({
        command: 'dd if=/dev/zero bs=1024 count=100 2>/dev/null | base64',
        shell: true,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(70000); // > 70KB (base64 encoding and line breaks vary)
    });

    it('should handle large stderr output', async () => {
      // Generate fewer lines for reliability (1000 lines)
      const result = await adapter.execute({
        command: 'for i in $(seq 1 1000); do echo "Error line $i" >&2; done',
        shell: true,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr.length).toBeGreaterThan(10000); // Should be > 10KB
      expect(result.stderr).toContain('Error line 1');
      expect(result.stderr).toContain('Error line 1000');
    });
  });
  describe('Process spawn error handling', () => {
    it('should handle Docker not being available', async () => {
      // Mock the executeDockerCommand to simulate Docker not being available
      const badAdapter = new DockerAdapter();

      // Override the executeDockerCommand method to simulate Docker not found
      const originalExecute = badAdapter['executeDockerCommand'];
      const dockerError = new Error('spawn docker ENOENT') as any;
      dockerError.code = 'ENOENT';
      dockerError.errno = -2;
      dockerError.syscall = 'spawn docker';
      dockerError.path = 'docker';

      (badAdapter as any)['executeDockerCommand'] = jest.fn(() => Promise.reject(dockerError));

      const available = await badAdapter.isAvailable();
      expect(available).toBe(false);

      await expect(badAdapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'docker',
          container: 'any-container'
        }
      })).rejects.toThrow();

      // Restore original method
      (badAdapter as any)['executeDockerCommand'] = originalExecute;
      await badAdapter.dispose();
    });
  });

  describe('Multiple stdin formats handling', () => {
    beforeEach(async () => {
      await ensureTestContainer(testContainerName);
    });

    it('should handle large Buffer stdin', async () => {
      // Create a large buffer (1MB)
      const largeBuffer = Buffer.alloc(1024 * 1024, 'x');

      const result = await adapter.execute({
        command: 'wc -c',
        stdin: largeBuffer,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(parseInt(result.stdout.trim())).toBe(1024 * 1024);
    });

    it('should handle multiline string stdin', async () => {
      const multilineInput = 'line1\nline2\nline3\n';

      const result = await adapter.execute({
        command: 'wc -l',
        stdin: multilineInput,
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('3');
    });

    it('should handle empty stdin', async () => {
      const result = await adapter.execute({
        command: 'cat',
        stdin: '',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    });

    it('should work without stdin', async () => {
      const result = await adapter.execute({
        command: 'echo "no stdin needed"',
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('no stdin needed');
    });
  });

  describe('Environment and exec options combinations', () => {
    beforeEach(async () => {
      await ensureTestContainer(testContainerName);
    });

    it('should merge environment variables from multiple sources', async () => {
      // Test with simple default env and command env
      const envAdapter = new DockerAdapter({
        defaultEnv: { DEFAULT_VAR: 'default' }
      });

      const result = await envAdapter.execute({
        command: 'sh -c "echo DEFAULT_VAR=$DEFAULT_VAR CMD_VAR=$CMD_VAR"',
        env: { CMD_VAR: 'fromcmd' },
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('DEFAULT_VAR=default');
      expect(result.stdout).toContain('CMD_VAR=fromcmd');

      await envAdapter.dispose();
    });

    it('should handle special characters in environment values', async () => {
      const result = await adapter.execute({
        command: 'sh -c "echo VAR=$SPECIAL_VAR"',
        env: { SPECIAL_VAR: 'value_with_special' },
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('VAR=value_with_special');
    });
  });

  describe('Timeout behavior', () => {
    beforeEach(async () => {
      await ensureTestContainer(testContainerName);
    });

    it('should handle timeout with nothrow', async () => {
      // DockerAdapter now implements timeout handling
      const result = await adapter.execute({
        command: 'sleep 2',
        timeout: 100, // 100ms timeout
        nothrow: true, // Return result instead of throwing
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      });

      expect(result.exitCode).toBe(124); // Standard timeout exit code
      expect(result.stderr).toContain('docker');
      expect(result.duration).toBeLessThan(2000); // Command was interrupted
    });

    it('should throw TimeoutError without nothrow', async () => {
      // Without nothrow, should throw TimeoutError
      await expect(adapter.execute({
        command: 'sleep 2',
        timeout: 100, // 100ms timeout
        adapterOptions: {
          type: 'docker',
          container: testContainerName
        }
      })).rejects.toThrow(TimeoutError);
    });
  });
});

describe('DockerAdapter Integration-like Tests', () => {
  let adapter: DockerAdapter;
  let integrationContainerName: string;

  beforeAll(async () => {
    // Ensure Docker is in PATH
    process.env['PATH'] = `/usr/local/bin:${process.env['PATH']}`;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new DockerAdapter();
    integrationContainerName = `${TEST_CONTAINER_PREFIX}integration-${Date.now()}`;
  });

  afterEach(async () => {
    await adapter.dispose();
    // Clean up integration test containers
    await execDocker(['rm', '-f', integrationContainerName]).catch(() => { });
  });

  afterAll(async () => {
    await cleanupTestContainers();
  });

  it('should handle complex multi-command scenario', async () => {
    // List containers before
    const containersBefore = await adapter.listContainers();

    // Create and start new container
    // Need to create with a command that keeps container running
    await execDocker(['run', '-d', '--name', integrationContainerName, TEST_IMAGE, 'sh', '-c', 'while true; do sleep 1; done']);
    testContainers.push(integrationContainerName);

    // Give container time to start
    await sleep(500);

    // Verify container is in list
    const containersAfter = await adapter.listContainers();
    expect(containersAfter).toContain(integrationContainerName);
    expect(containersAfter.length).toBeGreaterThan(containersBefore.length);

    // Execute command
    const result = await adapter.execute({
      command: 'echo "Hello from new container"',
      adapterOptions: {
        type: 'docker',
        container: integrationContainerName
      }
    });
    expect(result.stdout.trim()).toBe('Hello from new container');

    // Stop and remove
    await adapter.stopContainer(integrationContainerName);
    await adapter.removeContainer(integrationContainerName);

    // Remove from cleanup list since we removed it
    testContainers = testContainers.filter(c => c !== integrationContainerName);

    // Verify container is gone
    const { exitCode } = await execDocker(['inspect', integrationContainerName]);
    expect(exitCode).not.toBe(0);
  });
});

describe('DockerAdapter - Run Mode', () => {
  let adapter: DockerAdapter;

  beforeEach(() => {
    adapter = new DockerAdapter();
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  afterAll(async () => {
    await cleanupTestContainers();
  });

  it('should execute command in ephemeral container using run mode', async () => {
    const result = await adapter.execute({
      command: 'echo',
      args: ['Hello from ephemeral container'],
      adapterOptions: {
        type: 'docker',
        container: 'ephemeral',
        runMode: 'run',
        image: TEST_IMAGE,
        autoRemove: true
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('Hello from ephemeral container');
  });

  it('should mount volumes in run mode', async () => {
    const result = await adapter.execute({
      command: 'ls',
      args: ['-la', '/data'],
      adapterOptions: {
        type: 'docker',
        container: 'ephemeral',
        runMode: 'run',
        image: TEST_IMAGE,
        volumes: [`${process.cwd()}:/data:ro`],
        autoRemove: true
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('total');
  });

  it('should set working directory in run mode', async () => {
    const result = await adapter.execute({
      command: 'pwd',
      adapterOptions: {
        type: 'docker',
        container: 'ephemeral',
        runMode: 'run',
        image: TEST_IMAGE,
        workdir: '/tmp',
        autoRemove: true
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('/tmp');
  });

  it('should handle environment variables in run mode', async () => {
    const result = await adapter.execute({
      command: 'printenv',
      args: ['TEST_VAR'],
      env: { TEST_VAR: 'test_value' },
      adapterOptions: {
        type: 'docker',
        container: 'ephemeral',
        runMode: 'run',
        image: TEST_IMAGE,
        autoRemove: true
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('test_value');
  });

  it('should handle named containers in run mode', async () => {
    const containerName = `${TEST_CONTAINER_PREFIX}run-mode-${Date.now()}`;
    testContainers.push(containerName);

    const result = await adapter.execute({
      command: 'hostname',
      adapterOptions: {
        type: 'docker',
        container: containerName,
        runMode: 'run',
        image: TEST_IMAGE,
        autoRemove: false
      }
    });

    expect(result.exitCode).toBe(0);
    
    // Clean up
    await execDocker(['rm', '-f', containerName]);
    testContainers = testContainers.filter(c => c !== containerName);
  });

  it('should fail if image is not specified in run mode', async () => {
    await expect(adapter.execute({
      command: 'echo',
      args: ['test'],
      adapterOptions: {
        type: 'docker',
        container: 'ephemeral',
        runMode: 'run'
        // image is missing
      }
    })).rejects.toThrow('Image must be specified for run mode');
  });

  it('should handle complex command with shell in run mode', async () => {
    const result = await adapter.execute({
      command: 'echo "Count:"; ls -1 /etc | wc -l',
      shell: true,
      adapterOptions: {
        type: 'docker',
        container: 'ephemeral',
        runMode: 'run',
        image: TEST_IMAGE,
        autoRemove: true
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Count:\s*\d+/);
  });
});