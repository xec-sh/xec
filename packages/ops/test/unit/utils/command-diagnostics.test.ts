import { it, vi, expect, describe, afterEach } from 'vitest';
import { $, CommandError, sanitizeCommandForError } from '@xec-sh/core';

import { handleError } from '../../../src/utils/error-handler.js';
import { EnhancedCommandError } from '../../../src/utils/enhanced-error.js';

function capture(error: Error, options: Parameters<typeof handleError>[1] = {}) {
  const lines: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => lines.push(args.join(' ')));
  vi.spyOn(process, 'exit').mockImplementation(code => { throw new Error(`exit:${code}`); });
  let exit: unknown;
  try { handleError(error, options); } catch (value) { exit = value; }
  return { text: lines.join('\n'), exit };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('command failure diagnostics', () => {
  it('keeps native stdout and stderr in ordinary failure diagnostics', async () => {
    const error = await $.local().exec(process.execPath, {
      shell: false, args: ['-e', 'process.stdout.write(process.env.XEC_TEST_STDOUT);process.stderr.write(process.env.XEC_TEST_STDERR);process.exitCode=7'],
      env: { XEC_TEST_STDOUT: 'stdout-evidence', XEC_TEST_STDERR: 'stderr-evidence' },
    }).catch(value => value);
    expect(error).toBeInstanceOf(CommandError);
    const result = capture(error);
    expect(result.exit).toMatchObject({ message: 'exit:7' });
    expect(result.text).toContain('stdout-evidence');
    expect(result.text).toContain('stderr-evidence');
  });

  it('keeps exit status and bounded redacted output in JSON', () => {
    const error = new CommandError('tool --token private-command', 7, undefined,
      'first\ntoken=private-output\n' + 'z'.repeat(70_000), 'stderr-evidence', 42);
    error.cause = new Error('cause password=private-cause');
    const result = capture(error, { output: 'json' });
    const document = JSON.parse(result.text);
    expect(document).toMatchObject({ exitCode: 7, stdout: expect.stringContaining('first'), stderr: 'stderr-evidence' });
    expect(document.outputTruncated).toEqual({ stdout: true, stderr: false });
    expect(Buffer.byteLength(document.stdout)).toBeLessThanOrEqual(16_384);
    expect(result.text).toContain('[REDACTED]');
    expect(result.text).not.toMatch(/private-(command|output|cause)/);
    expect(document.causes[0].message).toContain('cause');
  });

  it('uses the same safe preview for text and JSON without mutating source output', () => {
    const error = new EnhancedCommandError('tool', 4, 'SIGTERM', 'start\n' + '😀'.repeat(9_000), 'password=private-output', 1);
    const original = error.stdout;
    const text = error.format();
    const document = JSON.parse(capture(error, { output: 'json' }).text);
    expect(document.signal).toBe('SIGTERM');
    expect(document.outputTruncated).toEqual({ stdout: true, stderr: false });
    expect(text).toContain(document.stdout);
    expect(text).toContain('truncated');
    expect(text).toContain(sanitizeCommandForError(error.stderr));
    expect(text).not.toContain('private-output');
    expect(document.stdout).not.toContain('�');
    expect(error.stdout).toBe(original);
  });

  it('preserves an explicit failed-command exit code in quiet mode', () => {
    const result = capture(new CommandError('tool', 7, undefined, 'data', 'error', 1), { quiet: true });
    expect(result.exit).toMatchObject({ message: 'exit:7' });
    expect(result.text).toBe('');
  });

  it('retains a machine-readable error even when presentation is quiet', () => {
    const result = capture(new CommandError('tool', 7, undefined, 'output', 'error', 1), { output: 'json', quiet: true });
    expect(result.exit).toMatchObject({ message: 'exit:7' });
    expect(JSON.parse(result.text)).toMatchObject({ exitCode: 7, stdout: 'output' });
  });

  it('redacts debug fields and keeps JSON a single document', () => {
    vi.stubEnv('XEC_DEBUG', 'true');
    const error = Object.assign(new Error('failure password=private-message'), { code: 'EACCES', path: 'token=private-path' });
    error.stack = 'stack password=private-stack';
    const result = capture(error, { output: 'json' });
    expect(() => JSON.parse(result.text)).not.toThrow();
    expect(result.text).not.toMatch(/private-(message|path|stack)/);
  });
});
