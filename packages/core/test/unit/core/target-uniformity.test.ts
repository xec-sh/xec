import { $ } from '../../../src/index.js';

/**
 * The product claim is that the target changes and the code does not: a step
 * written as `(target) => target\`...\`` should run anywhere.
 *
 * It held for local and Docker, which return a configured engine, and broke
 * for SSH and Kubernetes, which returned a hand-written object carrying about
 * a third of the engine. `target.with(...)`, `target.transfer`,
 * `target.which(...)`, `target.batch(...)` and a dozen more were `undefined` on
 * exactly the two targets that make the feature worth having — so a step
 * developed against a container threw `not a function` the first time it was
 * pointed at a production host.
 *
 * This test pins the surface itself rather than any one method, so a member
 * added to the engine later cannot quietly go missing on half the targets.
 */
describe('every target exposes the same engine surface', () => {
  const targets = {
    local: $.local(),
    docker: $.docker('some-container'),
    ssh: $.ssh('deploy@example.invalid'),
    k8s: $.k8s('default/some-pod'),
  } as const;

  /**
   * What a step may rely on regardless of where it runs.
   *
   * Deliberately not the whole engine: `ssh`/`docker`/`k8s` re-target and are
   * meaningless on an already-targeted engine.
   */
  const REQUIRED = [
    'exec', 'raw', 'run',
    'with', 'defaults',
    'cd', 'env', 'shell', 'timeout', 'retry',
    'which', 'isCommandAvailable',
    'readFile', 'writeFile', 'tempFile', 'withTempFile', 'withTempDir',
    'batch', 'template', 'withSpinner',
    'on', 'off', 'once',
  ] as const;

  it.each(Object.entries(targets))('%s is callable as a template tag', (_name, target) => {
    expect(typeof target).toBe('function');
  });

  it.each(Object.entries(targets))('%s has every required member', (name, target) => {
    const missing = REQUIRED.filter(member => (target as Record<string, unknown>)[member] === undefined);

    expect(missing, `${name} is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(Object.entries(targets))('%s exposes transfer', (_name, target) => {
    expect((target as Record<string, unknown>)['transfer']).toBeDefined();
  });

  it('keeps the target when configuration is derived from it', async () => {
    // .with() must not drop back to local execution — that would run a
    // production command on the operator's laptop.
    const configured = $.ssh('deploy@example.invalid').with({ defaultCwd: '/srv' });

    expect(typeof configured).toBe('function');
    expect(configured).not.toBe($);
  });

  it('keeps SSH-specific members reachable after configuration', () => {
    const configured = $.ssh('deploy@example.invalid').with({ defaultCwd: '/srv' });

    // Chaining must not cost you the reason you chose this target.
    expect(typeof (configured as unknown as { tunnel?: unknown }).tunnel).toBe('function');
  });

  it('keeps pod access reachable after configuration on Kubernetes', () => {
    const configured = $.k8s('default/some-pod').with({ defaultCwd: '/srv' });

    expect(typeof (configured as unknown as { pod?: unknown }).pod).toBe('function');
  });

  it('runs the same step against local and a derived local engine', async () => {
    const step = async (target: typeof $) => (await target`echo uniform`).stdout.trim();

    expect(await step($.local())).toBe('uniform');
    expect(await step($.local().with({ defaultCwd: '/tmp' }))).toBe('uniform');
  }, 20_000);
});
