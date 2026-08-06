import { $, within, withinSync } from '../../../src/index.js';
import { cwdOf, tempRoot } from '../../helpers/platform.js';

/**
 * `within()` promises that configuration changed inside it stays inside.
 *
 * It did not. `$.defaults()` wrote straight to the process-wide engine, so
 * `within(() => $.defaults({ cwd: '/tmp' }))` changed the working directory
 * for the rest of the program — permanently, silently, and in the exact
 * example our own README used to illustrate isolation. Anything relying on
 * the scope was reading another scope's settings.
 */
describe('within confines configuration to its scope', () => {
  /** Read a variable through an actual command, not through internal state. */
  const read = async (name: string): Promise<string> =>
    (await $.exec(`sh -c 'echo $${name}'`)).stdout.trim();

  it('does not leak defaults out of the scope', async () => {
    const before = await read('XEC_ISOLATION_PROBE');

    await within(async () => {
      $.defaults({ env: { XEC_ISOLATION_PROBE: 'inside' } });
      expect(await read('XEC_ISOLATION_PROBE')).toBe('inside');
    });

    expect(await read('XEC_ISOLATION_PROBE')).toBe(before);
  }, 30_000);

  it('keeps concurrent scopes from seeing each other', async () => {
    // Interleaved on purpose: a global write would have the later scope
    // overwrite the earlier one while it is still running.
    const seen: Record<string, string> = {};

    await Promise.all([
      within(async () => {
        $.defaults({ env: { XEC_CONCURRENT_PROBE: 'A' } });
        await new Promise(resolve => { setTimeout(resolve, 60); });
        seen['A'] = await read('XEC_CONCURRENT_PROBE');
      }),
      within(async () => {
        $.defaults({ env: { XEC_CONCURRENT_PROBE: 'B' } });
        await new Promise(resolve => { setTimeout(resolve, 20); });
        seen['B'] = await read('XEC_CONCURRENT_PROBE');
      }),
    ]);

    expect(seen).toEqual({ A: 'A', B: 'B' });
  }, 30_000);

  it('nests, with the inner scope inheriting the outer', async () => {
    await within(async () => {
      $.defaults({ env: { XEC_OUTER_PROBE: 'outer' } });

      await within(async () => {
        $.defaults({ env: { XEC_INNER_PROBE: 'inner' } });

        expect(await read('XEC_OUTER_PROBE')).toBe('outer');
        expect(await read('XEC_INNER_PROBE')).toBe('inner');
      });

      // The inner scope's own addition must not escape into the outer one.
      expect(await read('XEC_INNER_PROBE')).toBe('');
    });
  }, 30_000);
});

describe('within accepts both call shapes', () => {
  it('takes a bare function, as zx does and as the README shows', async () => {
    // A single function used to reach AsyncLocalStorage.run(fn, undefined)
    // and fail with "Function.prototype.apply was called on undefined",
    // which says nothing about what the caller did wrong.
    const result = await within(async () => 'ran');

    expect(result).toBe('ran');
  });

  it('takes a bare directory, as the docs show', async () => {
    // Stored as the scope itself — a string where an object was expected —
    // every property read came back undefined and the scope did nothing.
    const seen = await within(tempRoot(), async () => cwdOf($));

    expect(seen).toBe(tempRoot());
  }, 30_000);

  it('restores the directory afterwards', async () => {
    const cwd = (): Promise<string> => cwdOf($);
    const before = await cwd();
    await within(tempRoot(), async () => cwd());

    expect(await cwd()).toBe(before);
  }, 30_000);

  it('takes an explicit configuration', async () => {
    const result = await within({ defaultEnv: { XEC_SEEDED_PROBE: 'seeded' } }, async () =>
      (await $.exec("sh -c 'echo $XEC_SEEDED_PROBE'")).stdout.trim()
    );

    expect(result).toBe('seeded');
  }, 30_000);

  it('works synchronously in both shapes', () => {
    expect(withinSync(() => 'bare')).toBe('bare');
    expect(withinSync('/tmp', () => 'cwd')).toBe('cwd');
    expect(withinSync({ defaultEnv: {} }, () => 'configured')).toBe('configured');
  });

  it('names the mistake when given no function', async () => {
    await expect(within('not a function' as never)).rejects.toThrow('requires a function');
  });
});
