import { TimeoutError } from '../../../src/core/error.js';
import { DockerAdapter } from '../../../src/adapters/docker/index.js';

// A transport timeout is not proof of remote completion. The native tests
// separately exercise the same public API with real child processes.
describe('Docker timeout policy', () => {
  class TimeoutDocker extends DockerAdapter {
    failCreation = false;
    protected override async executeDockerCommand(args: string[]) {
      if ((args[0] === 'create' && this.failCreation) || args[0] === 'start') throw new TimeoutError('fixture', 50);
      const stdout = args[0] === 'create' ? 'a'.repeat(64) : '';
      return { stdout, stderr: '', stdall: stdout, exitCode: 0, signal: null };
    }
  }
  const command = { command: 'sleep', args: ['5'], timeout: 50,
    adapterOptions: { type: 'docker' as const, container: 'fixture', image: 'fixture', runMode: 'run' as const } };

  it('returns 124 only after independently confirming container absence', async () => {
    const adapter = new TimeoutDocker();
    try {
      await expect(adapter.execute({ ...command, nothrow: true })).resolves.toMatchObject({ exitCode: 124 });
      await expect(adapter.execute(command)).rejects.toBeInstanceOf(TimeoutError);
    } finally { await adapter.dispose(); }
  });

  it('does not call an unacknowledged creation a confirmed timeout', async () => {
    const adapter = new TimeoutDocker({ managementTimeout: 1 });
    adapter.failCreation = true;
    try {
      await expect(adapter.execute({ ...command, nothrow: true })).rejects.toMatchObject({ operation: 'terminate' });
    } finally { await adapter.dispose(); }
  });
});
