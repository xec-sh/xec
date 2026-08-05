import { Deployer, type DeployConfig } from '../../src/deploy/index.js';

/**
 * The version bookkeeping here guards the most expensive mistake the module
 * can make: a failed deploy used to become "the previous version"
 * unconditionally, so `rollback()` re-deployed the exact version that had
 * just failed — a rollback that rolls forward into the fire.
 */
describe('Deployer version bookkeeping', () => {
  const config = (overrides: Partial<DeployConfig> = {}): DeployConfig => ({
    name: 'app',
    targets: ['web-1'],
    strategy: 'all-at-once',
    hooks: {
      deploy: async () => {},
      rollback: async () => {},
    },
    ...overrides,
  });

  it('rolls back to the version before a regretted success', async () => {
    const deployed: string[] = [];
    const deployer = Deployer.create(
      config({ hooks: { deploy: async ctx => { deployed.push(ctx.version); }, rollback: async () => {} } })
    );

    await deployer.deploy('1.0.0');
    await deployer.deploy('2.0.0');
    const result = await deployer.rollback();

    expect(result.version).toBe('1.0.0');
    expect(deployed).toEqual(['1.0.0', '2.0.0', '1.0.0']);
  });

  it('rolls back to the last good version after a failure — never the failed one', async () => {
    const deployed: string[] = [];
    let fail = false;
    const deployer = Deployer.create(
      config({
        hooks: {
          deploy: async ctx => {
            deployed.push(ctx.version);
            if (fail) throw new Error('bad build');
          },
          rollback: async () => {},
        },
      })
    );

    await deployer.deploy('1.0.0');
    fail = true;
    const failed = await deployer.deploy('2.0.0');
    expect(failed.success).toBe(false);

    fail = false;
    const result = await deployer.rollback();

    expect(result.version).toBe('1.0.0');
    expect(deployed).toEqual(['1.0.0', '2.0.0', '1.0.0']);
  });

  it('a failed first deploy leaves nothing to roll back to', async () => {
    const deployer = Deployer.create(
      config({ hooks: { deploy: async () => { throw new Error('bad'); }, rollback: async () => {} } })
    );

    const failed = await deployer.deploy('1.0.0');
    expect(failed.success).toBe(false);

    await expect(deployer.rollback()).rejects.toThrow('No known-good version');
  });

  it('hooks see the version being replaced, not the one being deployed', async () => {
    const seen: Array<string | undefined> = [];
    const deployer = Deployer.create(
      config({ hooks: { deploy: async ctx => { seen.push(ctx.previousVersion); }, rollback: async () => {} } })
    );

    await deployer.deploy('1.0.0');
    await deployer.deploy('2.0.0');

    expect(seen).toEqual([undefined, '1.0.0']);
  });
});

describe('Deployer configuration validation', () => {
  it('refuses zero targets', () => {
    // deploy() over an empty target list produces zero results, and
    // every() over [] is vacuously true — a "successful" deployment of
    // nothing, with version bookkeeping advanced to match.
    expect(() =>
      Deployer.create({
        name: 'app',
        targets: [],
        strategy: 'all-at-once',
        hooks: { deploy: async () => {} },
      })
    ).toThrow('at least one target');
  });

  it('refuses a missing deploy hook', () => {
    expect(() =>
      Deployer.create({
        name: 'app',
        targets: ['web-1'],
        strategy: 'all-at-once',
        hooks: {} as never,
      })
    ).toThrow('deploy hook');
  });
});

describe('Deployer concurrency', () => {
  it('runs all-at-once hooks concurrently', async () => {
    // Rendezvous, not stopwatch: each hook waits to observe every other
    // hook's arrival. Sequential execution deadlocks the first hook and
    // fails by timeout; overlapping execution completes instantly.
    const arrived = new Set<string>();
    let release!: () => void;
    const everyone = new Promise<void>(resolve => { release = resolve; });

    const deployer = Deployer.create({
      name: 'app',
      targets: ['a', 'b', 'c'],
      strategy: 'all-at-once',
      hooks: {
        deploy: async ctx => {
          arrived.add(ctx.target);
          if (arrived.size === 3) release();
          await everyone;
        },
      },
    });

    const result = await deployer.deploy('1.0.0');

    expect(result.success).toBe(true);
    expect(result.summary.succeeded).toBe(3);
  }, 10_000);

  it('exec resolves with the command output and exit code', async () => {
    let captured: { stdout: string; exitCode: number } | undefined;
    const deployer = Deployer.create({
      name: 'app',
      targets: ['web-1'],
      strategy: 'all-at-once',
      hooks: {
        deploy: async ctx => {
          captured = await ctx.exec`printf deploy-exec-ok`;
        },
      },
    });

    await deployer.deploy('1.0.0');

    expect(captured).toEqual({ stdout: 'deploy-exec-ok', exitCode: 0 });
  });

  it('exec reports a failing command without throwing', async () => {
    let captured: { stdout: string; exitCode: number } | undefined;
    const deployer = Deployer.create({
      name: 'app',
      targets: ['web-1'],
      strategy: 'all-at-once',
      hooks: {
        deploy: async ctx => {
          captured = await ctx.exec`exit 7`;
        },
      },
    });

    await deployer.deploy('1.0.0');

    expect(captured?.exitCode).toBe(7);
  });
});
