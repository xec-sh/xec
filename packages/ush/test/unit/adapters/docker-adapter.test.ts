import { EventEmitter } from 'node:events';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { DockerError } from '../../../src/core/error.js';
import { DockerAdapter } from '../../../src/adapters/docker-adapter.js';

// Mock child_process
const mockSpawn = jest.fn();

jest.mock('node:child_process', () => ({
  spawn: mockSpawn,
  execFile: jest.fn()
}));

// Helper to create mock process
function createMockProcess(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  signal?: string;
  delay?: number;
} = {}): any {
  const { stdout = '', stderr = '', exitCode = 0, signal, delay = 0 } = options;

  const mockProcess = new EventEmitter() as any;
  mockProcess.stdout = Object.assign(new EventEmitter(), {
    pipe: jest.fn((target: any) => {
      // Simulate piping data
      mockProcess.stdout.on('data', (chunk: any) => {
        if (target.write) target.write(chunk);
      });
      return target;
    })
  });
  mockProcess.stderr = Object.assign(new EventEmitter(), {
    pipe: jest.fn((target: any) => {
      // Simulate piping data
      mockProcess.stderr.on('data', (chunk: any) => {
        if (target.write) target.write(chunk);
      });
      return target;
    })
  });
  mockProcess.stdin = {
    write: jest.fn(),
    end: jest.fn()
  };
  mockProcess.kill = jest.fn(() => {
    mockProcess.emit('exit', -1, 'SIGTERM');
  });

  // Simulate process output and exit
  setTimeout(() => {
    if (stdout) mockProcess.stdout.emit('data', Buffer.from(stdout));
    if (stderr) mockProcess.stderr.emit('data', Buffer.from(stderr));
    mockProcess.emit('exit', exitCode, signal);
  }, delay);

  return mockProcess;
}

// TODO: These tests need to be fixed with proper mocking of child_process spawn
// The jest.mock() is not intercepting the spawn properly

describe('DockerAdapter', () => {
  let adapter: DockerAdapter;

  beforeEach(() => {
    jest.clearAllMocks();

    adapter = new DockerAdapter({
      defaultExecOptions: {
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true
      },
      throwOnNonZeroExit: false
    });
  });

  afterEach(async () => {
    await adapter.dispose();
  });

  describe('Availability', () => {
    it.skip('should be available when docker CLI exists', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stdout: 'Docker version 20.10.0' })
      );

      const available = await adapter.isAvailable();
      expect(available).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('docker', ['version', '--format', 'json'], expect.any(Object));
    });
  });

  describe('Basic command execution', () => {
    it.skip('should execute commands in Docker container', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stdout: 'Hello Docker\n' })
      );

      const result = await adapter.execute({
        command: 'echo',
        args: ['Hello Docker'],
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(result.stdout).toBe('Hello Docker\n');
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(result.adapter).toBe('docker');
      expect(result.container).toBe('test-container');

      expect(mockSpawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-i',
        'test-container',
        'echo',
        'Hello Docker'
      ]);
    });

    it('should fail without Docker options', async () => {
      await expect(adapter.execute({
        command: 'ls'
      })).rejects.toThrow('Docker container options not provided');
    });

    it.skip('should handle non-existent container', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 125,
          stderr: 'Error: No such container: nonexistent-container\n'
        })
      );

      const result = await adapter.execute({
        command: 'ls',
        adapterOptions: { type: 'docker', container: 'nonexistent-container' }
      });

      expect(result.exitCode).toBe(125);
      expect(result.stderr).toContain('No such container');
    });

    it.skip('should handle command failures', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ exitCode: 42 })
      );

      const result = await adapter.execute({
        command: 'sh',
        args: ['-c', 'exit 42'],
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(result.exitCode).toBe(42);
    });

    it.skip('should capture stderr output', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stderr: 'error\n' })
      );

      const result = await adapter.execute({
        command: 'sh',
        args: ['-c', 'echo error >&2'],
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('error\n');
    });
  });

  describe('Docker exec options', () => {
    it.skip('should use custom user', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stdout: 'root\n' })
      );

      await adapter.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'docker',
          container: 'test-container',
          user: 'root'
        }
      });

      expect(mockSpawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-i',
        '-u', 'root',
        'test-container',
        'whoami'
      ]);
    });

    it.skip('should set working directory', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stdout: '/app\n' })
      );

      await adapter.execute({
        command: 'pwd',
        adapterOptions: {
          type: 'docker',
          container: 'test-container',
          workdir: '/app'
        }
      });

      expect(mockSpawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-i',
        '-w', '/app',
        'test-container',
        'pwd'
      ]);
    });

    it.skip('should pass environment variables', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stdout: 'test-value\n' })
      );

      await adapter.execute({
        command: 'sh',
        args: ['-c', 'echo $MY_VAR'],
        env: { MY_VAR: 'test-value' },
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(mockSpawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-i',
        '-e', 'MY_VAR=test-value',
        'test-container',
        'sh', '-c', 'echo $MY_VAR'
      ]);
    });

    it.skip('should handle TTY option', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess());

      await adapter.execute({
        command: 'bash',
        stdin: 'echo hello\n',
        adapterOptions: {
          type: 'docker',
          container: 'test-container',
          tty: true
        }
      });

      expect(mockSpawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-i',
        '-t',
        'test-container',
        'bash'
      ]);
    });

    it.skip('should handle custom exec options from config', async () => {
      // Test with adapter configured with privileged option
      const privilegedAdapter = new DockerAdapter({
        defaultExecOptions: {
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          Privileged: true
        }
      });

      mockSpawn.mockReturnValueOnce(createMockProcess());

      await privilegedAdapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'docker',
          container: 'test-container'
        }
      });

      expect(mockSpawn).toHaveBeenCalledWith('docker', [
        'exec',
        '--privileged',
        'test-container',
        'ls'
      ]);
    });
  });

  describe('Input/Output handling', () => {
    it.skip('should handle stdin input', async () => {
      const mockProcess = createMockProcess({ stdout: 'test input' });
      mockSpawn.mockReturnValueOnce(mockProcess);

      await adapter.execute({
        command: 'cat',
        stdin: 'test input',
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(mockProcess.stdin.write).toHaveBeenCalledWith('test input');
      expect(mockProcess.stdin.end).toHaveBeenCalled();
    });

    it.skip('should handle large output', async () => {
      const largeOutput = 'x'.repeat(1000);
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stdout: largeOutput })
      );

      const result = await adapter.execute({
        command: 'echo',
        args: [largeOutput],
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(result.stdout).toBe(largeOutput);
    });

    it.skip('should handle command with shell', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ stdout: '2\n' })
      );

      const result = await adapter.execute({
        command: 'echo "hello world" | wc -w',
        shell: true,
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(result.stdout).toBe('2\n');
      expect(mockSpawn).toHaveBeenCalledWith('docker', [
        'exec',
        '-i',
        'test-container',
        '/bin/sh', '-c', 'echo "hello world" | wc -w'
      ]);
    });
  });

  describe('Error handling', () => {
    it('should throw DockerError with throwOnNonZeroExit enabled', async () => {
      const throwAdapter = new DockerAdapter({ throwOnNonZeroExit: true });

      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 125,
          stderr: 'Container error'
        })
      );

      await expect(throwAdapter.execute({
        command: 'false',
        adapterOptions: { type: 'docker', container: 'test-container' }
      })).rejects.toThrow(DockerError);
    });

    it.skip('should handle process spawn errors', async () => {
      mockSpawn.mockImplementationOnce(() => {
        throw new Error('spawn ENOENT');
      });

      await expect(adapter.execute({
        command: 'echo',
        adapterOptions: { type: 'docker', container: 'test-container' }
      })).rejects.toThrow('spawn ENOENT');
    });

    it.skip('should handle timeout', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({ delay: 200 })
      );

      const result = await adapter.execute({
        command: 'sleep',
        args: ['10'],
        timeout: 100,
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(result.exitCode).toBe(-1);
      expect(result.signal).toBe('SIGTERM');
    });

    it.skip('should handle abort signal', async () => {
      const abortController = new AbortController();
      const mockProcess = createMockProcess({ delay: 100 });
      mockSpawn.mockReturnValueOnce(mockProcess);

      setTimeout(() => abortController.abort(), 50);

      const result = await adapter.execute({
        command: 'sleep',
        args: ['10'],
        signal: abortController.signal,
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(result.exitCode).toBe(-1);
      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it.skip('should use custom docker path', async () => {
      // TODO: DockerAdapter doesn't support custom docker path in config
      // This test should be updated when this feature is added
      const customAdapter = new DockerAdapter({});

      mockSpawn.mockReturnValueOnce(createMockProcess());

      await customAdapter.execute({
        command: 'ls',
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      expect(mockSpawn).toHaveBeenCalledWith('docker', expect.any(Array));
    });

    it.skip('should apply default exec options', async () => {
      const customAdapter = new DockerAdapter({
        defaultExecOptions: {
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          User: 'www-data'
        }
      });

      mockSpawn.mockReturnValueOnce(createMockProcess());

      await customAdapter.execute({
        command: 'ls',
        adapterOptions: { type: 'docker', container: 'test-container' }
      });

      const args = mockSpawn.mock.calls[0]?.[1] || [];
      expect(args).not.toContain('-i');
      expect(args).toContain('-t');
      expect(args).toContain('-u');
      expect(args).toContain('www-data');
    });
  });
});