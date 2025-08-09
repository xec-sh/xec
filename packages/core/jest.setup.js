import { jest } from '@jest/globals';
import { dockerManager } from '@xec-sh/test-utils';
import { configure } from './src/index.js';
jest.setTimeout(30000);
configure({
    adapters: {
        ssh: {},
        docker: {}
    }
});
const shouldManageContainersGlobally = () => {
    const testFiles = process.argv.filter(arg => arg.endsWith('.test.ts'));
    const isRunningOldSSHTests = testFiles.some(file => (file.includes('ssh') && file.includes('test.ts')) &&
        !file.includes('ssh-docker-integration.test.ts') &&
        !file.includes('package-managers.test.ts') &&
        !file.includes('ssh-authentication.test.ts') &&
        !file.includes('ssh-file-transfer.test.ts') &&
        !file.includes('ssh-performance.test.ts') &&
        !file.includes('ssh-complex-scenarios.test.ts') &&
        !file.includes('ssh-high-level.test.ts'));
    return isRunningOldSSHTests && !dockerManager.shouldSkipSSHTests();
};
if (shouldManageContainersGlobally()) {
    let containersStarted = false;
    beforeAll(async () => {
        console.log('Setting up Docker containers for legacy SSH tests...');
        containersStarted = await dockerManager.startRequiredContainers();
        if (!containersStarted) {
            console.warn('Failed to start some Docker containers, SSH tests may fail');
        }
    }, 120000);
    afterAll(async () => {
        if (containersStarted) {
            console.log('Cleaning up Docker containers...');
            await dockerManager.stopAllContainers();
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }, 60000);
}
//# sourceMappingURL=jest.setup.js.map