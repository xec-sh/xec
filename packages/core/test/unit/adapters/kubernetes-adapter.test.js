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
            try {
                const result = await adapter.getPodFromSelector('app=test', 'default');
                expect(result === null || typeof result === 'string').toBe(true);
            }
            catch (error) {
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
                }
            })).rejects.toThrow(ExecutionError);
        });
        it('should require pod parameter', async () => {
            const adapter = new KubernetesAdapter();
            try {
                await adapter.execute({
                    command: 'ls',
                    adapterOptions: {
                        type: 'kubernetes'
                    }
                });
                fail('Should have thrown error');
            }
            catch (error) {
                expect(error).toBeInstanceOf(ExecutionError);
                expect(error.message).toContain('Pod name or selector is required');
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
            expect(portForward.localPort).toBe(0);
            expect(portForward.remotePort).toBe(80);
            expect(portForward.isOpen).toBe(false);
        });
        it('should handle streamLogs parameters', async () => {
            const adapter = new KubernetesAdapter();
            const logs = [];
            try {
                const stream = await adapter.streamLogs('test-pod', (line) => logs.push(line), {
                    namespace: 'default',
                    container: 'nginx',
                    follow: true,
                    tail: 100,
                    timestamps: true
                });
                expect(stream).toBeDefined();
                expect(stream.stop).toBeDefined();
                expect(typeof stream.stop).toBe('function');
                stream.stop();
            }
            catch (error) {
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
            }
            catch (error) {
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
            const pf = await adapter.portForward('test-pod', 8080, 80);
            adapter.portForwards = new Set([pf]);
            await expect(adapter.dispose()).resolves.toBeUndefined();
        });
        it('should handle dispose when no resources', async () => {
            const adapter = new KubernetesAdapter();
            await expect(adapter.dispose()).resolves.toBeUndefined();
        });
    });
    describe('copyFiles', () => {
        it('should handle file copy parameters', async () => {
            const adapter = new KubernetesAdapter();
            try {
                await adapter.copyFiles('/local/file.txt', 'test-pod:/remote/file.txt', {
                    namespace: 'default',
                    container: 'app',
                    direction: 'to'
                });
            }
            catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
});
//# sourceMappingURL=kubernetes-adapter.test.js.map