import { it, jest, expect, describe, beforeEach } from '@jest/globals';

import { DockerError } from '../../../src/core/error.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { DockerAdapter } from '../../../src/adapters/docker-adapter.js';
import { DockerContainer, createDockerContext } from '../../../src/utils/docker-api.js';

import type { DockerContainerConfig } from '../../../src/utils/docker-api.js';

// Disable TypeScript for mocking
declare const global: any;

describe('Docker API', () => {
  let engine: ExecutionEngine;
  let adapter: DockerAdapter;
  let mockAdapter: any;

  beforeEach(() => {
    // Create a mock adapter
    mockAdapter = {
      type: 'docker',
      createContainer: jest.fn(() => Promise.resolve()),
      startContainer: jest.fn(() => Promise.resolve()),
      runContainer: jest.fn(() => Promise.resolve()),
      stopContainer: jest.fn(() => Promise.resolve()),
      removeContainer: jest.fn(() => Promise.resolve()),
      inspectContainer: jest.fn(() => Promise.resolve({
        NetworkSettings: {
          Networks: {
            bridge: { IPAddress: '172.17.0.2' }
          }
        },
        State: {
          Health: { Status: 'healthy' }
        },
        Config: {
          Labels: { app: 'test' }
        }
      })),
      getLogs: jest.fn(() => Promise.resolve('test logs')),
      streamLogs: jest.fn(() => Promise.resolve()),
      waitForHealthy: jest.fn(() => Promise.resolve()),
      getStats: jest.fn(() => Promise.resolve({ memory_stats: { usage: 1048576 } })),
      copyToContainer: jest.fn(() => Promise.resolve()),
      copyFromContainer: jest.fn(() => Promise.resolve())
    };

    // Create engine with mock adapter
    engine = new ExecutionEngine();
    (engine as any).adapters.set('docker', mockAdapter);
    adapter = mockAdapter as DockerAdapter;
  });

  describe('DockerContainer', () => {
    let container: DockerContainer;
    const config: DockerContainerConfig = {
      image: 'nginx:alpine',
      name: 'test-container',
      ports: { '8080': '80' },
      env: { NODE_ENV: 'test' },
      volumes: { '/host/path': '/container/path' }
    };

    beforeEach(() => {
      container = new DockerContainer(engine, adapter, config);
    });

    describe('start()', () => {
      it('should start a container with the correct configuration', async () => {
        const result = await container.start();

        expect(result).toBe(container);
        expect(container.started).toBe(true);
        expect(mockAdapter.runContainer).toHaveBeenCalledWith({
          name: 'test-container',
          image: 'nginx:alpine',
          volumes: ['/host/path:/container/path'],
          env: { NODE_ENV: 'test' },
          ports: ['8080:80'],
          network: undefined,
          restart: undefined,
          workdir: undefined,
          user: undefined,
          labels: undefined,
          privileged: undefined,
          healthcheck: undefined,
          command: undefined
        });
      });

      it('should generate a unique name if not provided', async () => {
        const anonContainer = new DockerContainer(engine, adapter, { image: 'alpine' });
        await anonContainer.start();

        expect(anonContainer.name).toMatch(/^xec-\d+-[a-z0-9]+$/);
      });

      it('should not start if already started', async () => {
        await container.start();
        mockAdapter.runContainer.mockClear();

        await container.start();

        expect(mockAdapter.runContainer).not.toHaveBeenCalled();
      });

      it('should throw error if container has been removed', async () => {
        await container.start();
        await container.remove();

        await expect(container.start()).rejects.toThrow(DockerError);
      });

      it('should handle advanced configuration options', async () => {
        const advancedConfig: DockerContainerConfig = {
          image: 'postgres:15',
          name: 'advanced-test',
          network: 'custom-network',
          restart: 'unless-stopped',
          workdir: '/app',
          user: 'nobody',
          labels: { version: '1.0.0', env: 'test' },
          privileged: true,
          healthcheck: {
            test: 'pg_isready',
            interval: '30s',
            timeout: '5s',
            retries: 3,
            startPeriod: '60s'
          },
          command: ['postgres', '-c', 'shared_buffers=256MB']
        };

        const advContainer = new DockerContainer(engine, adapter, advancedConfig);
        await advContainer.start();

        expect(mockAdapter.runContainer).toHaveBeenCalledWith({
          name: 'advanced-test',
          image: 'postgres:15',
          volumes: undefined,
          env: undefined,
          ports: undefined,
          network: 'custom-network',
          restart: 'unless-stopped',
          workdir: '/app',
          user: 'nobody',
          labels: { version: '1.0.0', env: 'test' },
          privileged: true,
          healthcheck: {
            test: 'pg_isready',
            interval: '30s',
            timeout: '5s',
            retries: 3,
            startPeriod: '60s'
          },
          command: ['postgres', '-c', 'shared_buffers=256MB']
        });
      });
    });

    describe('exec()', () => {
      it('should execute commands in a running container', async () => {
        await container.start();

        const mockRun = jest.fn().mockReturnValue({ exitCode: 0, stdout: 'hello' });
        const dockerEngine = { run: mockRun };
        jest.spyOn(engine, 'docker').mockReturnValue(dockerEngine as any);

        const result = container.exec`echo hello`;

        expect(engine.docker).toHaveBeenCalledWith({
          container: 'test-container',
          user: undefined,
          workdir: undefined
        });
        expect(mockRun).toHaveBeenCalled();
      });

      it('should throw error if container is not started', () => {
        expect(() => container.exec`echo hello`).toThrow(DockerError);
      });

      it('should use user and workdir from config', async () => {
        const customContainer = new DockerContainer(engine, adapter, {
          ...config,
          user: 'nobody',
          workdir: '/app'
        });
        await customContainer.start();

        const mockRun = jest.fn();
        const dockerEngine = { run: mockRun };
        jest.spyOn(engine, 'docker').mockReturnValue(dockerEngine as any);

        customContainer.exec`ls -la`;

        expect(engine.docker).toHaveBeenCalledWith({
          container: 'test-container',
          user: 'nobody',
          workdir: '/app'
        });
      });
    });

    describe('execRaw()', () => {
      it('should execute raw commands without shell', async () => {
        await container.start();

        const mockRun = jest.fn();
        mockRun.mockReturnValue(Promise.resolve({ exitCode: 0, stdout: 'ok' }));
        const dockerEngine = { run: mockRun };
        jest.spyOn(engine, 'docker').mockReturnValue(dockerEngine as any);

        await container.execRaw('echo', ['hello', 'world']);

        expect(mockRun).toHaveBeenCalled();
      });
    });

    describe('logs()', () => {
      it('should get container logs', async () => {
        await container.start();

        const logs = await container.logs();

        expect(logs).toBe('test logs');
        expect(mockAdapter.getLogs).toHaveBeenCalledWith('test-container', undefined);
      });

      it('should pass log options', async () => {
        await container.start();

        await container.logs({ tail: 10, timestamps: true });

        expect(mockAdapter.getLogs).toHaveBeenCalledWith('test-container', {
          tail: 10,
          timestamps: true
        });
      });

      it('should throw error if container is not started', async () => {
        await expect(container.logs()).rejects.toThrow(DockerError);
      });
    });

    describe('streamLogs()', () => {
      it('should stream container logs', async () => {
        await container.start();

        const onData = jest.fn();
        await container.streamLogs(onData);

        expect(mockAdapter.streamLogs).toHaveBeenCalledWith(
          'test-container',
          onData,
          undefined
        );
      });

      it('should pass streaming options', async () => {
        await container.start();

        const onData = jest.fn();
        const options = { follow: true, tail: 20 };
        await container.streamLogs(onData, options);

        expect(mockAdapter.streamLogs).toHaveBeenCalledWith(
          'test-container',
          onData,
          options
        );
      });
    });

    describe('follow()', () => {
      it('should follow logs with follow: true', async () => {
        await container.start();

        const onData = jest.fn();
        await container.follow(onData, { tail: 5 });

        expect(mockAdapter.streamLogs).toHaveBeenCalledWith(
          'test-container',
          onData,
          { tail: 5, follow: true }
        );
      });
    });

    describe('stop()', () => {
      it('should stop a running container', async () => {
        await container.start();
        await container.stop();

        expect(container.started).toBe(false);
        expect(mockAdapter.stopContainer).toHaveBeenCalledWith('test-container');
      });

      it('should not error if container is not started', async () => {
        await expect(container.stop()).resolves.toBeUndefined();
      });

      it('should not error if container is removed', async () => {
        await container.start();
        await container.remove();
        await expect(container.stop()).resolves.toBeUndefined();
      });
    });

    describe('remove()', () => {
      it('should remove a stopped container', async () => {
        await container.start();
        await container.stop();
        await container.remove();

        expect(container.removed).toBe(true);
        expect(mockAdapter.removeContainer).toHaveBeenCalledWith('test-container', false);
      });

      it('should stop container before removing if not forced', async () => {
        await container.start();
        await container.remove();

        expect(mockAdapter.stopContainer).toHaveBeenCalled();
        expect(mockAdapter.removeContainer).toHaveBeenCalled();
      });

      it('should force remove without stopping if forced', async () => {
        await container.start();
        await container.remove(true);

        expect(mockAdapter.stopContainer).not.toHaveBeenCalled();
        expect(mockAdapter.removeContainer).toHaveBeenCalledWith('test-container', true);
      });

      it('should not error if already removed', async () => {
        await container.start();
        await container.remove();
        await expect(container.remove()).resolves.toBeUndefined();
      });
    });

    describe('restart()', () => {
      it('should restart a running container', async () => {
        await container.start();
        
        // Clear previous calls
        mockAdapter.stopContainer.mockClear();
        mockAdapter.runContainer.mockClear();
        mockAdapter.startContainer.mockClear();
        
        await container.restart();

        expect(mockAdapter.stopContainer).toHaveBeenCalledWith('test-container');
        // On restart, it should use startContainer since container already exists
        expect(mockAdapter.runContainer).not.toHaveBeenCalled();
        expect(mockAdapter.startContainer).toHaveBeenCalledWith('test-container');
      });

      it('should throw error if container is not started', async () => {
        await expect(container.restart()).rejects.toThrow(DockerError);
      });
    });

    describe('waitForHealthy()', () => {
      it('should wait for container to be healthy', async () => {
        await container.start();
        await container.waitForHealthy(5000);

        expect(mockAdapter.waitForHealthy).toHaveBeenCalledWith('test-container', 5000);
      });

      it('should use default timeout', async () => {
        await container.start();
        await container.waitForHealthy();

        expect(mockAdapter.waitForHealthy).toHaveBeenCalledWith('test-container', 30000);
      });
    });

    describe('stats()', () => {
      it('should get container stats', async () => {
        await container.start();
        const stats = await container.stats();

        expect(stats).toEqual({ memory_stats: { usage: 1048576 } });
        expect(mockAdapter.getStats).toHaveBeenCalledWith('test-container');
      });
    });

    describe('inspect()', () => {
      it('should inspect container', async () => {
        const info = await container.inspect();

        expect(info.NetworkSettings).toBeDefined();
        expect(mockAdapter.inspectContainer).toHaveBeenCalledWith('test-container');
      });

      it('should work even if container is not started', async () => {
        const info = await container.inspect();
        expect(info).toBeDefined();
      });
    });

    describe('copyTo()', () => {
      it('should copy file to container', async () => {
        await container.start();
        await container.copyTo('/local/file.txt', '/container/file.txt');

        expect(mockAdapter.copyToContainer).toHaveBeenCalledWith(
          '/local/file.txt',
          'test-container',
          '/container/file.txt'
        );
      });

      it('should throw error if container is not started', async () => {
        await expect(container.copyTo('/local', '/container')).rejects.toThrow(DockerError);
      });
    });

    describe('copyFrom()', () => {
      it('should copy file from container', async () => {
        await container.start();
        await container.copyFrom('/container/file.txt', '/local/file.txt');

        expect(mockAdapter.copyFromContainer).toHaveBeenCalledWith(
          'test-container',
          '/container/file.txt',
          '/local/file.txt'
        );
      });
    });

    describe('getIpAddress()', () => {
      it('should get container IP address', async () => {
        const ip = await container.getIpAddress();
        expect(ip).toBe('172.17.0.2');
      });

      it('should get IP for specific network', async () => {
        mockAdapter.inspectContainer = jest.fn(() => Promise.resolve({
          NetworkSettings: {
            Networks: {
              bridge: { IPAddress: '172.17.0.2' },
              custom: { IPAddress: '10.0.0.5' }
            }
          }
        }));

        const ip = await container.getIpAddress('custom');
        expect(ip).toBe('10.0.0.5');
      });

      it('should return null if no IP found', async () => {
        mockAdapter.inspectContainer = jest.fn(() => Promise.resolve({
          NetworkSettings: { Networks: {} }
        }));

        const ip = await container.getIpAddress();
        expect(ip).toBeNull();
      });
    });

    describe('volume and port formatting', () => {
      it('should handle array volume format', async () => {
        const arrayContainer = new DockerContainer(engine, adapter, {
          image: 'alpine',
          volumes: ['/host1:/cont1', '/host2:/cont2:ro']
        });
        await arrayContainer.start();

        expect(mockAdapter.runContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            volumes: ['/host1:/cont1', '/host2:/cont2:ro']
          })
        );
      });

      it('should handle array port format', async () => {
        const arrayContainer = new DockerContainer(engine, adapter, {
          image: 'alpine',
          ports: ['8080:80', '9000:9000/udp']
        });
        await arrayContainer.start();

        expect(mockAdapter.runContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            ports: ['8080:80', '9000:9000/udp']
          })
        );
      });
    });
  });

  describe('createDockerContext', () => {
    it('should create a context with start method', async () => {
      const context = createDockerContext(engine, {
        image: 'nginx:alpine',
        name: 'ctx-test'
      });

      expect(context.start).toBeDefined();
      const container = await context.start();
      expect(container).toBeInstanceOf(DockerContainer);
    });

    it('should create callable context for existing containers', () => {
      const context = createDockerContext(engine, {
        image: 'nginx',
        name: 'existing-container'
      });

      const mockRun = jest.fn().mockReturnValue({ exitCode: 0 });
      const dockerEngine = { run: mockRun };
      jest.spyOn(engine, 'docker').mockReturnValue(dockerEngine as any);

      // Test callable interface
      const strings: any = ['echo hello'];
      strings.raw = strings;
      context(strings as TemplateStringsArray);

      expect(engine.docker).toHaveBeenCalledWith({
        container: 'existing-container',
        user: undefined,
        workdir: undefined
      });
    });

    it('should throw error when no adapter available', () => {
      const emptyEngine = new ExecutionEngine();
      
      expect(() => createDockerContext(emptyEngine, { image: 'alpine' }))
        .toThrow('Docker adapter not available');
    });

    it('should throw error when calling without container name', () => {
      const context = createDockerContext(engine, { image: 'alpine' });

      const strings: any = ['echo hello'];
      strings.raw = strings;
      
      expect(() => context(strings as TemplateStringsArray))
        .toThrow('Container name must be specified for direct execution');
    });
  });

  describe('Error handling and edge cases', () => {
    let container: DockerContainer;
    const config: DockerContainerConfig = {
      image: 'nginx:alpine',
      name: 'error-test-container'
    };

    beforeEach(() => {
      container = new DockerContainer(engine, adapter, config);
    });

    it('should use fallback create/start when adapter lacks runContainer', async () => {
      // Create adapter without runContainer method
      const limitedAdapter = { ...mockAdapter };
      delete (limitedAdapter as any).runContainer;
      (engine as any).adapters.set('docker', limitedAdapter);

      const fallbackContainer = new DockerContainer(engine, limitedAdapter as any, config);
      await fallbackContainer.start();

      expect(limitedAdapter.createContainer).toHaveBeenCalledWith({
        name: 'error-test-container',
        image: 'nginx:alpine',
        volumes: undefined,
        env: undefined,
        ports: undefined
      });
      expect(limitedAdapter.startContainer).toHaveBeenCalledWith('error-test-container');
    });

    it('should rethrow DockerError in start()', async () => {
      const dockerError = new DockerError('test', 'start', new Error('Docker daemon error'));
      mockAdapter.runContainer.mockRejectedValue(dockerError);

      await expect(container.start()).rejects.toThrow(dockerError);
    });

    it('should wrap non-DockerError in start()', async () => {
      mockAdapter.runContainer.mockRejectedValue(new Error('Network error'));

      await expect(container.start()).rejects.toThrow(DockerError);
      await expect(container.start()).rejects.toThrow('Docker operation \'start\' failed');
    });

    it('should wrap non-Error objects in start()', async () => {
      mockAdapter.runContainer.mockRejectedValue('String error');

      const error = await container.start().catch(e => e);
      expect(error).toBeInstanceOf(DockerError);
      expect(error.originalError.message).toBe('String error');
    });

    it('should handle exec error for removed container', async () => {
      await container.start();
      // Simulate container removal outside of our API
      container['isRemoved'] = true;
      
      const error = await container.start().catch(e => e);
      expect(error).toBeInstanceOf(DockerError);
      expect(error.originalError.message).toBe('Container has been removed');
    });

    it('should handle execRaw with empty args', async () => {
      await container.start();

      const mockRun = jest.fn() as jest.MockedFunction<any>;
      mockRun.mockResolvedValue({ exitCode: 0, stdout: 'ok' });
      const dockerEngine = { run: mockRun };
      jest.spyOn(engine, 'docker').mockReturnValue(dockerEngine as any);

      await container.execRaw('ls');
      
      // Verify command was built correctly without args
      expect(mockRun).toHaveBeenCalledWith(['ls']);
    });

    it('should handle adapter errors in stop()', async () => {
      await container.start();
      mockAdapter.stopContainer.mockRejectedValue(new Error('Stop failed'));

      // stop() will throw adapter errors
      await expect(container.stop()).rejects.toThrow('Stop failed');
    });

    it('should handle adapter errors in remove()', async () => {
      await container.start();
      mockAdapter.removeContainer.mockRejectedValue(new Error('Remove failed'));

      // remove() will throw adapter errors
      await expect(container.remove()).rejects.toThrow('Remove failed');
    });

    it('should handle network without IP in getIpAddress()', async () => {
      mockAdapter.inspectContainer.mockResolvedValue({
        NetworkSettings: {
          Networks: {
            bridge: { IPAddress: '' },
            custom: {}
          }
        }
      });

      const ip = await container.getIpAddress();
      expect(ip).toBeNull();
    });

    it('should handle missing NetworkSettings in getIpAddress()', async () => {
      mockAdapter.inspectContainer.mockResolvedValue({});

      const ip = await container.getIpAddress();
      expect(ip).toBeNull();
    });

    it('should handle formatVolumes with empty input', () => {
      const formatted = container['formatVolumes']();
      expect(formatted).toEqual([]);
    });

    it('should handle formatPorts with empty input', () => {
      const formatted = container['formatPorts']();
      expect(formatted).toEqual([]);
    });

    it('should handle container with string command', async () => {
      const stringCmdContainer = new DockerContainer(engine, adapter, {
        image: 'alpine',
        command: 'echo hello world'
      });
      
      await stringCmdContainer.start();

      expect(mockAdapter.runContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          command: ['sh', '-c', 'echo hello world']
        })
      );
    });

    it('should handle restart error when container becomes removed', async () => {
      await container.start();
      
      // Mock stop to mark container as removed (simulating external removal)
      mockAdapter.stopContainer.mockImplementation(() => {
        container['isRemoved'] = true;
        container['isStarted'] = false;
        return Promise.resolve();
      });

      const error = await container.restart().catch(e => e);
      expect(error).toBeInstanceOf(DockerError);
      expect(error.originalError.message).toBe('Container has been removed');
    });
  });
});