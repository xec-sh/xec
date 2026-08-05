/**
 * `docker container run` flag plumbing.
 *
 * Each of these is declared in --help and reaches the handler, but was never
 * threaded into the fluent builder, so the container came up without it and
 * nothing said so. --workdir is included as a control: it was already wired,
 * so if it ever fails the harness is wrong rather than the flag.
 *
 * Runs against the built dist, like the other docker tests, because the
 * question is what the shipped CLI hands to Docker.
 */

import path from 'path';
import { $ } from '@xec-sh/core';
import { fileURLToPath } from 'url';
import { it, expect, afterAll, describe, beforeAll } from 'vitest';

const cliEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/main.js');
const NAME = 'xec-dxflags-probe';

const SKIP = process.env['SKIP_DOCKER_TESTS'] === 'true' || process.env['CI'] === 'true';
const describeDocker = SKIP ? describe.skip : describe;

const inspect = async (format: string): Promise<string> => {
  const r = await $`docker inspect ${NAME} --format ${format}`.nothrow();
  return r.stdout.trim();
};

const remove = async () => {
  await $`docker rm -f ${NAME}`.nothrow();
};

describeDocker('docker container run flag plumbing', () => {
  beforeAll(async () => {
    await remove();
    await $`node ${cliEntry} docker container run alpine:3 --name ${NAME} --label probe=yes --restart unless-stopped --entrypoint /bin/sleep --workdir /tmp -d`.nothrow();
  }, 120_000);

  afterAll(remove, 60_000);

  it('passes --workdir through (control)', async () => {
    expect(await inspect('{{.Config.WorkingDir}}')).toBe('/tmp');
  });

  it('passes --label through', async () => {
    expect(await inspect('{{index .Config.Labels "probe"}}')).toBe('yes');
  });

  it('passes --restart through', async () => {
    expect(await inspect('{{.HostConfig.RestartPolicy.Name}}')).toBe('unless-stopped');
  });

  it('passes --entrypoint through', async () => {
    expect(await inspect('{{json .Config.Entrypoint}}')).toContain('/bin/sleep');
  });
});
