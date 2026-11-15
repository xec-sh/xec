import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { BaseCommand, SubcommandBase } from '../../src/utils/command-base.js';

vi.mock('@xec-sh/ops', async importOriginal => ({
  ...await importOriginal<typeof import('@xec-sh/ops')>(),
  handleError(error: unknown) { throw error; },
}));

class Probe extends BaseCommand {
  result: Record<string, unknown> = {};
  constructor(defaults: Record<string, unknown>) {
    super({ name: 'probe', configurationDefaults: true, description: 'Defaults contract', options: [
      { flags: '--count <n>', description: 'Count', defaultValue: 10, parser: value => Number(value) },
      { flags: '--label <text>', description: 'Label', defaultValue: 'fallback' },
      { flags: '--enabled', description: 'Enable', defaultValue: true },
      { flags: '--no-enabled', description: 'Disable' },
    ] });
    this.xecConfig = { version: '1.0', commands: { probe: defaults } };
  }
  async execute(args: unknown[]): Promise<void> {
    this.result = this.applyDefaults(args.at(-1) as Record<string, unknown>, this.getCommandDefaults());
  }
}

async function run(defaults: Record<string, unknown>, args: string[] = []) {
  const probe = new Probe(defaults);
  const program = new Command().exitOverride();
  program.addCommand(probe.create());
  await program.parseAsync(['probe', ...args], { from: 'user' });
  return probe.result;
}

describe('native command default precedence', () => {
  it('uses configuration instead of parser defaults', async () => {
    expect(await run({ count: 3, label: 'configured', enabled: false })).toMatchObject({
      count: 3, label: 'configured', enabled: false,
    });
  });
  it('retains explicit CLI false, zero and empty string', async () => {
    expect(await run({ count: 3, label: 'configured', enabled: true },
      ['--count', '0', '--label', '', '--no-enabled'])).toMatchObject({ count: 0, label: '', enabled: false });
  });
  it('retains parser defaults when configuration is absent', async () => {
    expect(await run({})).toMatchObject({ count: 10, label: 'fallback', enabled: true });
  });
  it('rejects misspelled config options before the command can use them', async () => {
    await expect(run({ maxConcurent: 2 })).rejects.toThrow(/Unknown.*commands.probe.maxConcurent/);
  });
  it('rejects an array for a scalar option instead of silently retaining the last element', async () => {
    await expect(run({ count: [1, 2] })).rejects.toThrow('not a repeatable option');
  });
  it('does not let configuration select preview, trust or output mode', async () => {
    for (const key of ['dryRun', 'config', 'output']) {
      await expect(run({ [key]: key === 'dryRun' ? false : 'value' })).rejects.toThrow(/invocation-only/);
    }
  });
  it('uses native subcommand option sources for nested defaults', async () => {
    class Group extends SubcommandBase {
      result: Record<string, unknown> = {};
      constructor() {
        super({ name: 'group', configurationDefaults: true, description: 'Nested defaults' });
        this.xecConfig = { version: '1.0', commands: { group: { sub: { count: 4 } } } };
      }
      protected setupSubcommands(command: Command): void {
        command.command('sub').option('--count <n>', 'Count', Number, 10)
          .action(options => { this.result = this.applyDefaults(options, this.getCommandDefaults()); });
      }
    }
    const group = new Group();
    await group.create().exitOverride().parseAsync(['sub'], { from: 'user' });
    expect(group.result.count).toBe(4);
  });
});
