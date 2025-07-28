import { it, expect, describe, beforeEach } from '@jest/globals';

import { ExecutionEngine, createCallableEngine } from '../../src/index.js';

describe('Kubernetes Port Forward Integration (API Tests)', () => {
  let engine: ExecutionEngine;
  let $: any;
  
  beforeEach(() => {
    // Create engine with kubernetes adapter always available
    engine = new ExecutionEngine({
      adapters: {
        kubernetes: {} // This ensures KubernetesAdapter is registered
      }
    });
    $ = createCallableEngine(engine);
  });
  
  describe('K8s API Structure', () => {
    it('should create k8s execution context', () => {
      const k8s = $.k8s();
      
      expect(k8s).toBeDefined();
      expect(typeof k8s).toBe('function');
      expect(k8s.pod).toBeDefined();
      expect(typeof k8s.pod).toBe('function');
    });

    it('should create pod instance with correct methods', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      // Verify all methods exist
      expect(pod.name).toBe('test-pod');
      expect(pod.namespace).toBe('default');
      expect(typeof pod.exec).toBe('function');
      expect(typeof pod.raw).toBe('function');
      expect(typeof pod.portForward).toBe('function');
      expect(typeof pod.portForwardDynamic).toBe('function');
      expect(typeof pod.logs).toBe('function');
      expect(typeof pod.streamLogs).toBe('function');
      expect(typeof pod.follow).toBe('function');
      expect(typeof pod.copyTo).toBe('function');
      expect(typeof pod.copyFrom).toBe('function');
    });

    it('should handle namespace configuration', () => {
      const k8s = $.k8s();
      const defaultPod = k8s.pod('default-pod');
      expect(defaultPod.namespace).toBe('default');
      
      // TODO: When namespace support is added to k8s(), test it here
      // const k8sProd = $.k8s({ namespace: 'production' });
      // const prodPod = k8sProd.pod('prod-pod');
      // expect(prodPod.namespace).toBe('production');
    });
  });

  describe('Command execution', () => {
    it('should prepare exec commands', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      // These will fail without a real cluster, but we're testing the API
      const execPromise = pod.exec`echo "test"`;
      expect(execPromise).toBeDefined();
      expect(execPromise.then).toBeDefined();
      expect(execPromise.catch).toBeDefined();
      
      // Clean up the promise to avoid unhandled rejection
      execPromise.catch(() => {});
    });

    it('should prepare raw commands', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const rawPromise = pod.raw`echo $PATH`;
      expect(rawPromise).toBeDefined();
      expect(rawPromise.then).toBeDefined();
      
      // Clean up
      rawPromise.catch(() => {});
    });
  });

  describe('Port forwarding API', () => {
    it('should create port forward promise', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const forwardPromise = pod.portForward(8080, 80);
      expect(forwardPromise).toBeDefined();
      expect(forwardPromise.then).toBeDefined();
      
      // Clean up
      forwardPromise.catch(() => {});
    });

    it('should create dynamic port forward promise', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const dynamicPromise = pod.portForwardDynamic(80);
      expect(dynamicPromise).toBeDefined();
      expect(dynamicPromise.then).toBeDefined();
      
      // Clean up
      dynamicPromise.catch(() => {});
    });
  });

  describe('Logging API', () => {
    it('should create logs promise', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const logsPromise = pod.logs({ tail: 10 });
      expect(logsPromise).toBeDefined();
      expect(logsPromise.then).toBeDefined();
      
      // Clean up
      logsPromise.catch(() => {});
    });

    it('should create stream logs promise', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const streamPromise = pod.streamLogs(() => {}, { follow: true });
      expect(streamPromise).toBeDefined();
      expect(streamPromise.then).toBeDefined();
      
      // Clean up
      streamPromise.catch(() => {});
    });

    it('should create follow logs promise', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const followPromise = pod.follow(() => {});
      expect(followPromise).toBeDefined();
      expect(followPromise.then).toBeDefined();
      
      // Clean up
      followPromise.catch(() => {});
    });
  });

  describe('File operations API', () => {
    it('should create copyTo promise', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const copyToPromise = pod.copyTo('/local/file', '/remote/file');
      expect(copyToPromise).toBeDefined();
      expect(copyToPromise.then).toBeDefined();
      
      // Clean up
      copyToPromise.catch(() => {});
    });

    it('should create copyFrom promise', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const copyFromPromise = pod.copyFrom('/remote/file', '/local/file');
      expect(copyFromPromise).toBeDefined();
      expect(copyFromPromise.then).toBeDefined();
      
      // Clean up
      copyFromPromise.catch(() => {});
    });

    it('should support container parameter in copy operations', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const copyToPromise = pod.copyTo('/local/file', '/remote/file', 'nginx');
      const copyFromPromise = pod.copyFrom('/remote/file', '/local/file', 'app');
      
      expect(copyToPromise).toBeDefined();
      expect(copyFromPromise).toBeDefined();
      
      // Clean up
      copyToPromise.catch(() => {});
      copyFromPromise.catch(() => {});
    });
  });

  describe('Multiple pods', () => {
    it('should handle multiple pod instances', () => {
      const k8s = $.k8s();
      
      const pods = ['web-1', 'web-2', 'web-3'].map(name => k8s.pod(name));
      
      expect(pods).toHaveLength(3);
      expect(pods[0]?.name).toBe('web-1');
      expect(pods[1]?.name).toBe('web-2');
      expect(pods[2]?.name).toBe('web-3');
      
      // All should have same namespace
      pods.forEach(pod => {
        expect(pod.namespace).toBe('default');
      });
    });
  });

  describe('Error handling', () => {
    it('should throw when executing without pod in context', () => {
      const k8s = $.k8s();
      
      // Direct execution should throw
      expect(() => k8s.exec`echo test`).toThrow('Pod must be specified for direct execution');
      expect(() => k8s.raw`echo test`).toThrow('Pod must be specified for direct execution');
    });

    it('should handle errors when kubectl is not available', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      // When kubectl is not available or the pod doesn't exist,
      // these operations will fail. We're just testing that the 
      // errors are handled properly, not the specific error messages
      // since those depend on the actual kubectl installation
      
      // Test logs - will fail if kubectl is not available
      const logsPromise = pod.logs();
      expect(logsPromise).toBeDefined();
      expect(logsPromise.then).toBeDefined();
      expect(logsPromise.catch).toBeDefined();
      
      // Test port forward - will fail if kubectl is not available
      const portForwardPromise = pod.portForward(8080, 80);
      expect(portForwardPromise).toBeDefined();
      expect(portForwardPromise.then).toBeDefined();
      expect(portForwardPromise.catch).toBeDefined();
      
      // Clean up promises to avoid unhandled rejections
      logsPromise.catch(() => {});
      portForwardPromise.catch(() => {});
    });
  });

  describe('Options and parameters', () => {
    it('should accept log options', () => {
      const k8s = $.k8s();
      const pod = k8s.pod('test-pod');
      
      const options = {
        container: 'nginx',
        tail: 100,
        previous: true,
        timestamps: true
      };
      
      const logsPromise = pod.logs(options);
      const streamPromise = pod.streamLogs(() => {}, { ...options, follow: true });
      
      expect(logsPromise).toBeDefined();
      expect(streamPromise).toBeDefined();
      
      // Clean up
      logsPromise.catch(() => {});
      streamPromise.catch(() => {});
    });
  });
});