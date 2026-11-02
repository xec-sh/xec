import { randomUUID } from 'node:crypto';
import { it, expect, describe } from 'vitest';
import { execFileSync } from 'node:child_process';

import { DockerAdapter } from '../../src/adapters/docker/index.js';

const docker = (args: string[]) => execFileSync('docker', args, { encoding: 'utf8', timeout: 15_000 }).trim();
describe('confirmed removal against Docker', () => {
  for (const mode of ['stopped', 'force', 'graceful'] as const) it(`removes only its isolated ${mode} container`, async () => {
    const name = `xec-removal-${randomUUID()}`;
    const id = docker(['create', '--name', name, '--label', 'xec.test=confirmed-removal', 'alpine:3', 'sleep', '60']);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    const adapter = new DockerAdapter();
    try {
      if (mode !== 'stopped') docker(['start', id]);
      await adapter.removeContainer(name, mode === 'force', { graceful: mode === 'graceful', stopTimeoutSeconds: 1 });
      expect(docker(['ps', '-a', '--no-trunc', '--filter', `id=${id}`, '--format', '{{.ID}}'])).toBe('');
      await adapter.removeContainer(name);
    } finally {
      // Only the immutable ID created by this test is eligible for cleanup.
      if (/^[a-f0-9]{64}$/.test(id)) docker(['rm', '-f', '--', id]);
      await adapter.dispose();
    }
  });
});
