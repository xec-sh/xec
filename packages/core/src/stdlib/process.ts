import type { CallableExecutionEngine } from '@xec-js/ush';

import type { Logger } from '../utils/logger.js';
import type {
  Process,
  ExecResult,
  ExecOptions,
  ProcessInfo,
  SpawnOptions,
  ChildProcess,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createProcess(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<Process> {

  const proc: Process = {
    async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
      try {
        const result = await $`${command}`;
        const execResult = {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode || 0,
        };

        // Throw error if ignoreError is false (default) and exitCode is non-zero
        if (!options?.ignoreError && execResult.exitCode !== 0) {
          throw new Error(execResult.stderr || 'Command failed');
        }

        return execResult;
      } catch (error: any) {
        const result = {
          stdout: error.stdout || '',
          stderr: error.stderr || error.message,
          exitCode: error.exitCode || 1,
        };

        // Throw error if ignoreError is false (default) and exitCode is non-zero
        if (!options?.ignoreError && result.exitCode !== 0) {
          throw new Error(result.stderr || 'Command failed');
        }

        return result;
      }
    },

    spawn(command: string, argsOrOptions?: string[] | SpawnOptions, options?: SpawnOptions): ChildProcess | Promise<number> {
      // This is a simplified implementation
      // In real implementation, would use proper process spawning

      // Handle overloaded parameters - if second param is an object, it's options
      let args: string[] | undefined;
      let spawnOptions: SpawnOptions | undefined;

      if (Array.isArray(argsOrOptions)) {
        args = argsOrOptions;
        spawnOptions = options;
      } else {
        args = undefined;
        spawnOptions = argsOrOptions;
      }

      const fullCommand = args ? `${command} ${args.join(' ')}` : command;

      let processPromise: Promise<number>;
      let killed = false;

      const pid = Math.floor(Math.random() * 100000);

      const childProcess: ChildProcess = {
        pid,

        kill(signal?: string): void {
          killed = true;
          // In real implementation, would send signal to process
        },

        async wait(): Promise<number> {
          if (!processPromise) {
            processPromise = $`${fullCommand}`.then(() => 0).catch(() => 1);
          }
          return processPromise;
        },
      };

      // If called with just command and options (no args), return promise of PID for compatibility
      if (!Array.isArray(argsOrOptions) && argsOrOptions) {
        return Promise.resolve(pid);
      }

      return childProcess;
    },

    async list(name?: string): Promise<ProcessInfo[]> {
      try {
        const processes: ProcessInfo[] = [];

        if (env.platform.os === 'linux' || env.platform.os === 'darwin') {
          // Use ps command or grep for name
          let result;
          if (name) {
            result = await $`ps aux | grep ${name}`;
          } else {
            result = await $`ps aux`;
          }
          const lines = result.stdout.split('\n').slice(1); // Skip header

          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 11) {
              const pid = parseInt(parts[1] || '0');
              const cpu = parseFloat(parts[2] || '0');
              const memory = parseFloat(parts[3] || '0');
              const processName = parts.slice(10).join(' ');

              if (!isNaN(pid)) {
                processes.push({ pid, name: processName, cpu, memory });
              }
            }
          }
        }

        return processes;
      } catch (error) {
        log?.warn('Failed to list processes', error);
        return [];
      }
    },

    async kill(pidOrName: number | string, signal?: string): Promise<void> {
      const sig = signal || 'TERM';

      if (typeof pidOrName === 'number') {
        // Kill by PID
        await $`kill -${sig} ${pidOrName}`;
      } else {
        // Kill by process name
        await $`pkill -${sig} ${pidOrName}`;
      }
    },

    async exists(pid: number): Promise<boolean> {
      try {
        await $`kill -0 ${pid}`;
        return true;
      } catch {
        return false;
      }
    },

    cwd(): string {
      // This would need to be tracked by the shell
      return process.cwd();
    },

    exit(code?: number): never {
      process.exit(code || 0);
    },

    async wait(pid: number, options?: { timeout?: number; checkInterval?: number }): Promise<void> {
      const timeout = options?.timeout || 30000; // 30 seconds default
      const checkInterval = options?.checkInterval || 100; // 100ms default
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const exists = await this.exists(pid);
        if (!exists) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      throw new Error('Timeout waiting for process');
    },

    async signal(pid: number, signal: string): Promise<void> {
      await $`kill -${signal} ${pid}`;
    },

    async getPidByPort(port: number): Promise<number | null> {
      try {
        const result = await $`lsof -t -i:${port}`;
        const pid = parseInt(result.stdout.trim());
        return isNaN(pid) ? null : pid;
      } catch {
        return null;
      }
    },

    async tree(pid: number): Promise<number[]> {
      try {
        const result = await $`pgrep -P ${pid}`;
        const childPids = result.stdout.split('\n')
          .filter(line => line.trim())
          .map(line => parseInt(line.trim()))
          .filter(pid => !isNaN(pid));

        return [pid, ...childPids];
      } catch {
        return [pid];
      }
    },
  };

  return proc;
}