import { jest } from '@jest/globals';

import { createK8sExecutionContext } from '../../../src/adapters/kubernetes/kubernetes-api.js';

import type { ExecutionEngine } from '../../../src/core/execution-engine.js';
import type { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';

describe('Kubernetes API', () => {
  let mockEngine: jest.Mocked<ExecutionEngine>;
  let mockAdapter: jest.Mocked<KubernetesAdapter>;
  let mockK8sEngine: any;

  beforeEach(() => {
    // Mock Kubernetes adapter
    mockAdapter = {
      execute: jest.fn(),
      executeKubectl: jest.fn(),
      portForward: jest.fn(),
      streamLogs: jest.fn(),
      copyFiles: jest.fn(),
      dispose: jest.fn()
    } as any;

    // Mock k8s engine returned by with()
    mockK8sEngine = {
      run: jest.fn().mockReturnValue({ stdout: 'test output', exitCode: 0 }),
      raw: jest.fn().mockReturnValue({ stdout: 'raw output', exitCode: 0 })
    };

    // Mock execution engine
    mockEngine = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
      k8s: jest.fn().mockReturnThis(),
      with: jest.fn().mockReturnValue(mockK8sEngine),
      run: jest.fn(),
      raw: jest.fn()
    } as any;
  });

  describe('createK8sExecutionContext', () => {
    it('should create execution context without pod', () => {
      const context = createK8sExecutionContext(mockEngine, {
        namespace: 'default'
      });

      expect(context).toBeDefined();
      expect(context.pod).toBeDefined();
      expect(context.exec).toBeDefined();
      expect(context.raw).toBeDefined();
    });

    it('should throw error when executing without pod', async () => {
      const context = createK8sExecutionContext(mockEngine, {
        namespace: 'default'
      });

      expect(() => context.exec`echo test`).toThrow('Pod must be specified for direct execution');
      expect(() => context.raw`echo test`).toThrow('Pod must be specified for direct execution');
    });

    it('should execute commands when pod is specified', () => {
      const context = createK8sExecutionContext(mockEngine, {
        pod: 'test-pod',
        namespace: 'default'
      });

      context.exec`echo test`;
      
      expect(mockEngine.with).toHaveBeenCalledWith({
        adapter: 'kubernetes',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          namespace: 'default'
        }
      });
      expect(mockK8sEngine.run).toHaveBeenCalled();
    });

    it('should execute raw commands when pod is specified', () => {
      const context = createK8sExecutionContext(mockEngine, {
        pod: 'test-pod',
        namespace: 'default'
      });

      context.raw`echo $VAR`;
      
      expect(mockEngine.with).toHaveBeenCalledWith({
        adapter: 'kubernetes',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          namespace: 'default'
        }
      });
      expect(mockK8sEngine.raw).toHaveBeenCalled();
    });

    it('should throw error when kubernetes adapter is not available', () => {
      const mockEngineNoAdapter = {
        getAdapter: jest.fn().mockReturnValue(null)
      } as any;

      expect(() => createK8sExecutionContext(mockEngineNoAdapter, {})).toThrow('Kubernetes adapter not available');
    });

    it('should execute commands with all optional parameters', () => {
      const context = createK8sExecutionContext(mockEngine, {
        pod: 'test-pod',
        namespace: 'custom-ns',
        container: 'main',
        execFlags: ['-i', '-t'],
        tty: true,
        stdin: true
      });

      context.exec`echo test`;
      
      expect(mockEngine.with).toHaveBeenCalledWith({
        adapter: 'kubernetes',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          namespace: 'custom-ns',
          container: 'main',
          execFlags: ['-i', '-t'],
          tty: true,
          stdin: true
        }
      });
    });

    it('should execute raw commands with all optional parameters', () => {
      const context = createK8sExecutionContext(mockEngine, {
        pod: 'test-pod',
        namespace: 'custom-ns',
        container: 'main',
        execFlags: ['-i', '-t'],
        tty: false,
        stdin: false
      });

      context.raw`echo $VAR`;
      
      expect(mockEngine.with).toHaveBeenCalledWith({
        adapter: 'kubernetes',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          namespace: 'custom-ns',
          container: 'main',
          execFlags: ['-i', '-t'],
          tty: false,
          stdin: false
        }
      });
    });
  });

  describe('K8sPod', () => {
    let context: any;
    let pod: any;

    beforeEach(() => {
      context = createK8sExecutionContext(mockEngine, {
        namespace: 'test-namespace'
      });
      pod = context.pod('test-pod');
    });

    describe('exec and raw', () => {
      it('should execute commands in the pod', () => {
        pod.exec`echo hello`;

        expect(mockEngine.with).toHaveBeenCalledWith({
          adapter: 'kubernetes',
          adapterOptions: {
            type: 'kubernetes',
            pod: 'test-pod',
            namespace: 'test-namespace'
          }
        });
        expect(mockK8sEngine.run).toHaveBeenCalled();
      });

      it('should execute raw commands in the pod', () => {
        pod.raw`echo $VAR`;

        expect(mockEngine.with).toHaveBeenCalledWith({
          adapter: 'kubernetes',
          adapterOptions: {
            type: 'kubernetes',
            pod: 'test-pod',
            namespace: 'test-namespace'
          }
        });
        expect(mockK8sEngine.raw).toHaveBeenCalled();
      });
    });

    describe('port forwarding', () => {
      const mockPortForward = {
        localPort: 8080,
        remotePort: 80,
        isOpen: false,
        open: jest.fn().mockImplementation(() => Promise.resolve()),
        close: jest.fn().mockImplementation(() => Promise.resolve())
      };

      beforeEach(() => {
        mockAdapter.portForward.mockReturnValue(mockPortForward as any);
      });

      it('should create port forward with specific ports', async () => {
        const forward = await pod.portForward(8080, 80);

        expect(mockAdapter.portForward).toHaveBeenCalledWith(
          'test-pod',
          8080,
          80,
          { namespace: 'test-namespace' }
        );
        expect(mockPortForward.open).toHaveBeenCalled();
        expect(forward).toBe(mockPortForward);
      });

      it('should create port forward with dynamic local port', async () => {
        const forward = await pod.portForwardDynamic(3000);

        expect(mockAdapter.portForward).toHaveBeenCalledWith(
          'test-pod',
          0,
          3000,
          { namespace: 'test-namespace', dynamicLocalPort: true }
        );
        expect(mockPortForward.open).toHaveBeenCalled();
        expect(forward).toBe(mockPortForward);
      });
    });

    describe('logs', () => {
      it('should get logs', async () => {
        mockAdapter.executeKubectl.mockResolvedValue({
          stdout: 'log line 1\nlog line 2',
          stderr: '',
          exitCode: 0
        });

        const logs = await pod.logs({ tail: 10, timestamps: true });

        expect(mockAdapter.executeKubectl).toHaveBeenCalledWith(
          ['logs', '-n', 'test-namespace', '--tail', '10', '--timestamps', 'test-pod'],
          { throwOnNonZeroExit: true }
        );
        expect(logs).toBe('log line 1\nlog line 2');
      });

      it('should get logs from specific container', async () => {
        mockAdapter.executeKubectl.mockResolvedValue({
          stdout: 'container logs',
          stderr: '',
          exitCode: 0
        });

        const logs = await pod.logs({ container: 'nginx', previous: true });

        expect(mockAdapter.executeKubectl).toHaveBeenCalledWith(
          ['logs', '-n', 'test-namespace', '-c', 'nginx', '--previous', 'test-pod'],
          { throwOnNonZeroExit: true }
        );
        expect(logs).toBe('container logs');
      });
    });

    describe('streaming logs', () => {
      const mockLogStream = {
        stop: jest.fn()
      };

      beforeEach(() => {
        mockAdapter.streamLogs.mockResolvedValue(mockLogStream as any);
      });

      it('should stream logs', async () => {
        const onData = jest.fn();
        const stream = await pod.streamLogs(onData, {
          follow: true,
          tail: 20
        });

        expect(mockAdapter.streamLogs).toHaveBeenCalledWith(
          'test-pod',
          onData,
          {
            namespace: 'test-namespace',
            follow: true,
            tail: 20
          }
        );
        expect(stream).toBe(mockLogStream);
      });

      it('should follow logs (alias)', async () => {
        const onData = jest.fn();
        const stream = await pod.follow(onData, {
          container: 'app',
          tail: 50
        });

        expect(mockAdapter.streamLogs).toHaveBeenCalledWith(
          'test-pod',
          onData,
          {
            namespace: 'test-namespace',
            container: 'app',
            tail: 50,
            follow: true
          }
        );
        expect(stream).toBe(mockLogStream);
      });
    });

    describe('logs error handling', () => {
      it('should handle executeKubectl rejection', async () => {
        mockAdapter.executeKubectl.mockRejectedValue(new Error('kubectl failed'));

        await expect(pod.logs()).rejects.toThrow('kubectl failed');
      });
    });

    describe('streaming logs error handling', () => {
      it('should handle streamLogs rejection', async () => {
        mockAdapter.streamLogs.mockRejectedValue(new Error('stream failed'));

        await expect(pod.streamLogs(jest.fn())).rejects.toThrow('stream failed');
      });
    });

    describe('port forwarding error handling', () => {
      it('should handle portForward rejection', async () => {
        mockAdapter.portForward.mockRejectedValue(new Error('port forward failed'));

        await expect(pod.portForward(8080, 80)).rejects.toThrow('port forward failed');
      });

      it('should handle open() rejection', async () => {
        const mockPortForward = {
          localPort: 8080,
          remotePort: 80,
          isOpen: false,
          open: jest.fn().mockImplementation(() => Promise.reject(new Error('open failed'))),
          close: jest.fn()
        };
        mockAdapter.portForward.mockReturnValue(mockPortForward as any);

        await expect(pod.portForward(8080, 80)).rejects.toThrow('open failed');
      });
    });

    describe('file operations', () => {
      it('should copy file to pod', async () => {
        await pod.copyTo('/local/file.txt', '/pod/file.txt');

        expect(mockAdapter.copyFiles).toHaveBeenCalledWith(
          '/local/file.txt',
          'test-pod:/pod/file.txt',
          {
            namespace: 'test-namespace',
            container: undefined,
            direction: 'to'
          }
        );
      });

      it('should copy file to specific container', async () => {
        await pod.copyTo('/local/config.json', '/app/config.json', 'app');

        expect(mockAdapter.copyFiles).toHaveBeenCalledWith(
          '/local/config.json',
          'test-pod:/app/config.json -c app',
          {
            namespace: 'test-namespace',
            container: 'app',
            direction: 'to'
          }
        );
      });

      it('should copy file from pod', async () => {
        await pod.copyFrom('/pod/output.log', '/local/output.log');

        expect(mockAdapter.copyFiles).toHaveBeenCalledWith(
          'test-pod:/pod/output.log',
          '/local/output.log',
          {
            namespace: 'test-namespace',
            container: undefined,
            direction: 'from'
          }
        );
      });

      it('should copy file from specific container', async () => {
        await pod.copyFrom('/var/log/nginx/access.log', './nginx-access.log', 'nginx');

        expect(mockAdapter.copyFiles).toHaveBeenCalledWith(
          'test-pod:/var/log/nginx/access.log -c nginx',
          './nginx-access.log',
          {
            namespace: 'test-namespace',
            container: 'nginx',
            direction: 'from'
          }
        );
      });
    });
  });

  describe('multiple pods', () => {
    it('should create multiple pod instances', () => {
      const context = createK8sExecutionContext(mockEngine, {});
      
      const web1 = context.pod('web-1');
      const web2 = context.pod('web-2');
      
      expect(web1.name).toBe('web-1');
      expect(web2.name).toBe('web-2');
      expect(web1.namespace).toBe('default');
      expect(web2.namespace).toBe('default');
    });

    it('should create pod instances with custom namespace', () => {
      const context = createK8sExecutionContext(mockEngine, {
        namespace: 'production'
      });
      
      const pod = context.pod('app-pod');
      
      expect(pod.name).toBe('app-pod');
      expect(pod.namespace).toBe('production');
    });
  });

  describe('K8sPod with baseOptions', () => {
    it('should pass baseOptions to exec commands', () => {
      const context = createK8sExecutionContext(mockEngine, {
        namespace: 'test',
        container: 'sidecar',
        tty: true
      });
      const pod = context.pod('test-pod');

      pod.exec`echo test`;

      expect(mockEngine.with).toHaveBeenCalledWith({
        adapter: 'kubernetes',
        adapterOptions: {
          type: 'kubernetes',
          container: 'sidecar',
          tty: true,
          pod: 'test-pod',
          namespace: 'test'
        }
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined values correctly', () => {
      const context = createK8sExecutionContext(mockEngine, {
        pod: 'test-pod',
        namespace: undefined,
        container: undefined,
        execFlags: undefined,
        tty: undefined,
        stdin: undefined
      });

      context.exec`echo test`;
      
      // Should only include defined values
      expect(mockEngine.with).toHaveBeenCalledWith({
        adapter: 'kubernetes',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
    });

    it('should handle logs options correctly', async () => {
      mockAdapter.executeKubectl.mockResolvedValue({
        stdout: 'logs',
        stderr: '',
        exitCode: 0
      });

      const context = createK8sExecutionContext(mockEngine, {});
      const pod = context.pod('test-pod');

      // Test with no options
      await pod.logs();
      expect(mockAdapter.executeKubectl).toHaveBeenCalledWith(
        ['logs', '-n', 'default', 'test-pod'],
        { throwOnNonZeroExit: true }
      );

      // Test with all options
      await pod.logs({
        container: 'app',
        tail: 100,
        previous: true,
        timestamps: true
      });
      expect(mockAdapter.executeKubectl).toHaveBeenCalledWith(
        ['logs', '-n', 'default', '-c', 'app', '--tail', '100', '--previous', '--timestamps', 'test-pod'],
        { throwOnNonZeroExit: true }
      );
    });

    it('should handle streaming logs options correctly', async () => {
      const onData = jest.fn();
      const context = createK8sExecutionContext(mockEngine, {});
      const pod = context.pod('test-pod');

      // Test with minimal options
      await pod.streamLogs(onData);
      expect(mockAdapter.streamLogs).toHaveBeenCalledWith(
        'test-pod',
        onData,
        { namespace: 'default' }
      );

      // Test with all options
      await pod.streamLogs(onData, {
        container: 'nginx',
        follow: true,
        tail: 500,
        previous: true,
        timestamps: true
      });
      expect(mockAdapter.streamLogs).toHaveBeenCalledWith(
        'test-pod',
        onData,
        {
          namespace: 'default',
          container: 'nginx',
          follow: true,
          tail: 500,
          previous: true,
          timestamps: true
        }
      );
    });
  });
});