import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect, describe } from 'vitest';
import { rm, mkdtemp, readdir } from 'node:fs/promises';

import { Pipeline } from '../../src/pipeline/index.js';
import { prepareScript } from '../../src/script/index.js';

describe('isolated TypeScript automation', () => {
  it('runs TypeScript and Xec in a child without modifying the parent', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'xec-script-test-'));
    const script = await prepareScript('const n: number = 42; console.log(n, process.pid, params.value); console.log((await $target`printf xec`).stdout); globalThis.parentMutation = true;',
      { cwd, params: { value: 'a; exit 99' } });
    try {
      const result = await Pipeline.create('script').step('run', { run: script.command }).run();
      expect(result.status).toBe('success');
      expect(result.steps[0]?.stdout).toContain('42');
      expect(result.steps[0]?.stdout).toContain('a; exit 99');
      expect(result.steps[0]?.stdout).toContain('xec');
      expect(result.steps[0]?.stdout).not.toContain(String(process.pid));
      expect((globalThis as Record<string, unknown>).parentMutation).toBeUndefined();
      expect(script.command.args?.join(' ')).not.toContain('a; exit 99');
    } finally { await script.dispose(); }
    expect(await readdir(cwd)).toEqual([]);
    await rm(cwd, { recursive: true });
  });
  it('propagates a script failure with stderr', async () => {
    const script = await prepareScript('throw new Error("script failure")');
    try {
      const result = await Pipeline.create('failure').step('script', { run: script.command }).run();
      expect(result.status).toBe('failed');
      expect(result.steps[0]?.stderr).toContain('script failure');
    } finally { await script.dispose(); }
  });
  it('cancels the isolated process and releases its source directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'xec-script-cancel-'));
    const script = await prepareScript('console.log("ready"); await new Promise(() => setInterval(()=>{}, 1000));', { cwd });
    const abort = new AbortController();
    try {
      const result = await Pipeline.create('cancel').step('script', { run: script.command }).run({}, {
        signal: abort.signal, onEvent: event => { if (event.type === 'step-output') abort.abort(); },
      });
      expect(result.status).toBe('cancelled');
    } finally { await script.dispose(); }
    expect(await readdir(cwd)).toEqual([]);
    await rm(cwd, { recursive: true });
  });
  it('rejects invalid TypeScript before creating a process', async () => {
    await expect(prepareScript('const x: = ;')).rejects.toThrow();
  });
});
