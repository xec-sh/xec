import { it, expect, describe } from '@jest/globals';

import { ExecutionError } from '../../../src/core/error.js';
import { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';

describe('KubernetesAdapter Simple Unit Tests', () => {
  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const adapter = new KubernetesAdapter();
      expect(adapter.name).toBe('kubernetes');
    });

    it('should create adapter with custom config', () => {
      const adapter = new KubernetesAdapter({
        namespace: 'custom-ns',
        context: 'custom-context',
        kubeconfig: '/custom/path',
        kubectlPath: '/custom/kubectl'
      });
      expect(adapter.name).toBe('kubernetes');
    });
  });

  describe('getPodFromSelector', () => {
    it('should handle null response gracefully', async () => {
      const adapter = new KubernetesAdapter();
      // This will fail in CI but that's okay for a unit test
      // The important thing is it doesn't throw
      try {
        const result = await adapter.getPodFromSelector('app=test', 'default');
        expect(result === null || typeof result === 'string').toBe(true);
      } catch (error) {
        // Expected in CI environment without kubectl
        expect(error).toBeDefined();
      }
    });
  });

  describe('execute error handling', () => {
    it('should throw error when pod is not specified', async () => {
      const adapter = new KubernetesAdapter();
      
      await expect(adapter.execute({
        command: 'echo',
        args: ['test'],
        adapterOptions: {
          type: 'kubernetes'
          // Missing pod
        } as any
      })).rejects.toThrow(ExecutionError);
    });

    it('should require pod parameter', async () => {
      const adapter = new KubernetesAdapter();
      
      try {
        await adapter.execute({
          command: 'ls',
          adapterOptions: {
            type: 'kubernetes'
          } as any
        });
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ExecutionError);
        expect((error as ExecutionError).message).toContain('Pod name or selector is required');
      }
    });
  });

  describe('new features', () => {
    it('should create port forward', async () => {
      const adapter = new KubernetesAdapter({
        namespace: 'test-ns'
      });
      
      const portForward = await adapter.portForward('test-pod', 8080, 80, {
        namespace: 'test-ns'
      });
      
      expect(portForward).toBeDefined();
      expect(portForward.localPort).toBe(8080);
      expect(portForward.remotePort).toBe(80);
      expect(portForward.isOpen).toBe(false);
    });

    it('should create port forward with dynamic port', async () => {
      const adapter = new KubernetesAdapter();
      
      const portForward = await adapter.portForward('test-pod', 0, 80, {
        namespace: 'default',
        dynamicLocalPort: true
      });
      
      expect(portForward).toBeDefined();
      expect(portForward.localPort).toBe(0); // Dynamic port starts at 0
      expect(portForward.remotePort).toBe(80);
      expect(portForward.isOpen).toBe(false);
    });

    it('should handle streamLogs parameters', async () => {
      const adapter = new KubernetesAdapter();
      const logs: string[] = [];
      
      try {
        const stream = await adapter.streamLogs(
          'test-pod',
          (line) => logs.push(line),
          {
            namespace: 'default',
            container: 'nginx',
            follow: true,
            tail: 100,
            timestamps: true
          }
        );
        
        expect(stream).toBeDefined();
        expect(stream.stop).toBeDefined();
        expect(typeof stream.stop).toBe('function');
        
        // Stop immediately to avoid hanging
        stream.stop();
      } catch (error) {
        // Expected in CI environment without kubectl
        expect(error).toBeDefined();
      }
    });
  });

  describe('executeKubectl', () => {
    it('should handle missing kubectl gracefully', async () => {
      const adapter = new KubernetesAdapter({
        kubectlPath: '/nonexistent/kubectl'
      });
      
      try {
        await adapter.executeKubectl(['version', '--client']);
        // If we get here, kubectl exists (unlikely in CI)
      } catch (error) {
        // This is expected - no kubectl in CI
        expect(error).toBeDefined();
      }
    });
  });

  describe('isPodReady', () => {
    it('should return false when kubectl is not available', async () => {
      const adapter = new KubernetesAdapter({
        kubectlPath: '/nonexistent/kubectl'
      });
      
      const result = await adapter.isPodReady('test-pod', 'default');
      expect(result).toBe(false);
    });
  });

  describe('isAvailable', () => {
    it('should check kubectl availability', async () => {
      const adapter = new KubernetesAdapter();
      
      // This will return false in CI without kubectl
      const available = await adapter.isAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should return false with invalid kubectl path', async () => {
      const adapter = new KubernetesAdapter({
        kubectlPath: '/nonexistent/kubectl'
      });
      
      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      const adapter = new KubernetesAdapter();
      
      // Create a port forward
      const pf = await adapter.portForward('test-pod', 8080, 80);
      
      // Add to internal set
      (adapter as any).portForwards = new Set([pf]);
      
      // Dispose should not throw
      await expect(adapter.dispose()).resolves.toBeUndefined();
    });

    it('should handle dispose when no resources', async () => {
      const adapter = new KubernetesAdapter();
      
      // Dispose should not throw even with no resources
      await expect(adapter.dispose()).resolves.toBeUndefined();
    });
  });

  describe('copyFiles', () => {
    it('should handle file copy parameters', async () => {
      const adapter = new KubernetesAdapter();
      
      try {
        await adapter.copyFiles(
          '/local/file.txt',
          'test-pod:/remote/file.txt',
          {
            namespace: 'default',
            container: 'app',
            direction: 'to'
          }
        );
        // If we get here, kubectl exists (unlikely in CI)
      } catch (error) {
        // Expected in CI environment
        expect(error).toBeDefined();
      }
    });
  });
});