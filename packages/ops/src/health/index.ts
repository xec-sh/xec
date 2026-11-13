/**
 * Health check framework — verify service availability, HTTP endpoints,
 * TCP ports, command execution, and custom checks.
 *
 * @example
 * ```typescript
 * import { HealthChecker } from '@xec-sh/ops/health';
 *
 * const checker = HealthChecker.create()
 *   .http('https://api.example.com/health', { status: 200, timeout: 5000 })
 *   .tcp('db.example.com', 5432, { timeout: 3000 })
 *   .command('docker ps', { contains: 'my-service' })
 *   .custom('cache', async () => {
 *     const resp = await fetch('http://localhost:6379/ping');
 *     return resp.ok;
 *   });
 *
 * const report = await checker.run();
 * console.log(report.healthy); // true/false
 * console.log(report.checks);  // detailed per-check results
 * ```
 *
 * @module @xec-sh/ops/health
 */

import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { type Command, getExecutionSignal } from '@xec-sh/core';

import { runOperation, type OperationOptions } from '../utils/operation-scope.js';

export interface CheckResult {
  name: string;
  healthy: boolean;
  duration: number;
  message?: string;
  error?: string;
}

export interface HealthReport {
  healthy: boolean;
  timestamp: number;
  duration: number;
  checks: CheckResult[];
  summary: { total: number; healthy: number; unhealthy: number };
}

interface CheckDefinition {
  name: string;
  run: (signal?: AbortSignal) => Promise<CheckResult>;
}

export interface HttpCheckOptions {
  status?: number;
  timeout?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  contains?: string;
}

export interface TcpCheckOptions {
  timeout?: number;
}

export interface CommandCheckOptions extends OperationOptions {
  contains?: string;
  exitCode?: number;
  timeout?: number;
}

/**
 * Composable health check runner.
 */
export class HealthChecker {
  private checks: CheckDefinition[] = [];

  private constructor() {}

  static create(): HealthChecker {
    return new HealthChecker();
  }

  /** Check an HTTP endpoint */
  http(url: string, opts: HttpCheckOptions = {}): this {
    const name = `http:${new URL(url).hostname}${new URL(url).pathname}`;
    this.checks.push({
      name,
      run: async (signal) => {
        const start = Date.now();
        try {
          const deadline = AbortSignal.timeout(opts.timeout ?? 10_000);
          const resp = await fetch(url, {
            method: opts.method ?? 'GET',
            headers: opts.headers,
            body: opts.body,
            signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
          });
          const duration = Date.now() - start;

          const expectedStatus = opts.status ?? 200;
          if (resp.status !== expectedStatus) {
            await resp.body?.cancel();
            return { name, healthy: false, duration, error: `Status ${resp.status} (expected ${expectedStatus})` };
          }

          if (opts.contains) {
            const body = await resp.text();
            if (!body.includes(opts.contains)) {
              return { name, healthy: false, duration, error: 'Response does not contain the expected text' };
            }
          }

          if (!opts.contains) await resp.body?.cancel();
          return { name, healthy: true, duration: Date.now() - start, message: `${resp.status} OK` };
        } catch (err) {
          return { name, healthy: false, duration: Date.now() - start, error: String(err) };
        }
      },
    });
    return this;
  }

  /** Check a TCP port */
  tcp(host: string, port: number, opts: TcpCheckOptions = {}): this {
    const name = `tcp:${host}:${port}`;
    this.checks.push({
      name,
      run: (signal) => new Promise<CheckResult>((resolve) => {
        const start = Date.now();
        const socket = connect({ host, port });
        let result: CheckResult | undefined;
        const finish = (healthy: boolean, error?: string) => {
          result ??= { name, healthy, duration: Date.now() - start, ...(error ? { error } : { message: `Port ${port} open` }) };
          socket.destroy();
        };
        const abort = () => finish(false, String(signal?.reason ?? 'Health check aborted'));
        const timer = setTimeout(() => finish(false, `Timeout after ${opts.timeout ?? 5000}ms`), opts.timeout ?? 5000);
        socket.once('connect', () => finish(true));
        socket.once('error', error => finish(false, error.message));
        socket.once('close', () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          resolve(result ?? { name, healthy: false, duration: Date.now() - start, error: 'Socket closed before connection' });
        });
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      }),
    });
    return this;
  }

  /** Check trusted shell source or a literal Command argument vector. */
  command(cmd: string | Command, opts: CommandCheckOptions = {}): this {
    const name = `cmd:${(typeof cmd === 'string' ? cmd : cmd.command).split(' ')[0]}`;
    this.checks.push({ name, run: async (signal) => {
      const start = Date.now();
      try {
        const inherited = getExecutionSignal(opts.signal);
        return await runOperation({ ...opts, timeout: opts.timeout ?? 10_000,
          signal: signal && inherited ? AbortSignal.any([signal, inherited]) : signal ?? inherited }, async ({ exec }) => {
          const command = typeof cmd === 'string' ? { command: cmd, shell: true } : cmd;
          const result = await exec({ ...command, throwOnNonZeroExit: false, nothrow: undefined });
          const duration = Date.now() - start;
          const expected = opts.exitCode ?? 0;
          if (result.exitCode !== expected || result.signal) {
            return { name, healthy: false, duration, error: `Exit code ${result.exitCode} (expected ${expected})${result.signal ? `, signal ${result.signal}` : ''}` };
          }
          if (opts.contains !== undefined && !result.buffer().toString('utf8').includes(opts.contains)) {
            return { name, healthy: false, duration, error: 'Output does not contain the expected text' };
          }
          return { name, healthy: true, duration, message: `Exit code ${expected} (expected)` };
        }, { exactOutput: true });
      } catch (error) { return { name, healthy: false, duration: Date.now() - start, error: String(error) }; }
    } });
    return this;
  }

  /** Custom check function */
  custom(name: string, fn: (signal?: AbortSignal) => Promise<boolean | string>): this {
    this.checks.push({
      name: `custom:${name}`,
      run: async (signal) => {
        const start = Date.now();
        try {
          const result = await fn(signal);
          const duration = Date.now() - start;
          if (typeof result === 'string') {
            return { name: `custom:${name}`, healthy: true, duration, message: result };
          }
          return { name: `custom:${name}`, healthy: result, duration };
        } catch (err) {
          return { name: `custom:${name}`, healthy: false, duration: Date.now() - start, error: String(err) };
        }
      },
    });
    return this;
  }

  /** Run all checks (parallel by default) */
  async run(opts?: { sequential?: boolean; signal?: AbortSignal }): Promise<HealthReport> {
    const start = Date.now();
    const signal = getExecutionSignal(opts?.signal);
    signal?.throwIfAborted();
    const execute = async (check: CheckDefinition): Promise<CheckResult> => {
      const checkStart = Date.now();
      try { return await check.run(signal); }
      catch (error) { return { name: check.name, healthy: false, duration: Date.now() - checkStart, error: String(error) }; }
    };
    let results: CheckResult[];

    if (opts?.sequential) {
      results = [];
      for (const check of this.checks) {
        signal?.throwIfAborted();
        results.push(await execute(check));
      }
    } else {
      results = await Promise.all(this.checks.map(execute));
    }

    signal?.throwIfAborted();
    const healthy = results.every((r) => r.healthy);
    const summary = {
      total: results.length,
      healthy: results.filter((r) => r.healthy).length,
      unhealthy: results.filter((r) => !r.healthy).length,
    };

    return { healthy, timestamp: Date.now(), duration: Date.now() - start, checks: results, summary };
  }

  /** Wait until all checks pass (polling) */
  async waitUntilHealthy(opts?: { timeout?: number; interval?: number; signal?: AbortSignal }): Promise<HealthReport> {
    const timeout = opts?.timeout ?? 60_000;
    const interval = opts?.interval ?? 2000;
    const inherited = getExecutionSignal(opts?.signal);
    const deadline = AbortSignal.timeout(timeout);
    const signal = inherited ? AbortSignal.any([inherited, deadline]) : deadline;
    let report: HealthReport | undefined;
    try {
      while (true) {
        signal.throwIfAborted();
        report = await this.run({ signal });
        if (report.healthy) return report;
        await delay(interval, undefined, { signal });
      }
    } catch (error) {
      inherited?.throwIfAborted();
      if (!deadline.aborted) throw error;
      const failed = report?.checks.filter(check => !check.healthy).map(check => `${check.name}: ${check.error}`).join(', ');
      throw new Error(`Health check timeout after ${timeout}ms${failed ? `. Failed: ${failed}` : ''}`, { cause: error });
    }
  }
}
