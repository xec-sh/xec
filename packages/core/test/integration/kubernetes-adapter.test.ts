import { unlinkSync, writeFileSync } from 'fs';
import { KindClusterManager } from '@xec-sh/testing';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';

import { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';

/**
 * Integration tests for KubernetesAdapter.
 * These tests focus on real cluster interactions and multi-container pod scenarios.
 * Basic functionality tests are covered in kubernetes-adapter-enhanced.test.ts
 */
describe('KubernetesAdapter Integration Tests', () => {
  let adapter: KubernetesAdapter;
  let cluster: KindClusterManager;

  beforeAll(async () => {
    // Set up PATH
    process.env['PATH'] = `${process.env['PATH']}:/usr/local/bin:/opt/homebrew/bin`;

    // Create and setup cluster
    cluster = new KindClusterManager({ name: 'ush-k8s-integration-tests' });
    await cluster.createCluster();

    // Deploy test pods
    await cluster.deployTestPod('test-pod', 'test');
    await cluster.createMultiContainerPod('multi-pod', 'test');

    // Wait a bit for pods to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Create adapter with cluster's kubeconfig
    adapter = new KubernetesAdapter({
      namespace: 'test',
      kubeconfig: cluster.getKubeConfigPath(),
      kubectlPath: 'kubectl'
    });
  }, 300000);

  afterAll(async () => {
    if (cluster) {
      await cluster.deleteCluster();
      cluster.cleanup();
    }
  }, 120000);

  // Constructor and isAvailable tests are covered in kubernetes-adapter-enhanced.test.ts

  describe('Multi-container pod integration', () => {
    // Focus on unique multi-container scenarios not covered in other tests
    it('should handle multi-container pod command execution', async () => {
      // Test main container
      const result1 = await adapter.execute({
        command: 'echo "from app"',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'multi-pod',
          container: 'app'
        }
      });

      expect(result1.exitCode).toBe(0);
      expect(result1.stdout.trim()).toBe('from app');

      // Test sidecar container
      const result2 = await adapter.execute({
        command: 'echo "from sidecar"',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'multi-pod',
          container: 'sidecar'
        }
      });

      expect(result2.exitCode).toBe(0);
      expect(result2.stdout.trim()).toBe('from sidecar');
    });

    it('should handle custom shell path', async () => {
      // This test is unique - checks $0 to verify shell path
      const result = await adapter.execute({
        command: 'echo $0',
        shell: '/bin/sh',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('/bin/sh');
    });
  });

  // Helper method tests are covered in kubernetes-adapter-enhanced.test.ts

  describe('Integration-specific file operations', () => {
    // Keep only the unique container-specific copy test
    it('should handle file copy with specific container', async () => {
      const testContent = 'Test for nginx container';
      const localFile = `/tmp/nginx-test-${Date.now()}.txt`;
      writeFileSync(localFile, testContent);

      // Create fresh adapter
      const testAdapter = new KubernetesAdapter({
        namespace: 'test',
        kubeconfig: cluster.getKubeConfigPath(),
        kubectlPath: 'kubectl'
      });

      await testAdapter.copyFiles(
        localFile,
        'test-pod:/tmp/test.txt',
        { container: 'nginx', namespace: 'test', direction: 'to' }
      );

      // Verify through nginx container
      const result = await testAdapter.execute({
        command: 'cat /tmp/test.txt',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          container: 'nginx'
        }
      });

      expect(result.stdout.trim()).toBe(testContent);

      // Cleanup
      unlinkSync(localFile);
    });
  });

  // Dispose and metadata tests are covered in kubernetes-adapter-enhanced.test.ts
});