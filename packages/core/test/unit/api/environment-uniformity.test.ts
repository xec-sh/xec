import { $ } from '../../../src/index.js';

/**
 * The product's headline claim is one API across environments. That is only
 * true if `$.ssh(...)`, `$.docker(...)`, `$.k8s(...)` and `$.local()` all
 * offer the same surface: usable as a template tag, and chainable with the
 * same methods.
 *
 * `$.k8s(target)` used to throw `engine.run is not a function` when used as
 * a tag — the flagship syntax, crashing on one of the four environments —
 * because the callable-engine proxy wrapped its context as if it were an
 * ExecutionEngine. It also offered no chaining at all.
 */
describe('every environment exposes the same surface', () => {
  const environments: Array<[string, () => unknown]> = [
    ['local', () => $.local()],
    ['ssh', () => $.ssh('user@example-host')],
    ['docker', () => $.docker({ container: 'some-container' })],
    ['k8s', () => $.k8s('default/some-pod')],
  ];

  const chain = ['cd', 'env', 'timeout', 'shell', 'retry', 'exec', 'raw'] as const;

  it.each(environments)('%s is usable as a template tag', (_name, make) => {
    const target = make() as (strings: TemplateStringsArray, ...values: unknown[]) => unknown;

    expect(typeof target).toBe('function');

    // Constructing the promise must not throw for any environment; execution
    // is lazy, so no connection is attempted here.
    const promise = target`echo hi` as { nothrow?: unknown; pipe?: unknown; then?: unknown };
    expect(typeof promise.then).toBe('function');
    expect(typeof promise.nothrow).toBe('function');
    expect(typeof promise.pipe).toBe('function');
  });

  it.each(environments)('%s offers the shared chaining methods', (_name, make) => {
    const target = make() as Record<string, unknown>;

    for (const method of chain) {
      expect(typeof target[method], `${_name}.${method}`).toBe('function');
    }
  });

  it('k8s chaining composes and stays a k8s context', () => {
    const chained = $.k8s('default/some-pod').cd('/app').env({ A: '1' }).timeout(5_000);

    // Still a template tag and still pod-aware.
    expect(typeof chained).toBe('function');
    expect(typeof chained.pod).toBe('function');
  });

  it('ssh keeps its environment-specific extras alongside the shared chain', () => {
    const ssh = $.ssh('user@example-host');

    expect(typeof ssh.tunnel).toBe('function');
    expect(typeof ssh.uploadFile).toBe('function');
  });
});
