import { Command } from '../core/command.js';
import { ExecutionResult } from '../core/result.js';
import { BaseAdapter, BaseAdapterConfig } from './base-adapter.js';
import { AdapterError, CommandError, TimeoutError } from '../core/error.js';

export interface MockResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  signal?: string;
  delay?: number;
  error?: Error;
  // For lazy error creation
  errorType?: 'timeout' | 'command' | 'adapter';
  errorDelay?: number;
}

export interface MockAdapterConfig extends BaseAdapterConfig {
  recordCommands?: boolean;
  defaultDelay?: number;
}

export class MockAdapter extends BaseAdapter {
  protected readonly adapterName = 'mock';
  private responses: Map<string, MockResponse> = new Map();
  private regexResponses: Array<{ pattern: RegExp; response: MockResponse }> = [];
  private defaultResponse: MockResponse = { stdout: '', stderr: '', exitCode: 0 };
  private executedCommands: string[] = [];
  private mockConfig: MockAdapterConfig;

  constructor(config: MockAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.mockConfig = {
      recordCommands: config.recordCommands ?? true,
      defaultDelay: config.defaultDelay ?? 10,
      ...config
    };
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock adapter is always available
  }

  async execute(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);
    let commandString: string;
    
    // Handle shell option like other adapters
    if (mergedCommand.shell) {
      const shellCmd = typeof mergedCommand.shell === 'string' ? mergedCommand.shell : 'sh';
      commandString = `${shellCmd} -c "${this.buildCommandString(mergedCommand)}"`;
    } else {
      commandString = this.buildCommandString(mergedCommand);
    }
    
    const startTime = Date.now();

    // Record command if enabled
    if (this.mockConfig.recordCommands) {
      this.executedCommands.push(commandString);
    }

    try {
      // Find mock response
      const mockResponse = this.findMockResponse(commandString);
      
      // Simulate delay
      const delay = mockResponse.delay ?? this.mockConfig.defaultDelay ?? 10;
      if (delay > 0) {
        await this.delay(delay);
      }

      // Handle abort signal
      if (command.signal?.aborted) {
        throw new AdapterError(this.adapterName, 'execute', new Error('Operation aborted'));
      }

      // Throw error if configured
      if (mockResponse.error) {
        throw mockResponse.error;
      }
      
      // Handle lazy error creation for timeout
      if (mockResponse.errorType === 'timeout') {
        throw new TimeoutError(commandString, mockResponse.errorDelay || delay);
      }

      const endTime = Date.now();

      return this.createResult(
        mockResponse.stdout ?? '',
        mockResponse.stderr ?? '',
        mockResponse.exitCode ?? 0,
        mockResponse.signal,
        commandString,
        startTime,
        endTime,
        { originalCommand: mergedCommand }
      );
    } catch (error) {
      // Re-throw CommandError and TimeoutError as-is
      if (error instanceof CommandError || error instanceof TimeoutError || error instanceof AdapterError) {
        throw error;
      }
      
      throw new AdapterError(
        this.adapterName,
        'execute',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // Mock configuration methods
  mockCommand(command: string | RegExp, response: MockResponse): void {
    if (typeof command === 'string') {
      this.responses.set(command, response);
    } else {
      this.regexResponses.push({ pattern: command, response });
    }
  }

  mockDefault(response: MockResponse): void {
    this.defaultResponse = response;
  }

  clearMocks(): void {
    this.responses.clear();
    this.regexResponses = [];
    this.executedCommands = [];
    this.defaultResponse = { stdout: '', stderr: '', exitCode: 0 };
  }

  getExecutedCommands(): string[] {
    return [...this.executedCommands];
  }

  wasCommandExecuted(command: string | RegExp): boolean {
    if (typeof command === 'string') {
      return this.executedCommands.includes(command);
    } else {
      return this.executedCommands.some(cmd => command.test(cmd));
    }
  }

  getCommandExecutionCount(command: string | RegExp): number {
    if (typeof command === 'string') {
      return this.executedCommands.filter(cmd => cmd === command).length;
    } else {
      return this.executedCommands.filter(cmd => command.test(cmd)).length;
    }
  }

  // Helper methods
  private findMockResponse(command: string): MockResponse {
    // Check exact matches first
    const exactMatch = this.responses.get(command);
    if (exactMatch) {
      return exactMatch;
    }

    // Check regex patterns
    for (const { pattern, response } of this.regexResponses) {
      if (pattern.test(command)) {
        return response;
      }
    }

    // Return default response
    return this.defaultResponse;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Testing utilities
  mockSuccess(command: string | RegExp, stdout: string = ''): void {
    this.mockCommand(command, { stdout, stderr: '', exitCode: 0 });
  }

  mockFailure(command: string | RegExp, stderr: string = 'Command failed', exitCode: number = 1): void {
    this.mockCommand(command, { stdout: '', stderr, exitCode });
  }

  mockTimeout(command: string | RegExp, delay: number = 5000): void {
    this.mockCommand(command, { 
      delay,
      // Store error info instead of creating the error immediately
      errorType: 'timeout',
      errorDelay: delay
    });
  }

  // Assertion helpers for testing
  assertCommandExecuted(command: string | RegExp): void {
    if (!this.wasCommandExecuted(command)) {
      throw new Error(`Expected command "${command}" to be executed, but it was not`);
    }
  }

  assertCommandNotExecuted(command: string | RegExp): void {
    if (this.wasCommandExecuted(command)) {
      throw new Error(`Expected command "${command}" not to be executed, but it was`);
    }
  }

  assertCommandExecutedTimes(command: string | RegExp, times: number): void {
    const count = this.getCommandExecutionCount(command);
    if (count !== times) {
      throw new Error(`Expected command "${command}" to be executed ${times} times, but it was executed ${count} times`);
    }
  }

  assertCommandsExecutedInOrder(commands: (string | RegExp)[]): void {
    let lastIndex = -1;
    
    for (const command of commands) {
      const index = this.executedCommands.findIndex((cmd, i) => {
        if (i <= lastIndex) return false;
        return typeof command === 'string' ? cmd === command : command.test(cmd);
      });
      
      if (index === -1) {
        throw new Error(`Expected command "${command}" to be executed in order, but it was not found after index ${lastIndex}`);
      }
      
      lastIndex = index;
    }
  }

  /**
   * Dispose of resources. MockAdapter doesn't hold any persistent resources.
   */
  async dispose(): Promise<void> {
    // MockAdapter doesn't maintain any persistent connections or resources
    // This is a no-op implementation to satisfy the Disposable interface
    this.clearMocks();
  }
}