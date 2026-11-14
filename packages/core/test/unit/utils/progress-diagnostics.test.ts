import type { ProgressEvent } from '../../../src/utils/progress.js';

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspect } from 'node:util';
import { randomUUID } from 'node:crypto';

import { ProgressReporter } from '../../../src/utils/progress.js';
import { LocalAdapter } from '../../../src/adapters/local/index.js';
import { sanitizeCommandForError } from '../../../src/core/error.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';

const secret = 'synthetic-progress-credential';
const diagnostics = (events: ProgressEvent[]) => inspect(events, { depth: null });
const collect = () => {
  const events: ProgressEvent[] = [];
  return { events, progress: { enabled: true, onProgress: (event: ProgressEvent) => events.push(event) } };
};

// Native processes exercise the same callback boundary used by raw kubectl capture.
// None of these commands contacts a service or reads credentials.
describe('progress diagnostics', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('redacts command diagnostics without altering raw output or progress counts', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node', sensitiveDataMasking: { enabled: false } });
    const { events, progress } = collect();
    const output = JSON.stringify({ token: secret }) + '\n';
    const result = await adapter.execute({
      command: process.execPath,
      args: ['-e', 'process.stdout.write(JSON.stringify({token:process.argv[2]})+"\\n")', '--', '--password', secret],
      shell: false, timeout: 3000, progress,
    });
    expect(result.stdout).toBe(output);
    expect(JSON.parse(result.stdout)).toEqual({ token: secret });
    expect(events[0]?.message).toContain('[REDACTED]');
    expect(diagnostics(events)).not.toContain(secret);
    expect(events.at(-1)).toMatchObject({ type: 'complete', data: { linesProcessed: 1, bytesProcessed: output.length } });
  });

  it('redacts overflow data in callbacks without changing the thrown error', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node', sensitiveDataMasking: { enabled: false } });
    const { events, progress } = collect();
    const failure = await adapter.execute({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("password="+process.argv[1]+"\\n"); setTimeout(()=>process.stdout.write("x".repeat(8192)),30)', '--', secret],
      shell: false, timeout: 3000, maxBuffer: 128, progress,
    }).catch(error => error);
    expect(failure).toMatchObject({ code: 'MAX_BUFFER_EXCEEDED' });
    expect(failure.partialStdout).toContain(secret);
    const diagnostic = events.find(event => event.type === 'error')!.data.error;
    expect(diagnostic).not.toBe(failure);
    expect(diagnostic).toMatchObject({ code: 'MAX_BUFFER_EXCEEDED', limit: failure.limit });
    // The command argument above is deliberately unlabeled; only the output
    // field has secret context. Test the error graph independently of start.
    expect(diagnostics(events.filter(event => event.type === 'error'))).not.toContain(secret);
    expect(diagnostic.partialStdout).toContain('[REDACTED]');
  });

  it('preserves native spawn diagnostics while masking separated credential arguments', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node', sensitiveDataMasking: { enabled: false } });
    const { events, progress } = collect();
    const command = join(tmpdir(), `xec-missing-${randomUUID()}`);
    const failure = await adapter.execute({ command, args: ['--password', secret], shell: false, timeout: 3000, progress }).catch(error => error);
    expect(failure.originalError).toMatchObject({ code: 'ENOENT', spawnargs: ['--password', secret] });
    const diagnostic = events.find(event => event.type === 'error')!.data.error;
    expect(diagnostic).toMatchObject({ code: 'ENOENT', path: command, spawnargs: ['--password', '[REDACTED]'] });
    expect(diagnostics(events)).not.toContain(secret);
    expect(failure.originalError.spawnargs[1]).toBe(secret);
  });

  it('copies nested causes and frozen errors without exposing or modifying their source', () => {
    const { events } = collect();
    const cause = new Error(`Authorization: Bearer ${secret}`);
    const failure = Object.assign(new Error(`password=${secret}`, { cause }), {
      code: 'SYNTHETIC_FAILURE', errno: 12,
      details: { password: secret, args: ['--client-secret', secret], count: 42 },
      partialStdout: Buffer.from(`token=${secret}`),
    });
    Object.defineProperty(failure, 'name', { value: 'FixtureError', writable: false });
    Object.freeze(failure);
    new ProgressReporter({ onProgress: event => events.push(event) }).error(failure);
    const diagnostic = events[0]?.data.error;
    expect(diagnostic).toBeInstanceOf(Error);
    expect(diagnostic).toMatchObject({ name: 'FixtureError', code: 'SYNTHETIC_FAILURE', errno: 12, details: { count: 42 } });
    expect(diagnostics(events)).not.toContain(secret);
    expect(failure.details.password).toBe(secret);
    expect(failure.partialStdout.toString()).toBe(`token=${secret}`);
    expect(failure.cause).toBe(cause);
    expect(cause.message).toContain(secret);
  });

  it('uses the same redaction for default console messages', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapter = new LocalAdapter({ forceImplementation: 'node', sensitiveDataMasking: { enabled: false } });
    await expect(adapter.execute({
      command: join(tmpdir(), `xec-missing-${randomUUID()}`), args: ['--password', secret],
      shell: false, timeout: 3000, progress: { enabled: true },
    })).rejects.toMatchObject({ originalError: { code: 'ENOENT' } });
    new ProgressReporter().error(new Error(`password=${secret}`));
    expect(inspect([...log.mock.calls, ...error.mock.calls])).not.toContain(secret);
    expect(inspect(log.mock.calls)).toContain('[REDACTED]');
    expect(inspect(error.mock.calls)).toContain('[REDACTED]');
  });

  it('preserves exact API data per command without changing shared redaction defaults', async () => {
    const engine = new ExecutionEngine();
    const { events, progress } = collect();
    const output = JSON.stringify({ token: secret });
    const script = 'process.stdout.write(JSON.stringify({token:process.argv[2]}));process.stderr.write("token="+process.argv[2])';
    try {
      const api = engine.with({ redactOutput: false, progress });
      const result = await api.run`${process.execPath} -e ${script} -- --token ${secret}`;
      expect(result.stdout).toBe(output);
      expect(result.stderr).toBe(`token=${secret}`);
      expect(result.json()).toEqual({ token: secret });
      expect(result.stdall).toContain(output);
      expect(diagnostics(events)).not.toContain(secret);
      const masked = await engine.run`${process.execPath} -e ${script} -- --token ${secret}`;
      expect(masked.stdout).not.toContain(secret);
      expect(masked.stderr).not.toContain(secret);
    } finally { await engine.dispose(); }
  });

  it('redacts failure objects even when the API result preserves raw output', async () => {
    const engine = new ExecutionEngine();
    const script = 'process.stdout.write("token="+process.argv[2]);process.stderr.write("password="+process.argv[2]);process.exitCode=7';
    try {
      const result = await engine.with({ redactOutput: false }).run`${process.execPath} -e ${script} -- --token ${secret}`.nothrow();
      expect(result.stdout).toBe(`token=${secret}`);
      expect(result.stderr).toBe(`password=${secret}`);
      let failure: unknown;
      try { result.throwIfFailed(); } catch (error) { failure = error; }
      expect(failure).toMatchObject({ exitCode: 7, stdout: expect.stringContaining('[REDACTED]'), stderr: expect.stringContaining('[REDACTED]') });
      expect(inspect(failure, { depth: null })).not.toContain(secret);
      expect(result.stdout).toContain(secret);
    } finally { await engine.dispose(); }
  });

  it('sanitizes JSON decoding diagnostics while retaining the failed source result', async () => {
    const engine = new ExecutionEngine();
    try {
      const result = await engine.with({ redactOutput: false }).run`${process.execPath} -e ${'process.stdout.write("{token="+process.argv[2])'} -- --token ${secret}`;
      expect(result.stdout).toContain(secret);
      let failure: unknown;
      try { result.json(); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect(inspect(failure, { depth: null })).not.toContain(secret);
    } finally { await engine.dispose(); }
  });


  it.each(['token', 'api-key', 'access_token', 'auth-token', 'password', 'client-secret'])('masks both CLI forms of --%s', flag => {
    expect(sanitizeCommandForError(`client --${flag} ${secret}`)).toBe(`client --${flag} [REDACTED]`);
    expect(sanitizeCommandForError(`client --${flag}="${secret} with space"`)).toBe(`client --${flag}=[REDACTED]`);
  });

});
