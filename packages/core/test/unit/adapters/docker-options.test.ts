import type { Command } from '../../../src/types/command.js';

import { DockerAdapter } from '../../../src/adapters/docker/index.js';

/**
 * What the adapter actually tells docker.
 *
 * An option that reaches the type system and not the command line is the
 * defect this repository produces most often, and the docker adapter has
 * two argument builders — `exec` and `run` — that had drifted apart, so
 * one target configuration meant two different things depending on a
 * mode the caller never chose explicitly.
 */
describe('the docker arguments', () => {
  const command: Command = { command: 'echo', args: ['x'], shell: false } as Command;

  /** Reach the builders directly: the assertion is about argv, not about docker. */
  const args = (adapter: DockerAdapter, method: string, ...rest: unknown[]): string[] =>
    (adapter as unknown as Record<string, (...a: unknown[]) => string[]>)[method]!(...rest);

  describe('privileged', () => {
    it('reaches both modes from one configuration', () => {
      // It was honoured in `exec` and dropped in `run`, so a target that
      // needed privileges got them or did not depending on whether an
      // image happened to be set.
      const adapter = new DockerAdapter({ defaultExecOptions: { Privileged: true } });

      const exec = args(adapter, 'buildDockerExecArgs', 'c1', { type: 'docker', container: 'c1' }, command);
      const run = args(adapter, 'buildDockerRunArgs', { type: 'docker', container: 'ephemeral', image: 'alpine' }, command);

      expect(exec).toContain('--privileged');
      expect(run).toContain('--privileged');
    });

    it('is absent when it was not configured', () => {
      const adapter = new DockerAdapter({});

      expect(args(adapter, 'buildDockerRunArgs', { type: 'docker', container: 'ephemeral', image: 'alpine' }, command))
        .not.toContain('--privileged');
    });
  });

  describe('the engine default environment', () => {
    it('reaches both modes', () => {
      // `run` applied only the per-command env, so `defaultEnv` — set once
      // on the engine and relied on everywhere — vanished for any target
      // that happened to run in `run` mode.
      const adapter = new DockerAdapter({ defaultEnv: { DEPLOY_ENV: 'staging' } });

      const run = args(adapter, 'buildDockerRunArgs', { type: 'docker', container: 'ephemeral', image: 'alpine' }, command);

      expect(run.join(' ')).toContain('DEPLOY_ENV=staging');
    });

    it('yields to what the command asked for', () => {
      const adapter = new DockerAdapter({ defaultEnv: { DEPLOY_ENV: 'staging' } });
      const withEnv = { ...command, env: { DEPLOY_ENV: 'production' } } as Command;

      const run = args(adapter, 'buildDockerRunArgs', { type: 'docker', container: 'ephemeral', image: 'alpine' }, withEnv);

      expect(run.join(' ')).toContain('DEPLOY_ENV=production');
      expect(run.join(' ')).not.toContain('DEPLOY_ENV=staging');
    });
  });

  describe('volumes', () => {
    it('are mounted when a container is created', () => {
      const adapter = new DockerAdapter({});

      const run = args(adapter, 'buildDockerRunArgs',
        { type: 'docker', container: 'ephemeral', image: 'alpine', volumes: ['/host:/cont'] }, command);

      expect(run).toContain('-v');
      expect(run).toContain('/host:/cont');
    });

    it('are refused, not ignored, when the container already exists', () => {
      // `docker exec` cannot mount: mounts are fixed at creation. Accepting
      // them and quietly not mounting meant the command ran against a
      // filesystem the caller believed was somewhere else.
      const adapter = new DockerAdapter({});

      expect(() =>
        args(adapter, 'buildDockerExecArgs', 'c1',
          { type: 'docker', container: 'c1', volumes: ['/host:/cont'] }, command)
      ).toThrow(/volumes/);
    });

    it('says how to get the mount it refused', () => {
      const adapter = new DockerAdapter({});

      expect(() =>
        args(adapter, 'buildDockerExecArgs', 'c1',
          { type: 'docker', container: 'c1', volumes: ['/host:/cont'] }, command)
      ).toThrow(/image|runMode/);
    });

    it('lets an empty list through', () => {
      const adapter = new DockerAdapter({});

      expect(() =>
        args(adapter, 'buildDockerExecArgs', 'c1',
          { type: 'docker', container: 'c1', volumes: [] }, command)
      ).not.toThrow();
    });
  });
});
