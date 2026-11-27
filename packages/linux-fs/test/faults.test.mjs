import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { rm, stat, mkdtemp, readFile, writeFile } from 'node:fs/promises';

const execute = promisify(execFile);
const caller = fileURLToPath(new URL('./injected-call.mjs', import.meta.url));

for (const [fault, outcome, codes, published] of [
  ['renameat2:error=EOPNOTSUPP', 'not-published', ['ENOTSUP', 'EOPNOTSUPP'], false],
  ['fsync:error=EIO', 'published-not-synced', ['EIO'], true],
  ['renameat2:error=EINTR:signal=SIGKILL', 'unknown', ['SIGKILL'], false],
  ['fsync:error=EINTR:signal=SIGKILL', 'unknown', ['SIGKILL'], true],
]) {
  test(fault, { skip: process.platform !== 'linux' }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'xec-rename-fault-'));
    const staged = join(directory, 'staged'), result = join(directory, 'result');
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(staged, 'test-record', { flush: true });
    const before = await stat(staged, { bigint: true });
    const trace = join(directory, 'trace');
    const { stdout } = await execute('strace', ['-f', '-o', trace, '-e', 'trace=renameat2,fsync', '-e', 'inject=' + fault,
      '--', process.execPath, caller, directory]);
    const reported = JSON.parse(stdout);
    assert.equal(reported.outcome, outcome);
    assert.ok(codes.includes(reported.code), 'Unexpected errno or signal: ' + reported.code);
    const after = await stat(published ? result : staged, { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.nlink, 1n);
    await assert.rejects(stat(published ? staged : result), { code: 'ENOENT' });
    // SIGKILL can terminate the helper before strace observes a syscall return.
    const traceText = await readFile(trace, 'utf8');
    if (codes.includes('SIGKILL')) {
      assert.match(traceText, /killed by SIGKILL/);
      assert.equal(/\brenameat2(?:\(| resumed>)[^\n]*=\s*0\b/.test(traceText), published);
    } else {
      assert.ok(traceText.includes(fault.split(':')[0] + '('), 'Expected the target syscall in the trace');
      assert.match(traceText, /\(INJECTED\)/);
    }
  });
}
