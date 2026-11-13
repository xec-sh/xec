import type { ResolvedTarget } from '@xec-sh/ops';

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { LogsCommand } from '../../src/commands/logs.js';

const targets: ResolvedTarget[] = [
  { id: 'a', name: 'a', type: 'local', source: 'configured', config: { type: 'local' } },
  { id: 'b', name: 'b', type: 'local', source: 'configured', config: { type: 'local' } },
];

interface Hooks {
  initializeConfig(options: unknown): Promise<void>;
  getCommandDefaults(): object;
  findTargets(pattern: string): Promise<ResolvedTarget[]>;
  buildLogCommand(target: ResolvedTarget, path: string | undefined, options: unknown): Promise<string>;
  createTargetEngine(target: ResolvedTarget): Promise<{ raw: (strings: TemplateStringsArray) => Promise<{ stdout: string }> }>;
  streamLogsWithPrefix(target: ResolvedTarget, path: string | undefined, options: unknown, signal?: AbortSignal): Promise<void>;
}

function commandWithTargets() {
  const command = new LogsCommand();
  const hooks = command as unknown as Hooks;
  vi.spyOn(hooks, 'initializeConfig').mockResolvedValue();
  vi.spyOn(hooks, 'getCommandDefaults').mockReturnValue({});
  vi.spyOn(hooks, 'findTargets').mockResolvedValue(targets);
  vi.spyOn(hooks, 'buildLogCommand').mockResolvedValue('synthetic log source');
  return { command, hooks };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('multi-target logs outcomes', () => {
  it.each([{ parallel: true }, { aggregate: true }])('retains successful output and rejects partial collection %j', async options => {
    const { command, hooks } = commandWithTargets();
    const failure = new Error('target b unavailable');
    const read = vi.fn(async (target: ResolvedTarget) => ({
      raw: async () => {
        if (target.id === 'b') throw failure;
        return { stdout: '2026-11-14T00:00:00Z from a\n' };
      },
    }));
    vi.spyOn(hooks, 'createTargetEngine').mockImplementation(read);
    await expect(command.execute(['*', '/synthetic.log', options])).rejects.toMatchObject({ errors: [failure] });
    expect(read).toHaveBeenCalledTimes(2);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('from a');
  });

  it('joins every admitted finite read before reporting failure', async () => {
    const { command, hooks } = commandWithTargets();
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(hooks, 'createTargetEngine').mockImplementation(async target => ({ raw: async () => {
      if (target.id === 'a') throw new Error('first failed');
      await delayed;
      return { stdout: 'second finished' };
    } }));
    let settled = false;
    const result = command.execute(['*', '/synthetic.log', { parallel: true }]);
    const outcome = result.catch(error => { settled = true; return error; });
    await vi.waitFor(() => expect(hooks.createTargetEngine).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    release();
    expect(await outcome).toBeInstanceOf(AggregateError);
  });

  it('cancels and joins other follow streams when one fails', async () => {
    const { command, hooks } = commandWithTargets();
    let stopped = false;
    const failure = new Error('stream failed');
    vi.spyOn(hooks, 'streamLogsWithPrefix').mockImplementation(async (target, _path, _options, signal) => {
      if (target.id === 'a') throw failure;
      if (!signal?.aborted) await new Promise<void>(resolve => signal?.addEventListener('abort', () => resolve(), { once: true }));
      stopped = true;
    });
    await expect(command.execute(['*', '/synthetic.log', { parallel: true, follow: true }]))
      .rejects.toMatchObject({ errors: [failure] });
    expect(stopped).toBe(true);
  });

  it('keeps parallel dry-run free of source reads', async () => {
    const { command, hooks } = commandWithTargets();
    const execute = vi.spyOn(hooks, 'createTargetEngine');
    await command.execute(['*', '/synthetic.log', { parallel: true, dryRun: true }]);
    expect(execute).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
  });

  it('rejects unsupported unbounded aggregation before reading any source', async () => {
    const { command, hooks } = commandWithTargets();
    const execute = vi.spyOn(hooks, 'createTargetEngine');
    await expect(command.execute(['*', '/synthetic.log', { aggregate: true, follow: true }]))
      .rejects.toThrow(/aggregate.*follow/);
    expect(execute).not.toHaveBeenCalled();
  });
});
