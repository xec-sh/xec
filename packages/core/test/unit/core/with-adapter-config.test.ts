import { $ } from '../../../src/index.js';

/**
 * `$.with()` reuses its parent's adapter instances so an SSH connection pool
 * survives being reconfigured. The cost was that every setting the adapter
 * owned was read from the copy it was built with, so a derived engine could
 * not change one — and said nothing about it.
 *
 * `defaultCwd` was the first case found. These are the rest, and they are the
 * ones that matter most:
 *
 *   - `maxBuffer` is the cap on how much output is captured. Ignored, a
 *     runaway command eats memory until the process dies, and the control that
 *     was supposed to prevent it reported no error.
 *   - `throwOnNonZeroExit` decides whether a failed command throws. Ignored,
 *     a caller who asked for result-style handling got exceptions anyway.
 */
describe('$.with applies settings the adapter owns', () => {
  /** Roughly 50KB of output — far past any cap set below. */
  const NOISY = 'sh -c \'head -c 50000 /dev/zero | tr "\\0" x\'';

  it('enforces a maxBuffer set on a derived engine', async () => {
    const outcome = await $.with({ maxBuffer: 128 })
      .exec(NOISY)
      .then(result => `captured ${result.stdout.length} bytes`, (error: Error) => error.constructor.name);

    expect(outcome).not.toMatch(/^captured 50000/);
  }, 20_000);

  it('leaves the cap on the parent engine alone', async () => {
    await $.with({ maxBuffer: 128 }).exec(NOISY).catch(() => undefined);

    const result = await $.exec(NOISY);
    expect(result.stdout.length).toBe(50_000);
  }, 20_000);

  it('honours throwOnNonZeroExit: false on a derived engine', async () => {
    const result = await $.with({ throwOnNonZeroExit: false }).exec('sh -c "exit 3"');

    expect(result.exitCode).toBe(3);
    expect(result.ok).toBe(false);
  }, 20_000);

  it('still throws on the parent engine', async () => {
    await $.with({ throwOnNonZeroExit: false }).exec('sh -c "exit 3"');

    await expect($.exec('sh -c "exit 3"')).rejects.toThrow();
  }, 20_000);

  it('lets .nothrow() win over the engine setting', async () => {
    // The per-command opt-out is the more specific statement of intent.
    const result = await $.with({ throwOnNonZeroExit: true })`sh -c 'exit 4'`.nothrow();

    expect(result.exitCode).toBe(4);
  }, 20_000);

  it('carries both settings through a derived engine', async () => {
    const engine = $.with({ maxBuffer: 128 }).with({ throwOnNonZeroExit: false });

    const result = await engine.exec('sh -c "exit 3"');
    expect(result.exitCode).toBe(3);
  }, 20_000);
});
