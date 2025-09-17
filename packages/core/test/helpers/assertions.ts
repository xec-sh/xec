import { expect } from '@jest/globals';

import { Command } from '../../src/types/command.js';
import { ExecutionResult } from '../../src/core/result.js';

export function expectSuccessResult(result: ExecutionResult, expectedStdout?: string | RegExp) {
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  
  if (expectedStdout instanceof RegExp) {
    expect(result.stdout).toMatch(expectedStdout);
  } else if (expectedStdout !== undefined) {
    expect(result.stdout).toBe(expectedStdout);
  }
}

export function expectFailureResult(result: ExecutionResult, expectedExitCode: number = 1, expectedStderr?: string | RegExp) {
  expect(result.exitCode).toBe(expectedExitCode);
  
  if (expectedStderr instanceof RegExp) {
    expect(result.stderr).toMatch(expectedStderr);
  } else if (expectedStderr !== undefined) {
    expect(result.stderr).toBe(expectedStderr);
  }
}

export function expectCommandToMatch(command: Command, expected: Partial<Command>) {
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined) {
      expect(command[key as keyof Command]).toEqual(value);
    }
  }
}

export function expectTimeoutError(error: any, commandName?: string, timeout?: number) {
  expect(error.name).toBe('TimeoutError');
  expect(error.code).toBe('TIMEOUT');
  
  if (commandName) {
    expect(error.command).toBe(commandName);
  }
  
  if (timeout) {
    expect(error.timeout).toBe(timeout);
  }
}

export function expectConnectionError(error: any, host?: string) {
  expect(error.name).toBe('ConnectionError');
  expect(error.code).toBe('CONNECTION_FAILED');
  
  if (host) {
    expect(error.host).toBe(host);
  }
}

export function expectCommandError(error: any, exitCode?: number) {
  expect(error.name).toBe('CommandError');
  expect(error.code).toBe('COMMAND_FAILED');
  
  if (exitCode !== undefined) {
    expect(error.exitCode).toBe(exitCode);
  }
}

export function expectStreamContent(stream: NodeJS.ReadableStream, expected: string | RegExp): Promise<void> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => {
      const content = Buffer.concat(chunks).toString();
      
      if (expected instanceof RegExp) {
        expect(content).toMatch(expected);
      } else {
        expect(content).toBe(expected);
      }
      
      resolve();
    });
    stream.on('error', reject);
  });
}

export async function expectAsyncError<T>(promise: Promise<T>, errorType: new (...args: any[]) => Error, message?: string | RegExp) {
  await expect(promise).rejects.toThrow(errorType);
  
  if (message) {
    try {
      await promise;
    } catch (error: any) {
      if (message instanceof RegExp) {
        expect(error.message).toMatch(message);
      } else {
        expect(error.message).toBe(message);
      }
    }
  }
}

export function expectEnvVariables(env: Record<string, string>, expected: Record<string, string>) {
  for (const [key, value] of Object.entries(expected)) {
    expect(env[key]).toBe(value);
  }
}

export function expectDuration(result: ExecutionResult, minMs: number, maxMs: number) {
  expect(result.duration).toBeGreaterThanOrEqual(minMs);
  expect(result.duration).toBeLessThanOrEqual(maxMs);
}