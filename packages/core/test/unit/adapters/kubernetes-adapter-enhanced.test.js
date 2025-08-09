import { join } from 'path';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import { KindClusterManager } from '@xec-sh/test-utils';
import { existsSync, unlinkSync, mkdtempSync, writeFileSync } from 'fs';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';
import { TimeoutError } from '../../../src/core/error.js';
import { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';
describe('KubernetesAdapter Enhanced Tests', () => {
    let adapter;
    let cluster;
    let kubeConfigPath;
    beforeAll(async () => {
        process.env['PATH'] = `${process.env['PATH']}:/usr/local/bin:/opt/homebrew/bin`;
        cluster = new KindClusterManager({ name: 'ush-k8s-enhanced-tests' });
        await cluster.createCluster();
        kubeConfigPath = cluster.getKubeConfigPath();
        try {
            await cluster.kubectl('create namespace test');
        }
        catch (e) {
        }
        try {
            await cluster.kubectl('create namespace production');
        }
        catch (e) {
        }
        await cluster.deployTestPod('test-pod', 'test');
        await cluster.createMultiContainerPod('multi-container-pod', 'production');
        await cluster.deployTestPod('my-pod', 'default');
        await new Promise(resolve => setTimeout(resolve, 5000));
        adapter = new KubernetesAdapter({
            throwOnNonZeroExit: false,
            kubectlPath: 'kubectl',
            kubeconfig: kubeConfigPath
        });
    }, 300000);
    afterAll(async () => {
        if (cluster) {
            await cluster.deleteCluster();
            cluster.cleanup();
        }
    }, 120000);
    describe('Availability', () => {
        it('should be available when kubectl exists and cluster is reachable', async () => {
            const available = await adapter.isAvailable();
            expect(available).toBe(true);
        });
        it('should not be available with invalid kubeconfig', async () => {
            const invalidAdapter = new KubernetesAdapter({
                kubeconfig: '/nonexistent/kubeconfig'
            });
            const available = await invalidAdapter.isAvailable();
            expect(available).toBe(false);
        });
    });
    describe('Basic command execution', () => {
        it('should execute commands in Kubernetes pod', async () => {
            const result = await adapter.execute({
                command: 'echo',
                args: ['Hello from Kubernetes'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod',
                    namespace: 'default'
                }
            });
            expect(result.stdout.trim()).toBe('Hello from Kubernetes');
            expect(result.exitCode).toBe(0);
            expect(result.adapter).toBe('kubernetes');
        });
        it('should execute commands with specific container', async () => {
            const result = await adapter.execute({
                command: 'echo',
                args: ['from app container'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'multi-container-pod',
                    container: 'app',
                    namespace: 'production'
                }
            });
            expect(result.stdout.trim()).toBe('from app container');
            expect(result.exitCode).toBe(0);
        });
        it('should handle shell commands', async () => {
            const result = await adapter.execute({
                command: 'echo $((6 * 7))',
                shell: true,
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            });
            expect(result.stdout.trim()).toBe('42');
            expect(result.exitCode).toBe(0);
        });
        it('should use default namespace when not specified', async () => {
            const result = await adapter.execute({
                command: 'echo',
                args: ['default namespace'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            });
            expect(result.stdout.trim()).toBe('default namespace');
            expect(result.exitCode).toBe(0);
        });
        it('should fail without Kubernetes options', async () => {
            await expect(adapter.execute({
                command: 'ls'
            })).rejects.toThrow('Pod name or selector is required');
        });
        it('should handle non-existent pod', async () => {
            const result = await adapter.execute({
                command: 'ls',
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'non-existent'
                }
            });
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('not found');
        });
    });
    describe('Kubernetes exec options', () => {
        it('should handle TTY mode', async () => {
            const result = await adapter.execute({
                command: 'true',
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod',
                    tty: true
                }
            });
            expect(result.exitCode).toBe(0);
        });
        it('should handle stdin mode', async () => {
            const result = await adapter.execute({
                command: 'cat',
                stdin: 'test input',
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod',
                    stdin: true
                }
            });
            expect(result.stdout).toBe('test input');
            expect(result.exitCode).toBe(0);
        });
        it('should handle custom exec flags', async () => {
            const result = await adapter.execute({
                command: 'echo',
                args: ['custom flags'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod',
                    execFlags: ['--quiet']
                }
            });
            expect(result.exitCode).toBe(0);
        });
        it('should handle environment variables', async () => {
            const result = await adapter.execute({
                command: 'echo',
                args: ['value1', 'value2'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            });
            expect(result.stdout.trim()).toBe('value1 value2');
            expect(result.exitCode).toBe(0);
        });
    });
    describe('stdin handling', () => {
        it('should pass string stdin to process', async () => {
            const result = await adapter.execute({
                command: 'cat',
                stdin: 'test input',
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            });
            expect(result.stdout).toBe('test input');
            expect(result.exitCode).toBe(0);
        });
        it('should pass Buffer stdin to process', async () => {
            const result = await adapter.execute({
                command: 'cat',
                stdin: Buffer.from('buffer input'),
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            });
            expect(result.stdout).toBe('buffer input');
            expect(result.exitCode).toBe(0);
        });
    });
    describe('Pod management methods', () => {
        it('should get pod from selector', async () => {
            const pod = await adapter.getPodFromSelector('app=test', 'test');
            expect(pod).toBeTruthy();
            expect(['test-pod', 'multi-container-pod']).toContain(pod);
        });
        it('should check if pod is ready', async () => {
            const ready = await adapter.isPodReady('test-pod', 'test');
            expect(ready).toBe(true);
            const notReady = await adapter.isPodReady('non-existent-pod', 'test');
            expect(notReady).toBe(false);
        });
        it('should execute kubectl commands to get pod logs', async () => {
            const result = await adapter['executeKubectl'](['logs', 'my-pod', '--tail=10']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBeDefined();
        });
        it('should copy files to and from pod', async () => {
            const testContent = 'Test file content';
            const localFile = `/tmp/test-${Date.now()}.txt`;
            writeFileSync(localFile, testContent);
            try {
                await adapter.copyFiles(localFile, 'test-pod:/tmp/copied.txt', { namespace: 'test', direction: 'to' });
                const result = await adapter.execute({
                    command: 'cat',
                    args: ['/tmp/copied.txt'],
                    shell: false,
                    adapterOptions: {
                        type: 'kubernetes',
                        pod: 'test-pod',
                        namespace: 'test'
                    }
                });
                expect(result.stdout.trim()).toBe(testContent);
            }
            finally {
                if (existsSync(localFile)) {
                    unlinkSync(localFile);
                }
            }
        });
        it('should execute kubectl describe pod', async () => {
            const result = await adapter['executeKubectl'](['describe', 'pod', 'my-pod']);
            expect(result.stdout).toBeTruthy();
            expect(result.stdout).toContain('Name:');
            expect(result.stdout).toContain('my-pod');
            expect(result.stdout).toContain('Status:');
            expect(result.exitCode).toBe(0);
        });
    });
    describe('Error handling', () => {
        it('should throw KubernetesError on pod operation failure', async () => {
            const strictAdapter = new KubernetesAdapter({
                throwOnNonZeroExit: true,
                kubeconfig: kubeConfigPath
            });
            await expect(strictAdapter['executeKubectl'](['exec', 'non-existent-pod', '--', 'ls'], { throwOnNonZeroExit: true })).rejects.toThrow();
        });
        it('should handle command execution errors', async () => {
            const result = await adapter.execute({
                command: 'test',
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'non-existent-pod-xyz'
                }
            });
            expect(result.exitCode).not.toBe(0);
            expect(result.stderr).toContain('not found');
        });
        it('should throw KubernetesError when throwOnNonZeroExit is true', async () => {
            const strictAdapter = new KubernetesAdapter({
                throwOnNonZeroExit: true,
                kubeconfig: kubeConfigPath
            });
            await expect(strictAdapter.execute({
                command: 'false',
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            })).rejects.toThrow();
        });
    });
    describe('Process timeout', () => {
        it('should timeout long running commands', async () => {
            await expect(adapter.execute({
                command: 'sleep 10',
                timeout: 100,
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            })).rejects.toThrow(TimeoutError);
        });
    });
    describe('Custom kubectl configuration', () => {
        it('should use custom kubectl path', async () => {
            const customAdapter = new KubernetesAdapter({
                kubectlPath: 'kubectl',
                kubeconfig: kubeConfigPath
            });
            const result = await customAdapter.execute({
                command: 'echo',
                args: ['custom kubectl'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod'
                }
            });
            expect(result.stdout.trim()).toBe('custom kubectl');
            expect(result.exitCode).toBe(0);
        });
        it('should use custom namespace from config', async () => {
            const customAdapter = new KubernetesAdapter({
                namespace: 'test',
                kubeconfig: kubeConfigPath
            });
            const result = await customAdapter.execute({
                command: 'echo',
                args: ['ok'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'test-pod'
                }
            });
            expect(result.stdout.trim()).toBe('ok');
            expect(result.exitCode).toBe(0);
        });
    });
    describe('Additional unique test scenarios', () => {
        it('should handle stdin as stream', async () => {
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
                    pod: 'my-pod'
                }
            });
            expect(result.stdout).toBe('Stream content');
        });
        it('should verify nginx version in multi-container pod', async () => {
            const result = await adapter.execute({
                command: 'nginx -v',
                shell: true,
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'test-pod',
                    container: 'nginx',
                    namespace: 'test'
                }
            });
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain('nginx version');
        });
        it('should handle hostname command with label selector', async () => {
            const result = await adapter.execute({
                command: 'hostname',
                shell: false,
                adapterOptions: {
                    type: 'kubernetes',
                    pod: '-l app=test',
                    namespace: 'test'
                }
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBeTruthy();
        });
        it('should handle specific kubectl exec flags with pod-running-timeout', async () => {
            const result = await adapter.execute({
                command: 'echo',
                args: ['with exec flags'],
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'my-pod',
                    execFlags: ['--pod-running-timeout=5m']
                }
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('with exec flags');
        });
    });
});
describe('KubernetesAdapter Complex Scenarios', () => {
    let adapter;
    let kubeConfigPath;
    beforeAll(async () => {
        const cluster = new KindClusterManager({ name: 'ush-k8s-enhanced-tests' });
        const isRunning = await cluster.isClusterRunning();
        if (!isRunning) {
            await cluster.createCluster();
        }
        kubeConfigPath = cluster.getKubeConfigPath();
        adapter = new KubernetesAdapter({
            kubeconfig: kubeConfigPath
        });
        const webPodYaml = (name) => `
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: default
  labels:
    app: web
spec:
  containers:
  - name: main
    image: alpine:3.18
    command: ['sh', '-c', 'while true; do echo \"${name} is running\"; sleep 10; done']
`;
        const tempDir = mkdtempSync(join(tmpdir(), 'xec-test-'));
        for (const podName of ['web-1', 'web-2']) {
            const podPath = join(tempDir, `${podName}.yaml`);
            writeFileSync(podPath, webPodYaml(podName));
            try {
                await cluster.kubectl(`apply -f ${podPath}`);
            }
            catch (e) {
                console.error(`Failed to create ${podName}:`, e);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 15000));
    }, 300000);
    afterAll(async () => {
        try {
            const cluster = new KindClusterManager({ name: 'ush-k8s-enhanced-tests' });
            await cluster.kubectl('delete pod web-1 web-2 -n default --ignore-not-found=true');
        }
        catch (e) {
        }
    });
    it('should handle complex multi-pod scenario', async () => {
        const listResult = await adapter['executeKubectl'](['get', 'pods', '-o', 'jsonpath={.items[*].metadata.name}']);
        const pods = listResult.stdout.split(' ').filter(p => p);
        expect(pods).toEqual(expect.arrayContaining(['web-1', 'web-2']));
        for (const pod of ['web-1', 'web-2']) {
            const result = await adapter.execute({
                command: 'echo',
                args: [`${pod} ready`],
                adapterOptions: { type: 'kubernetes', pod }
            });
            expect(result.stdout.trim()).toBe(`${pod} ready`);
        }
        const logsResult = await adapter['executeKubectl'](['logs', 'web-1']);
        expect(logsResult.stdout).toBeTruthy();
        expect(logsResult.stdout).toContain('web-1 is running');
    });
});
//# sourceMappingURL=kubernetes-adapter-enhanced.test.js.map