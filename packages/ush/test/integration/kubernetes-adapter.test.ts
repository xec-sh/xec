import { spawn } from 'child_process';
import { test, expect, describe, afterAll, beforeAll, beforeEach } from '@jest/globals';

import { ExecutionEngine, createCallableEngine } from '../../src/index.js';
import { KubernetesAdapter } from '../../src/adapters/kubernetes-adapter.js';

// Helper to check if kubectl is available
async function isKubectlAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('kubectl', ['version', '--client', '--short']);
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

// Helper to check if we're connected to a cluster
async function isClusterAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('kubectl', ['cluster-info'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

// Skip tests if kubectl or cluster is not available
const skipIfNoKubectl = await isKubectlAvailable().then(available => !available);
const skipIfNoCluster = skipIfNoKubectl || await isClusterAvailable().then(available => !available);

// Only run these tests if kubectl and cluster are available
const describeIntegration = skipIfNoCluster ? describe.skip : describe;

describeIntegration('KubernetesAdapter Integration Tests', () => {
  let adapter: KubernetesAdapter;
  let testPodName: string;
  let testNamespace: string;
  
  beforeAll(async () => {
    if (skipIfNoCluster) return;
    
    // Create a test namespace
    testNamespace = `ush-test-${Date.now()}`;
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('kubectl', ['create', 'namespace', testNamespace]);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to create namespace: ${code}`));
      });
    });
    
    // Create a test pod
    testPodName = 'test-pod';
    const podYaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${testPodName}
  namespace: ${testNamespace}
  labels:
    app: test
spec:
  containers:
  - name: main
    image: busybox:latest
    command: ['sleep', '3600']
`;
    
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('kubectl', ['apply', '-f', '-'], {
        stdio: ['pipe', 'ignore', 'ignore']
      });
      proc.stdin?.write(podYaml);
      proc.stdin?.end();
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to create pod: ${code}`));
      });
    });
    
    // Wait for pod to be ready
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        const proc = spawn('kubectl', [
          'get', 'pod', testPodName, 
          '-n', testNamespace,
          '-o', 'jsonpath={.status.phase}'
        ]);
        
        let output = '';
        proc.stdout?.on('data', (data) => { output += data; });
        proc.on('exit', () => {
          if (output.trim() === 'Running') {
            resolve();
          } else {
            setTimeout(checkReady, 1000);
          }
        });
      };
      checkReady();
    });
  });
  
  afterAll(async () => {
    if (skipIfNoCluster) return;
    
    // Clean up test namespace
    await new Promise<void>((resolve) => {
      const proc = spawn('kubectl', ['delete', 'namespace', testNamespace, '--wait=false']);
      proc.on('exit', () => resolve());
    });
  });
  
  beforeEach(() => {
    adapter = new KubernetesAdapter({
      namespace: testNamespace
    });
  });
  
  describe('Availability', () => {
    const testKubectl = skipIfNoKubectl ? test.skip : test;
    testKubectl('should detect kubectl availability', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });
  });
  
  describe('Command execution', () => {
    const testIntegration = skipIfNoCluster ? test.skip : test;
    
    testIntegration('should execute simple command in pod', async () => {
      const result = await adapter.execute({
        command: 'echo',
        args: ['Hello from Kubernetes'],
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello from Kubernetes');
    });
    
    testIntegration('should handle command with arguments', async () => {
      const result = await adapter.execute({
        command: 'ls',
        args: ['-la', '/'],
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bin');
      expect(result.stdout).toContain('etc');
    });
    
    testIntegration('should support working directory', async () => {
      const result = await adapter.execute({
        command: 'pwd',
        cwd: '/tmp',
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('/tmp');
    });
    
    testIntegration('should pass environment variables', async () => {
      const result = await adapter.execute({
        command: 'printenv',
        args: ['TEST_VAR'],
        env: { TEST_VAR: 'test-value' },
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test-value');
    });
    
    testIntegration('should handle stdin input', async () => {
      const result = await adapter.execute({
        command: 'cat',
        stdin: 'Input from stdin',
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName,
          stdin: true
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Input from stdin');
    });
    
    testIntegration('should handle command failure', async () => {
      const result = await adapter.execute({
        command: 'exit 42',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName
        }
      });
      
      expect(result.exitCode).toBe(42);
    });
    
    testIntegration('should support label selectors', async () => {
      const result = await adapter.execute({
        command: 'hostname',
        adapterOptions: {
          type: 'kubernetes',
          pod: '-l app=test'
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(testPodName);
    });
  });
  
  describe('Error handling', () => {
    const testIntegration = skipIfNoCluster ? test.skip : test;
    
    testIntegration('should handle non-existent pod', async () => {
      await expect(adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'non-existent-pod'
        }
      })).rejects.toThrow();
    });
    
    testIntegration('should handle non-existent namespace', async () => {
      await expect(adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName,
          namespace: 'non-existent-namespace'
        }
      })).rejects.toThrow();
    });
    
    testIntegration('should require pod name', async () => {
      await expect(adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'kubernetes'
        } as any
      })).rejects.toThrow('Pod name or selector is required');
    });
  });
  
  describe('Helper methods', () => {
    const testIntegration = skipIfNoCluster ? test.skip : test;
    
    testIntegration('should get pod from selector', async () => {
      const podName = await adapter.getPodFromSelector('app=test', testNamespace);
      expect(podName).toBe(testPodName);
    });
    
    testIntegration('should check if pod is ready', async () => {
      const ready = await adapter.isPodReady(testPodName, testNamespace);
      expect(ready).toBe(true);
    });
    
    testIntegration('should return false for non-ready pod', async () => {
      const ready = await adapter.isPodReady('non-existent', testNamespace);
      expect(ready).toBe(false);
    });
  });
  
  describe('File operations', () => {
    const testIntegration = skipIfNoCluster ? test.skip : test;
    
    testIntegration('should copy file to pod', async () => {
      // Create a temp file
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      
      const tempFile = path.join(os.tmpdir(), `test-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, 'Test content');
      
      try {
        await adapter.copyFiles(
          tempFile,
          `${testPodName}:/tmp/test.txt`,
          {
            namespace: testNamespace,
            direction: 'to'
          }
        );
        
        // Verify file was copied
        const result = await adapter.execute({
          command: 'cat /tmp/test.txt',
          adapterOptions: {
            type: 'kubernetes',
            pod: testPodName
          }
        });
        
        expect(result.stdout).toBe('Test content');
      } finally {
        fs.unlinkSync(tempFile);
      }
    });
    
    testIntegration('should copy file from pod', async () => {
      // Create a file in the pod
      await adapter.execute({
        command: 'echo "Pod content" > /tmp/from-pod.txt',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: testPodName
        }
      });
      
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      
      const tempFile = path.join(os.tmpdir(), `from-pod-${Date.now()}.txt`);
      
      try {
        await adapter.copyFiles(
          `${testPodName}:/tmp/from-pod.txt`,
          tempFile,
          {
            namespace: testNamespace,
            direction: 'from'
          }
        );
        
        const content = fs.readFileSync(tempFile, 'utf-8');
        expect(content.trim()).toBe('Pod content');
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });
  
  describe('Integration with ExecutionEngine', () => {
    const testIntegration = skipIfNoCluster ? test.skip : test;
    
    testIntegration('should work with execution engine', async () => {
      const engine = new ExecutionEngine();
      const $ = createCallableEngine(engine);
      
      const result = await $.kubernetes({
        pod: testPodName,
        namespace: testNamespace
      })`echo "Hello from $"`;
      
      expect(result.stdout.trim()).toBe('Hello from $');
    });
    
    testIntegration('should support chaining', async () => {
      const engine = new ExecutionEngine();
      const $ = createCallableEngine(engine);
      
      const k8s = $.kubernetes({
        pod: testPodName,
        namespace: testNamespace
      });
      
      const result1 = await k8s`echo "First command"`;
      const result2 = await k8s`echo "Second command"`;
      
      expect(result1.stdout.trim()).toBe('First command');
      expect(result2.stdout.trim()).toBe('Second command');
    });
  });
});