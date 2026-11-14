import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';

describe('Docker fluent command isolation', () => {
  it('keeps concurrent Compose environments scoped to their commands', async () => {
    const engine = new ExecutionEngine();
    const adapter = new MockAdapter({ defaultDelay: 20 });
    engine.registerAdapter('local', adapter);
    const execute = vi.spyOn(adapter, 'execute');
    const before = process.env['XEC_DOCKER_SCOPE_TEST'];
    const first = engine.docker().compose().withEnv({ XEC_DOCKER_SCOPE_TEST: 'first' }).ps();
    const second = engine.docker().compose().withEnv({ XEC_DOCKER_SCOPE_TEST: 'second' }).ps();
    expect(process.env['XEC_DOCKER_SCOPE_TEST']).toBe(before);
    await Promise.all([first, second]);
    expect(execute.mock.calls.map(([command]) => command.env?.['XEC_DOCKER_SCOPE_TEST']).sort())
      .toEqual(['first', 'second']);
    expect(process.env['XEC_DOCKER_SCOPE_TEST']).toBe(before);
  });

  it('limits BuildKit to the requested build and preserves the host setting', async () => {
    const engine = new ExecutionEngine();
    const adapter = new MockAdapter();
    engine.registerAdapter('local', adapter);
    const execute = vi.spyOn(adapter, 'execute');
    const before = process.env['DOCKER_BUILDKIT'];
    await engine.docker().build('.', 'fixture:latest').buildWithBuildKit();
    expect(execute.mock.calls[0]?.[0].env?.['DOCKER_BUILDKIT']).toBe('1');
    expect(process.env['DOCKER_BUILDKIT']).toBe(before);
  });

  it('reports an ephemeral running container from Docker inspect state', async () => {
    const engine = new ExecutionEngine();
    const adapter = new MockAdapter();
    adapter.mockSuccess(/ps/, JSON.stringify({ ID: 'a'.repeat(64), Names: 'fixture' }));
    adapter.mockSuccess(/inspect/, JSON.stringify([{
      Id: 'a'.repeat(64), Name: '/fixture', Config: { Image: 'alpine' },
      State: { Status: 'running' }, NetworkSettings: { Ports: {}, Networks: {} },
      Created: '2026-01-01T00:00:00Z',
    }]));
    engine.registerAdapter('local', adapter);
    const status = await engine.docker().ephemeral('alpine').name('fixture').status();
    expect(status.running).toBe(true);
    expect(status.healthy).toBe(true);
  });

  it('preserves entrypoint argv and quotes exec-form health commands', () => {
    const engine = new ExecutionEngine();
    const container = engine.docker().ephemeral('alpine')
      .entrypoint(['tini', '--'])
      .healthcheck(['CMD', 'printf', 'literal; data']);
    const args = (container as unknown as { buildRunArgs(): string[] }).buildRunArgs();
    expect(args.slice(args.indexOf('--entrypoint'))).toEqual(['--entrypoint', 'tini', 'alpine', '--']);
    expect(args[args.indexOf('--health-cmd') + 1]).toBe("printf 'literal; data'");
  });

  it('passes a zero log tail to Compose', async () => {
    const engine = new ExecutionEngine();
    const adapter = new MockAdapter();
    engine.registerAdapter('local', adapter);
    await engine.docker().compose().logs('api', false, 0);
    expect(adapter.getExecutedCommands().join(' ')).toContain('--tail 0');
  });
});
