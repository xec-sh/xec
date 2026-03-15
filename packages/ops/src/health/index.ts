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

import { execSync } from 'node:child_process';
import { connect, type Socket } from 'node:net';

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
  run: () => Promise<CheckResult>;
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

export interface CommandCheckOptions {
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
      run: async () => {
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), opts.timeout ?? 10_000);
          const resp = await fetch(url, {
            method: opts.method ?? 'GET',
            headers: opts.headers,
            body: opts.body,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const duration = Date.now() - start;

          const expectedStatus = opts.status ?? 200;
          if (resp.status !== expectedStatus) {
            return { name, healthy: false, duration, error: `Status ${resp.status} (expected ${expectedStatus})` };
          }

          if (opts.contains) {
            const body = await resp.text();
            if (!body.includes(opts.contains)) {
              return { name, healthy: false, duration, error: `Response does not contain "${opts.contains}"` };
            }
          }

          return { name, healthy: true, duration, message: `${resp.status} OK` };
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
      run: () =>
        new Promise<CheckResult>((resolve) => {
          const start = Date.now();
          const timeout = opts.timeout ?? 5000;
          let socket: Socket | null = null;

          const timer = setTimeout(() => {
            socket?.destroy();
            resolve({ name, healthy: false, duration: Date.now() - start, error: `Timeout after ${timeout}ms` });
          }, timeout);

          socket = connect({ host, port }, () => {
            clearTimeout(timer);
            socket?.destroy();
            resolve({ name, healthy: true, duration: Date.now() - start, message: `Port ${port} open` });
          });

          socket.on('error', (err) => {
            clearTimeout(timer);
            resolve({ name, healthy: false, duration: Date.now() - start, error: err.message });
          });
        }),
    });
    return this;
  }

  /** Check a shell command */
  command(cmd: string, opts: CommandCheckOptions = {}): this {
    const name = `cmd:${cmd.split(' ')[0]}`;
    this.checks.push({
      name,
      run: async () => {
        const start = Date.now();
        try {
          const output = execSync(cmd, {
            encoding: 'utf-8',
            timeout: opts.timeout ?? 10_000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          const duration = Date.now() - start;

          if (opts.contains && !output.includes(opts.contains)) {
            return { name, healthy: false, duration, error: `Output does not contain "${opts.contains}"` };
          }

          return { name, healthy: true, duration, message: 'OK' };
        } catch (err: unknown) {
          const duration = Date.now() - start;
          const exitCode = (err as { status?: number }).status;
          if (opts.exitCode !== undefined && exitCode === opts.exitCode) {
            return { name, healthy: true, duration, message: `Exit code ${exitCode} (expected)` };
          }
          return { name, healthy: false, duration, error: String(err) };
        }
      },
    });
    return this;
  }

  /** Custom check function */
  custom(name: string, fn: () => Promise<boolean | string>): this {
    this.checks.push({
      name: `custom:${name}`,
      run: async () => {
        const start = Date.now();
        try {
          const result = await fn();
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
  async run(opts?: { sequential?: boolean }): Promise<HealthReport> {
    const start = Date.now();
    let results: CheckResult[];

    if (opts?.sequential) {
      results = [];
      for (const check of this.checks) {
        results.push(await check.run());
      }
    } else {
      results = await Promise.all(this.checks.map((c) => c.run()));
    }

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
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (opts?.signal?.aborted) throw new Error('Health check aborted');
      const report = await this.run();
      if (report.healthy) return report;
      await new Promise((r) => setTimeout(r, interval));
    }

    const final = await this.run();
    if (!final.healthy) {
      const failed = final.checks.filter((c) => !c.healthy).map((c) => `${c.name}: ${c.error}`);
      throw new Error(`Health check timeout after ${timeout}ms. Failed: ${failed.join(', ')}`);
    }
    return final;
  }
}
