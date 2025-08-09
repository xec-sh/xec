import { it, expect, describe } from '@jest/globals';
import { BaseAdapter } from '../../src/adapters/base-adapter.js';
class TestAdapter extends BaseAdapter {
    constructor() {
        super(...arguments);
        this.adapterName = 'test';
    }
    async isAvailable() {
        return true;
    }
    async execute(command) {
        return { stdout: '', stderr: '', exitCode: 0 };
    }
    async dispose() {
    }
    testShouldThrowOnNonZeroExit(command, exitCode) {
        return this.shouldThrowOnNonZeroExit(command, exitCode);
    }
    getTestConfig() {
        return this.config;
    }
}
describe('BaseAdapter throwOnNonZeroExit configuration', () => {
    it('should respect throwOnNonZeroExit: false in adapter config', () => {
        const adapter = new TestAdapter({ throwOnNonZeroExit: false });
        const command = { command: 'test', shell: true };
        expect(adapter.testShouldThrowOnNonZeroExit(command, 1)).toBe(false);
        expect(adapter.testShouldThrowOnNonZeroExit(command, 0)).toBe(false);
        expect(adapter.testShouldThrowOnNonZeroExit('test', 1)).toBe(false);
    });
    it('should respect throwOnNonZeroExit: true in adapter config', () => {
        const adapter = new TestAdapter({ throwOnNonZeroExit: true });
        const command = { command: 'test', shell: true };
        expect(adapter.testShouldThrowOnNonZeroExit(command, 1)).toBe(true);
        expect(adapter.testShouldThrowOnNonZeroExit(command, 0)).toBe(false);
        expect(adapter.testShouldThrowOnNonZeroExit('test', 1)).toBe(true);
    });
    it('should respect command.nothrow when set', () => {
        const adapter = new TestAdapter({ throwOnNonZeroExit: true });
        const nothrowCommand = { command: 'test', shell: true, nothrow: true };
        expect(adapter.testShouldThrowOnNonZeroExit(nothrowCommand, 1)).toBe(false);
        const throwCommand = { command: 'test', shell: true, nothrow: false };
        expect(adapter.testShouldThrowOnNonZeroExit(throwCommand, 1)).toBe(true);
    });
    it('should handle false value for throwOnNonZeroExit correctly', () => {
        const config = { throwOnNonZeroExit: false };
        const adapter = new TestAdapter(config);
        expect(adapter.getTestConfig().throwOnNonZeroExit).toBe(false);
        const command = { command: 'test', shell: true };
        expect(adapter.testShouldThrowOnNonZeroExit(command, 1)).toBe(false);
    });
});
//# sourceMappingURL=base-adapter-nothrow.test.js.map