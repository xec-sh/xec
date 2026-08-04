import { $ } from '../../../src/index.js';
import { KubernetesAdapter } from '../../../src/adapters/kubernetes/index.js';

/**
 * A target names where it runs. Losing that identity is not a cosmetic bug:
 * it sends a command to a machine, cluster or container the caller did not
 * choose, with the caller's full credentials, and reports success.
 */
describe('a Kubernetes target names its own cluster', () => {
  /** Build exec args without a cluster; the builder is the contract. */
  async function argsFor(adapterOptions: Record<string, unknown>, adapterConfig = {}): Promise<string[]> {
    const adapter = new KubernetesAdapter(adapterConfig);
    return (adapter as unknown as {
      buildKubectlExecArgs(cmd: Record<string, unknown>): Promise<string[]>;
    }).buildKubectlExecArgs({
      command: 'ls',
      adapterOptions: { type: 'kubernetes', pod: 'web', ...adapterOptions },
    });
  }

  it('passes a per-target context to kubectl', async () => {
    // Without this the command runs against whatever
    // `kubectl config current-context` happens to be — a target that says
    // production landing in staging, or the reverse.
    const args = await argsFor({ context: 'production-cluster' });

    expect(args).toContain('--context');
    expect(args[args.indexOf('--context') + 1]).toBe('production-cluster');
  });

  it('passes a per-target kubeconfig to kubectl', async () => {
    const args = await argsFor({ kubeconfig: '/etc/prod.yaml' });

    expect(args[args.indexOf('--kubeconfig') + 1]).toBe('/etc/prod.yaml');
  });

  it('lets the target override the adapter default', async () => {
    const args = await argsFor({ context: 'production' }, { context: 'staging' });

    expect(args[args.indexOf('--context') + 1]).toBe('production');
  });

  it('falls back to the adapter default when the target names no cluster', async () => {
    const args = await argsFor({}, { context: 'staging' });

    expect(args[args.indexOf('--context') + 1]).toBe('staging');
  });

  it('adds no cluster flags when neither names one', async () => {
    const args = await argsFor({});

    expect(args).not.toContain('--context');
    expect(args).not.toContain('--kubeconfig');
  });
});

describe('a Docker target runs in the container it names', () => {
  it('treats an undefined image as no image at all', () => {
    // Every caller that forwards an optional config field produces
    // `{ container: 'api', image: undefined }`. The engine tested
    // `'image' in options`, so that shape selected the ephemeral-container
    // branch — the command ran in a brand-new container, and then crashed
    // on `image.split(':')`.
    const named = $.docker({ container: 'some-container' });
    const withUndefined = $.docker({ container: 'some-container', image: undefined } as never);

    expect(typeof named).toBe('function');
    expect(typeof withUndefined).toBe('function');
    // Constructing the ephemeral path would have thrown on the undefined
    // image while generating a container name.
  });

  it('still selects an ephemeral container when an image is named', () => {
    const ephemeral = $.docker({ image: 'alpine:latest' });

    expect(typeof ephemeral).toBe('function');
  });
});
