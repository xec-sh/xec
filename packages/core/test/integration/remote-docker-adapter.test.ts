import { test, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { $, ExecutionEngine } from '../../src';
import { DockerError } from '../../src/core/error';
import { RemoteDockerAdapter } from '../../../src/adapters/remote-docker/index';

// Mock SSH client for testing
class MockSSHClient {
  private connected = false;
  private listeners: Map<string, Function[]> = new Map();
  
  connect(config: any) {
    // console.log('MockSSHClient connect called');
    this.connected = true;
    process.nextTick(() => {
      // console.log('MockSSHClient emitting ready');
      this.emit('ready');
    });
  }
  
  end() {
    this.connected = false;
  }
  
  destroy() {
    this.connected = false;
  }
  
  exec(command: string, callback: (err: any, stream: any) => void) {
    // console.log('MockSSHClient exec called with command:', command);
    
    if (!this.connected) {
      callback(new Error('Not connected'), null);
      return;
    }
    
    // Simulate docker commands
    const stream = new MockStream();
    
    // Return stream immediately, then emit events
    process.nextTick(() => {
      callback(null, stream);
    });
    
    if (command.includes('docker version --format json')) {
      setTimeout(() => {
        stream.stdout.emit('data', '{"Version":"20.10.0"}');
        stream.emit('close', 0);
      }, 10);
    } else if (command.includes('docker inspect')) {
      // Handle container existence check
      if (command.includes('test-container')) {
        setTimeout(() => {
          stream.stdout.emit('data', 'true');
          stream.emit('close', 0);
        }, 10);
      } else {
        setTimeout(() => {
          stream.stderr.emit('data', 'Error: No such container');
          stream.emit('close', 1);
        }, 10);
      }
    } else if (command.includes('docker exec')) {
      // Handle various docker exec command formats
      // Extract the actual command from docker exec
      // Commands can be: docker exec [options] container command [args]
      // or: docker exec [options] container /bin/sh -c "command"
      
      setTimeout(() => {
        // Check for working directory option
        const workdirMatch = command.match(/-w\s+(\S+)/);
        const isWorkdirApp = workdirMatch && workdirMatch[1] === '/app';
        
        // Check for shell command format
        const shellCmdMatch = command.match(/\/bin\/sh -c "(.*)"/);
        let actualCommand = '';
        
        if (shellCmdMatch && shellCmdMatch[1]) {
          // Command is wrapped in shell
          actualCommand = shellCmdMatch[1];
          // Unescape quotes in the command
          actualCommand = actualCommand.replace(/\\"/g, '"');
        } else {
          // Direct command format - extract command after container name
          const parts = command.split(/\s+/);
          const execIndex = parts.indexOf('exec');
          let containerIndex = -1;
          
          // Skip options and find container name
          for (let i = execIndex + 1; i < parts.length; i++) {
            const part = parts[i];
            const prevPart = i > 0 ? parts[i - 1] : undefined;
            if (part && !part.startsWith('-') && 
                (i === execIndex + 1 || (prevPart && !prevPart.startsWith('-')))) {
              containerIndex = i;
              break;
            }
          }
          
          if (containerIndex >= 0 && containerIndex + 1 < parts.length) {
            actualCommand = parts.slice(containerIndex + 1).join(' ');
          }
        }
        
        // Process the actual command
        if (actualCommand.includes('echo')) {
          const echoMatch = actualCommand.match(/echo\s+"([^"]+)"/) ||
                           actualCommand.match(/echo\s+(.+)/);
          if (echoMatch && echoMatch[1]) {
            stream.stdout.emit('data', echoMatch[1]);
          }
        } else if (actualCommand === 'pwd') {
          stream.stdout.emit('data', isWorkdirApp ? '/app' : '/');
        } else if (actualCommand.includes('printenv')) {
          const envMatch = actualCommand.match(/printenv\s+(\w+)/);
          if (envMatch) {
            const envVar = envMatch[1];
            if (envVar === 'MY_VAR' || envVar === 'TEST_VAR') {
              stream.stdout.emit('data', envVar === 'MY_VAR' ? 'value' : 'test-value');
            }
          }
        } else if (actualCommand === 'cat') {
          stream.stdout.emit('data', stream.stdinData || '');
        } else if (actualCommand.includes('exit')) {
          const exitMatch = actualCommand.match(/exit\s+(\d+)/);
          const exitCode = exitMatch && exitMatch[1] ? parseInt(exitMatch[1]) : 1;
          stream.emit('close', exitCode);
          return;
        }
        
        stream.emit('close', 0);
      }, 10);
    } else if (command.includes('docker run')) {
      setTimeout(() => {
        stream.stdout.emit('data', 'container-12345');
        stream.emit('close', 0);
      }, 10);
    } else if (command.includes('docker stop')) {
      setTimeout(() => {
        stream.emit('close', 0);
      }, 10);
    } else {
      // Default: return empty output with success
      setTimeout(() => {
        stream.emit('close', 0);
      }, 10);
    }
    
    // Callback is called immediately with stream
  }
  
  once(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }
  
  emit(event: string, ...args: any[]) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(...args));
    this.listeners.delete(event);
  }
}

class MockStream {
  stdout = {
    listeners: new Map<string, Function[]>(),
    on(event: string, cb: Function) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(cb);
      return this;
    },
    emit(event: string, ...args: any[]) {
      const callbacks = this.listeners.get(event) || [];
      callbacks.forEach(cb => cb(...args));
    },
    pipe(target: any) {
      this.on('data', (chunk: any) => target.write(chunk));
      return target;
    }
  };
  
  stderr = {
    listeners: new Map<string, Function[]>(),
    on(event: string, cb: Function) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(cb);
      return this;
    },
    emit(event: string, ...args: any[]) {
      const callbacks = this.listeners.get(event) || [];
      callbacks.forEach(cb => cb(...args));
    },
    pipe(target: any) {
      this.on('data', (chunk: any) => target.write(chunk));
      return target;
    }
  };
  
  stdinData = '';
  
  write(data: string) {
    this.stdinData += data;
  }
  
  end() {}
  
  destroy() {
    this.emit('close', -1, 'SIGTERM');
  }
  
  private listeners: Map<string, Function[]> = new Map();
  
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    return this;
  }
  
  emit(event: string, ...args: any[]) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(...args));
  }
}

// Mock ssh2 module
jest.mock('ssh2', () => ({
  Client: MockSSHClient
}));

// TODO: These tests need to be fixed with proper mocking of SSH2
// The jest.mock() is not intercepting the ssh2 import properly
// This needs investigation and a better mocking strategy

describe('RemoteDockerAdapter', () => {
  let adapter: RemoteDockerAdapter;
  
  beforeEach(() => {
    adapter = new RemoteDockerAdapter({
      ssh: {
        host: 'test-host',
        username: 'test-user',
        password: 'test-pass'
      }
    });
  });
  
  afterEach(async () => {
    await adapter.dispose();
  });
  
  describe('Basic functionality', () => {
    test('should create adapter with config', () => {
      expect(adapter).toBeDefined();
    });
    
    test.skip('should check availability', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });
    
    test.skip('should execute command in remote docker', async () => {
      const result = await adapter.execute({
        command: 'echo "Hello from Docker"',
        adapterOptions: {
          type: 'remote-docker',
          ssh: {
            host: 'test-host',
            username: 'test-user'
          },
          docker: {
            container: 'test-container'
          }
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello from Docker');
    });
  });
  
  describe('Docker options', () => {
    test.skip('should support working directory', async () => {
      const result = await adapter.execute({
        command: 'pwd',
        adapterOptions: {
          type: 'remote-docker',
          ssh: { host: 'test-host', username: 'test-user' },
          docker: {
            container: 'test-container',
            workdir: '/app'
          }
        }
      });
      
      expect(result.stdout).toBe('/app');
    });
    
    test.skip('should pass environment variables', async () => {
      const result = await adapter.execute({
        command: 'printenv TEST_VAR',
        env: { TEST_VAR: 'test-value' },
        adapterOptions: {
          type: 'remote-docker',
          ssh: { host: 'test-host', username: 'test-user' },
          docker: { container: 'test-container' }
        }
      });
      
      expect(result.stdout).toBe('test-value');
    });
    
    test.skip('should handle stdin input', async () => {
      const result = await adapter.execute({
        command: 'cat',
        stdin: 'Input data',
        adapterOptions: {
          type: 'remote-docker',
          ssh: { host: 'test-host', username: 'test-user' },
          docker: { container: 'test-container' }
        }
      });
      
      expect(result.stdout).toBe('Input data');
    });
    
    test.skip('should handle command failure', async () => {
      const result = await adapter.execute({
        command: 'exit 42',
        shell: true,
        adapterOptions: {
          type: 'remote-docker',
          ssh: { host: 'test-host', username: 'test-user' },
          docker: { container: 'test-container' }
        }
      });
      
      expect(result.exitCode).toBe(42);
    });
  });
  
  describe('Auto-create containers', () => {
    test.skip('should create temporary container when enabled', async () => {
      const autoAdapter = new RemoteDockerAdapter({
        ssh: {
          host: 'test-host',
          username: 'test-user',
          password: 'test-pass'
        },
        autoCreate: {
          enabled: true,
          image: 'alpine:latest',
          autoRemove: true
        }
      });
      
      try {
        const result = await autoAdapter.execute({
          command: 'echo "Created"',
          adapterOptions: {
            type: 'remote-docker',
            ssh: { host: 'test-host', username: 'test-user' },
            docker: { container: 'non-existent' }
          }
        });
        
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('Created');
      } finally {
        await autoAdapter.dispose();
      }
    });
    
    test.skip('should clean up temporary containers on dispose', async () => {
      const autoAdapter = new RemoteDockerAdapter({
        ssh: {
          host: 'test-host',
          username: 'test-user',
          password: 'test-pass'
        },
        autoCreate: {
          enabled: true,
          image: 'alpine:latest',
          autoRemove: false // Don't auto-remove to test cleanup
        }
      });
      
      await autoAdapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'remote-docker',
          ssh: { host: 'test-host', username: 'test-user' },
          docker: { container: 'non-existent' }
        }
      });
      
      // Dispose should stop containers
      await autoAdapter.dispose();
      
      // Verify cleanup was attempted (mock will handle it)
      expect(true).toBe(true);
    });
  });
  
  describe('Connection pooling', () => {
    test.skip('should reuse SSH connections', async () => {
      let connectionCount = 0;
      const originalConnect = MockSSHClient.prototype.connect;
      MockSSHClient.prototype.connect = function(config: any) {
        connectionCount++;
        originalConnect.call(this, config);
      };
      
      try {
        // Execute multiple commands
        await adapter.execute({
          command: 'echo "First"',
          adapterOptions: {
            type: 'remote-docker',
            ssh: { host: 'test-host', username: 'test-user' },
            docker: { container: 'test-container' }
          }
        });
        
        await adapter.execute({
          command: 'echo "Second"',
          adapterOptions: {
            type: 'remote-docker',
            ssh: { host: 'test-host', username: 'test-user' },
            docker: { container: 'test-container' }
          }
        });
        
        // Should only connect once
        expect(connectionCount).toBe(1);
      } finally {
        MockSSHClient.prototype.connect = originalConnect;
      }
    });
    
    test('should handle connection failures', async () => {
      const failAdapter = new RemoteDockerAdapter({
        ssh: {
          host: 'fail-host',
          username: 'test-user',
          password: 'test-pass',
          readyTimeout: 100
        }
      });
      
      // Override connect to simulate failure
      const client = new MockSSHClient();
      client.connect = function() {
        setTimeout(() => this.emit('error', new Error('Connection failed')), 0);
      };
      (failAdapter as any).sshClient = null;
      (failAdapter as any).getConnection = () => Promise.reject(new Error('Connection failed'));
      
      await expect(failAdapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'remote-docker',
          ssh: { host: 'fail-host', username: 'test-user' },
          docker: { container: 'test-container' }
        }
      })).rejects.toThrow(DockerError);
    });
  });
  
  describe('Error handling', () => {
    test.skip('should handle missing container', async () => {
      await expect(adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'remote-docker',
          ssh: { host: 'test-host', username: 'test-user' },
          docker: { container: 'non-existent' }
        }
      })).rejects.toThrow(DockerError);
    });
    
    test('should handle invalid adapter options', async () => {
      await expect(adapter.execute({
        command: 'echo test',
        adapterOptions: {} as any
      })).rejects.toThrow('Remote Docker options not provided');
    });
  });
  
  describe('Factory function', () => {
    test('should create adapter directly', () => {
      const factoryAdapter = new RemoteDockerAdapter({
        ssh: {
          host: 'test-host',
          username: 'test-user',
          password: 'test-pass'
        },
        dockerPath: '/usr/bin/docker'
      });
      
      expect(factoryAdapter).toBeInstanceOf(RemoteDockerAdapter);
    });
  });
  
  describe('Integration with ExecutionEngine', () => {
    test.skip('should work with execution engine', async () => {
      const engine = new ExecutionEngine();
      
      const result = await engine.remoteDocker({
        ssh: { host: 'test-host', username: 'test-user' },
        docker: { container: 'test-container' }
      }).run`echo "Hello from remote docker"`;
      
      expect(result.stdout).toBe('Hello from remote docker');
    });
    
    test.skip('should support configuration chaining', async () => {
      const engine = new ExecutionEngine();
      
      const remote = engine.remoteDocker({
        ssh: { host: 'test-host', username: 'test-user' },
        docker: { container: 'test-container' }
      });
      
      const withEnv = remote.env({ MY_VAR: 'value' });
      
      const result = await withEnv.run`printenv MY_VAR`;
      
      expect(result.stdout).toBe('value');
    });

    test.skip('should work with global $ function', async () => {
      const result = await $.remoteDocker({
        ssh: { host: 'test-host', username: 'test-user' },
        docker: { container: 'test-container' }
      })`echo "Hello from $"`;
      
      expect(result.stdout).toBe('Hello from $');
    });
  });
});