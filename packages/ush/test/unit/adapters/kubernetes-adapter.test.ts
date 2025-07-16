import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

jest.unstable_mockModule('child_process', () => ({
  spawn: jest.fn()
}));

const { spawn } = await import('child_process');
const { KubernetesError, KubernetesAdapter } = await import('../../../src/adapters/kubernetes-adapter.js');
const { TimeoutError } = await import('../../../src/core/error.js');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Track all timeouts for cleanup
const activeTimeouts = new Set<NodeJS.Timeout>();

// Helper to create a mock child process
function createMockProcess(
  stdout: string = '',
  stderr: string = '',
  exitCode: number = 0,
  options: {
    delay?: number;
    error?: Error;
    signal?: NodeJS.Signals;
  } = {}
): any {
  const proc = new EventEmitter() as any;
  proc.stdout = new Readable({
    read() {
      if (stdout) {
        this.push(stdout);
        stdout = '';
      } else {
        this.push(null);
      }
    }
  });
  proc.stderr = new Readable({
    read() {
      if (stderr) {
        this.push(stderr);
        stderr = '';
      } else {
        this.push(null);
      }
    }
  });
  proc.stdin = new Writable({
    write(chunk, encoding, callback) {
      callback();
    }
  });
  
  proc.stdin.write = jest.fn((chunk: any, encoding?: any, callback?: any) => {
    if (typeof encoding === 'function') {
      callback = encoding;
    }
    if (callback) callback();
    return true;
  });
  
  proc.kill = jest.fn();
  
  // Simulate process behavior
  const timeout = setTimeout(() => {
    activeTimeouts.delete(timeout);
    if (options.error) {
      proc.emit('error', options.error);
    } else {
      proc.emit('exit', exitCode, options.signal || null);
    }
  }, options.delay || 0);
  
  activeTimeouts.add(timeout);
  
  return proc;
}

describe('KubernetesAdapter', () => {
  let adapter: InstanceType<typeof KubernetesAdapter>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new KubernetesAdapter({
      namespace: 'test-namespace',
      context: 'test-context'
    });
  });
  
  afterEach(async () => {
    jest.restoreAllMocks();
    // Clear any remaining timeouts
    activeTimeouts.forEach(timeout => clearTimeout(timeout));
    activeTimeouts.clear();
    // Wait a tick to ensure all microtasks are flushed
    await new Promise(resolve => setImmediate(resolve));
  });
  
  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const adapter = new KubernetesAdapter();
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });
    
    it('should create adapter with custom config', () => {
      const adapter = new KubernetesAdapter({
        namespace: 'custom-namespace',
        context: 'custom-context',
        kubeconfig: '/path/to/kubeconfig',
        kubectlPath: '/usr/local/bin/kubectl',
        kubectlTimeout: 60000
      });
      expect(adapter).toBeInstanceOf(KubernetesAdapter);
    });
  });
  
  describe('isAvailable', () => {
    it('should return true when kubectl and cluster are available', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess('Client Version: v1.24.0\n'))
        .mockReturnValueOnce(createMockProcess('Kubernetes control plane is running at https://localhost:6443\n'));
      
      const result = await adapter.isAvailable();
      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', ['version', '--client', '--short'], expect.any(Object));
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', ['cluster-info'], expect.any(Object));
    });
    
    it('should return false when kubectl is not available', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'kubectl: command not found', 127));
      
      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
    
    it('should return false when cluster is not available', async () => {
      mockSpawn
        .mockReturnValueOnce(createMockProcess('Client Version: v1.24.0\n'))
        .mockReturnValueOnce(createMockProcess('', 'The connection to the server localhost:8080 was refused', 1));
      
      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
    
    it('should handle spawn errors gracefully', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0, { error: new Error('spawn error') }));
      
      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });
  
  describe('execute', () => {
    it('should execute simple command in pod', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('Hello from Kubernetes\n'));
      
      const result = await adapter.execute({
        command: 'echo',
        args: ['Hello from Kubernetes'],
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Hello from Kubernetes\n');
      expect(result.stderr).toBe('');
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', [
        '--context', 'test-context',
        'exec',
        '-n', 'test-namespace',
        '-i',
        'test-pod',
        '--',
        'echo', 'Hello from Kubernetes'
      ], expect.any(Object));
    });
    
    it('should execute shell command', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('test-value\n'));
      
      const result = await adapter.execute({
        command: 'echo $TEST_VAR',
        shell: true,
        env: { TEST_VAR: 'test-value' },
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('test-value\n');
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', [
        '--context', 'test-context',
        'exec',
        '-n', 'test-namespace',
        '-i',
        'test-pod',
        '--',
        '/bin/sh', '-c', 'echo $TEST_VAR'
      ], expect.objectContaining({
        env: expect.objectContaining({ TEST_VAR: 'test-value' })
      }));
    });
    
    it('should handle custom shell', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('bash-5.1\n'));
      
      const result = await adapter.execute({
        command: 'echo $BASH_VERSION',
        shell: '/bin/bash',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(result.exitCode).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
        '/bin/bash', '-c', 'echo $BASH_VERSION'
      ]), expect.any(Object));
    });
    
    it('should handle container option', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('nginx version\n'));
      
      await adapter.execute({
        command: 'nginx -v',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          container: 'nginx'
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
        '-c', 'nginx'
      ]), expect.any(Object));
    });
    
    it('should handle namespace option', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('ok\n'));
      
      await adapter.execute({
        command: 'echo ok',
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          namespace: 'other-namespace'
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
        '-n', 'other-namespace'
      ]), expect.any(Object));
    });
    
    it('should handle label selector', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('test-pod\n'));
      
      await adapter.execute({
        command: 'hostname',
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: '-l app=test'
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
        '-l app=test'
      ]), expect.any(Object));
    });
    
    it('should handle stdin input', async () => {
      const mockProc = createMockProcess('Input from stdin');
      mockSpawn.mockReturnValueOnce(mockProc);
      
      const result = await adapter.execute({
        command: 'cat',
        stdin: 'Input from stdin',
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(result.stdout).toBe('Input from stdin');
      expect(mockProc.stdin.write).toHaveBeenCalled();
    });
    
    it('should handle stdin stream', async () => {
      const mockProc = createMockProcess('Stream content');
      mockSpawn.mockReturnValueOnce(mockProc);
      
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
          pod: 'test-pod'
        }
      });
      
      expect(result.stdout).toBe('Stream content');
    });
    
    it('should handle command timeout', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0, { delay: 2000 }));
      
      await expect(adapter.execute({
        command: 'sleep 10',
        timeout: 100,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      })).rejects.toThrow(TimeoutError);
    });
    
    it('should handle non-zero exit code', async () => {
      const adapter = new KubernetesAdapter({ throwOnNonZeroExit: false });
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'Command failed', 42));
      
      const result = await adapter.execute({
        command: 'exit 42',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(result.exitCode).toBe(42);
      expect(result.stderr).toBe('Command failed');
    });
    
    it('should throw on non-zero exit with throwOnNonZeroExit', async () => {
      const adapter = new KubernetesAdapter({ throwOnNonZeroExit: true });
      mockSpawn.mockReturnValueOnce(createMockProcess('', 'Command failed', 1));
      
      const promise = adapter.execute({
        command: 'test-exit-1',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      await expect(promise).rejects.toThrow(KubernetesError);
      // Wait for any pending microtasks
      await new Promise(resolve => setImmediate(resolve));
    });
    
    it('should throw error when pod name is missing', async () => {
      await expect(adapter.execute({
        command: 'echo test',
        adapterOptions: {
          type: 'kubernetes',
          pod: ''
        }
      })).rejects.toThrow(KubernetesError);
      
      await expect(adapter.execute({
        command: 'echo test'
      })).rejects.toThrow('Pod name or selector is required');
    });
    
    it('should handle spawn errors', async () => {
      // Create an adapter with throwOnNonZeroExit: false to avoid conflicts
      const testAdapter = new KubernetesAdapter({ 
        namespace: 'test-namespace',
        context: 'test-context',
        throwOnNonZeroExit: false 
      });
      mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0, { error: new Error('spawn kubectl ENOENT') }));
      
      await expect(testAdapter.execute({
        command: 'echo test',
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      })).rejects.toThrow(KubernetesError);
    });
    
    it('should handle command with shell mode', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('file1\nfile2\n'));
      
      await adapter.execute({
        command: 'ls -la /tmp',
        shell: true,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
        '/bin/sh', '-c', 'ls -la /tmp'
      ]), expect.any(Object));
    });
    
    it('should handle command with separate args', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('Hello World\n'));
      
      await adapter.execute({
        command: 'echo',
        args: ['Hello', 'World'],
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
        'echo', 'Hello', 'World'
      ]), expect.any(Object));
    });
    
    it('should include kubeconfig when provided', async () => {
      const adapter = new KubernetesAdapter({
        kubeconfig: '/custom/kubeconfig'
      });
      mockSpawn.mockReturnValueOnce(createMockProcess('ok\n'));
      
      await adapter.execute({
        command: 'echo ok',
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod'
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
        '--kubeconfig', '/custom/kubeconfig'
      ]), expect.any(Object));
    });
    
    it('should handle tty option', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('ok\n'));
      
      await adapter.execute({
        command: 'echo ok',
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          tty: true
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining(['-t']), expect.any(Object));
    });
    
    it('should disable stdin when specified', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('ok\n'));
      
      await adapter.execute({
        command: 'echo ok',
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          stdin: false
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', 
        expect.not.arrayContaining(['-i']), 
        expect.any(Object)
      );
    });
    
    it('should pass execFlags', async () => {
      mockSpawn.mockReturnValueOnce(createMockProcess('ok\n'));
      
      await adapter.execute({
        command: 'echo ok',
        shell: false,
        adapterOptions: {
          type: 'kubernetes',
          pod: 'test-pod',
          execFlags: ['--pod-running-timeout=5m']
        }
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('kubectl', 
        expect.arrayContaining(['--pod-running-timeout=5m']), 
        expect.any(Object)
      );
    });
  });
  
  describe('helper methods', () => {
    describe('getPodFromSelector', () => {
      it('should get pod name from label selector', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('test-pod-123\n'));
        
        const podName = await adapter.getPodFromSelector('app=test', 'test-namespace');
        
        expect(podName).toBe('test-pod-123');
        expect(mockSpawn).toHaveBeenCalledWith('kubectl', [
          'get', 'pods',
          '-o', 'jsonpath={.items[0].metadata.name}',
          '-n', 'test-namespace',
          '-l', 'app=test'
        ], expect.any(Object));
      });
      
      it('should handle selector with -l prefix', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('test-pod-456\n'));
        
        const podName = await adapter.getPodFromSelector('-l app=test');
        
        expect(podName).toBe('test-pod-456');
        expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
          '-l app=test'
        ]), expect.any(Object));
      });
      
      it('should return null when no pod found', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess(''));
        
        const podName = await adapter.getPodFromSelector('app=nonexistent');
        
        expect(podName).toBeNull();
      });
      
      it('should return null on error', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('', 'Error from server', 1));
        
        const podName = await adapter.getPodFromSelector('app=test');
        
        expect(podName).toBeNull();
      });
    });
    
    describe('isPodReady', () => {
      it('should return true for ready pod', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('True'));
        
        const ready = await adapter.isPodReady('test-pod', 'test-namespace');
        
        expect(ready).toBe(true);
        expect(mockSpawn).toHaveBeenCalledWith('kubectl', [
          'get', 'pod', 'test-pod',
          '-o', 'jsonpath={.status.conditions[?(@.type=="Ready")].status}',
          '-n', 'test-namespace'
        ], expect.any(Object));
      });
      
      it('should return false for non-ready pod', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('False'));
        
        const ready = await adapter.isPodReady('test-pod');
        
        expect(ready).toBe(false);
      });
      
      it('should return false for non-existent pod', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('', 'Error from server (NotFound)', 1));
        
        const ready = await adapter.isPodReady('non-existent');
        
        expect(ready).toBe(false);
      });
      
      it('should handle errors gracefully', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('', '', 0, { error: new Error('spawn error') }));
        
        const ready = await adapter.isPodReady('test-pod');
        
        expect(ready).toBe(false);
      });
    });
    
    describe('copyFiles', () => {
      it('should copy files to pod', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess(''));
        
        await adapter.copyFiles(
          '/local/file.txt',
          'test-pod:/remote/file.txt',
          { namespace: 'test-namespace', direction: 'to' }
        );
        
        expect(mockSpawn).toHaveBeenCalledWith('kubectl', [
          'cp',
          '-n', 'test-namespace',
          '/local/file.txt',
          'test-pod:/remote/file.txt'
        ], expect.any(Object));
      });
      
      it('should copy files from pod', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess(''));
        
        await adapter.copyFiles(
          'test-pod:/remote/file.txt',
          '/local/file.txt',
          { namespace: 'test-namespace', direction: 'from' }
        );
        
        expect(mockSpawn).toHaveBeenCalledWith('kubectl', [
          'cp',
          '-n', 'test-namespace',
          '/local/file.txt',
          'test-pod:/remote/file.txt'
        ], expect.any(Object));
      });
      
      it('should handle container option', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess(''));
        
        await adapter.copyFiles(
          '/local/file.txt',
          'test-pod:/remote/file.txt',
          { container: 'nginx', direction: 'to' }
        );
        
        expect(mockSpawn).toHaveBeenCalledWith('kubectl', expect.arrayContaining([
          '-c', 'nginx'
        ]), expect.any(Object));
      });
      
      it('should throw on copy failure', async () => {
        mockSpawn.mockReturnValueOnce(createMockProcess('', 'Permission denied', 1));
        
        await expect(adapter.copyFiles(
          '/local/file.txt',
          'test-pod:/remote/file.txt',
          { direction: 'to' }
        )).rejects.toThrow(KubernetesError);
      });
    });
  });
  
  describe('dispose', () => {
    it('should clean up without errors', async () => {
      await expect(adapter.dispose()).resolves.not.toThrow();
    });
  });
  
  describe('adapter metadata', () => {
    it('should return correct adapter name', () => {
      // @ts-ignore - accessing protected property for testing
      expect(adapter.adapterName).toBe('kubernetes');
    });
  });
});