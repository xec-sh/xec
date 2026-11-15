import type { TaskDefinition, ResolvedTarget } from '../../../src/config/types.js';

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { rm, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';

import { TaskExecutor } from '../../../src/config/task-executor.js';
import { TargetResolver } from '../../../src/config/target-resolver.js';
import { VariableInterpolator } from '../../../src/config/variable-interpolator.js';

// Only synthetic local targets: exercise ordinary resolution and native command
// execution without touching a real host, container or application.
class FixtureTargets extends TargetResolver {
  constructor(private readonly directories: Record<string, string>) { super({ version: '1.0' }); }
  override async resolve(ref: string): Promise<ResolvedTarget> {
    if (ref === 'local') return super.resolve(ref);
    const cwd = this.directories[ref];
    if (!cwd) throw new Error(`Unknown fixture target: ${ref}`);
    return { id: ref, type: 'local', source: 'configured', config: { type: 'local', workdir: cwd, timeout: 500, env: { TARGET: ref } } };
  }
}

const node = (source: string) => `node -e '${source}'`;
const readArgs = node('process.stdout.write(JSON.stringify(process.argv.slice(1)))') + ' -- ';
const write = (name: string, content = 'written') => node(`require("node:fs").writeFileSync(${JSON.stringify(name)},${JSON.stringify(content)})`);

describe('task execution safety contract', () => {
  let directory: string;
  let targets: FixtureTargets;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xec-task-safety-'));
    await Promise.all(['one', 'two', 'explicit'].map(name => mkdir(join(directory, name))));
    targets = new FixtureTargets({ one: join(directory, 'one'), two: join(directory, 'two') });
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
  const executor = (dryRun = false, tasks: Record<string, TaskDefinition> = {}) => new TaskExecutor({
    interpolator: new VariableInterpolator(), targetResolver: targets, dryRun,
    taskRegistry: name => tasks[name],
  });

  it.skipIf(process.platform === 'win32')('never promotes parameters or environment data to command source', async () => {
    const marker = join(directory, 'injected');
    const value = `'; touch ${marker}; echo "$(touch ${marker})" \`touch ${marker}\`\n\\\${cmd:touch ${marker}}`;
    for (const quote of ['', "'", '"']) {
      const result = await executor().execute('quoted', { command: readArgs + quote + '${params.value}' + quote }, { params: { value }, quiet: true });
      expect(result.success, result.error?.message).toBe(true);
      expect(JSON.parse(result.output!)).toEqual([value]);
    }
    const fromEnv = await executor().execute('env', { command: readArgs + '${env.PAYLOAD}' }, { env: { PAYLOAD: value }, quiet: true });
    expect(fromEnv.success, fromEnv.error?.message).toBe(true);
    expect(JSON.parse(fromEnv.output!)).toEqual([value]);
    expect(existsSync(marker)).toBe(false);
  });

  it('keeps registered output terminal even when it contains an executable template', async () => {
    const marker = join(directory, 'injected');
    const payload = '${cmd:touch ' + marker + '}';
    const file = join(directory, 'data.txt');
    await writeFile(file, payload);
    const result = await executor().execute('register', { steps: [
      { command: node(`process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(file)}))`), register: 'data' },
      { command: readArgs + '${vars.data}' },
    ] }, { quiet: true });
    expect(result.success, result.error?.message).toBe(true);
    expect(JSON.parse(result.steps![1]!.output!)).toEqual([payload]);
    expect(existsSync(marker)).toBe(false);
  });

  it('does not execute commands, scripts, conditions or error handlers in a preview', async () => {
    const marker = join(directory, 'effect');
    const script = join(directory, 'effect.mjs');
    await writeFile(script, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'bad');`);
    for (const definition of [
      { script },
      { command: '${cmd:' + write(marker) + '}' },
      { steps: [{ script, when: '${cmd:' + write(marker) + '}' }] },
      { steps: [{ task: 'child' }] },
    ] satisfies TaskDefinition[]) {
      const result = await executor(true, { child: { script } }).execute('preview', {
        ...definition, onError: { command: write(marker) },
      }, { quiet: true });
      expect(result.success, result.error?.message).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(existsSync(marker)).toBe(false);
    }
  });

  it('inherits target, environment and working directory through pipeline and nested tasks', async () => {
    const result = await executor(false, { child: { command: node('process.stdout.write(JSON.stringify({cwd:process.cwd(),target:process.env.TARGET,value:process.env.VALUE}))') } })
      .execute('parent', { target: 'one', workdir: join(directory, 'explicit'), env: { VALUE: 'parent' }, steps: [{ task: 'child' }] }, { quiet: true });
    expect(result.success, result.error?.message).toBe(true);
    expect(JSON.parse(result.steps![0]!.output!)).toEqual({ cwd: await realpath(join(directory, 'explicit')), target: 'one', value: 'parent' });
  });

  it('applies an inherited timeout and never retries an unconfirmed command outcome', async () => {
    const marker = join(directory, 'late');
    const result = await executor().execute('timeout', { timeout: '30ms', steps: [{
      command: node(`setTimeout(()=>require("node:fs").writeFileSync(${JSON.stringify(marker)},"bad"),250)`),
      onFailure: { retry: 2, delay: '0ms' },
    }] }, { quiet: true });
    expect(result.success).toBe(false);
    expect(result.steps![0]!.error).toBeDefined();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(existsSync(marker)).toBe(false);
  });

  it('uses target command defaults before the executor fallback', async () => {
    const current = new TaskExecutor({ interpolator: new VariableInterpolator(), targetResolver: targets, defaultTimeout: 1 });
    const result = await current.execute('target-default', { target: 'one', steps: [{ command: node('setTimeout(()=>console.log("finished"),30)') }] }, { quiet: true });
    expect(result.success, result.error?.message).toBe(true);
  });

  it('preserves timeout zero as an explicit no-timeout override', async () => {
    const current = new TaskExecutor({ interpolator: new VariableInterpolator(), targetResolver: targets, defaultTimeout: 5 });
    const result = await current.execute('zero', { timeout: 0, steps: [{ command: node('setTimeout(()=>console.log("finished"),60)') }] }, { quiet: true });
    expect(result.success, result.error?.message).toBe(true);
  });

  it.each([false, true])('runs cleanup after failure, with deterministic indexed results (parallel=%s)', async parallel => {
    const result = await executor().execute('cleanup', { parallel, ...(parallel ? { maxConcurrent: 1 } : {}), steps: [
      { name: 'duplicate', command: node('process.exit(7)') },
      { name: 'duplicate', command: write(join(directory, 'forbidden')) },
      { name: 'duplicate', alwaysRun: true, command: write(join(directory, 'cleanup')) },
    ] }, { quiet: true });
    expect(result.success).toBe(false);
    expect(result.steps!.map(step => step.index)).toEqual([0, 1, 2]);
    expect(result.steps![1]).toMatchObject({ skipped: true, success: false, skipReason: 'failure' });
    expect(existsSync(join(directory, 'forbidden'))).toBe(false);
    expect(existsSync(join(directory, 'cleanup'))).toBe(true);
  });

  it('waits for every started parallel operation before cleanup', async () => {
    const done = join(directory, 'settled');
    const result = await executor().execute('parallel', { parallel: true, maxConcurrent: 2, steps: [
      { command: node('process.exit(7)') },
      { command: node(`setTimeout(()=>require("node:fs").writeFileSync(${JSON.stringify(done)},"done"),80)`) },
      { command: write(join(directory, 'forbidden')) },
      { alwaysRun: true, command: node(`if(!require("node:fs").existsSync(${JSON.stringify(done)}))process.exit(9)`) },
    ] }, { quiet: true });
    expect(result.success).toBe(false);
    expect(result.steps![3]!.success).toBe(true);
    expect(existsSync(join(directory, 'forbidden'))).toBe(false);
  });

  it('uses source index rather than duplicate names to classify failure', async () => {
    const result = await executor().execute('duplicates', { steps: [
      { name: 'same', command: node('process.exit(7)'), onFailure: 'ignore' },
      { name: 'same', command: node('process.exit(7)') },
    ] }, { quiet: true });
    expect(result.success).toBe(false);
  });

  it('executes all explicit command targets and validates the entire list before effects', async () => {
    const result = await executor().execute('targets', { targets: ['one', 'two'], command: write('visited') }, { quiet: true });
    expect(result.success, result.error?.message).toBe(true);
    for (const target of ['one', 'two']) expect(await readFile(join(directory, target, 'visited'), 'utf8')).toBe('written');
    const refused = await executor().execute('invalid', { targets: ['one', 'missing'], command: write('should-not-exist') }, { quiet: true });
    expect(refused.success).toBe(false);
    expect(existsSync(join(directory, 'one', 'should-not-exist'))).toBe(false);
  });

  it.each(['command', 'task'] as const)('records %s recovery without converting the original failure into success', async kind => {
    const marker = join(directory, 'recovered');
    const handler = kind === 'task' ? { task: 'recover' } : { command: write(marker) };
    const result = await executor(false, { recover: { command: write(marker) } }).execute('failure', { steps: [{ command: node('process.exit(7)'), onFailure: handler }] }, { quiet: true });
    expect(result.success).toBe(false);
    expect(result.steps![0]!.success).toBe(false);
    expect(result.steps![0]!.recovery?.success).toBe(true);
    expect(existsSync(marker)).toBe(true);
  });

  it('rejects malformed failure handlers before any step can run', async () => {
    for (const onFailure of [null, [], { command: 5 }, { delay: null, retry: 1 }]) {
      const marker = join(directory, 'should-not-start');
      const task = { steps: [
        { command: write(marker), onFailure },
        { command: node('process.exit(7)') },
        { command: 'node --version', alwaysRun: true },
      ] } as unknown as TaskDefinition;
      const result = await executor().execute('invalid-handler', task, { quiet: true });
      expect(result.success).toBe(false);
      expect(result.error?.name).toBe('TaskParseError');
      expect(existsSync(marker)).toBe(false);
    }
  });

  it('rejects unsupported targets and retry combinations before effects', async () => {
    for (const task of [
      { targets: ['one', 'two'], script: 'never-loaded.mjs' },
      { targets: ['one'], steps: [{ command: 'true' }] },
      { steps: [{ targets: ['one', 'two'], command: 'true', onFailure: { retry: 1 } }] },
    ] satisfies TaskDefinition[]) expect((await executor().execute('invalid', task)).success).toBe(false);
  });
});
