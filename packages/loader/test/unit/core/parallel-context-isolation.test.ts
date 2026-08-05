import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';

import { ScriptExecutor } from '../../../src/core/script-executor.js';
import { ExecutionContext } from '../../../src/core/execution-context.js';

import type { TargetInfo } from '../../../src/types/index.js';

/**
 * One script, many targets, started together — the fan-out that
 * `xec on 'hosts.*'` performs. Injected globals used to be plain writes to
 * the shared globalThis, and the fan-out raced on them two ways at once:
 * the run addressed at host A read host B's $target and executed there,
 * and the first run to finish restored the globals out from under every
 * run still going, which then read undefined mid-flight. Both shapes were
 * reproduced before the fix; these tests hold the door shut.
 *
 * The runs rendezvous — each waits until all have started — so overlap is
 * structural, not a matter of timing luck.
 */
describe('parallel runs keep their own injected globals', () => {
  const target = (name: string): TargetInfo => ({ type: 'ssh', name, config: {} });

  it('each context chain resolves its own values', async () => {
    const seen = new Map<string, string | undefined>();
    let release!: () => void;
    const everyone = new Promise<void>(resolve => { release = resolve; });
    let arrived = 0;

    const run = (id: string) => {
      const context = new ExecutionContext({
        target: target(`host-${id}`),
        targetEngine: (() => {}) as never,
        customGlobals: { __runId: id },
      });

      return context.execute(async () => {
        arrived += 1;
        if (arrived === 3) release();
        await everyone;

        const g = globalThis as Record<string, { name?: string } | undefined>;
        seen.set(id, g['$targetInfo']?.name);
      });
    };

    await Promise.all([run('A'), run('B'), run('C')]);

    expect(seen.get('A')).toBe('host-A');
    expect(seen.get('B')).toBe('host-B');
    expect(seen.get('C')).toBe('host-C');
  }, 15_000);

  it('a finishing run does not strip globals from one still going', async () => {
    const late = new ExecutionContext({
      target: target('host-late'),
      targetEngine: (() => {}) as never,
    });
    const early = new ExecutionContext({
      target: target('host-early'),
      targetEngine: (() => {}) as never,
    });

    let lateStarted!: () => void;
    const lateIsIn = new Promise<void>(resolve => { lateStarted = resolve; });

    const lateRun = late.execute(async () => {
      lateStarted();
      // Outlive the early run, then read.
      await new Promise(resolve => setTimeout(resolve, 100));
      return (globalThis as Record<string, { name?: string } | undefined>)['$targetInfo']?.name;
    });

    await lateIsIn;
    await early.execute(async () => {});

    expect(await lateRun).toBe('host-late');
  }, 15_000);

  it('holds through real script execution, not just the harness', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-isolation-'));
    const script = path.join(dir, 'reads-target.mjs');

    // The script parks on a timer long enough for every sibling to start,
    // then records which target its chain resolved.
    await fs.writeFile(script, [
      "await new Promise(resolve => setTimeout(resolve, 120));",
      "globalThis.__isolationSeen = globalThis.__isolationSeen ?? [];",
      "globalThis.__isolationSeen.push(`${__runId}:${$targetInfo?.name}`);",
      '',
    ].join('\n'));

    try {
      const executor = new ScriptExecutor();
      const run = (id: string) => executor.executeScript(script, {
        context: { args: [], argv: ['x', script], __filename: script, __dirname: dir },
        target: target(`host-${id}`),
        targetEngine: (() => {}) as never,
        customGlobals: { __runId: id },
      });

      const results = await Promise.all([run('A'), run('B')]);
      expect(results.every(r => r.success)).toBe(true);

      const seen = (globalThis as Record<string, unknown>)['__isolationSeen'] as string[];
      expect([...seen].sort()).toEqual(['A:host-A', 'B:host-B']);
    } finally {
      delete (globalThis as Record<string, unknown>)['__isolationSeen'];
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
