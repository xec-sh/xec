import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * Root options act on every dispatch path, not only the commander one.
 *
 * `--cwd` and `--no-color` were applied in a commander preAction hook, which
 * never runs for the paths that bypass parseAsync: an eval, a task, a direct
 * command. `xec --cwd /x -e ...` evaluated in the old directory; and task
 * parameters obeyed a different grammar at the root than under `run` —
 * `--who=a=b` lost its tail, a valueless flag vanished, `-p` was unknown.
 */
describe('root dispatch', () => {
  let dir: string;
  let origin: string;
  let selected: string;

  const run = (
    cliArgs: string[],
    cwd?: string,
    entry = CLI
  ): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      const env = { ...process.env };
      delete env['NO_COLOR'];
      delete env['FORCE_COLOR'];
      delete env['XEC_COMMANDS_PATH'];
      execFile(process.execPath, [entry, ...cliArgs], { cwd: cwd ?? dir, env }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-dispatch-'));
    await fs.mkdir(path.join(dir, '.xec'));
    await fs.writeFile(
      path.join(dir, '.xec', 'config.yaml'),
      [
        'name: dispatch-test',
        'tasks:',
        '  greet:',
        '    params:',
        '      - name: who',
        '        required: true',
        '    command: echo "P=${params.who}"',
      ].join('\n')
    );
    origin = path.join(dir, 'origin');
    selected = path.join(dir, 'selected', 'work space');
    for (const project of [origin, selected]) {
      await fs.mkdir(path.join(project, '.xec', 'commands'), { recursive: true });
    }
    await fs.writeFile(path.join(origin, '.xec', 'config.yaml'), 'name: origin-project\n');
    await fs.writeFile(path.join(selected, '.xec', 'config.yaml'), 'name: selected-project\n');
    await fs.writeFile(path.join(origin, '.xec', 'commands', 'probe.mjs'), [
      'export function command(program) {',
      "  program.command('probe').alias('pb').action(() => console.log('WRONG_PROJECT'));",
      '}',
    ].join('\n'));
    await fs.writeFile(path.join(origin, '.xec', 'commands', 'origin-only.mjs'), [
      'export function command(program) {',
      "  program.command('origin-only').action(() => console.log('WRONG_PROJECT'));",
      '}',
    ].join('\n'));
    await fs.writeFile(path.join(selected, '.xec', 'commands', 'probe.mjs'), [
      'const loaded = { cwd: process.cwd(), color: process.env.NO_COLOR };',
      'export function command(program) {',
      "  program.command('probe').alias('pb').option('-e, --env <value>').action((options, command) => {",
      "    console.log('DISPATCH=' + JSON.stringify({ loaded, cwd: process.cwd(), color: process.env.NO_COLOR, value: options.env, verbose: command.optsWithGlobals().verbose }));",
      '  });',
      '}',
    ].join('\n'));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('applies --cwd on the eval path', async () => {
    const { output } = await run(['--cwd', os.tmpdir(), '-e', 'console.log("CWD=" + process.cwd())']);
    const line = output.split('\n').find(l => l.startsWith('CWD='));
    expect(line, output).toBeDefined();
    expect(await fs.realpath(line!.slice(4))).toBe(await fs.realpath(os.tmpdir()));
  }, 60_000);

  it('rejects a --cwd that does not exist', async () => {
    const { code, output } = await run(['--cwd', '/no/such/dir', '-e', '1']);
    expect(output).toContain("Cannot change directory to '/no/such/dir'");
    expect(code).not.toBe(0);
  }, 60_000);

  it('applies --no-color on the eval path', async () => {
    const { output } = await run(['--no-color', '-e', 'console.log("NC=" + process.env.NO_COLOR)']);
    expect(output).toContain('NC=1');
  }, 60_000);

  it.each(['probe', 'pb'])('discovers %s in the absolute --cwd project', async command => {
    const { code, output } = await run(['--cwd', selected, '--verbose', command, '-e', 'child-value'], origin);
    expect(code, output).toBe(0);
    expect(output).not.toContain('WRONG_PROJECT');
    const line = output.split(/\r?\n/).find(value => value.startsWith('DISPATCH='));
    expect(line, output).toBeDefined();
    const result = JSON.parse(line!.slice('DISPATCH='.length));
    expect(await fs.realpath(result.loaded.cwd)).toBe(await fs.realpath(selected));
    expect(await fs.realpath(result.cwd)).toBe(await fs.realpath(selected));
    expect(result.value).toBe('child-value');
    expect(result.verbose).toBe(true);
  }, 60_000);

  it.each(['--cwd', '--cwd='])('applies relative %s once before loading a command', async spelling => {
    const directory = path.relative(origin, selected);
    const args = spelling === '--cwd' ? [spelling, directory] : [spelling + directory];
    const { code, output } = await run([...args, 'probe'], origin);
    expect(code, output).toBe(0);
    const line = output.split(/\r?\n/).find(value => value.startsWith('DISPATCH='));
    expect(line, output).toBeDefined();
    const result = JSON.parse(line!.slice('DISPATCH='.length));
    expect(await fs.realpath(result.loaded.cwd)).toBe(await fs.realpath(selected));
    expect(await fs.realpath(result.cwd)).toBe(await fs.realpath(selected));
  }, 60_000);

  it('uses only the selected project for command discovery in help', async () => {
    const { code, output } = await run(['--cwd', selected, '--help'], origin);
    expect(code, output).toBe(0);
    expect(output).toContain('probe');
    expect(output).not.toContain('origin-only');
  }, 60_000);

  it.each(['config', 'cfg'])('applies relative --cwd once for the built-in %s command', async command => {
    const { code, output } = await run(['--cwd', path.relative(origin, selected), command, 'get', 'name'], origin);
    expect(code, output).toBe(0);
    expect(output).toContain('selected-project');
    expect(output).not.toContain('origin-project');
  }, 60_000);

  it('passes the resolved cwd to direct command execution', async () => {
    const { code, output } = await run(['--cwd', path.relative(origin, selected), '--', 'node', '-p', '"process.cwd()"'], origin);
    expect(code, output).toBe(0);
    expect(output).toContain(await fs.realpath(selected));
  }, 60_000);

  it('applies --no-color before a dynamic module loads and keeps it for its action', async () => {
    const { code, output } = await run(['--no-color', '--cwd', selected, 'probe'], origin);
    expect(code, output).toBe(0);
    const line = output.split(/\r?\n/).find(value => value.startsWith('DISPATCH='));
    expect(line, output).toBeDefined();
    const result = JSON.parse(line!.slice('DISPATCH='.length));
    expect(result.loaded.color).toBe('1');
    expect(result.color).toBe('1');
  }, 60_000);

  it('loads a deferred command from parsed arguments, preserving root option values', async () => {
    const driver = path.join(dir, 'deferred-dispatch.mjs');
    await fs.writeFile(driver, [
      `import { createProgram, loadCommands } from ${JSON.stringify(pathToFileURL(CLI).href)};`,
      'const program = createProgram();',
      // No requested command: exercise the lazy fallback with an explicit
      // parseAsync input that is deliberately different from process.argv.
      'await loadCommands(program);',
      "await program.parseAsync(['--cwd', 'already-consumed', '--verbose', 'pb', '-e', 'deferred'], { from: 'user' });",
    ].join('\n'));
    const { code, output } = await run([], selected, driver);
    expect(code, output).toBe(0);
    const line = output.split(/\r?\n/).find(value => value.startsWith('DISPATCH='));
    expect(line, output).toBeDefined();
    const result = JSON.parse(line!.slice('DISPATCH='.length));
    expect(result.value).toBe('deferred');
    expect(result.verbose).toBe(true);
    expect(await fs.realpath(result.cwd)).toBe(await fs.realpath(selected));
  }, 60_000);

  it('keeps every = in a root task parameter value', async () => {
    const { output } = await run(['greet', '--who=a=b']);
    expect(output).toContain('P=a=b');
  }, 60_000);

  it('accepts --key value and -p key=value for a root task alike', async () => {
    expect((await run(['greet', '--who', 'space'])).output).toContain('P=space');
    expect((await run(['greet', '-p', 'who=pair'])).output).toContain('P=pair');
  }, 60_000);

  it('accepts --key value under run as -p does', async () => {
    expect((await run(['run', 'greet', '--who', 'viarun'])).output).toContain('P=viarun');
    expect((await run(['run', 'greet', '-p', 'who=viap'])).output).toContain('P=viap');
  }, 60_000);

  it('refuses a stray positional after a task name', async () => {
    const { code, output } = await run(['greet', 'stray', '--who', 'x']);
    expect(output).toContain("Unexpected argument for task 'greet': stray");
    expect(code).not.toBe(0);
  }, 60_000);

  it('leaves -e alone after the command word', async () => {
    // Before the boundary, any -e anywhere in argv switched the whole
    // invocation into eval mode - even a script's own arguments.
    const script = path.join(dir, 'echo-args.mjs');
    await fs.writeFile(script, "console.log('GOT', JSON.stringify(process.argv.slice(2)))\n");
    const { output } = await run([script, '-e', 'payload']);
    expect(output).toContain('"-e"');
    expect(output).not.toContain('Evaluating');
  }, 60_000);
});
