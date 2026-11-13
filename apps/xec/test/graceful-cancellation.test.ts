import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { quoteForShell } from '@xec-sh/core';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';

const bin = fileURLToPath(new URL('../bin/xec', import.meta.url));

async function text(file: string): Promise<string | undefined> {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
async function until(predicate: () => Promise<boolean>, diagnostic: () => string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(diagnostic());
    await delay(20);
  }
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    // A killed grandchild can await reaping by the platform's init process.
    return !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim().startsWith('Z');
  } catch { return false; }
}

async function fixture(mode: 'script' | 'command' | 'loading' | 'watch' | 'watch-missing' | 'watch-missing-poll' | 'watch-script' | 'logs', uncooperative = false, cleanupMs = 2300) {
  const directory = await mkdtemp(join(tmpdir(), 'xec-cli-cancellation-'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  await writeFile(join(directory, 'grandchild.mjs'), `
    import { writeFile } from 'node:fs/promises';
    await writeFile('grandchild.pid', String(process.pid));
    setInterval(() => {}, 1000);
  `);
  await writeFile(join(directory, 'child.mjs'), `
    import { spawn } from 'node:child_process';
    import { writeFile } from 'node:fs/promises';
    spawn(process.execPath, ['grandchild.mjs'], { stdio: 'ignore' });
    await writeFile('child.pid', String(process.pid));
    setInterval(() => {}, 1000);
  `);
  await writeFile(join(directory, 'body.mjs'), `
    import { writeFile } from 'node:fs/promises';
    import { setTimeout as delay } from 'node:timers/promises';
    import { within, withoutCancellation } from '@xec-sh/core';
    import { acquireReleaseLock, releaseCommand } from '@xec-sh/ops/release';
    export default async function run() {
      const unlock = await acquireReleaseLock(process.cwd());
      try {
        ${uncooperative ? `
          setInterval(() => {}, 1000);
          await writeFile('ready', 'yes');
          await new Promise(() => {});
        ` : `
          await within({ cwd: process.cwd(), signal: new AbortController().signal }, () =>
            releaseCommand(process.cwd(), process.execPath, ['child.mjs'], {
              signal: new AbortController().signal, timeoutMs: 60_000,
            }));
        `}
      } finally {
        await writeFile('cleanup-started', 'yes');
        // Longer than the CLI's previous two-second forced-exit ceiling.
        await delay(${cleanupMs});
        await withoutCancellation(async () => {
          await releaseCommand(process.cwd(), process.execPath,
            ['--input-type=module', '-e', "import{writeFile}from'node:fs/promises';await writeFile('cleanup-command','yes')"],
            { signal: AbortSignal.timeout(2000) });
          await unlock();
        });
        await writeFile('cleanup-completed', 'yes');
      }
    }
  `);
  await writeFile(join(directory, 'run.mjs'), "import run from './body.mjs'; await run();\n");
  if (mode === 'command' || mode === 'loading') {
    await mkdir(join(directory, '.xec/commands'), { recursive: true });
    await writeFile(join(directory, '.xec/commands/cancel.js'),
      "import run from '../../body.mjs'; export default program => { program.command('cancel').action(run); };\n");
  }
  if (mode === 'loading') {
    await writeFile(join(directory, '.xec/commands/cancel.js'), `
      import { writeFile } from 'node:fs/promises';
      import { setTimeout as delay } from 'node:timers/promises';
      await writeFile('loading-ready', 'yes');
      await delay(300);
      export default program => program.command('cancel').action(() => writeFile('unexpected-admission','bad'));
    `);
  }
  await mkdir(join(directory, 'watched'));
  await writeFile(join(directory, 'app.log'), 'native-follow-ready\n');
  const args = mode === 'watch-missing' || mode === 'watch-missing-poll'
    ? ['watch', 'local', 'missing-root', '--command', 'echo unexpected-action', ...(mode === 'watch-missing-poll' ? ['--poll'] : [])]
    : mode === 'command' || mode === 'loading' ? ['cancel']
    : mode === 'watch-script' ? ['watch', 'local', 'watched', '--poll', '--interval', '50', '--debounce', '50', '--script', 'run.mjs']
    : mode === 'watch' ? ['watch', 'local', 'watched', '--poll', '--interval', '50', '--debounce', '50', '--command',
      `${quoteForShell(process.execPath, 'posix')} -e ${quoteForShell("require('node:fs').writeFileSync('watch-output','changed')", 'posix')}`]
    : mode === 'logs' ? ['logs', 'local', 'app.log', '--follow'] : ['run', 'run.mjs'];
  const child = spawn(process.execPath, [bin, ...args], {
    cwd: directory, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, XEC_DEBUG: '', XEC_COMMANDS_PATH: '', NO_COLOR: '1' },
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', value => { output = (output + value).slice(-64 * 1024); });
  let exited = false;
  const watchdog = setTimeout(() => child.kill('SIGKILL'), Math.max(18_000, cleanupMs + 20_000));
  const result = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => { clearTimeout(watchdog); exited = true; });
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  return { child, directory, result, output: () => output,
    ready: async () => {
      if (mode === 'watch-script') {
        await until(async () => {
          if (exited) throw new Error(`Watcher exited before readiness: ${output}`);
          return output.includes('Watching for changes');
        }, () => output);
        await writeFile(join(directory, 'watched/event.txt'), 'trigger');
      }
      await until(async () => {
        if (exited) throw new Error(`CLI exited before fixture readiness: ${output}`);
        if (mode === 'watch') return output.includes('Watching for changes');
        if (mode === 'logs') return output.includes('native-follow-ready');
        if (mode === 'loading') return !!await text(join(directory, 'loading-ready'));
        return uncooperative ? !!await text(join(directory, 'ready')) : !!await text(join(directory, 'grandchild.pid'));
      }, () => `Fixture did not become ready: ${output}`);
    },
    async close() {
      if (!exited) child.kill('SIGKILL');
      await result;
      for (const name of ['grandchild.pid', 'child.pid']) {
        const pid = Number(await text(join(directory, name)));
        if (Number.isInteger(pid) && pid > 0 && alive(pid)) {
          try { process.kill(pid, 'SIGKILL'); } catch { /* Already exited. */ }
        }
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}

it.skipIf(process.platform === 'win32').each([
  ['script', 'SIGINT', 130], ['command', 'SIGTERM', 143], ['watch-script', 'SIGTERM', 143],
] as const)('waits for %s cleanup and managed descendants after %s', async (mode, signal, code) => {
  const running = await fixture(mode);
  try {
    await running.ready();
    const owner = JSON.parse((await text(join(running.directory, '.release-artifacts/running/owner.json')))!);
    expect(owner.pid).toBe(running.child.pid);
    running.child.kill(signal);
    const result = await running.result;
    expect(result, running.output()).toEqual({ code, signal: null });
    expect(running.output()).not.toContain('cleanup is incomplete');
    expect(await text(join(running.directory, 'cleanup-completed')), running.output()).toBe('yes');
    expect(await text(join(running.directory, 'cleanup-command'))).toBe('yes');
    expect(await text(join(running.directory, '.release-artifacts/running/owner.json'))).toBeUndefined();
    const pids = await Promise.all(['child.pid', 'grandchild.pid'].map(async name => Number(await text(join(running.directory, name)))));
    expect(pids.every(pid => Number.isSafeInteger(pid) && pid > 0)).toBe(true);
    await until(async () => pids.every(pid => !alive(pid)), () => `Managed descendants survived: ${pids}`);
  } finally { await running.close(); }
}, 25_000);

it.skipIf(process.platform === 'win32')('waits for cleanup beyond ten seconds and permits a new command to acquire the released lock', async () => {
  const running = await fixture('script', false, 11_500);
  try {
    await running.ready();
    running.child.kill('SIGTERM');
    await until(async () => await text(join(running.directory, 'cleanup-started')) === 'yes', running.output);
    await delay(10_200);
    expect(running.child.exitCode, running.output()).toBeNull();
    expect(await text(join(running.directory, '.release-artifacts/running/owner.json'))).toBeDefined();
    expect(await running.result, running.output()).toEqual({ code: 143, signal: null });
    expect(running.output()).toContain('still cleaning up');
    expect(running.output()).not.toContain('cleanup is incomplete');
    expect(await text(join(running.directory, 'cleanup-completed'))).toBe('yes');
    expect(await text(join(running.directory, '.release-artifacts/running/owner.json'))).toBeUndefined();
    const retry = join(running.directory, 'retry.mjs');
    await writeFile(retry, `import {acquireReleaseLock} from '@xec-sh/ops/release';
const unlock = await acquireReleaseLock(process.cwd());
try { console.log('retry acquired its own lock'); } finally { await unlock(); }
`);
    const result = await promisify(execFile)(process.execPath, [bin, 'run', retry], { cwd: running.directory, timeout: 15_000 });
    expect(result.stdout).toContain('retry acquired its own lock');
    expect(await text(join(running.directory, '.release-artifacts/running/owner.json'))).toBeUndefined();
  } finally { await running.close(); }
}, 40_000);

it.skipIf(process.platform === 'win32')('reports incomplete cleanup on a repeated signal for uncooperative user code', async () => {
  const running = await fixture('script', true);
  try {
    await running.ready();
    running.child.kill('SIGINT');
    await until(async () => /cancell/i.test(running.output()), running.output);
    running.child.kill('SIGTERM');
    expect(await running.result).toEqual({ code: 130, signal: null });
    expect(running.output()).toMatch(/cleanup.*incomplete|incomplete.*cleanup/i);
    expect(await text(join(running.directory, 'cleanup-completed'))).toBeUndefined();
    expect(await text(join(running.directory, '.release-artifacts/running/owner.json'))).toBeDefined();
  } finally { await running.close(); }
}, 20_000);

it.skipIf(process.platform === 'win32').each([
  ['watch', 'SIGINT', 130], ['logs', 'SIGTERM', 143],
] as const)('settles built-in %s through the CLI owner after %s', async (mode, signal, code) => {
  const running = await fixture(mode);
  try {
    await running.ready();
    if (mode === 'watch') {
      await writeFile(join(running.directory, 'watched/event.txt'), 'change');
      await until(async () => await text(join(running.directory, 'watch-output')) === 'changed', running.output);
    }
    running.child.kill(signal);
    expect(await running.result, running.output()).toEqual({ code, signal: null });
    expect(running.output()).not.toMatch(/cleanup is incomplete/);
  } finally { await running.close(); }
}, 25_000);

it.skipIf(process.platform === 'win32')('refuses action admission when interrupted during command loading', async () => {
  const running = await fixture('loading');
  try {
    await running.ready();
    running.child.kill('SIGINT');
    expect(await running.result, running.output()).toEqual({ code: 130, signal: null });
    expect(await text(join(running.directory, 'unexpected-admission'))).toBeUndefined();
    expect(running.output()).not.toContain('cleanup is incomplete');
  } finally { await running.close(); }
}, 20_000);


it.each(['watch-missing', 'watch-missing-poll'] as const)(
  'refuses %s before claiming readiness or running an action', async mode => {
    const running = await fixture(mode);
    try {
      expect(await running.result, running.output()).toEqual({ code: 10, signal: null });
      expect(running.output()).toContain('missing-root');
      expect(running.output()).not.toContain('Watching for changes');
      expect(running.output()).not.toContain('unexpected-action');
    } finally { await running.close(); }
  }, 20_000,
);

it('fails a foreground watch when its polling root disappears', async () => {
  const running = await fixture('watch');
  try {
    await running.ready();
    await rm(join(running.directory, 'watched'), { recursive: true });
    expect(await running.result, running.output()).toEqual({ code: 10, signal: null });
    expect(running.output()).toContain('ENOENT');
    expect(running.output()).not.toContain('cleanup is incomplete');
    expect(await text(join(running.directory, 'watch-output'))).toBeUndefined();
  } finally { await running.close(); }
}, 20_000);
