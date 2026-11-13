import { TimeoutError } from '../../../src/core/error.js';
import { LocalAdapter } from '../../../src/adapters/local/index.js';
import { DockerAdapter } from '../../../src/adapters/docker/index.js';

// Native termination is checked in docker-lifecycle-native.test.ts. This test
// checks the public timeout policy without invoking a machine's Docker daemon.
describe('Docker timeout policy', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns 124 only when a confirmed local timeout is allowed by nothrow', async () => {
    vi.spyOn(LocalAdapter.prototype, 'execute').mockRejectedValue(new TimeoutError('docker run fixture', 50));
    const adapter = new DockerAdapter();
    const command = { command: 'sleep', args: ['5'], timeout: 50,
      adapterOptions: { type: 'docker' as const, container: 'fixture', image: 'fixture', runMode: 'run' as const } };
    try {
      await expect(adapter.execute({ ...command, nothrow: true })).resolves.toMatchObject({ exitCode: 124, stderr: expect.stringContaining('timed out') });
      await expect(adapter.execute(command)).rejects.toBeInstanceOf(TimeoutError);
    } finally { await adapter.dispose(); }
  });
});
