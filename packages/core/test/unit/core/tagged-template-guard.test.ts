import { ExecutionEngine, createCallableEngine } from '../../../src/index.js';

/**
 * `run`/`raw` iterate their first argument as template segments. Called as
 * ordinary functions they iterated a string's *characters* and spliced the
 * remaining arguments between them, silently producing a different command
 * than the caller wrote.
 */
describe('tagged-template misuse is rejected', () => {
  const engine = new ExecutionEngine();
  const $ = createCallableEngine(engine);

  afterAll(async () => {
    await engine.dispose();
  });

  it('rejects run() called with a plain string and options', () => {
    // Previously produced the command: e'{"cwd":"/tmp"}'cho hello
    expect(() => ($.run as unknown as (...args: unknown[]) => unknown)('echo hello', { cwd: '/tmp' }))
      .toThrow(TypeError);
  });

  it('rejects raw() called with a plain string', () => {
    expect(() => ($.raw as unknown as (...args: unknown[]) => unknown)('echo hello'))
      .toThrow(TypeError);
  });

  it('names the supported alternatives in the error', () => {
    let message = '';

    try {
      ($.run as unknown as (...args: unknown[]) => unknown)('echo hello', { cwd: '/tmp' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('$.execute(');
    expect(message).toContain('tagged template');
  });

  it('still accepts a genuine tagged template', async () => {
    const result = await $`echo tagged`;
    expect(result.stdout.trim()).toBe('tagged');
  });

  it('still accepts a plain array of segments', async () => {
    // Consumers with a command already in a variable pass `[command]`; that
    // form is unambiguous and must keep working.
    const result = await $.run(['echo array'] as unknown as TemplateStringsArray);
    expect(result.stdout.trim()).toBe('array');
  });
});
