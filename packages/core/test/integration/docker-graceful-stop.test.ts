import { randomUUID } from 'node:crypto';
import { it, expect, describe } from 'vitest';

import { DockerAdapter } from '../../src/adapters/docker/index.js';

describe('graceful stop against Docker', () => {
  it.each([0, 5])('honours %s seconds in an isolated container', async (seconds) => {
    const name = `xec-stop-${randomUUID()}`;
    const adapter = new DockerAdapter();
    // Only the operation under test gets the deliberately short request budget.
    // Image/container setup and recovery must not inherit that test condition.
    const stopper = new DockerAdapter({ managementTimeout: 10000 });
    let id: string | undefined;
    try {
      await adapter.runContainer({ name, image: process.env['XEC_TEST_DOCKER_IMAGE'] ?? 'alpine:3',
        network: 'none', restart: 'no', labels: { 'xec.test.graceful-stop': name },
        command: ['sh', '-c', "trap 'sleep 2; exit 0' TERM; touch /tmp/ready; while :; do sleep 1; done"] });
      const created = await adapter.inspectContainer(name);
      expect(created.Config.Labels['xec.test.graceful-stop']).toBe(name);
      expect(created.Id).toMatch(/^[a-f0-9]{64}$/);
      id = created.Id;
      const deadline = Date.now() + 8000;
      let ready = false;
      while (!ready && Date.now() < deadline) {
        const probe = await adapter.execute({ command: 'test', args: ['-f', '/tmp/ready'],
          adapterOptions: { type: 'docker', container: id! }, throwOnNonZeroExit: false });
        ready = probe.exitCode === 0;
        if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(ready).toBe(true);
      await stopper.stopContainer(id!, seconds);
      const stopped = await adapter.inspectContainer(id!);
      expect(stopped.State.Running).toBe(false);
      expect(stopped.State.ExitCode).toBe(seconds === 0 ? 137 : 0);
      expect(stopped.State.OOMKilled).toBe(false);
    } finally {
      if (!id) {
        const observed = await adapter.inspectContainer(name).catch(() => null);
        if (observed?.Config.Labels?.['xec.test.graceful-stop'] === name) id = observed.Id;
      }
      if (id && /^[a-f0-9]{64}$/.test(id)) await adapter.removeContainer(id, true);
      await adapter.dispose();
      await stopper.dispose();
    }
  }, 180000);
});
