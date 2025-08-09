import { BaseAdapter } from '../../src/adapters/base-adapter.js';
import { ExecutionResult } from '../../src/core/result.js';
import { Command, SSHAdapterOptions, DockerAdapterOptions } from '../../src/core/command.js';
export declare function createMockCommand(overrides?: Partial<Command>): Command;
export declare function createMockExecutionResult(overrides?: Partial<ExecutionResult>): ExecutionResult;
export declare function createMockSSHOptions(overrides?: Partial<SSHAdapterOptions>): SSHAdapterOptions;
export declare function createMockDockerOptions(overrides?: Partial<DockerAdapterOptions>): DockerAdapterOptions;
export declare class MockAdapter extends BaseAdapter {
    protected readonly adapterName = "mock-test";
    executeCalls: Command[];
    executeResults: ExecutionResult[];
    private nextResult;
    isAvailable(): Promise<boolean>;
    execute(command: Command): Promise<ExecutionResult>;
    mockNextResult(result: ExecutionResult | Error): void;
    reset(): void;
    dispose(): Promise<void>;
}
export declare function createErrorResult(message: string, code?: number): ExecutionResult;
export declare function createTimeoutResult(command: string, timeout: number): ExecutionResult;
