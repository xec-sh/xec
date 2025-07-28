import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';

import { $ } from '../../src/index.js';

// Skip tests if kubectl is not available
const KUBECTL_AVAILABLE = process.env['KUBECTL_AVAILABLE'] === 'true';

const conditionalDescribe = KUBECTL_AVAILABLE ? describe : describe.skip;

conditionalDescribe('Kubernetes Port Forward Integration', () => {
  const TEST_NAMESPACE = process.env['K8S_TEST_NAMESPACE'] || 'default';
  const TEST_POD = process.env['K8S_TEST_POD'] || 'test-nginx';
  
  beforeAll(async () => {
    // Ensure test pod exists
    try {
      await $`kubectl get pod ${TEST_POD} -n ${TEST_NAMESPACE}`;
    } catch {
      // Create a test nginx pod if it doesn't exist
      await $`kubectl run ${TEST_POD} --image=nginx:alpine -n ${TEST_NAMESPACE}`;
      await $`kubectl wait --for=condition=ready pod/${TEST_POD} -n ${TEST_NAMESPACE} --timeout=30s`;
    }
  });

  afterAll(async () => {
    // Clean up test pod if we created it
    if (process.env['K8S_CLEANUP'] !== 'false') {
      await $`kubectl delete pod ${TEST_POD} -n ${TEST_NAMESPACE} --ignore-not-found`;
    }
  });

  describe('Port Forwarding', () => {
    it('should forward specific port', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      // Forward port 8888 locally to port 80 in the pod
      const forward = await pod.portForward(8888, 80);
      
      try {
        expect(forward.localPort).toBe(8888);
        expect(forward.remotePort).toBe(80);
        expect(forward.isOpen).toBe(true);
        
        // Test the forwarded port
        const response = await $`curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/`.nothrow();
        expect(response.stdout.trim()).toBe('200');
      } finally {
        await forward.close();
        expect(forward.isOpen).toBe(false);
      }
    });

    it('should allocate dynamic local port', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      // Request dynamic port allocation
      const forward = await pod.portForwardDynamic(80);
      
      try {
        expect(forward.localPort).toBeGreaterThan(1024);
        expect(forward.remotePort).toBe(80);
        expect(forward.isOpen).toBe(true);
        
        // Test the dynamically allocated port
        const response = await $`curl -s -o /dev/null -w "%{http_code}" http://localhost:${forward.localPort}/`.nothrow();
        expect(response.stdout.trim()).toBe('200');
      } finally {
        await forward.close();
      }
    });

    it('should handle multiple concurrent forwards', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      // Create multiple port forwards
      const forward1 = await pod.portForwardDynamic(80);
      const forward2 = await pod.portForwardDynamic(80);
      
      try {
        // Ensure different local ports were allocated
        expect(forward1.localPort).not.toBe(forward2.localPort);
        
        // Both should work
        const [response1, response2] = await Promise.all([
          $`curl -s -o /dev/null -w "%{http_code}" http://localhost:${forward1.localPort}/`.nothrow(),
          $`curl -s -o /dev/null -w "%{http_code}" http://localhost:${forward2.localPort}/`.nothrow()
        ]);
        
        expect(response1.stdout.trim()).toBe('200');
        expect(response2.stdout.trim()).toBe('200');
      } finally {
        await Promise.all([forward1.close(), forward2.close()]);
      }
    });
  });

  describe('Streaming Logs', () => {
    it('should stream logs with follow', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      const collectedLogs: string[] = [];
      
      // Start following logs
      const stream = await pod.follow(
        (line) => collectedLogs.push(line),
        { tail: 5 }
      );
      
      // Generate some log activity
      await pod.exec`nginx -s reload`;
      
      // Wait a bit for logs
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      stream.stop();
      expect(collectedLogs.length).toBeGreaterThan(0);
    });

    it('should stream logs from specific time window', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      const collectedLogs: string[] = [];
      
      // Stream recent logs without following
      const stream = await pod.streamLogs(
        (line) => collectedLogs.push(line),
        { tail: 10, follow: false }
      );
      
      // Wait for streaming to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      stream.stop();
      expect(collectedLogs.length).toBeGreaterThan(0);
      expect(collectedLogs.length).toBeLessThanOrEqual(10);
    });

    it('should get logs with timestamps', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      const logs = await pod.logs({ tail: 5, timestamps: true });
      
      expect(logs).toBeTruthy();
      // Timestamps should be present at the start of each line
      const lines = logs.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });
  });

  describe('File Operations', () => {
    it('should copy file to pod', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      // Create a test file
      const testContent = 'Hello from Kubernetes API test';
      await $`echo "${testContent}" > /tmp/k8s-test-input.txt`;
      
      try {
        // Copy to pod
        await pod.copyTo('/tmp/k8s-test-input.txt', '/tmp/test.txt');
        
        // Verify the file was copied
        const result = await pod.exec`cat /tmp/test.txt`;
        expect(result.stdout.trim()).toBe(testContent);
      } finally {
        await $`rm -f /tmp/k8s-test-input.txt`;
      }
    });

    it('should copy file from pod', async () => {
      const k8s = $.k8s();
      const pod = k8s.pod(TEST_POD);
      
      // Create a file in the pod
      const testContent = 'Hello from pod';
      await pod.exec`echo "${testContent}" > /tmp/pod-output.txt`;
      
      try {
        // Copy from pod
        await pod.copyFrom('/tmp/pod-output.txt', '/tmp/k8s-test-output.txt');
        
        // Verify the file was copied
        const result = await $`cat /tmp/k8s-test-output.txt`;
        expect(result.stdout.trim()).toBe(testContent);
      } finally {
        await $`rm -f /tmp/k8s-test-output.txt`;
        await pod.exec`rm -f /tmp/pod-output.txt`;
      }
    });
  });
});