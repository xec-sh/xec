import { it , jest, expect, describe, beforeEach } from '@jest/globals';

import { unifiedConfig } from '../../../src/config/unified-config.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { ConvenienceAPI, attachConvenienceMethods } from '../../../src/utils/convenience.js';

import type { ExecutionResult } from '../../../src/core/result.js';

// Helper to create mock ProcessPromise
function createMockProcessPromise(result: Partial<ExecutionResult>): any {
  const fullResult: ExecutionResult = {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode || 0,
    isSuccess: result.isSuccess || (() => result.exitCode === 0),
    duration: result.duration || 100,
    command: result.command || 'mock command',
    startedAt: result.startedAt || new Date(),
    finishedAt: result.finishedAt || new Date(),
    adapter: result.adapter || 'mock',
    signal: result.signal,
    toJSON: () => ({
      stdout: fullResult.stdout,
      stderr: fullResult.stderr,
      exitCode: fullResult.exitCode,
      duration: fullResult.duration,
      command: fullResult.command,
      adapter: fullResult.adapter,
      signal: fullResult.signal
    }),
    throwIfFailed: () => {
      if (fullResult.exitCode !== 0) {
        throw new Error(`Command failed with exit code ${fullResult.exitCode}`);
      }
    }
  };
  
  const promise = Promise.resolve(fullResult);
  const mockProcessPromise: any = promise;
  
  // Add ProcessPromise properties without spreading to avoid circular references
  mockProcessPromise.stdout = fullResult.stdout;
  mockProcessPromise.stderr = fullResult.stderr;
  mockProcessPromise.exitCode = fullResult.exitCode;
  mockProcessPromise.command = fullResult.command;
  mockProcessPromise.startedAt = fullResult.startedAt;
  mockProcessPromise.finishedAt = fullResult.finishedAt;
  mockProcessPromise.adapter = fullResult.adapter;
  mockProcessPromise.signal = fullResult.signal;
  mockProcessPromise.isSuccess = fullResult.isSuccess;
  mockProcessPromise.duration = fullResult.duration;
  mockProcessPromise.toJSON = fullResult.toJSON;
  mockProcessPromise.throwIfFailed = fullResult.throwIfFailed;
  
  // Add ProcessPromise-specific methods
  mockProcessPromise.nothrow = () => mockProcessPromise;
  mockProcessPromise.quiet = () => mockProcessPromise;
  mockProcessPromise.verbose = () => mockProcessPromise;
  mockProcessPromise.pipe = () => mockProcessPromise;
  mockProcessPromise.timeout = () => mockProcessPromise;
  mockProcessPromise.kill = () => {};
  mockProcessPromise.stdin = { write: jest.fn(), end: jest.fn() };
  mockProcessPromise.exitCode = Promise.resolve(fullResult.exitCode);
  
  return mockProcessPromise;
}

// Helper to create mock ExecutionResult
function createMockExecutionResult(partial: Partial<ExecutionResult>): ExecutionResult {
  return {
    stdout: partial.stdout || '',
    stderr: partial.stderr || '',
    exitCode: partial.exitCode || 0,
    isSuccess: partial.isSuccess || (() => partial.exitCode === 0),
    duration: partial.duration || 100,
    command: partial.command || 'mock command',
    startedAt: partial.startedAt || new Date(),
    finishedAt: partial.finishedAt || new Date(),
    adapter: partial.adapter || 'mock',
    signal: partial.signal,
    toJSON: () => ({
      stdout: partial.stdout || '',
      stderr: partial.stderr || '',
      exitCode: partial.exitCode || 0,
      duration: partial.duration || 100,
      command: partial.command || 'mock command',
      adapter: partial.adapter || 'mock',
      signal: partial.signal
    }),
    throwIfFailed: () => {
      if ((partial.exitCode || 0) !== 0) {
        throw new Error(`Command failed with exit code ${partial.exitCode}`);
      }
    }
  };
}

describe('ConvenienceAPI', () => {
  let engine: ExecutionEngine;
  let api: ConvenienceAPI;
  let mockConfig: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock config
    mockConfig = {
      hosts: {
        prod: {
          host: 'prod.example.com',
          username: 'deploy'
        },
        staging: {
          host: 'staging.example.com',
          username: 'ubuntu'
        }
      },
      containers: {
        app: {
          name: 'myapp-container'
        },
        db: {
          name: 'postgres-container'
        }
      },
      pods: {
        web: {
          name: 'web-pod',
          namespace: 'default'
        },
        api: {
          name: 'api-pod',
          namespace: 'production'
        }
      }
    };
    
    // Mock the unifiedConfig methods using spyOn
    jest.spyOn(unifiedConfig, 'load').mockResolvedValue(mockConfig);
    jest.spyOn(unifiedConfig, 'hostToSSHOptions').mockImplementation(async (name: string) => {
      const options = {
        host: mockConfig.hosts[name]?.host || name,
        username: mockConfig.hosts[name]?.username
      };
      return options;
    });
    jest.spyOn(unifiedConfig, 'podToK8sOptions').mockImplementation((name: string) => ({
      pod: mockConfig.pods[name]?.name || name,
      namespace: mockConfig.pods[name]?.namespace || 'default'
    }));
    
    // Create engine and api after mocks are set up
    engine = new ExecutionEngine();
    api = new ConvenienceAPI(engine);
  });
  
  describe('onHost() - SSH execution', () => {
    it('should execute on a single host', async () => {
      // Verify mock is working
      const loadedConfig = await unifiedConfig.load();
      expect(loadedConfig).toEqual(mockConfig);
      
      const sshOptions = await unifiedConfig.hostToSSHOptions('prod');
      expect(sshOptions).toEqual({
        host: 'prod.example.com',
        username: 'deploy'
      });
      
      const sshCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({ 
          stdout: 'uptime output',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({ 
            stdout: 'uptime output',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const sshSpy = jest.spyOn(engine, 'ssh').mockReturnValue(sshCallable as any);
      
      const result = await api.onHost('prod', 'uptime');
      
      expect(sshSpy).toHaveBeenCalledWith({
        host: 'prod.example.com',
        username: 'deploy'
      });
      expect((result as ExecutionResult).stdout).toBe('uptime output');
    });
    
    it('should execute on multiple hosts in parallel', async () => {
      let callCount = 0;
      const sshSpy = jest.spyOn(engine, 'ssh').mockImplementation(() => {
        const sshCallable = Object.assign(
          jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: `output-${callCount++}`,
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          })),
          {
            exec: jest.fn().mockImplementation(() => createMockProcessPromise({
              stdout: `output-${callCount}`,
              stderr: '',
              exitCode: 0,
              isSuccess: () => true
            }))
          }
        );
        return sshCallable as any;
      });
      
      const results = await api.onHost(['prod', 'staging'], 'uptime');
      
      expect(sshSpy).toHaveBeenCalledTimes(2);
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(2);
      const resultsArray = results as ExecutionResult[];
      expect(resultsArray[0]?.stdout).toBe('output-0');
      expect(resultsArray[1]?.stdout).toBe('output-1');
    });
    
    it('should handle direct hostnames', async () => {
      const sshCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({ 
          stdout: 'direct output',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({ 
            stdout: 'direct output',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const sshSpy = jest.spyOn(engine, 'ssh').mockReturnValue(sshCallable as any);
      
      const result = await api.onHost('direct.host.com', 'ls');
      
      expect(sshSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'direct.host.com'
        })
      );
    });
    
    it('should handle template strings with values', async () => {
      const sshCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({ 
          stdout: 'template output',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({ 
            stdout: 'template output',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const sshSpy = jest.spyOn(engine, 'ssh').mockReturnValue(sshCallable as any);
      
      const file = 'test.txt';
      const cmd = ['ls', '-la', file];
      const result = await api.onHost('prod', cmd as any);
      
      expect(sshSpy).toHaveBeenCalled();
      expect((result as ExecutionResult).stdout).toBe('template output');
    });
  });
  
  describe('in() - Container/Pod execution', () => {
    it('should execute in a container', async () => {
      const dockerCallableMock = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: 'container output',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: 'container output',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const dockerSpy = jest.spyOn(engine, 'docker').mockReturnValue(dockerCallableMock as any);
      
      const result = await api.in('app', 'npm test');
      
      expect(dockerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          container: 'myapp-container'
        })
      );
      expect((result as ExecutionResult).stdout).toBe('container output');
    });
    
    it('should execute in a pod', async () => {
      const k8sCallableMock = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: 'pod output',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: 'pod output',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const k8sSpy = jest.spyOn(engine, 'k8s').mockReturnValue(k8sCallableMock as any);
      
      const result = await api.in('pod:web', 'date');
      
      expect(k8sSpy).toHaveBeenCalledWith({
        pod: 'web-pod',
        namespace: 'default'
      });
      expect((result as ExecutionResult).stdout).toBe('pod output');
    });
    
    it('should handle container: prefix', async () => {
      const dockerCallableMock = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: 'explicit container',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: 'explicit container',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const dockerSpy = jest.spyOn(engine, 'docker').mockReturnValue(dockerCallableMock as any);
      
      await api.in('container:nginx', 'nginx -v');
      
      expect(dockerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          container: 'nginx'
        })
      );
    });
    
    it('should provide interactive shell when no command given', async () => {
      const dockerCallableMock = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: 'shell prompt',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: 'shell prompt',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const dockerSpy = jest.spyOn(engine, 'docker').mockReturnValue(dockerCallableMock as any);
      
      const result = await api.in('app');
      
      // Should execute /bin/sh for interactive shell
      expect(dockerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          container: 'myapp-container'
        })
      );
      expect(result).toBeDefined();
      // Verify the actual call was made to execute /bin/sh
      expect(dockerCallableMock).toHaveBeenCalled();
    });
    
    it('should handle template strings with values in container', async () => {
      const dockerCallableMock = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: 'docker template output',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: 'docker template output',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      jest.spyOn(engine, 'docker').mockReturnValue(dockerCallableMock as any);
      
      const file = 'app.js';
      const cmd = ['cat', file];
      const result = await api.in('app', cmd as any);
      
      expect(dockerCallableMock).toHaveBeenCalled();
      expect((result as ExecutionResult).stdout).toBe('docker template output');
    });
  });
  
  describe('copy() - File operations', () => {
    it('should handle local to local copy', async () => {
      const execSpy = jest.spyOn(engine, 'execute').mockResolvedValue(
        createMockExecutionResult({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true,
          duration: 100
        })
      );
      
      await api.copy('./src', './dest');
      
      expect(execSpy).toHaveBeenCalled();
      const command = execSpy.mock.calls[0]?.[0];
      expect(command?.command).toContain('cp -r');
    });
    
    it('should handle SSH upload', async () => {
      const uploadSpy = jest.fn().mockImplementation(() => Promise.resolve());
      const sshCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          uploadFile: uploadSpy
        }
      );
      jest.spyOn(engine, 'ssh').mockReturnValue(sshCallable as any);
      
      await api.copy('./local-file.txt', 'prod:/remote/path.txt');
      
      expect(uploadSpy).toHaveBeenCalledWith('./local-file.txt', '/remote/path.txt');
    });
    
    it('should handle SSH download', async () => {
      const downloadSpy = jest.fn().mockImplementation(() => Promise.resolve());
      const sshCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          downloadFile: downloadSpy
        }
      );
      jest.spyOn(engine, 'ssh').mockReturnValue(sshCallable as any);
      
      await api.copy('staging:/logs/app.log', './local-logs/');
      
      expect(downloadSpy).toHaveBeenCalledWith('/logs/app.log', './local-logs/');
    });
    
    it('should handle Docker copy operations', async () => {
      const copyFromSpy = jest.fn().mockImplementation(() => Promise.resolve());
      const copyToSpy = jest.fn().mockImplementation(() => Promise.resolve());
      const containerMock = {
        copyFrom: copyFromSpy,
        copyTo: copyToSpy
      };
      
      const dockerCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          start: jest.fn(() => Promise.resolve(containerMock))
        }
      );
      jest.spyOn(engine, 'docker').mockReturnValue(dockerCallable as any);
      
      // Copy to container
      await api.copy('./config.json', 'container:app:/app/config.json');
      expect(copyToSpy).toHaveBeenCalledWith('./config.json', '/app/config.json');
      
      // Copy from container
      await api.copy('container:app:/logs', './backup/');
      expect(copyFromSpy).toHaveBeenCalledWith('/logs', './backup/');
    });
    
    it('should handle Kubernetes copy operations', async () => {
      const copyFromSpy = jest.fn().mockImplementation(() => Promise.resolve());
      const copyToSpy = jest.fn().mockImplementation(() => Promise.resolve());
      const podMock = {
        copyFrom: copyFromSpy,
        copyTo: copyToSpy
      };
      
      const k8sCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          pod: jest.fn().mockReturnValue(podMock)
        }
      );
      jest.spyOn(engine, 'k8s').mockReturnValue(k8sCallable as any);
      
      // Copy to pod
      await api.copy('./data', 'pod:web:/data');
      expect(copyToSpy).toHaveBeenCalledWith('./data', '/data');
      
      // Copy from pod
      await api.copy('pod:api:/var/log', './logs/');
      expect(copyFromSpy).toHaveBeenCalledWith('/var/log', './logs/');
    });
    
    it('should throw error for unsupported operations', async () => {
      await expect(api.copy('prod:/file', 'staging:/file'))
        .rejects.toThrow('Direct SSH to SSH copy not supported yet');
      
      // Mock docker for container to container copy test
      const dockerCallable = Object.assign(
        jest.fn(),
        {
          start: jest.fn().mockImplementation(() => Promise.resolve({
            copyFrom: jest.fn(),
            copyTo: jest.fn()
          }))
        }
      );
      jest.spyOn(engine, 'docker').mockReturnValue(dockerCallable as any);
      
      await expect(api.copy('container:app:/data', 'container:db:/data'))
        .rejects.toThrow('Direct container to container copy not supported yet');
      
      // Mock k8s for pod to pod copy test
      const k8sCallable = Object.assign(
        jest.fn(),
        {
          pod: jest.fn().mockReturnValue({
            copyFrom: jest.fn(),
            copyTo: jest.fn()
          })
        }
      );
      jest.spyOn(engine, 'k8s').mockReturnValue(k8sCallable as any);
      
      await expect(api.copy('pod:web:/logs', 'pod:api:/logs'))
        .rejects.toThrow('Direct pod to pod copy not supported yet');
    });
  });
  
  describe('forward() - Port forwarding', () => {
    it('should create SSH tunnel', async () => {
      const tunnelMock = {
        open: jest.fn(() => Promise.resolve()),
        close: jest.fn(() => Promise.resolve()),
        localPort: 3307,
        localHost: 'localhost',
        remoteHost: 'localhost',
        remotePort: 3306,
        isOpen: true
      };
      
      const sshCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          tunnel: jest.fn().mockImplementation(() => Promise.resolve(tunnelMock))
        }
      );
      jest.spyOn(engine, 'ssh').mockReturnValue(sshCallable as any);
      
      const tunnel = await api.forward('prod:3306', 3307);
      
      expect(sshCallable.tunnel).toHaveBeenCalledWith({
        localPort: 3307,
        remoteHost: 'localhost',
        remotePort: 3306
      });
      expect(tunnel).toBe(tunnelMock);
    });
    
    it('should create K8s port forward', async () => {
      const portForwardMock = {
        localPort: 8080,
        remotePort: 80,
        pod: 'web',
        namespace: 'default',
        stop: jest.fn(() => Promise.resolve())
      };
      
      const k8sCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          pod: jest.fn().mockReturnValue({
            portForward: jest.fn(() => Promise.resolve(portForwardMock)),
            portForwardDynamic: jest.fn(() => Promise.resolve({
              ...portForwardMock,
              localPort: 12345
            }))
          })
        }
      );
      jest.spyOn(engine, 'k8s').mockReturnValue(k8sCallable as any);
      
      // With specific local port
      const forward1 = await api.forward('pod:web:80', 8080);
      expect(forward1.localPort).toBe(8080);
      
      // With dynamic local port
      const forward2 = await api.forward('pod:api:443');
      expect(forward2.localPort).toBe(12345);
    });
    
    it('should throw error for Docker port forwarding', async () => {
      await expect(api.forward('container:app:5432'))
        .rejects.toThrow('Docker port forwarding not implemented yet');
    });
  });
  
  describe('logs() - Log streaming', () => {
    it('should get container logs', async () => {
      const logsSpy = jest.fn().mockImplementation(() => Promise.resolve('container logs content'));
      const containerMock = {
        logs: logsSpy,
        streamLogs: jest.fn()
      };
      
      const dockerCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          start: jest.fn(() => Promise.resolve(containerMock))
        }
      );
      jest.spyOn(engine, 'docker').mockReturnValue(dockerCallable as any);
      
      const logs = await api.logs('container:app', { tail: 50 });
      
      expect(logsSpy).toHaveBeenCalledWith({
        tail: 50,
        timestamps: undefined
      });
      expect(logs).toBe('container logs content');
    });
    
    it('should stream container logs', async () => {
      const streamSpy = jest.fn().mockImplementation(() => Promise.resolve());
      const containerMock = {
        logs: jest.fn(),
        streamLogs: streamSpy
      };
      
      const dockerCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          start: jest.fn(() => Promise.resolve(containerMock))
        }
      );
      jest.spyOn(engine, 'docker').mockReturnValue(dockerCallable as any);
      
      const onData = jest.fn();
      await api.logs('container:db', { follow: true, onData });
      
      expect(streamSpy).toHaveBeenCalledWith(onData, {
        follow: true,
        tail: undefined,
        timestamps: undefined
      });
    });
    
    it('should get pod logs', async () => {
      const logsSpy = jest.fn().mockImplementation(() => Promise.resolve('pod logs content'));
      const podMock = {
        logs: logsSpy,
        streamLogs: jest.fn()
      };
      
      const k8sCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: '',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          pod: jest.fn().mockReturnValue(podMock)
        }
      );
      jest.spyOn(engine, 'k8s').mockReturnValue(k8sCallable as any);
      
      const logs = await api.logs('pod:web', { 
        tail: 100,
        timestamps: true
      });
      
      expect(logsSpy).toHaveBeenCalledWith({
        tail: 100,
        timestamps: true
      });
      expect(logs).toBe('pod logs content');
    });
    
    it('should tail SSH logs', async () => {
      const sshCallableMock = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: 'ssh log content',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: 'ssh log content',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      const sshSpy = jest.spyOn(engine, 'ssh').mockReturnValue(sshCallableMock as any);
      
      const logs = await api.logs('prod:/var/log/app.log', { tail: 20 });
      
      expect(sshSpy).toHaveBeenCalled();
      expect(logs).toBe('ssh log content');
    });
    
    it('should tail local logs', async () => {
      const runSpy = jest.spyOn(engine, 'run').mockReturnValue(
        createMockProcessPromise({
          stdout: 'local log content',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true,
          duration: 50
        })
      );
      
      const logs = await api.logs('/var/log/system.log', { tail: 30 });
      
      expect(runSpy).toHaveBeenCalled();
      expect(logs).toBe('local log content');
    });
    
    it('should stream SSH logs with follow and onData', async () => {
      const sshCallableMock = Object.assign(
        jest.fn().mockImplementation(() => {
          const proc = createMockProcessPromise({
            stdout: 'streaming ssh logs',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          });
          // Simulate async behavior
          setTimeout(() => {
            // Streaming would happen here
          }, 10);
          return proc;
        }),
        {
          exec: jest.fn()
        }
      );
      jest.spyOn(engine, 'ssh').mockReturnValue(sshCallableMock as any);
      
      const onData = jest.fn();
      await api.logs('prod:/var/log/app.log', { 
        follow: true,
        tail: 100,
        onData 
      });
      
      // Since we're mocking, we need to manually call onData
      // In real implementation, the streaming would call onData
      expect(sshCallableMock).toHaveBeenCalled();
    });
    
    it('should stream local logs with follow and onData', async () => {
      const runSpy = jest.spyOn(engine, 'run').mockReturnValue(
        createMockProcessPromise({
          stdout: 'streaming local logs',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true,
          duration: 50
        })
      );
      
      const onData = jest.fn();
      await api.logs('/var/log/system.log', { 
        follow: true,
        onData 
      });
      
      // Since we're mocking, we need to verify the command was called
      expect(runSpy).toHaveBeenCalled();
    });
  });
  
  describe('smart() - Auto-detection', () => {
    it('should detect and execute on SSH host', async () => {
      const onSpy = jest.spyOn(api, 'onHost').mockResolvedValue({
        stdout: 'ssh result',
        stderr: '',
        exitCode: 0,
        isSuccess: () => true,
        duration: 100
      } as ExecutionResult);
      
      const result = await api.smart('prod uptime');
      
      expect(onSpy).toHaveBeenCalledWith('prod', 'uptime');
      expect(result.stdout).toBe('ssh result');
    });
    
    it('should detect and execute in container', async () => {
      const inSpy = jest.spyOn(api, 'in').mockResolvedValue(
        createMockProcessPromise({
          stdout: 'container result',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true,
          duration: 100
        })
      );
      
      const result = await api.smart('app npm test');
      
      expect(inSpy).toHaveBeenCalledWith('app', 'npm test');
      expect(result.stdout).toBe('container result');
    });
    
    it('should detect and execute in pod', async () => {
      const inSpy = jest.spyOn(api, 'in').mockResolvedValue(
        createMockProcessPromise({
          stdout: 'pod result',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true,
          duration: 100
        })
      );
      
      const result = await api.smart('web date');
      
      expect(inSpy).toHaveBeenCalledWith('pod:web', 'date');
      expect(result.stdout).toBe('pod result');
    });
    
    it('should default to local execution', async () => {
      const execSpy = jest.spyOn(engine, 'execute').mockResolvedValue(
        createMockExecutionResult({
          stdout: 'local result',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true,
          duration: 100
        })
      );
      
      const result = await api.smart('unknown-target ls -la');
      
      expect(execSpy).toHaveBeenCalled();
      expect(result.stdout).toBe('local result');
    });
  });
  
  describe('attachConvenienceMethods', () => {
    it('should attach all convenience methods to engine', () => {
      const enhancedEngine = attachConvenienceMethods(engine);
      
      expect(enhancedEngine.onHost).toBeDefined();
      expect(enhancedEngine.in).toBeDefined();
      expect(enhancedEngine.copy).toBeDefined();
      expect(enhancedEngine.forward).toBeDefined();
      expect(enhancedEngine.logs).toBeDefined();
      expect(enhancedEngine.smart).toBeDefined();
      
      // Should still have original engine methods
      expect(enhancedEngine.execute).toBeDefined();
      expect(enhancedEngine.ssh).toBeDefined();
      expect(enhancedEngine.docker).toBeDefined();
      expect(enhancedEngine.k8s).toBeDefined();
    });
    
    it('should bind methods correctly', async () => {
      const enhancedEngine = attachConvenienceMethods(engine);
      
      const sshCallable = Object.assign(
        jest.fn().mockImplementation(() => createMockProcessPromise({
          stdout: 'bound method result',
          stderr: '',
          exitCode: 0,
          isSuccess: () => true
        })),
        {
          exec: jest.fn().mockImplementation(() => createMockProcessPromise({
            stdout: 'bound method result',
            stderr: '',
            exitCode: 0,
            isSuccess: () => true
          }))
        }
      );
      jest.spyOn(engine, 'ssh').mockReturnValue(sshCallable as any);
      
      // Call convenience method directly on enhanced engine
      const result = await enhancedEngine.onHost('prod', 'test');
      expect((result as ExecutionResult).stdout).toBe('bound method result');
    });
  });
});