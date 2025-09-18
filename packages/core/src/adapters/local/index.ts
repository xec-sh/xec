/// <reference path="../../types/globals.d.ts" />

import { platform } from 'node:os';
import { Readable } from 'node:stream';
import { constants, accessSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

import { Command } from '../../types/command.js';
import { StreamHandler } from '../../utils/stream.js';
import { RuntimeDetector } from './runtime-detect.js';
import { ExecutionResult } from '../../core/result.js';
import { CommandError, AdapterError } from '../../core/error.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';

export interface LocalAdapterConfig extends BaseAdapterConfig {
  preferBun?: boolean;
  forceImplementation?: 'node' | 'bun';
  uid?: number;
  gid?: number;
  killSignal?: string;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
}

export class LocalAdapter extends BaseAdapter {
  protected readonly adapterName = 'local';
  private localConfig: LocalAdapterConfig;

  constructor(config: LocalAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.localConfig = config;
  }

  async isAvailable(): Promise<boolean> {
    return true; // Local execution is always available
  }

  async execute(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);
    const startTime = Date.now();

    try {
      const implementation = this.getImplementation();

      let result: ProcessResult;
      if (implementation === 'bun' && RuntimeDetector.isBun()) {
        result = await this.executeBun(mergedCommand);
      } else {
        result = await this.executeNode(mergedCommand);
      }

      const endTime = Date.now();

      // Use createResultNoThrow if nothrow is set, otherwise use createResult which respects throwOnNonZeroExit
      if (mergedCommand.nothrow) {
        return await this.createResultNoThrow(
          result.stdout,
          result.stderr,
          result.exitCode ?? 0,
          result.signal ?? undefined,
          this.buildCommandString(mergedCommand),
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
      } else {
        return await this.createResult(
          result.stdout,
          result.stderr,
          result.exitCode ?? 0,
          result.signal ?? undefined,
          this.buildCommandString(mergedCommand),
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
      }
    } catch (error) {
      const endTime = Date.now();

      // If nothrow is set, return error as result instead of throwing
      if (mergedCommand.nothrow) {
        return await this.createResultNoThrow(
          '',
          error instanceof Error ? error.message : String(error),
          1,
          undefined,
          this.buildCommandString(mergedCommand),
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
      }

      if (error instanceof CommandError || error instanceof AdapterError) {
        throw error;
      }

      throw new AdapterError(
        this.adapterName,
        'execute',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  override executeSync(command: Command): ExecutionResult {
    const mergedCommand = this.mergeCommand(command);
    const startTime = Date.now();

    try {
      const implementation = this.getImplementation();

      let result: ProcessResult;
      if (implementation === 'bun' && RuntimeDetector.isBun()) {
        result = this.executeBunSync(mergedCommand);
      } else {
        result = this.executeNodeSync(mergedCommand);
      }

      const endTime = Date.now();

      // Use createResultNoThrowSync if nothrow is set
      if (mergedCommand.nothrow) {
        return this.createResultNoThrowSync(
          result.stdout,
          result.stderr,
          result.exitCode ?? 0,
          result.signal ?? undefined,
          this.buildCommandString(mergedCommand),
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
      } else {
        return this.createResultSync(
          result.stdout,
          result.stderr,
          result.exitCode ?? 0,
          result.signal ?? undefined,
          this.buildCommandString(mergedCommand),
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
      }
    } catch (error) {
      const endTime = Date.now();

      // If nothrow is set, return error as result instead of throwing
      if (mergedCommand.nothrow) {
        return this.createResultNoThrowSync(
          '',
          error instanceof Error ? error.message : String(error),
          1,
          undefined,
          this.buildCommandString(mergedCommand),
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
      }

      if (error instanceof CommandError || error instanceof AdapterError) {
        throw error;
      }

      throw new AdapterError(
        this.adapterName,
        'executeSync',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  private getImplementation(): 'node' | 'bun' {
    if (this.localConfig.forceImplementation) {
      return this.localConfig.forceImplementation;
    }

    if (this.localConfig.preferBun && RuntimeDetector.isBun()) {
      return 'bun';
    }

    return 'node';
  }

  private async executeNode(command: Command): Promise<ProcessResult> {
    if (!('stdout' in command) || command.stdout == null) command.stdout = 'pipe';
    if (!('stderr' in command) || command.stderr == null) command.stderr = 'pipe';

    // Create progress reporter if enabled
    const progressReporter = this.createProgressReporter(command);

    const stdoutHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer,
      onData: progressReporter ? (data) => progressReporter.reportOutput(data) : undefined
    });

    const stderrHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    const spawnOptions = this.buildNodeSpawnOptions(command);

    // Start progress reporting if enabled
    if (progressReporter) {
      progressReporter.start(`Executing: ${this.buildCommandString(command)}`);
    }

    // Handle shell execution properly
    let child;
    if (command.shell === true) {
      // When shell is enabled, combine command and args into a single string
      const shellCommand = this.buildCommandString(command);
      child = spawn(shellCommand, [], { ...spawnOptions, shell: true });
    } else if (typeof command.shell === 'string') {
      // When using a custom shell path, invoke it with -c flag
      const shellCommand = this.buildCommandString(command);
      child = spawn(command.shell, ['-c', shellCommand], { ...spawnOptions, shell: false });
    } else {
      // Direct execution without shell
      child = spawn(command.command, command.args || [], spawnOptions);
    }

    // Handle stdin
    if (command.stdin) {
      if (typeof command.stdin === 'string' || Buffer.isBuffer(command.stdin)) {
        child.stdin?.write(command.stdin);
        child.stdin?.end();
      } else if (command.stdin instanceof Readable) {
        command.stdin.pipe(child.stdin!);
      }
    }

    // Handle abort signal
    if (command.signal) {
      const cleanup = () => child.kill(this.localConfig.killSignal as any);
      await this.handleAbortSignal(command.signal, cleanup);
    }

    // Collect output and keep references to transforms for cleanup
    let stdoutTransform: any = null;
    let stderrTransform: any = null;

    // Handle stdout
    if (child.stdout) {
      if (command.stdout === 'pipe') {
        stdoutTransform = stdoutHandler.createTransform();
        child.stdout.pipe(stdoutTransform);
      } else if (command.stdout && typeof command.stdout === 'object' && typeof command.stdout.write === 'function') {
        // Custom writable stream
        child.stdout.pipe(command.stdout);
      }
    }

    // Handle stderr
    if (child.stderr) {
      if (command.stderr === 'pipe') {
        stderrTransform = stderrHandler.createTransform();
        child.stderr.pipe(stderrTransform);
      } else if (command.stderr && typeof command.stderr === 'object' && typeof command.stderr.write === 'function') {
        // Custom writable stream
        child.stderr.pipe(command.stderr);
      }
    }

    // Wait for process completion
    const processPromise = new Promise<ProcessResult>((resolve, reject) => {
      let processExited = false;
      let stdoutClosed = false;
      let stderrClosed = false;
      let exitCode: number | null = null;
      let exitSignal: string | null = null;

      const tryResolve = () => {
        // Only resolve when the process has exited and all streams are closed
        if (processExited && stdoutClosed && stderrClosed) {
          // Report completion to progress reporter
          if (progressReporter) {
            if (exitCode === 0) {
              progressReporter.complete('Command completed successfully');
            } else {
              progressReporter.error(new Error(`Command failed with exit code ${exitCode}`));
            }
          }

          resolve({
            stdout: stdoutHandler.getContent(),
            stderr: stderrHandler.getContent(),
            exitCode,
            signal: exitSignal
          });
        }
      };

      child.on('error', (err: any) => {
        // Enhance error message for common cases
        if (err.code === 'ENOENT') {
          if (err.syscall === 'spawn /bin/sh' || err.syscall === 'spawn') {
            // Check if it's likely a cwd issue
            if (command.cwd) {
              err.message = `spawn ${err.path || '/bin/sh'} ENOENT: No such file or directory (cwd: ${command.cwd})`;
            } else {
              err.message = `spawn ${err.path || '/bin/sh'} ENOENT: No such file or directory`;
            }
          }
        }

        // Cleanup transform streams on error
        if (stdoutTransform) {
          stdoutTransform.destroy();
        }
        if (stderrTransform) {
          stderrTransform.destroy();
        }

        // Report error to progress reporter
        if (progressReporter) {
          progressReporter.error(err);
        }

        reject(err);
      });

      // Handle stdout close
      if (child.stdout) {
        child.stdout.on('close', () => {
          stdoutClosed = true;
          tryResolve();
        });
      } else {
        stdoutClosed = true;
      }

      // Handle stderr close
      if (child.stderr) {
        child.stderr.on('close', () => {
          stderrClosed = true;
          tryResolve();
        });
      } else {
        stderrClosed = true;
      }

      child.on('exit', (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        processExited = true;

        // Cleanup transform streams
        if (stdoutTransform) {
          stdoutTransform.end();
        }
        if (stderrTransform) {
          stderrTransform.end();
        }

        tryResolve();
      });
    });

    // Handle timeout
    const timeout = command.timeout ?? this.config.defaultTimeout;
    const result = await this.handleTimeout(
      processPromise,
      timeout,
      this.buildCommandString(command),
      () => child.kill(this.localConfig.killSignal as any)
    );

    return result;
  }

  private async executeBun(command: Command): Promise<ProcessResult> {
    const Bun = globalThis.Bun;
    if (!Bun || !Bun.spawn) {
      throw new AdapterError(this.adapterName, 'execute', new Error('Bun.spawn is not available'));
    }

    // Create progress reporter if enabled
    const progressReporter = this.createProgressReporter(command);

    const stdoutHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer,
      onData: progressReporter ? (data) => progressReporter.reportOutput(data) : undefined
    });

    const stderrHandler = new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer
    });

    // Start progress reporting if enabled
    if (progressReporter) {
      progressReporter.start(`Executing: ${this.buildCommandString(command)}`);
    }

    const proc = Bun.spawn({
      cmd: [command.command, ...(command.args || [])],
      cwd: command.cwd,
      env: this.createCombinedEnv(this.config.defaultEnv, command.env),
      stdin: this.mapBunStdin(command.stdin),
      stdout: command.stdout === 'pipe' ? 'pipe' : command.stdout,
      stderr: command.stderr === 'pipe' ? 'pipe' : command.stderr
    });

    // Handle stdin for string/buffer
    if (command.stdin && (typeof command.stdin === 'string' || Buffer.isBuffer(command.stdin))) {
      const writer = proc.stdin.getWriter();
      await writer.write(typeof command.stdin === 'string' ? new TextEncoder().encode(command.stdin) : command.stdin);
      await writer.close();
    }

    // Collect output
    const stdoutPromise = command.stdout === 'pipe' && proc.stdout
      ? this.streamBunReadable(proc.stdout, stdoutHandler)
      : Promise.resolve();

    const stderrPromise = command.stderr === 'pipe' && proc.stderr
      ? this.streamBunReadable(proc.stderr, stderrHandler)
      : Promise.resolve();

    // Wait for process completion
    const exitPromise = proc.exited;

    // Handle timeout
    const timeout = command.timeout ?? this.config.defaultTimeout;
    const exitCode = await this.handleTimeout(
      exitPromise,
      timeout,
      this.buildCommandString(command),
      () => proc.kill()
    );

    await Promise.all([stdoutPromise, stderrPromise]);

    // Report completion to progress reporter
    if (progressReporter) {
      if (exitCode === 0) {
        progressReporter.complete('Command completed successfully');
      } else {
        progressReporter.error(new Error(`Command failed with exit code ${exitCode}`));
      }
    }

    return {
      stdout: stdoutHandler.getContent(),
      stderr: stderrHandler.getContent(),
      exitCode,
      signal: null
    };
  }

  private buildNodeSpawnOptions(command: Command): any {
    const options: any = {
      cwd: command.cwd,
      env: this.createCombinedEnv(this.config.defaultEnv, command.env),
      detached: command.detached,
      windowsHide: true
    };

    // Check if cwd exists if provided
    if (command.cwd) {
      try {
        accessSync(command.cwd, constants.F_OK);
      } catch (err) {
        // This will be caught by spawn and result in an ENOENT error
        // Keep cwd as is - spawn will handle the error appropriately
      }
    }

    if (this.localConfig.uid !== undefined) {
      options.uid = this.localConfig.uid;
    }

    if (this.localConfig.gid !== undefined) {
      options.gid = this.localConfig.gid;
    }

    // Handle shell option properly
    if (command.shell === true) {
      if (platform() === 'win32') {
        options.shell = 'cmd.exe';
      } else {
        // For Unix systems, try to find available shell
        const availableShells = ['/bin/bash', '/bin/sh', '/usr/bin/bash', '/usr/bin/sh'];
        let shellFound = false;

        for (const shell of availableShells) {
          try {
            accessSync(shell, constants.F_OK);
            options.shell = shell;
            shellFound = true;
            break;
          } catch {
            // Shell not found, try next
          }
        }

        if (!shellFound) {
          // Fallback to just true and let Node.js decide
          options.shell = true;
        }
      }
    } else if (typeof command.shell === 'string') {
      options.shell = command.shell;
    } else {
      options.shell = command.shell;
    }

    // Handle stdio - convert Stream objects to 'pipe' for spawn
    const isStream = (value: any) => value && typeof value === 'object' && typeof value.write === 'function';

    options.stdio = [
      command.stdin ? 'pipe' : 'ignore',
      (typeof command.stdout === 'string' ? command.stdout : 'pipe') || 'pipe',
      (typeof command.stderr === 'string' ? command.stderr : 'pipe') || 'pipe'
    ];

    return options;
  }

  private mapBunStdin(stdin: Command['stdin']): any {
    if (!stdin) return 'ignore';
    if (stdin instanceof Readable) return stdin;
    if (typeof stdin === 'string' || Buffer.isBuffer(stdin)) return 'pipe';
    return 'ignore';
  }

  private async streamBunReadable(readable: any, handler: StreamHandler): Promise<void> {
    const reader = readable.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = Buffer.from(value);
        const transform = handler.createTransform();

        await new Promise<void>((resolve, reject) => {
          transform.on('error', reject);
          transform.on('finish', resolve);
          transform.write(chunk);
          transform.end();
        });
      }
    } finally {
      reader.releaseLock();
    }
  }

  private executeNodeSync(command: Command): ProcessResult {
    if (!('stdout' in command) || command.stdout == null) command.stdout = 'pipe';
    if (!('stderr' in command) || command.stderr == null) command.stderr = 'pipe';
    const spawnOptions = this.buildNodeSpawnOptions(command);

    // Add encoding for sync execution
    spawnOptions.encoding = this.config.encoding;

    // Handle shell execution properly
    let result;
    if (command.shell === true) {
      // When shell is enabled, combine command and args into a single string
      const shellCommand = this.buildCommandString(command);
      result = spawnSync(shellCommand, [], { ...spawnOptions, shell: true });
    } else if (typeof command.shell === 'string') {
      // When using a custom shell path, invoke it with -c flag
      const shellCommand = this.buildCommandString(command);
      result = spawnSync(command.shell, ['-c', shellCommand], { ...spawnOptions, shell: false });
    } else {
      // Direct execution without shell
      result = spawnSync(command.command, command.args || [], spawnOptions);
    }

    return {
      stdout: result.stdout?.toString() || '',
      stderr: result.stderr?.toString() || '',
      exitCode: result.status,
      signal: result.signal
    };
  }

  private executeBunSync(command: Command): ProcessResult {
    const proc = globalThis.Bun!.spawnSync({
      cmd: [command.command, ...(command.args || [])],
      cwd: command.cwd,
      env: this.createCombinedEnv(this.config.defaultEnv, command.env),
      stdin: command.stdin && (typeof command.stdin === 'string' || Buffer.isBuffer(command.stdin))
        ? command.stdin
        : undefined,
      stdout: command.stdout === 'pipe' ? 'pipe' : command.stdout,
      stderr: command.stderr === 'pipe' ? 'pipe' : command.stderr
    });

    return {
      stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
      stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
      exitCode: proc.exitCode,
      signal: null
    };
  }

  /**
   * Dispose of resources. LocalAdapter doesn't hold any persistent resources.
   */
  async dispose(): Promise<void> {
    // LocalAdapter doesn't maintain any persistent connections or resources
    // This is a no-op implementation to satisfy the Disposable interface
  }
}