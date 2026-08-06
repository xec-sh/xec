import { $ } from '../../../src/index.js';
import { cwdOf, tempRoot } from '../../helpers/platform.js';

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

    expect((await engine.exec('pwd', { cwd: '/usr' })).stdout.trim()).toBe('/usr');
  }, 20_000);

  it('carries the directory through a derived engine', async () => {
    // Presets compose: .with() on a configured engine must keep what it had.
    const derived = $.with({ defaultCwd: TMP }).with({ timeout: 30_000 });

    expect(await pwd(derived)).toBe(TMP);
  }, 20_000);
});
