import { DockerAdapter } from '../../../src/adapters/docker/index.js';

/**
 * A wedged Docker daemon used to hang every management call forever — inspect,
 * ps, start, stop, cp all passed no timeout. That is indistinguishable from a
 * hung application, and it drove at least one consumer to bypass the adapter
 * for raw `docker` subprocesses. Management calls must now fail loudly instead.
 */
describe('Docker management operations are bounded by a timeout', () => {
  /** Adapter whose docker invocations never return, standing in for a wedged daemon. */
  class WedgedDockerAdapter extends DockerAdapter {
    public calls: Array<Partial<{ timeout: number }>> = [];

    protected override async executeDockerCommand(
      _args: string[],
      command: { timeout?: number }
    ): Promise<{ stdout: string; stderr: string; exitCode: number; signal: string | null }> {
      this.calls.push(command);

      // Never settles — exactly what a hung daemon looks like to the adapter.
      return new Promise(() => {});
    }
  }

  it('passes a finite timeout to short management commands', async () => {
    const adapter = new WedgedDockerAdapter({ managementTimeout: 25 });

    // isAvailable() swallows failures by design, so it returns rather than hangs.
    const pending = adapter.isAvailable();
    await Promise.race([pending, new Promise(resolve => setTimeout(resolve, 50))]);

    expect(adapter.calls.length).toBeGreaterThan(0);
    expect(adapter.calls[0]!.timeout).toBe(25);
  });

  it('defaults management operations to 60 seconds when unconfigured', async () => {
    const adapter = new WedgedDockerAdapter();

    const pending = adapter.isAvailable();
    await Promise.race([pending, new Promise(resolve => setTimeout(resolve, 20))]);

    expect(adapter.calls[0]!.timeout).toBe(60_000);
  });

  it('gives image transfers a longer budget than management calls', async () => {
    const adapter = new WedgedDockerAdapter();

    void adapter.pullImage('alpine:latest').catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(adapter.calls[0]!.timeout).toBe(600_000);
  });

  it('honours an explicit transferTimeout', async () => {
    const adapter = new WedgedDockerAdapter({ transferTimeout: 1234 });

    void adapter.pullImage('alpine:latest').catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(adapter.calls[0]!.timeout).toBe(1234);
  });
});
