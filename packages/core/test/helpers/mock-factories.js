import { BaseAdapter } from '../../src/adapters/base-adapter.js';
import { ExecutionResultImpl } from '../../src/core/result.js';
export function createMockCommand(overrides = {}) {
    return {
        command: 'echo',
        args: ['test'],
        cwd: '/tmp',
        env: { TEST: 'true' },
        timeout: 5000,
        shell: true,
        ...overrides
    };
}
export function createMockExecutionResult(overrides = {}) {
    const defaults = {
        stdout: 'mock output',
        stderr: '',
        exitCode: 0,
        signal: undefined,
        command: 'echo test',
        duration: 100,
        startedAt: new Date(),
        finishedAt: new Date(Date.now() + 100),
        adapter: 'mock',
        host: undefined,
        container: undefined
    };
    return new ExecutionResultImpl(overrides.stdout ?? defaults.stdout, overrides.stderr ?? defaults.stderr, overrides.exitCode ?? defaults.exitCode, overrides.signal ?? defaults.signal, overrides.command ?? defaults.command, overrides.duration ?? defaults.duration, overrides.startedAt ?? defaults.startedAt, overrides.finishedAt ?? defaults.finishedAt, overrides.adapter ?? defaults.adapter, overrides.host ?? defaults.host, overrides.container ?? defaults.container);
}
export function createMockSSHOptions(overrides = {}) {
    return {
        type: 'ssh',
        host: 'test.example.com',
        username: 'testuser',
        port: 22,
        ...overrides
    };
}
export function createMockDockerOptions(overrides = {}) {
    return {
        type: 'docker',
        container: 'test-container',
        workdir: '/app',
        ...overrides
    };
}
export class MockAdapter extends BaseAdapter {
    constructor() {
        super(...arguments);
        this.adapterName = 'mock-test';
        this.executeCalls = [];
        this.executeResults = [];
        this.nextResult = null;
    }
    async isAvailable() {
        return true;
    }
    async execute(command) {
        this.executeCalls.push(command);
        if (this.nextResult instanceof Error) {
            throw this.nextResult;
        }
        const result = this.nextResult || createMockExecutionResult({ command: this.buildCommandString(command) });
        this.executeResults.push(result);
        return result;
    }
    mockNextResult(result) {
        this.nextResult = result;
    }
    reset() {
        this.executeCalls = [];
        this.executeResults = [];
        this.nextResult = null;
    }
    async dispose() {
        this.reset();
    }
}
export function createErrorResult(message, code = 1) {
    return createMockExecutionResult({
        stdout: '',
        stderr: message,
        exitCode: code
    });
}
export function createTimeoutResult(command, timeout) {
    return createMockExecutionResult({
        command,
        stdout: '',
        stderr: `Command timed out after ${timeout}ms`,
        exitCode: 124,
        signal: 'SIGTERM'
    });
}
//# sourceMappingURL=mock-factories.js.map