import { ExecutionEngine } from '@xec-sh/core';

import { windowsPackageManager } from './package-manager.js';

export interface ReleaseCommandOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
  redact?: readonly string[];
  /** Give an interactive command the operator's real terminal descriptors. */
  interactive?: boolean;
}
export type ReleaseCommand = (cwd: string, executable: string, args: readonly string[], options?: ReleaseCommandOptions) => Promise<string>;

export class ReleaseCommandError extends Error {
  constructor(
    executable: string,
    public readonly status: number | string | null,
    public readonly stdout: string,
    public readonly stderr: string,
  ) { super(`${executable} failed (${status ?? 'terminated'}): ${stderr.trim() || stdout.trim()}`); }
}

/** Bounded argv execution. Credentials and the full command never enter errors. */
export const releaseCommand: ReleaseCommand = async (cwd, executable, args, options = {}) => {
  const clean = (text: string) => (options.redact ?? []).filter(Boolean).reduce((value, secret) => value.split(secret).join('[redacted]'), text);
  // Use Xec's existing process-tree termination, output bounds and argv handling.
  // Each operation owns its engine; it cannot dispose another caller's processes.
  const engine = new ExecutionEngine({ adapters: { local: { killSignal: 'SIGKILL' } } });
  try {
    // Windows package-manager shims require a shell. Resolve their real entry
    // points so paths, scoped names and registry options remain literal argv.
    const manager = process.platform === 'win32' && (executable === 'npm' || executable === 'pnpm')
      ? windowsPackageManager(executable, { ...process.env, ...options.env })
      : undefined;
    const result = await engine.execute({ command: manager?.executable ?? executable,
      args: manager?.script ? [manager.script, ...args] : [...args], cwd, shell: false, adapter: 'local',
      ...(options.interactive ? { stdin: process.stdin, stdout: 'inherit' as const, stderr: 'inherit' as const, detached: false } : {}),
      timeout: options.timeoutMs ?? 120000, maxBuffer: 8 * 1024 * 1024, env: options.env, nothrow: true });
    if (result.exitCode !== 0) throw new ReleaseCommandError(executable, result.exitCode, clean(result.stdout), clean(result.stderr));
    return result.stdout.trim();
  } catch (error) {
    if (error instanceof ReleaseCommandError) throw error;
    const detail = error as { code?: string; stdout?: string; stderr?: string; message?: string };
    throw new ReleaseCommandError(executable, detail.code ?? null, clean(detail.stdout ?? ''), clean(detail.stderr ?? detail.message ?? String(error)));
  } finally { await engine.dispose(); }
};
