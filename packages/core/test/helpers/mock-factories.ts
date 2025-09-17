import { BaseAdapter } from '../../src/adapters/base-adapter.js';
import { ExecutionResult, ExecutionResultImpl } from '../../src/core/result.js';
import { Command , SSHAdapterOptions, DockerAdapterOptions } from '../../src/types/command.js';

export function createMockCommand(overrides: Partial<Command> = {}): Command {
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

export function createMockExecutionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
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
  
  return new ExecutionResultImpl(
    overrides.stdout ?? defaults.stdout,
    overrides.stderr ?? defaults.stderr,
    overrides.exitCode ?? defaults.exitCode,
    overrides.signal ?? defaults.signal,
    overrides.command ?? defaults.command,
    overrides.duration ?? defaults.duration,
    overrides.startedAt ?? defaults.startedAt,
    overrides.finishedAt ?? defaults.finishedAt,
    overrides.adapter ?? defaults.adapter,
    overrides.host ?? defaults.host,
    overrides.container ?? defaults.container
  );
}

export function createMockSSHOptions(overrides: Partial<SSHAdapterOptions> = {}): SSHAdapterOptions {
  return {
    type: 'ssh',
    host: 'test.example.com',
    username: 'testuser',
    port: 22,
    ...overrides
  };
}

export function createMockDockerOptions(overrides: Partial<DockerAdapterOptions> = {}): DockerAdapterOptions {
  return {
    type: 'docker',
    container: 'test-container',
    workdir: '/app',
    ...overrides
  };
}

export class MockAdapter extends BaseAdapter {
  protected readonly adapterName = 'mock-test';
  public executeCalls: Command[] = [];
  public executeResults: ExecutionResult[] = [];
  private nextResult: ExecutionResult | Error | null = null;
  
  async isAvailable(): Promise<boolean> {
    return true;
  }
  
  async execute(command: Command): Promise<ExecutionResult> {
    this.executeCalls.push(command);
    
    if (this.nextResult instanceof Error) {
      throw this.nextResult;
    }
    
    const result = this.nextResult || createMockExecutionResult({ command: this.buildCommandString(command) });
    this.executeResults.push(result);
    
    return result;
  }
  
  mockNextResult(result: ExecutionResult | Error): void {
    this.nextResult = result;
  }
  
  reset(): void {
    this.executeCalls = [];
    this.executeResults = [];
    this.nextResult = null;
  }
  
  async dispose(): Promise<void> {
    this.reset();
  }
}

export function createErrorResult(message: string, code: number = 1): ExecutionResult {
  return createMockExecutionResult({
    stdout: '',
    stderr: message,
    exitCode: code
  });
}

export function createTimeoutResult(command: string, timeout: number): ExecutionResult {
  return createMockExecutionResult({
    command,
    stdout: '',
    stderr: `Command timed out after ${timeout}ms`,
    exitCode: 124, // Common timeout exit code
    signal: 'SIGTERM'
  });
}