import { test, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { DockerError, CommandError } from '../../../src/core/error';
import { RemoteDockerAdapter, RemoteDockerAdapterConfig } from '../../../src/adapters/remote-docker-adapter';

// Create a mock Client constructor
const MockClient = jest.fn();

// Mock ssh2 module
jest.mock('ssh2', () => ({
  Client: MockClient
}));

// We'll mock the stream handler behavior in the stream itself

describe('RemoteDockerAdapter', () => {
  let adapter: RemoteDockerAdapter;
  let mockClient: any;
  let mockStream: any;

  const testConfig: RemoteDockerAdapterConfig = {
    ssh: {
      host: 'test-host',
      username: 'test-user',
      port: 22,
      privateKey: Buffer.from('test-key')
    },
    dockerPath: 'docker'
  };

  // Helper function to create a mock stream
  const createMockStream = (exitCode: number = 0, signal?: string) => {
    let transformStream: any;
    
    const stream: any = {
      write: jest.fn(),
      end: jest.fn(),
      pipe: jest.fn((transform) => {
        // Store the transform stream to simulate data flow
        transformStream = transform;
        return stream;
      }),
      on: jest.fn((event: string, handler: any) => {
        if (event === 'close') {
          // Simulate command execution completion
          process.nextTick(() => handler(exitCode, signal));
        }
        return stream;
      }),
      destroy: jest.fn(),
      stderr: {
        pipe: jest.fn().mockReturnThis()
      }
    };
    return stream;
  };

  beforeEach(() => {
    // Create mock client
    mockClient = {
      connect: jest.fn(),
      exec: jest.fn(),
      end: jest.fn(),
      once: jest.fn(),
      on: jest.fn(),
      destroy: jest.fn()
    };
    
    // Create mock stream
    mockStream = {
      write: jest.fn(),
      end: jest.fn(),
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn(),
      destroy: jest.fn(),
      stderr: {
        pipe: jest.fn().mockReturnThis()
      }
    };

    // Mock Client constructor
    MockClient.mockImplementation(() => mockClient);

    // Setup default exec behavior with properly mocked stream
    mockClient.exec.mockImplementation((command: string, callback: any) => {
      const stream = createMockStream();
      // Simulate the exec callback behavior that happens in ssh2
      process.nextTick(() => callback(null, stream));
    });
    
    // Setup default once behavior
    let readyCallback: any;
    let errorCallback: any;
    
    mockClient.once.mockImplementation((event: string, callback: any) => {
      if (event === 'ready') {
        readyCallback = callback;
      } else if (event === 'error') {
        errorCallback = callback;
      }
      return mockClient;
    });

    // Setup connect behavior to trigger ready event
    mockClient.connect.mockImplementation(() => {
      // Simulate successful connection
      process.nextTick(() => {
        if (readyCallback) {
          readyCallback();
        }
      });
    });

    adapter = new RemoteDockerAdapter({
      ...testConfig,
      throwOnNonZeroExit: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isAvailable', () => {
    test('should return true when SSH connection and Docker are available', async () => {
      // Mock getConnection to return the mock client
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
      
      // Mock the executeSSHCommand method directly
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: '{"Version":"20.10.0"}',
          stderr: '',
          exitCode: 0
        });

      const result = await adapter.isAvailable();
      
      expect(result).toBe(true);
      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        'docker version --format json'
      );
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should return false when Docker is not available', async () => {
      // Mock getConnection to return the mock client
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      // Mock the executeSSHCommand method to return failure
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: '',
          stderr: 'docker: command not found',
          exitCode: 1
        });

      const result = await adapter.isAvailable();
      
      expect(result).toBe(false);
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should return false when SSH connection fails', async () => {
      // Mock the getConnection method to throw an error
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockRejectedValue(new Error('Connection failed'));

      const result = await adapter.isAvailable();
      
      expect(result).toBe(false);
      
      getConnectionSpy.mockRestore();
    });
  });

  describe('execute', () => {
    test('should execute command in remote Docker container', async () => {
      // Mock getConnection to return the mock client
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      // Mock the executeSSHCommand method for successful execution
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: 'hello\n',
          stderr: '',
          exitCode: 0
        });

      const result = await adapter.execute({
        command: 'echo',
        args: ['hello'],
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container'
          }
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello\n');
      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('docker exec'),
        undefined,
        120000,  // default timeout
        undefined
      );
      // Check the command includes our expected parts
      const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
      expect(dockerCommand).toContain('test-container');
      expect(dockerCommand).toContain('echo hello');
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should handle docker exec with user option', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: 'testuser\n',
          stderr: '',
          exitCode: 0
        });

      await adapter.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container',
            user: 'testuser'
          }
        }
      });

      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('docker exec'),
        undefined,
        120000,
        undefined
      );
      const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
      expect(dockerCommand).toContain('-u testuser');
      expect(dockerCommand).toContain('test-container');
      expect(dockerCommand).toContain('whoami');
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should handle docker exec with working directory', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: '/workspace\n',
          stderr: '',
          exitCode: 0
        });

      await adapter.execute({
        command: 'pwd',
        cwd: '/app',
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container',
            workdir: '/workspace'
          }
        }
      });

      // Should prefer docker workdir over command cwd
      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('docker exec'),
        undefined,
        120000,
        undefined
      );
      const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
      expect(dockerCommand).toContain('-w /workspace');
      expect(dockerCommand).toContain('test-container');
      expect(dockerCommand).toContain('pwd');
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should handle environment variables', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: 'FOO=bar\nBAZ=qux\n',
          stderr: '',
          exitCode: 0
        });

      await adapter.execute({
        command: 'printenv',
        env: {
          FOO: 'bar',
          BAZ: 'qux'
        },
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container'
          }
        }
      });

      const callArgs = executeSSHCommandSpy.mock.calls[0];
      const dockerCommand = callArgs?.[1] || '';
      expect(dockerCommand).toContain('-e FOO=bar');
      expect(dockerCommand).toContain('-e BAZ=qux');
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should handle shell commands', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: '2\n',
          stderr: '',
          exitCode: 0
        });

      await adapter.execute({
        command: 'echo "hello world" | wc -w',
        shell: true,
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container'
          }
        }
      });

      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/docker exec.*test-container.*\/bin\/sh -c/),
        undefined,
        120000,
        undefined
      );
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should handle stdin input', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: 'test input',
          stderr: '',
          exitCode: 0
        });

      await adapter.execute({
        command: 'cat',
        stdin: 'test input',
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container'
          }
        }
      });

      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('docker exec'),
        'test input',
        120000,
        undefined
      );
      const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
      expect(dockerCommand).toContain('-i');
      expect(dockerCommand).toContain('test-container');
      expect(dockerCommand).toContain('cat');
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should handle TTY option', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0
        });

      await adapter.execute({
        command: 'bash',
        stdin: 'ls\n',
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container',
            tty: true
          }
        }
      });

      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('docker exec'),
        'ls\n',
        120000,
        undefined
      );
      const dockerCommand = executeSSHCommandSpy.mock.calls[0]?.[1];
      expect(dockerCommand).toContain('-i');
      expect(dockerCommand).toContain('-t');
      expect(dockerCommand).toContain('test-container');
      expect(dockerCommand).toContain('bash');
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should throw CommandError on command failure', async () => {
      // Create adapter with throwOnNonZeroExit enabled
      const throwAdapter = new RemoteDockerAdapter({
        ...testConfig,
        throwOnNonZeroExit: true
      });
      
      const getConnectionSpy = jest.spyOn(throwAdapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      const executeSSHCommandSpy = jest.spyOn(throwAdapter as any, 'executeSSHCommand')
        .mockResolvedValue({
          stdout: '',
          stderr: 'docker: Error response from daemon',
          exitCode: 125
        });

      await expect(
        throwAdapter.execute({
          command: 'invalid-command',
          adapterOptions: {
            type: 'remote-docker',
            ssh: testConfig.ssh,
            docker: {
              container: 'test-container'
            }
          }
        })
      ).rejects.toThrow(CommandError);
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });

    test('should handle connection errors', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockRejectedValue(new Error('Connection refused'));

      await expect(
        adapter.execute({
          command: 'echo',
          adapterOptions: {
            type: 'remote-docker',
            ssh: testConfig.ssh,
            docker: {
              container: 'test-container'
            }
          }
        })
      ).rejects.toThrow(DockerError);
      
      getConnectionSpy.mockRestore();
    });

    test('should handle timeout', async () => {
      // Mock executeSSHCommand to simulate a timeout
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockImplementation(() => new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error('Command timed out after 100ms'));
            }, 150);
          }));

      const promise = adapter.execute({
        command: 'sleep 10',
        timeout: 100,
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container'
          }
        }
      });

      await expect(promise).rejects.toThrow();
      
      executeSSHCommandSpy.mockRestore();
    });
  });

  describe('auto-create container', () => {
    beforeEach(() => {
      adapter = new RemoteDockerAdapter({
        ...testConfig,
        autoCreate: {
          enabled: true,
          image: 'alpine:latest',
          autoRemove: true,
          volumes: ['/data:/data']
        }
      });
    });

    test('should create temporary container if it does not exist', async () => {
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
        
      let callCount = 0;
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockImplementation((client, command) => {
          callCount++;
          
          // First call: check container exists (fails)
          if (callCount === 1) {
            return Promise.resolve({
              stdout: '',
              stderr: 'Error: No such container',
              exitCode: 1
            });
          }
          // Second call: create container (succeeds)
          else if (callCount === 2) {
            return Promise.resolve({
              stdout: 'container-id',
              stderr: '',
              exitCode: 0
            });
          }
          // Third call: execute command
          else {
            return Promise.resolve({
              stdout: 'hello',
              stderr: '',
              exitCode: 0
            });
          }
        });

      await adapter.execute({
        command: 'echo hello',
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'test-container'
          }
        }
      });

      // Check that container creation was attempted
      expect(executeSSHCommandSpy).toHaveBeenCalledTimes(3);
      const calls = executeSSHCommandSpy.mock.calls;
      expect(calls[1]?.[1]).toMatch(/docker run -d --name xec-temp-.* --rm -v \/data:\/data alpine:latest tail -f \/dev\/null/);
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });
  });

  describe('dispose', () => {
    test('should close SSH connection', async () => {
      // First disposal without connection
      await adapter.dispose();
      expect(mockClient.end).not.toHaveBeenCalled();

      // Mock getConnection to return the mock client
      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);
      
      // Set sshClient to simulate an active connection
      (adapter as any).sshClient = mockClient;
      
      await adapter.dispose();
      expect(mockClient.end).toHaveBeenCalled();
      
      getConnectionSpy.mockRestore();
    });

    test('should clean up temporary containers', async () => {
      // Create adapter with auto-create enabled
      adapter = new RemoteDockerAdapter({
        ...testConfig,
        autoCreate: {
          enabled: true,
          image: 'alpine:latest',
          autoRemove: true
        }
      });

      const getConnectionSpy = jest.spyOn(adapter as any, 'getConnection')
        .mockResolvedValue(mockClient);

      // Mock executeSSHCommand for container creation
      let callCount = 0;
      const executeSSHCommandSpy = jest.spyOn(adapter as any, 'executeSSHCommand')
        .mockImplementation((client, command) => {
          callCount++;
          // Container doesn't exist on first check
          if (callCount === 1) {
            return Promise.resolve({ stdout: '', stderr: 'No such container', exitCode: 1 });
          }
          // All other commands succeed
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        });

      // Execute command to create temp container
      await adapter.execute({
        command: 'echo hello',
        adapterOptions: {
          type: 'remote-docker',
          ssh: testConfig.ssh,
          docker: {
            container: 'non-existent'
          }
        }
      });

      // Reset spy and set up for dispose
      executeSSHCommandSpy.mockClear();
      executeSSHCommandSpy.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      
      // Set up connection for dispose
      (adapter as any).sshClient = mockClient;

      // Dispose should stop temp containers
      await adapter.dispose();

      // Should have attempted to stop the temp container
      expect(executeSSHCommandSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/docker stop xec-temp-.*/)
      );
      
      getConnectionSpy.mockRestore();
      executeSSHCommandSpy.mockRestore();
    });
  });
});