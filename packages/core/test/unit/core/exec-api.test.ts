import { ExecutionEngine, createCallableEngine } from '../../../src/index.js';

/**
 * Commands frequently arrive as strings — from a config file, a database row,
 * or an agent. That path used to be second-class: `execute()` returns a bare
 * promise with no `.nothrow()`, `.quiet()` or `.pipe()`, and the template tag
 * corrupts a string handed to it directly. `exec()` is the first-class path.
 */
describe('$.exec', () => {
  const engine = new ExecutionEngine();
  const $ = createCallableEngine(engine);

  afterAll(async () => {
    await engine.dispose();
  });

  it('runs a command held in a variable', async () => {
    const command = 'echo from-a-variable';
    const result = await $.exec(command);

    expect(result.stdout.trim()).toBe('from-a-variable');
    expect(result.exitCode).toBe(0);
  });

  it('returns a chainable promise, unlike execute()', async () => {
    const result = await $.exec('exit 3').nothrow();

    expect(result.exitCode).toBe(3);
    expect(result.ok).toBe(false);
  });

  it('applies per-command options', async () => {
    const result = await $.exec('pwd', { cwd: '/tmp' });
    // macOS reports /tmp as a symlink to /private/tmp.
    expect(result.stdout.trim()).toMatch(/^(\/private)?\/tmp$/);
  });

  it('passes environment variables through', async () => {
    const result = await $.exec('echo "$XEC_EXEC_TEST"', { env: { XEC_EXEC_TEST: 'present' } });
    expect(result.stdout.trim()).toBe('present');
  });

  it('throws on a non-zero exit by default', async () => {
    await expect($.exec('exit 1')).rejects.toThrow();
  });

  it('passes the command through verbatim rather than re-quoting it', async () => {
    // The caller supplied a command line, not a template — a pipeline must
    // stay a pipeline.
    const result = await $.exec('echo one two three | wc -w');
    expect(result.stdout.trim()).toBe('3');
  });

  it('rejects a non-string command instead of stringifying it', () => {
    expect(() => ($.exec as unknown as (c: unknown) => unknown)({ command: 'echo hi' })).toThrow(
      TypeError
    );
  });

  it('names exec in the error when the template tag is misused', () => {
    let message = '';

    try {
      ($.run as unknown as (...args: unknown[]) => unknown)('echo hello', { cwd: '/tmp' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('$.exec(');
  });
});
