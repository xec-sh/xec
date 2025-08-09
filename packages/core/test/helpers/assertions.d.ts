/// <reference types="node" />
import { Command } from '../../src/core/command.js';
import { ExecutionResult } from '../../src/core/result.js';
export declare function expectSuccessResult(result: ExecutionResult, expectedStdout?: string | RegExp): void;
export declare function expectFailureResult(result: ExecutionResult, expectedExitCode?: number, expectedStderr?: string | RegExp): void;
export declare function expectCommandToMatch(command: Command, expected: Partial<Command>): void;
export declare function expectTimeoutError(error: any, commandName?: string, timeout?: number): void;
export declare function expectConnectionError(error: any, host?: string): void;
export declare function expectCommandError(error: any, exitCode?: number): void;
export declare function expectStreamContent(stream: NodeJS.ReadableStream, expected: string | RegExp): Promise<void>;
export declare function expectAsyncError<T>(promise: Promise<T>, errorType: new (...args: any[]) => Error, message?: string | RegExp): Promise<void>;
export declare function expectEnvVariables(env: Record<string, string>, expected: Record<string, string>): void;
export declare function expectDuration(result: ExecutionResult, minMs: number, maxMs: number): void;
