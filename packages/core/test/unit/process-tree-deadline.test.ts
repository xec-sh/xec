import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { it, expect, describe, afterEach } from 'vitest';

import * as tree from '../../src/utils/process-tree.js';

const PATH = process.env['PATH'];
const cleanup: string[] = [];
afterEach(() => {
  process.env['PATH'] = PATH;
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Put a `ps` that behaves as `script` in front of the real one. */
function standInPs(script: string): void {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'xec-ps-'));
  cleanup.push(bin);
  fs.writeFileSync(path.join(bin, 'ps'), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  process.env['PATH'] = `${bin}:${PATH}`;
}

const timed = <T>(f: () => T) => {
  const t0 = Date.now();
  const value = f();
  return { value, ms: Date.now() - t0 };
};

describe.skipIf(process.platform === 'win32')('process snapshot deadline', () => {
  it('lists a process\'s children when ps answers', async () => {
    const parent = spawn('/bin/sh', ['-c', '/bin/sleep 30 & wait'], { stdio: 'ignore' });
    try {
      let found: number[] | null = [];
      for (let i = 0; i < 50 && found !== null && found.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 20));
        found = tree.listDescendants(parent.pid!);
      }
      expect(found?.length).toBeGreaterThan(0);
    } finally {
      tree.killProcessTree(parent.pid!, 'SIGKILL');
    }
  });

  it('answers «unknown», within its deadline, when ps does not answer', () => {
    standInPs('exec /bin/sleep 8');

    const { value, ms } = timed(() => tree.listDescendants(process.pid));

    expect(value, 'not «no descendants»: nothing was read').toBeNull();
    expect(ms, 'the event loop waited this long').toBeLessThan(4_000);
  });

  it('answers «unknown» when ps fails', () => {
    standInPs('echo "ps: cannot allocate memory" >&2; exit 1');

    expect(tree.listDescendants(process.pid)).toBeNull();
  });

  it('still kills the process, and says its descendants were unknown', async () => {
    const child = spawn('/bin/sleep', ['30'], { stdio: 'ignore', detached: true });
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    const warnings: Array<{ code?: string; message: string }> = [];
    const onWarning = (w: Error & { code?: string }) => void warnings.push({ code: w.code, message: w.message });
    process.on('warning', onWarning);
    try {
      standInPs('exec /bin/sleep 8');

      const { ms } = timed(() => tree.killProcessTree(child.pid!, 'SIGKILL'));
      await exited;
      await new Promise((r) => setImmediate(r));

      expect(ms).toBeLessThan(4_000);
      expect(warnings.map((w) => w.code)).toContain('XEC_DESCENDANTS_UNKNOWN');
      expect(warnings.find((w) => w.code === 'XEC_DESCENDANTS_UNKNOWN')?.message).toMatch(
        new RegExp(`descendants of ${child.pid}`),
      );
    } finally {
      process.off('warning', onWarning);
    }
  });
});
