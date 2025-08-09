import { test, expect, describe } from '@jest/globals';
import { RemoteDockerAdapter } from '../../../src/adapters/remote-docker/index';
describe('RemoteDockerAdapter - Simple Tests', () => {
    test('should create adapter instance', () => {
        const config = {
            ssh: {
                host: 'test-host',
                username: 'test-user',
                port: 22
            },
            dockerPath: 'docker'
        };
        const adapter = new RemoteDockerAdapter(config);
        expect(adapter).toBeInstanceOf(RemoteDockerAdapter);
    });
    test('should handle adapter options extraction', () => {
        const config = {
            ssh: {
                host: 'test-host',
                username: 'test-user'
            }
        };
        const adapter = new RemoteDockerAdapter(config);
        expect(adapter.adapterName).toBe('remote-docker');
    });
    test('should merge config with defaults', () => {
        const config = {
            ssh: {
                host: 'test-host',
                username: 'test-user'
            }
        };
        const adapter = new RemoteDockerAdapter(config);
        const adapterConfig = adapter.remoteDockerConfig;
        expect(adapterConfig.dockerPath).toBe('docker');
        expect(adapterConfig.autoCreate.enabled).toBe(false);
        expect(adapterConfig.autoCreate.image).toBe('alpine:latest');
        expect(adapterConfig.autoCreate.autoRemove).toBe(true);
    });
    test('should respect custom autoCreate config', () => {
        const config = {
            ssh: {
                host: 'test-host',
                username: 'test-user'
            },
            autoCreate: {
                enabled: true,
                image: 'ubuntu:latest',
                autoRemove: false,
                volumes: ['/data:/data']
            }
        };
        const adapter = new RemoteDockerAdapter(config);
        const adapterConfig = adapter.remoteDockerConfig;
        expect(adapterConfig.autoCreate.enabled).toBe(true);
        expect(adapterConfig.autoCreate.image).toBe('ubuntu:latest');
        expect(adapterConfig.autoCreate.autoRemove).toBe(false);
        expect(adapterConfig.autoCreate.volumes).toEqual(['/data:/data']);
    });
});
//# sourceMappingURL=remote-docker-adapter-simple.test.js.map