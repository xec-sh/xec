import type { Command } from '../../../src/types/command.js';

import { dirname } from 'node:path';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { globalCache } from '../../../src/utils/cache.js';
import { LocalAdapter } from '../../../src/adapters/local/index.js';
import { within, ExecutionEngine, createCallableEngine } from '../../../src/index.js';

const readEnvironment = 'process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("XEC_ENV_MODE_")))));';
const command: Command = { command: process.execPath, args: ['-e', readEnvironment], shell: false };
const engines: ExecutionEngine[] = [];
function engine() {
  const value = new ExecutionEngine({ defaultEnv: { XEC_ENV_MODE_ENGINE: 'engine' },
    preferLocal: true, adapters: { local: { defaultEnv: { XEC_ENV_MODE_ADAPTER: 'adapter' } } } });
  engines.push(value);
  return value;
}
afterEach(async () => { vi.unstubAllEnvs(); globalCache.clear(); for (const value of engines.splice(0)) await value.dispose(); });

describe('explicit local environment replacement', () => {
  it('excludes ambient, engine, adapter and within defaults through the ordinary engine', async () => {
    vi.stubEnv('XEC_ENV_MODE_AMBIENT', 'must-not-inherit');
    const result = await within({ defaultEnv: { XEC_ENV_MODE_SCOPE: 'scope' } }, () => engine().execute({
      ...command, envMode: 'replace', env: { XEC_ENV_MODE_SELECTED: 'selected' },
    }));
    expect(JSON.parse(result.stdout)).toEqual({ XEC_ENV_MODE_SELECTED: 'selected' });
  });

  it('an explicit empty replacement does not borrow a fluent environment', async () => {
    const value = engine().env({ XEC_ENV_MODE_FLUENT: 'fluent' });
    const result = await value.execute({ ...command, envMode: 'replace' });
    expect(JSON.parse(result.stdout)).toEqual({});
  });

  it('an explicitly configured derived replacement carries its own selected environment', async () => {
    const value = engine().with({ envMode: 'replace', env: { XEC_ENV_MODE_DERIVED: 'derived' } });
    const result = await value.execute(command);
    expect(JSON.parse(result.stdout)).toEqual({ XEC_ENV_MODE_DERIVED: 'derived' });
  });

  it('does not reintroduce fluent variables through the lazy exec builder', async () => {
    const $ = createCallableEngine(engine().env({ XEC_ENV_MODE_FLUENT: 'fluent' }));
    const result = await $.exec(command.command, { args: command.args, shell: false, envMode: 'replace' });
    expect(JSON.parse(result.stdout)).toEqual({});
  });

  it('honors a scoped replacement through lazy exec before resolving inherited presets', async () => {
    const $ = createCallableEngine(engine().env({ XEC_ENV_MODE_FLUENT: 'fluent' }));
    const result = await within({ envMode: 'replace', env: { XEC_ENV_MODE_SCOPE: 'selected' } },
      () => $.exec(command.command, { args: command.args, shell: false }));
    expect(JSON.parse(result.stdout)).toEqual({ XEC_ENV_MODE_SCOPE: 'selected' });
  });

  it('never serves an inherited cached result for a replacement command', async () => {
    vi.stubEnv('XEC_ENV_MODE_AMBIENT', 'inherited');
    const $ = createCallableEngine(engine());
    const inherited = await $.exec(command.command, { args: command.args, shell: false, env: {} }).cache();
    const replaced = await $.exec(command.command, { args: command.args, shell: false, env: {}, envMode: 'replace' }).cache();
    expect(JSON.parse(inherited.stdout).XEC_ENV_MODE_AMBIENT).toBe('inherited');
    expect(JSON.parse(replaced.stdout)).toEqual({});
  });

  it('preserves inherited defaults and explicit overrides when no replacement is requested', async () => {
    vi.stubEnv('XEC_ENV_MODE_AMBIENT', 'inherited');
    const result = await within({ defaultEnv: { XEC_ENV_MODE_SCOPE: 'scope' } }, () => engine().execute({
      ...command, env: { XEC_ENV_MODE_ENGINE: 'override' },
    }));
    expect(JSON.parse(result.stdout)).toEqual({ XEC_ENV_MODE_AMBIENT: 'inherited', XEC_ENV_MODE_ENGINE: 'override',
      XEC_ENV_MODE_ADAPTER: 'adapter', XEC_ENV_MODE_SCOPE: 'scope' });
  });

  it('uses the exact explicit PATH instead of preferLocal or ambient PATH', async () => {
    const selectedPath = dirname(process.execPath);
    const result = await engine().execute({ command: process.platform === 'win32' ? 'node.exe' : 'node',
      args: ['-e', 'process.stdout.write(process.env.PATH)'], shell: false,
      envMode: 'replace', env: { PATH: selectedPath },
    });
    expect(result.stdout).toBe(selectedPath);
  });

  it('applies the same replacement through the synchronous local adapter', () => {
    vi.stubEnv('XEC_ENV_MODE_AMBIENT', 'must-not-inherit');
    const adapter = new LocalAdapter({ defaultEnv: { XEC_ENV_MODE_ADAPTER: 'adapter' } });
    const result = adapter.executeSync({ ...command, envMode: 'replace', env: { XEC_ENV_MODE_SYNC: 'sync' } });
    expect(JSON.parse(result.stdout)).toEqual({ XEC_ENV_MODE_SYNC: 'sync' });
  });

  it.each(['ssh', 'docker', 'kubernetes'] as const)('rejects replacement on %s before a connection or execution', async adapter => {
    const value = engine();
    const start = vi.fn();
    value.on('command:start', start);
    await expect(value.execute({ ...command, adapter, envMode: 'replace', nothrow: true }))
      .rejects.toThrow(/envMode.*replace.*local/i);
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects unknown modes rather than silently inheriting the host environment', async () => {
    await expect(engine().execute({ ...command, envMode: 'typo' } as unknown as Command)).rejects.toThrow(/envMode/);
  });
});
