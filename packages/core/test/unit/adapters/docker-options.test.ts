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


describe('Docker target options through the public engine', () => {
  class CaptureDocker extends DockerAdapter {
    calls: string[][] = [];
    protected override async executeDockerCommand(args: string[]) {
      this.calls.push(args);
      return { stdout: '', stderr: '', stdall: '', exitCode: 0, signal: null };
    }
  }

  it('forwards creation options, target environment and workdir aliases', async () => {
    const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
    const engine = new ExecutionEngine();
    const adapter = new CaptureDocker();
    engine.registerAdapter('docker', adapter);
    const target = engine.docker({
      image: 'node:24-alpine',
      autoRemove: false,
      env: { TARGET: 'one=two', SHARED: 'target' },
      workingDir: '/app',
      ports: ['127.0.0.1:18080:8080'],
      network: 'private',
      platform: 'linux/arm64',
      pull: true,
      labels: { project: 'test' },
      privileged: true,
    });
    await target.execute({ command: 'node', args: ['--version'], shell: false, env: { SHARED: 'command' } });
    const argv = adapter.calls.at(-1)!;
    expect(argv).toEqual(expect.arrayContaining([
      '-w', '/app', '-p', '127.0.0.1:18080:8080', '--network', 'private',
      '--platform', 'linux/arm64', '--pull', 'always', '--label', 'project=test',
      '-e', 'TARGET=one=two', 'SHARED=command', '--privileged',
    ]));
    expect(argv).not.toContain('--rm');
    expect(argv).not.toContain('SHARED=target');
    expect(argv.slice(-3)).toEqual(['node:24-alpine', 'node', '--version']);
  });

  it('uses named containers in exec mode and retains target env and equals signs', async () => {
    const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
    const engine = new ExecutionEngine();
    const adapter = new CaptureDocker({ defaultExecOptions: { Env: ['BASE=a=b'] } });
    engine.registerAdapter('docker', adapter);
    await engine.docker({ container: 'api', image: 'node:24', env: { TARGET: 'yes' }, workingDir: '/app' })
      .execute({ command: 'node', args: ['--version'], shell: false });
    const argv = adapter.calls.at(-1)!;
    expect(argv[0]).toBe('exec');
    expect(argv).toEqual(expect.arrayContaining(['TARGET=yes', 'BASE=a=b', '-w', '/app']));
  });

  it('preserves entrypoint executable and each argument separately', async () => {
    const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
    const engine = new ExecutionEngine();
    const adapter = new CaptureDocker();
    engine.registerAdapter('docker', adapter);
    await engine.docker({ image: 'alpine', entrypoint: ['tini', '--'] })
      .execute({ command: 'printf', args: ['literal space'], shell: false });
    const argv = adapter.calls.at(-1)!;
    expect(argv.slice(argv.indexOf('--entrypoint'))).toEqual([
      '--entrypoint', 'tini', 'alpine', '--', 'printf', 'literal space',
    ]);
  });

  it('rejects creation-only options for an existing container', async () => {
    const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
    const engine = new ExecutionEngine();
    const adapter = new CaptureDocker();
    engine.registerAdapter('docker', adapter);
    await expect(engine.docker({ container: 'api', ports: ['80:80'] }).execute({ command: 'true' }))
      .rejects.toThrow(/ports.*runMode/);
    expect(adapter.calls.some(args => args[0] === 'exec')).toBe(false);
  });
});
