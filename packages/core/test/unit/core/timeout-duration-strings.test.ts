import { $, parseDuration } from '../../../src/index.js';

/**
 * A duration string worked on `.timeout('5m')` and nowhere else.
 *
 * Passed as an option — `$.with({ timeout: '5m' })`, `$.exec(cmd, { timeout })`
 * — the string reached `setTimeout` unparsed, became NaN, and Node clamped it
 * to 1ms. Every command then failed immediately, and the message said
 * "Command timed out after 5mms": a plausible sentence claiming the five
 * minutes elapsed.
 *
 * So the failure was not just silent, it testified against itself. Someone
 * reading that message would look for a slow command rather than a timeout
 * that never had a chance to be long.
 */
describe('a timeout option accepts the same duration strings as .timeout()', () => {
  const forms: ReadonlyArray<readonly [string, number]> = [
    ['5m', 300_000],
    ['30s', 30_000],
    ['1h', 3_600_000],
    ['500ms', 500],
  ];

  it.each(forms)('parses %s', (text, expected) => {
    expect(parseDuration(text)).toBe(expected);
  });

  it('runs a fast command under a long string timeout via .with()', async () => {
    const result = await $.with({ timeout: '5m' })`echo fine`;

    expect(result.stdout.trim()).toBe('fine');
  }, 20_000);

  it('runs a fast command under a long string timeout via exec options', async () => {
    const result = await $.exec('echo fine', { timeout: '5m' });

    expect(result.stdout.trim()).toBe('fine');
  }, 20_000);

  it('still enforces a short string timeout', async () => {
    // The string must be honoured in both directions: a real timeout has to
    // still fire, or the fix would just be disabling timeouts.
    const error = await $.with({ timeout: '100ms' })`sleep 5`
      .then(() => null, (e: unknown) => e as Error);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/timed out/i);
  }, 20_000);

  it('reports the elapsed limit in milliseconds, not the raw string', async () => {
    const error = await $.with({ timeout: '100ms' })`sleep 5`
      .then(() => null, (e: unknown) => e as Error);

    expect(error!.message).not.toContain('100msms');
    expect(error!.message).toContain('100');
  }, 20_000);

  it('accepts a plain number as before', async () => {
    const result = await $.with({ timeout: 60_000 })`echo fine`;

    expect(result.stdout.trim()).toBe('fine');
  }, 20_000);

  it('carries a string timeout through a derived engine', async () => {
    const result = await $.with({ timeout: '5m' }).with({ defaultCwd: '/tmp' })`echo fine`;

    expect(result.stdout.trim()).toBe('fine');
  }, 20_000);
});
