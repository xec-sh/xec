import { it, expect, describe, beforeAll } from '@jest/globals';
import { $, withTempDir } from '../../../src/index.js';
describe('Docker ephemeral container name conflicts', () => {
    const testImage = 'alpine:latest';
    beforeAll(async () => {
        const pullResult = await $ `docker pull ${testImage}`.nothrow();
        if (!pullResult.ok) {
            throw new Error(`Failed to pull test image: ${pullResult.stderr}`);
        }
    });
    it('should run multiple ephemeral containers without name conflicts', async () => {
        const runs = 5;
        const results = [];
        for (let i = 0; i < runs; i++) {
            const promise = $.with({
                adapter: 'docker',
                adapterOptions: {
                    type: 'docker',
                    container: 'ephemeral',
                    runMode: 'run',
                    image: testImage,
                    autoRemove: true
                }
            }) `echo "Run ${i}"`.nothrow();
            results.push(promise);
        }
        const outputs = await Promise.all(results);
        outputs.forEach((result, index) => {
            expect(result.ok).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toMatch(/Run \d+/);
        });
    });
    it('should run containers sequentially without conflicts', async () => {
        for (let i = 0; i < 3; i++) {
            const result = await $.with({
                adapter: 'docker',
                adapterOptions: {
                    type: 'docker',
                    container: 'test-ephemeral-seq',
                    runMode: 'run',
                    image: testImage,
                    autoRemove: true
                }
            }) `echo "Sequential run ${i}"`;
            expect(result.ok).toBe(true);
            expect(result.stdout.trim()).toBe(`Sequential run ${i}`);
        }
    });
    it('should work with custom container names', async () => {
        const customName = `test-custom-${Date.now()}`;
        const result = await $.with({
            adapter: 'docker',
            adapterOptions: {
                type: 'docker',
                container: customName,
                runMode: 'run',
                image: testImage,
                autoRemove: true
            }
        }) `echo "Custom container works"`;
        expect(result.ok).toBe(true);
        expect(result.stdout.trim()).toBe('Custom container works');
    });
    it('should work with mkp224o container', async () => {
        const mkp224oImage = 'xec-test-mkp224o';
        const buildResult = await $.cd('./test/fixtures/docker/mkp224o') `docker build -t ${mkp224oImage} .`.quiet();
        if (!buildResult.ok) {
            throw new Error(`Failed to build mkp224o image: ${buildResult.stderr}`);
        }
        await withTempDir(async (tempDir) => {
            const result = await $.with({
                adapter: 'docker',
                adapterOptions: {
                    type: 'docker',
                    container: 'mkp224o-test',
                    runMode: 'run',
                    image: mkp224oImage,
                    volumes: [`${tempDir.path}:/work`],
                    autoRemove: true
                }
            }) `-n 1 -d /work -q placeholder`.nothrow();
            if (!result.ok) {
                console.log('mkp224o stderr:', result.stderr);
                console.log('mkp224o stdout:', result.stdout);
                console.log('mkp224o exit code:', result.exitCode);
            }
            expect(result.stderr).not.toContain('docker:');
            expect(result.stderr).not.toContain('Error');
        });
        await $ `docker rmi -f ${mkp224oImage}`.nothrow();
    });
});
//# sourceMappingURL=docker-mkp224o.test.js.map