import { it, expect } from '@jest/globals';
import { describeSSH, getSSHConfig } from '@xec-sh/test-utils';
import { $ } from '../../src/index';
describeSSH('Automatic Container Management Test', () => {
    it('should automatically start and connect to ubuntu-apt container', async () => {
        const config = getSSHConfig('ubuntu-apt');
        const $ssh = $.ssh(config);
        const result = await $ssh `echo "Container is running!"`;
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('Container is running!');
    });
    it('should have SSH connection ready', async () => {
        const config = getSSHConfig('alpine-apk');
        const $ssh = $.ssh(config);
        const result = await $ssh `uname -s`;
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('Linux');
    });
}, {
    containers: ['ubuntu-apt', 'alpine-apk'],
    timeout: 60000
});
//# sourceMappingURL=auto-container.test.js.map