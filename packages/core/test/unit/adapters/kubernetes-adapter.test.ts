import { promisify } from 'util';
import { Readable } from 'stream';
import { exec } from 'child_process';
import { it, expect, describe, afterAll, beforeAll, afterEach, beforeEach } from '@jest/globals';

import { KubernetesAdapter } from '../../../src/adapters/kubernetes-adapter.js';

const execAsync = promisify(exec);

// Set PATH for tests to find kubectl, docker, and kind
process.env['PATH'] = `/usr/local/bin:/opt/homebrew/bin:${process.env['PATH'] || ''}`;

// Also set explicit paths for execAsync calls
const execAsyncOptions = { env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env['PATH'] || ''}` } };

// Test configuration
const TEST_NAMESPACE = 'test-namespace';
const TEST_CONTEXT = 'kind-test-cluster';
const TEST_POD = 'test-pod';

/**
 * Unit tests for KubernetesAdapter.
 * This file focuses on unique unit test scenarios not covered in kubernetes-adapter-enhanced.test.ts
 * Common functionality tests have been moved to the enhanced test file.
 */
describe('KubernetesAdapter Unit Tests', () => {
  let adapter: InstanceType<typeof KubernetesAdapter>;

  beforeAll(async () => {
    // Ensure kind cluster exists
    try {
      const { stdout } = await execAsync('/opt/homebrew/bin/kind get clusters', execAsyncOptions);
      if (!stdout.includes('test-cluster')) {
        console.log('Creating kind cluster...');
        await execAsync('/opt/homebrew/bin/kind create cluster --name test-cluster', { ...execAsyncOptions, timeout: 300000 });
      }
    } catch (error) {
      console.error('Failed to check/create kind cluster:', error);
      throw error;
    }

    // Ensure test namespace exists
    try {
      await execAsync(`/usr/local/bin/kubectl create namespace ${TEST_NAMESPACE}`, execAsyncOptions);
    } catch (error) {
      // Namespace might already exist
    }

    // Ensure test pod exists
    try {
      await execAsync(`/usr/local/bin/kubectl get pod ${TEST_POD} -n ${TEST_NAMESPACE}`, execAsyncOptions);
    } catch (error) {
      // Create test pod if it doesn't exist
      const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${TEST_POD}
  namespace: ${TEST_NAMESPACE}
  labels:
    app: test
spec:
  containers:
  - name: main
    image: busybox:latest
    command: ["sleep", "3600"]
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80
`;
      await execAsync(`echo '${podYaml}' | /usr/local/bin/kubectl apply -f -`, execAsyncOptions);
      await execAsync(`/usr/local/bin/kubectl wait --for=condition=ready pod/${TEST_POD} -n ${TEST_NAMESPACE} --timeout=60s`, execAsyncOptions);
    }
  }, 120000);

  afterAll(async () => {
    // Cleanup is optional - you might want to keep the cluster for future tests
    // await execAsync('kind delete cluster --name test-cluster');
  });

  beforeEach(() => {
    adapter = new KubernetesAdapter({
      namespace: TEST_NAMESPACE,
      context: TEST_CONTEXT,
      kubectlPath: '/usr/local/bin/kubectl'
    });
  });

  afterEach(async () => {
    if (adapter && typeof adapter.dispose === 'function') {
      await adapter.dispose();
    }
  });

  // Constructor and isAvailable tests are covered in kubernetes-adapter-enhanced.test.ts

  describe('Unique unit test scenarios', () => {
    // Keep unique tests not covered in enhanced test file
    it('should handle nginx container version check', async () => {
      const result = await adapter.execute({
        command: 'nginx -v',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: TEST_POD,
          container: 'nginx'
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('nginx version');
    });

    it('should handle stdin stream', async () => {
      const inputStream = new Readable({
        read() {
          this.push('Stream content');
          this.push(null);
        }
      });

      const result = await adapter.execute({
        command: 'cat',
        stdin: inputStream,
        adapterOptions: {
          type: 'kubernetes',
          pod: TEST_POD
        }
      });

      expect(result.stdout).toBe('Stream content');
    });

    it('should pass custom execFlags', async () => {
      // This test is unique - tests specific kubectl exec flags
      const testAdapter = new KubernetesAdapter({
        namespace: TEST_NAMESPACE,
        context: TEST_CONTEXT,
        throwOnNonZeroExit: false,
        kubectlPath: '/usr/local/bin/kubectl'
      });

      const result = await testAdapter.execute({
        command: 'echo',
        args: ['ok'],
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: TEST_POD,
          container: 'main',
          stdin: false,
          execFlags: ['--pod-running-timeout=5m']
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('ok\n');
    });
  });

  // Helper method tests are covered in kubernetes-adapter-enhanced.test.ts

  // Skipped copyFiles tests remain here due to Jest environment issues
  describe('copyFiles (skipped due to environment)', () => {
    // TODO: Fix copyFiles tests - they work when run manually but fail in Jest environment
    // Likely due to PATH or environment differences in the test runner
    beforeEach(async () => {
      // Create a test file
      await execAsync('echo "test content" > /tmp/test-file.txt', execAsyncOptions);
    });

    afterEach(async () => {
      // Cleanup
      await execAsync('rm -f /tmp/test-file.txt /tmp/test-file-copy.txt', execAsyncOptions);
    });

    it.skip('should copy files from pod', async () => {
      // First create a file in the pod
      await adapter.execute({
        command: 'echo "pod content" > /tmp/pod-file.txt',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: TEST_POD
        }
      });

      // Copy from pod
      await adapter.copyFiles(
        `${TEST_POD}:/tmp/pod-file.txt`,
        '/tmp/test-file-copy.txt',
        { namespace: TEST_NAMESPACE, direction: 'from' }
      );

      // Verify file exists locally
      const { stdout } = await execAsync('cat /tmp/test-file-copy.txt', execAsyncOptions);
      expect(stdout).toContain('pod content');
    });
  });
  // Dispose and metadata tests are covered in kubernetes-adapter-enhanced.test.ts
});