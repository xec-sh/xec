import { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';
import { $, ExecutionEngine, createCallableEngine } from '../../../src/index.js';

/**
 * The product's core promise is one API across environments. An option that
 * is accepted and silently dropped — or, worse, applied to the wrong process
 * — breaks that promise in the least visible way possible. These tests pin
 * the contract: an option either takes effect in the target environment or
 * fails loudly.
 */
describe('maxBuffer overflow is loud on every path', () => {
  const emit = (bytes: number) => `node -e "process.stdout.write('x'.repeat(${bytes}))"`;

  it('fails with a truncated head in nothrow mode', async () => {
    const engine = createCallableEngine(new ExecutionEngine({ maxBuffer: 1024 }));

    const result = await engine.exec(emit(100_000)).nothrow();

    // The old behaviour: empty stdout, exit 0, ok: true — total data loss
    // reported as success.
    expect(result.ok).toBe(false);
    expect(result.stdout.length).toBe(1024);
    expect(result.stderr).toContain('maxBuffer');
  });

  it('throws MaxBufferExceededError with the head preserved', async () => {
    const engine = createCallableEngine(new ExecutionEngine({ maxBuffer: 1024 }));

    await expect(engine.exec(emit(100_000))).rejects.toMatchObject({
      name: 'MaxBufferExceededError',
      partialStdout: 'x'.repeat(1024),
    });
  });

  it('kills a producer that would otherwise stream forever', async () => {
    const engine = createCallableEngine(new ExecutionEngine({ maxBuffer: 1024 }));

    const started = Date.now();
    // Emits ~1KB every 20ms indefinitely; only the overflow kill ends it.
    const result = await engine
      .exec(`node -e "setInterval(() => process.stdout.write('y'.repeat(1024)), 20)"`)
      .nothrow();

    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 20_000);
});

describe('abort reaches every adapter', () => {
  it('local: kills the process when the signal fires', async () => {
    const controller = new AbortController();
    const promise = $.exec('sleep 30').signal(controller.signal).nothrow();

    setTimeout(() => controller.abort(), 150);
    const started = Date.now();
    const result = await promise;

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result.ok).toBe(false);
  }, 15_000);
});

describe('cwd and env reach the Kubernetes pod, not the local kubectl', () => {
  /** Build exec args without a cluster: the private builder is the contract. */
  async function argsFor(command: Record<string, unknown>): Promise<string[]> {
    const adapter = new KubernetesAdapter({});
    return (adapter as unknown as {
      buildKubectlExecArgs(cmd: Record<string, unknown>): Promise<string[]>;
    }).buildKubectlExecArgs({
      adapterOptions: { type: 'kubernetes', pod: 'web' },
      ...command,
    });
  }

  it('translates cwd into a cd prelude inside the pod', async () => {
    const args = await argsFor({ command: 'ls', cwd: '/app' });

    const script = args[args.length - 1];
    expect(args).toContain('-c');
    expect(script).toContain('cd /app &&');
    expect(script).toContain('ls');
  });

  it('quotes a cwd that needs it', async () => {
    const args = await argsFor({ command: 'ls', cwd: '/opt/my app' });

    expect(args[args.length - 1]).toContain("cd '/opt/my app' &&");
  });

  it('translates env into an export prelude inside the pod', async () => {
    const args = await argsFor({ command: 'printenv FOO', env: { FOO: 'bar baz' } });

    const script = args[args.length - 1];
    expect(script).toContain("export FOO='bar baz' &&");
  });

  it('quotes each part of a shell-less command routed through the prelude', async () => {
    const args = await argsFor({
      command: 'echo',
      args: ['a b', '$HOME'],
      cwd: '/tmp',
    });

    const script = args[args.length - 1];
    // Interpolated arguments must survive the sh -c hop without word
    // splitting or expansion.
    expect(script).toContain("'a b'");
    expect(script).toContain("'$HOME'");
  });

  it('rejects an env name that would inject into the shell', async () => {
    await expect(
      argsFor({ command: 'true', env: { 'X=1; rm -rf /; A': 'v' } })
    ).rejects.toThrow('Invalid environment variable name');
  });

  it('leaves a plain command untouched when no cwd or env is set', async () => {
    const args = await argsFor({ command: 'ls', args: ['-la'] });

    expect(args.slice(-2)).toEqual(['ls', '-la']);
    expect(args).not.toContain('-c');
  });
});
