import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { $ } from '../../../src/index.js';

/**
 * `result.stdall` carries stdout and stderr in the order this process saw
 * them arrive.
 *
 * Separate `stdout` and `stderr` strings lose the interleaving, and for a
 * build or a deploy the interleaving *is* the story: which step was running
 * when the warning appeared. Reconstructing it afterwards is impossible.
 */
describe('stdall preserves observed arrival order', () => {
  let dir: string;
  let script: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-stdall-'));
    script = path.join(dir, 'interleave.cjs');
    await fs.writeFile(
      script,
      [
        `process.stdout.write('step1 ');`,
        `setTimeout(() => {`,
        `  process.stderr.write('WARN ');`,
        `  setTimeout(() => { process.stdout.write('step2'); }, 60);`,
        `}, 60);`,
      ].join('\n')
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('places a warning between the steps that surround it', async () => {
    const result = await $.exec(`node ${script}`).nothrow();

    // The separate views each tell half the story.
    expect(result.stdout).toBe('step1 step2');
    expect(result.stderr).toBe('WARN ');

    // Together, in order: this is what a reader needs.
    expect(result.stdall).toBe('step1 WARN step2');
  }, 20_000);

  it('contains every byte of both streams', async () => {
    const result = await $.exec(`node ${script}`).nothrow();

    expect(result.stdall.length).toBe(result.stdout.length + result.stderr.length);
  }, 20_000);

  it('preserves relative order within each stream', async () => {
    const result = await $.exec(`node ${script}`).nothrow();

    expect(result.stdall.indexOf('step1')).toBeLessThan(result.stdall.indexOf('step2'));
  }, 20_000);

  it('falls back to stdout + stderr rather than being empty', async () => {
    // Every result must carry a usable stdall, including paths where the
    // adapter cannot observe the interleaving.
    const result = await $.exec('echo only-stdout').nothrow();

    expect(result.stdall).toContain('only-stdout');
  }, 20_000);
});
