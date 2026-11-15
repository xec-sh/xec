import { dirname } from 'node:path';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { Pipeline } from '../../src/pipeline/index.js';
import { releaseCommand, ReleaseCommandError, type ReleaseCommandEvent } from '../../src/release/command.js';

const script = 'process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith("XEC_ENV_MODE_")))));';
afterEach(() => vi.unstubAllEnvs());

describe('operation environment replacement', () => {
  it('releaseCommand excludes an ambient secret and honors explicit executable PATH', async () => {
    vi.stubEnv('XEC_ENV_MODE_AMBIENT', 'must-not-inherit');
    const result = await releaseCommand(process.cwd(), process.platform === 'win32' ? 'node.exe' : 'node', ['-e', script], {
      envMode: 'replace', env: { PATH: dirname(process.execPath), XEC_ENV_MODE_SELECTED: 'selected' },
    });
    expect(JSON.parse(result)).toEqual({ XEC_ENV_MODE_SELECTED: 'selected' });
  });

  it('releaseCommand default still merges the host environment', async () => {
    vi.stubEnv('XEC_ENV_MODE_AMBIENT', 'inherited');
    const result = await releaseCommand(process.cwd(), process.execPath, ['-e', script], {
      env: { XEC_ENV_MODE_SELECTED: 'selected' },
    });
    expect(JSON.parse(result)).toEqual({ XEC_ENV_MODE_AMBIENT: 'inherited', XEC_ENV_MODE_SELECTED: 'selected' });
  });

  it('Pipeline replacement excludes ambient, pipeline, run, matrix and step variables', async () => {
    vi.stubEnv('XEC_ENV_MODE_AMBIENT', 'must-not-inherit');
    const result = await Pipeline.create('exact-environment').env({ XEC_ENV_MODE_PIPELINE: 'pipeline' })
      .step('selected', { matrix: { XEC_ENV_MODE_MATRIX: ['matrix'] }, env: { XEC_ENV_MODE_STEP: 'step' },
        run: { command: process.execPath, args: ['-e', script], envMode: 'replace', env: { XEC_ENV_MODE_SELECTED: 'selected' } },
      }).run({ env: { XEC_ENV_MODE_RUN: 'run' } });
    expect(result.success).toBe(true);
    expect(JSON.parse(result.steps[0]!.stdout)).toEqual({ XEC_ENV_MODE_SELECTED: 'selected' });
  });

  it('releaseCommand keeps streaming redaction, child status and output limits in replacement mode', async () => {
    let streamed = '';
    await expect(releaseCommand(process.cwd(), process.execPath, ['-e', 'process.stdout.write("x".repeat(200)+"value-private");process.exitCode=7'], {
      envMode: 'replace', env: {}, outputLimit: 32, redact: ['value-private'],
      onEvent: event => { if (event.type === 'command-output') streamed += event.text; },
    })).rejects.toMatchObject({ status: 7, stdout: expect.stringMatching(/\[redacted\]$/) });
    expect(streamed).toBe('x'.repeat(200) + '[redacted]');
  });

  it('releaseCommand cancellation still waits for its owned local process', async () => {
    const controller = new AbortController();
    const events: ReleaseCommandEvent[] = [];
    let pid = 0;
    await expect(releaseCommand(process.cwd(), process.execPath, ['-e', 'console.log(process.pid);setInterval(()=>{},1000)'], {
      envMode: 'replace', env: {}, signal: controller.signal,
      onEvent: event => {
        events.push(event);
        if (event.type === 'command-output') { pid = Number(event.text.trim()); controller.abort(); }
      },
    })).rejects.toBeInstanceOf(ReleaseCommandError);
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(events.at(-1)).toMatchObject({ type: 'command-complete', cancelled: true });
  });
});
