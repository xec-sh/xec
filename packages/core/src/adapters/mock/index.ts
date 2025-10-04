import { Command } from '../../types/command.js';
import { ExecutionResult } from '../../core/result.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { AdapterError, CommandError, TimeoutError } from '../../core/error.js';

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
  private isDefaultResponseCustomized = false;
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

    // Build command string without shell wrapping first
    const baseCommandString = this.buildCommandString(mergedCommand);

    // Handle shell option like other adapters
    if (mergedCommand.shell) {
      const shellCmd = typeof mergedCommand.shell === 'string' ? mergedCommand.shell : 'sh';
      // Don't escape quotes here - keep the original command string
      commandString = `${shellCmd} -c "${baseCommandString}"`;
    } else {
      commandString = baseCommandString;
    }

    const startTime = Date.now();

    // Record command if enabled
    if (this.mockConfig.recordCommands) {
      this.executedCommands.push(commandString);
    }

    try {
      // Find mock response - try both the full command and base command
      let mockResponse = this.findMockResponse(commandString);

      // If no specific mock found and we have a generic pattern, try the base command
      if (mockResponse === this.defaultResponse && commandString !== baseCommandString) {
        const baseResponse = this.findMockResponse(baseCommandString);
        if (baseResponse !== this.defaultResponse) {
          mockResponse = baseResponse;
        }
      }

      // Special handling for commands when using default response (and not customized)
      if (mockResponse === this.defaultResponse && !this.isDefaultResponseCustomized) {
        // Handle echo commands
        if (this.shouldHandleEcho(baseCommandString)) {
          const echoOutput = this.handleEchoCommand(baseCommandString, mergedCommand.env);
          if (echoOutput !== null) {
            mockResponse = { stdout: echoOutput + '\n', stderr: '', exitCode: 0 };
          }
        }
        // Handle failing-command pattern
        else if (baseCommandString.includes('failing') || baseCommandString === 'fail') {
          mockResponse = { stdout: '', stderr: 'Command failed', exitCode: 1 };
        }
        // Handle commands that should be "not found"
        else if (baseCommandString.includes('cargo') || baseCommandString.includes('rustc')) {
          mockResponse = { stdout: '', stderr: 'command not found', exitCode: 127 };
        }
      }

      // Special handling for exit commands (only if default response not customized)
      if (mockResponse === this.defaultResponse && !this.isDefaultResponseCustomized) {
        const exitMatch = baseCommandString.match(/(?:^|\s)exit\s+(\d+)(?:\s|$)/);
        if (exitMatch && exitMatch[1]) {
          const exitCode = parseInt(exitMatch[1], 10);
          if (!isNaN(exitCode)) {
            mockResponse = { stdout: '', stderr: '', exitCode };
          }
        }
      }

      // Special handling for sh -c "exit N" commands (only if default response not customized)
      if (mockResponse === this.defaultResponse && !this.isDefaultResponseCustomized) {
        const shExitMatch = baseCommandString.match(/sh\s+-c\s+["']exit\s+(\d+)["']/);
        if (shExitMatch && shExitMatch[1]) {
          const exitCode = parseInt(shExitMatch[1], 10);
          if (!isNaN(exitCode)) {
            mockResponse = { stdout: '', stderr: '', exitCode };
          }
        }
      }

      // Check if already aborted before starting
      if (command.signal?.aborted) {
        throw new AdapterError(this.adapterName, 'execute', new Error('Operation aborted'));
      }

      // Simulate delay with abort signal support
      const delay = mockResponse.delay ?? this.mockConfig.defaultDelay ?? 10;
      let wasAborted = false;
      if (delay > 0) {
        wasAborted = await this.delay(delay, command.signal);
      }

      // If aborted during delay, return result with signal
      if (wasAborted) {
        const endTime = Date.now();
        return this.createResult(
          mockResponse.stdout ?? '',
          mockResponse.stderr ?? '',
          mockResponse.exitCode ?? 0,
          mockResponse.signal || 'SIGTERM',
          commandString,
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
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
    this.isDefaultResponseCustomized = true;
  }

  clearMocks(): void {
    this.responses.clear();
    this.regexResponses = [];
    this.executedCommands = [];
    this.defaultResponse = { stdout: '', stderr: '', exitCode: 0 };
    this.isDefaultResponseCustomized = false;
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

    // If no match found, try normalizing shell-wrapped commands
    // Handle cases like: sh -c "'git --version'" -> sh -c "git --version"
    const normalizedCommand = this.normalizeShellCommand(command);
    if (normalizedCommand !== command) {
      // Try exact match with normalized
      const normalizedExact = this.responses.get(normalizedCommand);
      if (normalizedExact) {
        return normalizedExact;
      }

      // Try regex patterns with normalized
      for (const { pattern, response } of this.regexResponses) {
        if (pattern.test(normalizedCommand)) {
          return response;
        }
      }
    }

    // Return default response
    return this.defaultResponse;
  }

  private normalizeShellCommand(command: string): string {
    // Normalize shell commands that have extra quotes
    // sh -c "'command'" -> sh -c "command"
    // sh -c '"command"' -> sh -c "command"
    const shellMatch = command.match(/^(sh|bash|zsh|fish|cmd|powershell)\s+-c\s+["'](.*)["']$/);
    if (shellMatch && shellMatch[2]) {
      const innerCommand = shellMatch[2];
      // Remove extra quotes if present
      const cleanedInner = innerCommand.replace(/^['"]|['"]$/g, '');
      return `${shellMatch[1]} -c "${cleanedInner}"`;
    }
    return command;
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), ms);

      // If signal is provided and already aborted, resolve immediately with aborted=true
      if (signal?.aborted) {
        clearTimeout(timeout);
        resolve(true);
        return;
      }

      // Listen for abort event
      const abortHandler = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      signal?.addEventListener('abort', abortHandler, { once: true });

      // Clean up listener when timeout completes
      setTimeout(() => {
        signal?.removeEventListener('abort', abortHandler);
      }, ms);
    });
  }

  private shouldHandleEcho(command: string): boolean {
    return command.startsWith('echo ') || !!command.match(/^sh -c ['"]echo /);
  }

  private handleEchoCommand(command: string, env?: Record<string, string>): string | null {
    // Handle various echo patterns
    let echoContent: string | null = null;

    // Pattern 1: Direct echo command
    if (command.startsWith('echo ')) {
      echoContent = command.substring(5);
    }
    // Pattern 2: echo with quotes
    else if (command.match(/^echo ["']/)) {
      const match = command.match(/^echo ["'](.*)["']$/);
      if (match && match[1]) {
        echoContent = match[1];
      } else {
        // Fallback for unmatched quotes
        echoContent = command.substring(5).replace(/^["']|["']$/g, '');
      }
    }
    // Pattern 3: Complex shell commands with echo
    else if (command.includes('echo ')) {
      // Handle && chained commands
      if (command.includes('&&')) {
        const parts = command.split('&&').map(p => p.trim());
        const outputs = parts
          .filter(p => p.startsWith('echo '))
          .map(p => this.handleEchoCommand(p, env))
          .filter(p => p !== null);
        return outputs.join('\n');
      }
      // Extract echo part
      const echoMatch = command.match(/echo\s+(.+?)(?:;|$|&&|\|\|)/);
      if (echoMatch && echoMatch[1]) {
        echoContent = echoMatch[1];
      }
    }

    if (echoContent !== null) {
      // Remove surrounding quotes if present
      echoContent = echoContent.replace(/^["'](.*)["']$/, '$1');
      // Handle escaped quotes
      echoContent = echoContent.replace(/\\"/g, '"');

      // Expand environment variables if env is provided
      if (env) {
        echoContent = echoContent.replace(/\$(\w+)/g, (match, varName) => env[varName] !== undefined ? env[varName] : match);
      }

      return echoContent;
    }

    return null;
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