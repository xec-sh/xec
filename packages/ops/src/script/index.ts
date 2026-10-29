import type { Command, SSHAdapterOptions } from '@xec-sh/core';

import { join } from 'node:path';
import { TypeScriptTransformer } from '@xec-sh/loader';
import { rm, mkdtemp, realpath, writeFile } from 'node:fs/promises';

export interface ScriptOptions {
  cwd?: string;
  env?: Record<string, string>;
  params?: Record<string, unknown>;
  args?: string[];
  /** Script orchestration stays local; $target executes on this SSH target. */
  target?: SSHAdapterOptions;
}
export interface PreparedScript {
  command: Command;
  /** Call after execution has settled, including after cancellation. Idempotent. */
  dispose(): Promise<void>;
}

/**
 * Prepare a TypeScript script for a separate Node process, executed by Xec.
 * No script is imported into the host. This is process isolation, not a sandbox:
 * the script has the operating-system permissions of the invoking user.
 * Modules resolve from cwd; dependencies are never downloaded implicitly.
 */
export async function prepareScript(source: string, options: ScriptOptions = {}): Promise<PreparedScript> {
  const cwd = await realpath(options.cwd ?? process.cwd());
  const code = await new TypeScriptTransformer(undefined, { target: 'es2022' }).transform(source, 'script.ts');
  const directory = await mkdtemp(join(cwd, '.xec-run-'));
  const script = join(directory, 'script.mjs');
  try {
    await writeFile(script, code, { mode: 0o600, flag: 'wx' });
    // Payloads travel over stdin, never process arguments or a credential file.
    const bootstrap = `
      import { ExecutionEngine, createCallableEngine } from ${JSON.stringify(import.meta.resolve('@xec-sh/core'))};
      import { ScriptExecutor } from ${JSON.stringify(import.meta.resolve('@xec-sh/loader'))};
      let input = ''; for await (const chunk of process.stdin) input += chunk;
      const payload = JSON.parse(input);
      const engine = new ExecutionEngine();
      const $ = createCallableEngine(engine);
      const $target = payload.target ? $.ssh(payload.target) : $;
      try {
        const result = await new ScriptExecutor().executeScript(payload.script, {
          context: { args: payload.args, argv: [process.execPath, payload.script, ...payload.args],
            __filename: payload.script, __dirname: process.cwd() },
          customGlobals: { $, $target, params: payload.params },
        });
        if (!result.success) { console.error(result.error?.stack ?? result.error); process.exitCode = 1; }
      } finally { await engine.dispose(); }
    `;
    return {
      command: { command: process.execPath, args: ['--input-type=module', '--eval', bootstrap],
        shell: false, adapter: 'local', cwd, env: options.env,
        stdin: JSON.stringify({ script, args: options.args ?? [], params: options.params ?? {}, target: options.target }) },
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
