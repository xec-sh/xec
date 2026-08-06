import { dirname } from 'node:path';

import { $ } from '../../../src/index.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { cwdOf, tempRoot, nodeCommand } from '../../helpers/platform.js';

/**
 * `$.with({ defaultCwd })` promises a configured engine whose commands run in
 * that directory. It ran them in the parent's directory instead.
 *
 * `with()` deliberately reuses the parent's adapter instances so an SSH
 * connection pool survives being reconfigured. But the adapter is where the
 * fallback `cwd` was read from, and its copy was baked in at construction —
 * so a directory set on the new engine never reached the command, while
 * `defaultEnv` (merged one level up, in the engine) worked. Half a config
 * object applied, silently.
 *
 * The failure mode is the dangerous one for this project: a preset built for
 * `/srv/app` runs `git clean -fd` wherever the parent happened to be.
 */
const emit_cwd = 'process.stdout.write(process.cwd())';

describe('$.with applies the whole configuration it is given', () => {
  const pwd = (engine: typeof $): Promise<string> => cwdOf(engine);

  /** Resolved through symlinks, since macOS reports /tmp as /private/tmp. */
  const TMP = tempRoot();

  it('runs commands in defaultCwd', async () => {
    expect(await pwd($.with({ defaultCwd: TMP }))).toBe(TMP);
  }, 20_000);

  it('treats cwd and defaultCwd the same way', async () => {
    expect(await pwd($.with({ defaultCwd: TMP }))).toBe(await pwd($.with({ cwd: TMP })));
  }, 20_000);

  it('applies defaultCwd and defaultEnv together', async () => {
    // defaultEnv alone worked, which is what hid the missing directory.
    const engine = $.with({ defaultCwd: TMP, defaultEnv: { XEC_WITH_PROBE: 'set' } });

    expect(await pwd(engine)).toBe(TMP);
    expect((await engine.exec("sh -c 'echo $XEC_WITH_PROBE'")).stdout.trim()).toBe('set');
  }, 20_000);

  it('leaves the parent engine alone', async () => {
    const before = await pwd($);
    await pwd($.with({ defaultCwd: TMP }));

    expect(await pwd($)).toBe(before);
  }, 20_000);

  it('lets a per-command cwd win over the engine default', async () => {
    const engine = $.with({ defaultCwd: TMP });
    const elsewhere = dirname(TMP);

    expect((await engine.exec(nodeCommand(emit_cwd), { cwd: elsewhere })).stdout.trim())
      .toBe(elsewhere);
  }, 20_000);

  it('carries the directory through a derived engine', async () => {
    // Presets compose: .with() on a configured engine must keep what it had.
    const derived = $.with({ defaultCwd: TMP }).with({ timeout: 30_000 });

    expect(await pwd(derived)).toBe(TMP);
  }, 20_000);
});

/**
 * A configured shell is the shell — for what runs and for how it is quoted.
 *
 * `new ExecutionEngine({ shell })` reached the adapter through
 * `defaultShell`, but the tagged template sent `shell: true`, which shadowed
 * it, and quoted its interpolations for the host's dialect. So a caller who
 * named `cmd.exe` from Linux got POSIX quoting for a shell that does not
 * read it — the escaping not applying to the shell that parses it.
 */
describe('$ honours a shell configured on the engine', () => {
  const commandOf = async (engine: typeof $): Promise<string> =>
    (await engine`echo ${'a b'}`.nothrow()).command;

  it('quotes for the configured shell, not the host', async () => {
    expect(await commandOf($.with({ shell: 'sh' }))).toBe("echo 'a b'");
    expect(await commandOf($.with({ shell: 'cmd.exe' }))).toBe('echo ^"a^ b^"');
  });

  it('reaches the command as the shell to run it with', async () => {
    const result = await $.with({ shell: 'cmd.exe' })`echo ${'a b'}`.nothrow();

    // Not `true`, which would let the adapter pick the host's own.
    expect(result.command).toContain('^"');
  });
});

describe('the engine config spells the shell either way', () => {
  it('takes `shell` at construction, as `defaults()` always did', async () => {
    // `shell` was accepted by the type and read by nothing: every consumer
    // looks at `defaultShell`, and only `defaults()` translated between
    // them. So `new ExecutionEngine({ shell })` configured nothing.
    const engine = new ExecutionEngine({ shell: 'cmd.exe' });

    expect((await engine.tag`echo ${'a b'}`.nothrow()).command).toBe('echo ^"a^ b^"');
  });

  it('keeps it across with()', async () => {
    const derived = new ExecutionEngine({ shell: 'cmd.exe' }).with({ timeout: 5000 });

    expect((await derived.tag`echo ${'a b'}`.nothrow()).command).toBe('echo ^"a^ b^"');
  });
});
