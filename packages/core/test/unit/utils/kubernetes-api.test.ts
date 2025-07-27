import { jest } from '@jest/globals';

import { createK8sExecutionContext } from '../../../src/utils/kubernetes-api.js';

import type { ExecutionEngine } from '../../../src/core/execution-engine.js';
import type { KubernetesAdapter } from '../../../src/adapters/kubernetes-adapter.js';

describe('Kubernetes API', () => {
  let mockEngine: jest.Mocked<ExecutionEngine>;
  let mockAdapter: jest.Mocked<KubernetesAdapter>;

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

    // Mock execution engine
    mockEngine = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
      k8s: jest.fn().mockReturnThis(),
      with: jest.fn().mockReturnThis(),
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
      
      expect(mockEngine.k8s).toHaveBeenCalledWith({
        pod: 'test-pod',
        namespace: 'default'
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

        expect(mockEngine.k8s).toHaveBeenCalledWith({
          pod: 'test-pod',
          namespace: 'test-namespace'
        });
      });

      it('should execute raw commands in the pod', () => {
        pod.raw`echo $VAR`;

        expect(mockEngine.k8s).toHaveBeenCalledWith({
          pod: 'test-pod',
          namespace: 'test-namespace'
        });
      });
    });

    describe('port forwarding', () => {
      const mockPortForward = {
        localPort: 8080,
        remotePort: 80,
        isOpen: false,
        open: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      };

      beforeEach(() => {
        mockAdapter.portForward.mockResolvedValue(mockPortForward);
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
        mockAdapter.streamLogs.mockResolvedValue(mockLogStream);
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
  });
});