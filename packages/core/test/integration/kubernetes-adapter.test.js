import { unlinkSync, writeFileSync } from 'fs';
import { KindClusterManager } from '@xec-sh/test-utils';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';
import { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';
describe('KubernetesAdapter Integration Tests', () => {
    let adapter;
    let cluster;
    beforeAll(async () => {
        process.env['PATH'] = `${process.env['PATH']}:/usr/local/bin:/opt/homebrew/bin`;
        cluster = new KindClusterManager({ name: 'ush-k8s-integration-tests' });
        await cluster.createCluster();
        await cluster.deployTestPod('test-pod', 'test');
        await cluster.createMultiContainerPod('multi-pod', 'test');
        await new Promise(resolve => setTimeout(resolve, 3000));
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
    describe('Multi-container pod integration', () => {
        it('should handle multi-container pod command execution', async () => {
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
    describe('Integration-specific file operations', () => {
        it('should handle file copy with specific container', async () => {
            const testContent = 'Test for nginx container';
            const localFile = `/tmp/nginx-test-${Date.now()}.txt`;
            writeFileSync(localFile, testContent);
            const testAdapter = new KubernetesAdapter({
                namespace: 'test',
                kubeconfig: cluster.getKubeConfigPath(),
                kubectlPath: 'kubectl'
            });
            await testAdapter.copyFiles(localFile, 'test-pod:/tmp/test.txt', { container: 'nginx', namespace: 'test', direction: 'to' });
            const result = await testAdapter.execute({
                command: 'cat /tmp/test.txt',
                adapterOptions: {
                    type: 'kubernetes',
                    pod: 'test-pod',
                    container: 'nginx'
                }
            });
            expect(result.stdout.trim()).toBe(testContent);
            unlinkSync(localFile);
        });
    });
});
//# sourceMappingURL=kubernetes-adapter.test.js.map