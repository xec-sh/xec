import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DockerAdapter } from '../../src/adapters/docker/index.js';

const docker = (args: string[]) => execFileSync('docker', args, { encoding: 'utf8', timeout: 15_000 }).trim();
describe('confirmed removal against Docker', () => {
  for (const running of [false, true]) it(`removes only its isolated ${running ? 'running' : 'stopped'} container`, async () => {
    const name = `xec-removal-${randomUUID()}`;
    const id = docker(['create', '--name', name, '--label', 'xec.test=confirmed-removal', 'alpine:3', 'sleep', '60']);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    const adapter = new DockerAdapter();
    try {
      if (running) docker(['start', id]);
      await adapter.removeContainer(name, running);
      expect(docker(['ps', '-a', '--no-trunc', '--filter', `id=${id}`, '--format', '{{.ID}}'])).toBe('');
      await adapter.removeContainer(name, running);
    } finally {
      // Only the immutable ID created by this test is eligible for cleanup.
      if (/^[a-f0-9]{64}$/.test(id)) docker(['rm', '-f', '--', id]);
      await adapter.dispose();
    }
  });
});
