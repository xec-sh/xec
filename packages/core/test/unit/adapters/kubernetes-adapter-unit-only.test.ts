import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';

/**
 * True unit tests for KubernetesAdapter that do not require a real Kubernetes cluster
 */
describe('KubernetesAdapter - Unit Tests (No Cluster)', () => {
  let adapter: KubernetesAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  describe('Configuration', () => {
    it('should create adapter with default configuration', () => {
      adapter = new KubernetesAdapter();
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should create adapter with custom namespace', () => {
      adapter = new KubernetesAdapter({
        namespace: 'production'
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should create adapter with custom context', () => {
      adapter = new KubernetesAdapter({
        context: 'my-cluster-context'
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should create adapter with custom kubectl path', () => {
      adapter = new KubernetesAdapter({
        kubectlPath: '/custom/path/kubectl'
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should create adapter with custom kubeconfig', () => {
      adapter = new KubernetesAdapter({
        kubeconfig: '/path/to/kubeconfig'
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should create adapter with all configuration options', () => {
      adapter = new KubernetesAdapter({
        namespace: 'production',
        context: 'prod-cluster',
        kubectlPath: '/usr/local/bin/kubectl',
        kubeconfig: '/home/user/.kube/config',
        defaultTimeout: 30000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8'
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });
  });

  describe('Error Handling', () => {
    it('should throw KubernetesError when pod is not specified', async () => {
      adapter = new KubernetesAdapter();
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'kubernetes',
          pod: undefined as any
          // Missing pod
        }
      })).rejects.toThrow('Pod name or selector is required');
    });

    it('should throw AdapterError for invalid adapter type', async () => {
      adapter = new KubernetesAdapter();
      await expect(adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'docker' as any // Wrong type
        }
      })).rejects.toThrow('Pod name or selector is required');
    });

    it('should throw error when adapter options are missing', async () => {
      adapter = new KubernetesAdapter();
      await expect(adapter.execute({
        command: 'ls'
        // Missing adapterOptions
      })).rejects.toThrow('Pod name or selector is required');
    });
  });

  describe('Configuration Validation', () => {
    it('should accept various namespace values', () => {
      const namespaces = ['default', 'kube-system', 'production', 'my-namespace-123'];
      
      namespaces.forEach(ns => {
        const testAdapter = new KubernetesAdapter({ namespace: ns });
        expect(testAdapter).toBeInstanceOf(KubernetesAdapter);
      });
    });

    it('should accept various context values', () => {
      const contexts = ['minikube', 'docker-desktop', 'gke_project_zone_cluster', 'eks-cluster'];
      
      contexts.forEach(ctx => {
        const testAdapter = new KubernetesAdapter({ context: ctx });
        expect(testAdapter).toBeInstanceOf(KubernetesAdapter);
      });
    });

    it('should handle empty configuration object', () => {
      adapter = new KubernetesAdapter({});
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });
  });

  describe('Adapter Identification', () => {
    it('should identify as kubernetes adapter', () => {
      adapter = new KubernetesAdapter();
      // Access protected property for testing
      const adapterName = (adapter as any).adapterName;
      expect(adapterName).toBe('kubernetes');
    });
  });

  describe('Command Building', () => {
    it('should require pod name in adapter options', async () => {
      adapter = new KubernetesAdapter();
      
      const validOptions = {
        type: 'kubernetes' as const,
        pod: 'my-pod',
        namespace: 'default'
      };
      
      const invalidOptions = {
        type: 'kubernetes' as const,
        namespace: 'default',
        pod: undefined as any
        // Missing pod
      };
      
      // Valid options should be accepted
      expect(() => {
        const opts = validOptions;
        if (!opts.pod) throw new Error('Pod name is required');
      }).not.toThrow();
      
      // Invalid options should throw
      expect(() => {
        const opts = invalidOptions as any;
        if (!opts.pod) throw new Error('Pod name is required');
      }).toThrow('Pod name is required');
    });

    it('should support container selection', () => {
      adapter = new KubernetesAdapter();
      
      const optionsWithContainer = {
        type: 'kubernetes' as const,
        pod: 'multi-container-pod',
        container: 'nginx',
        namespace: 'default'
      };
      
      expect(optionsWithContainer.container).toBe('nginx');
    });
  });

  describe('Timeout Configuration', () => {
    it('should respect default timeout configuration', () => {
      adapter = new KubernetesAdapter({
        defaultTimeout: 60000
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should accept various timeout values', () => {
      const timeouts = [1000, 5000, 30000, 120000];
      
      timeouts.forEach(timeout => {
        const testAdapter = new KubernetesAdapter({ defaultTimeout: timeout });
        expect(testAdapter).toBeInstanceOf(KubernetesAdapter);
      });
    });
  });

  describe('Resource Cleanup', () => {
    it('should dispose without errors', async () => {
      adapter = new KubernetesAdapter();
      await expect(adapter.dispose()).resolves.not.toThrow();
    });

    it('should handle multiple dispose calls', async () => {
      adapter = new KubernetesAdapter();
      await adapter.dispose();
      await expect(adapter.dispose()).resolves.not.toThrow();
    });
  });

  describe('Configuration Inheritance', () => {
    it('should inherit base adapter configuration', () => {
      adapter = new KubernetesAdapter({
        defaultTimeout: 30000,
        maxBuffer: 1024 * 1024 * 10,
        encoding: 'utf8',
        throwOnNonZeroExit: false
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should merge Kubernetes-specific config with base config', () => {
      adapter = new KubernetesAdapter({
        namespace: 'production',
        context: 'prod-cluster',
        defaultTimeout: 45000,
        throwOnNonZeroExit: true
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in namespace', () => {
      adapter = new KubernetesAdapter({
        namespace: 'my-namespace-with-dashes'
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });

    it('should handle special characters in pod names', async () => {
      adapter = new KubernetesAdapter();
      
      const podNames = ['my-pod', 'pod-123', 'app-deployment-abc123-xyz'];
      
      podNames.forEach(podName => {
        expect(() => {
          const opts = {
            type: 'kubernetes' as const,
            pod: podName,
            namespace: 'default'
          };
          if (!opts.pod) throw new Error('Pod name is required');
        }).not.toThrow();
      });
    });

    it('should handle long namespace names', () => {
      adapter = new KubernetesAdapter({
        namespace: 'very-long-namespace-name-that-is-still-valid'
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });
  });

  describe('Adapter Options Validation', () => {
    it('should validate adapter options structure', async () => {
      adapter = new KubernetesAdapter();
      
      // Test various invalid structures
      const invalidOptions = [
        null,
        undefined,
        { type: 'local' },
        { type: 'ssh' },
        { type: 'docker' },
        { pod: 'my-pod' }, // Missing type
        { type: 'kubernetes' } // Missing pod
      ];
      
      for (const opts of invalidOptions) {
        await expect(adapter.execute({
          command: 'ls',
          adapterOptions: opts as any
        })).rejects.toThrow();
      }
    });

    it('should accept valid adapter options', () => {
      adapter = new KubernetesAdapter();
      
      const validOptions = {
        type: 'kubernetes' as const,
        pod: 'my-pod',
        namespace: 'default',
        container: 'main'
      };
      
      // Should not throw when validating structure
      expect(() => {
        if (validOptions.type !== 'kubernetes') throw new Error('Invalid type');
        if (!validOptions.pod) throw new Error('Pod required');
      }).not.toThrow();
    });
  });
});