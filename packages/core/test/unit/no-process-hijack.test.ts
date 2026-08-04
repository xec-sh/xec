import * as path from 'node:path';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';

const run = promisify(execFile);

const CORE = new URL('../../src/index.ts', import.meta.url).pathname;
const PACKAGE_ROOT = new URL('../..', import.meta.url).pathname;

/**
 * A library must not take over its host's process.
 *
 * Importing this package used to install four process-global handlers, three
 * of which called `process.exit()` — including one on `unhandledRejection`.
 * A host application with a rejection of its own, entirely unrelated to xec,
 * was killed by its dependency.
 *
 * These run in child processes because the assertions are about global process
 * state, which cannot be observed from inside a shared test worker.
 */
describe('importing the library does not hijack the host process', () => {
  let dir: string;

  beforeAll(async () => {
    // Inside the package: tsx resolves tsconfig and workspace imports
    // relative to the script's location, so a file in the OS temp directory
    // cannot import the source under test.
    dir = await fs.mkdtemp(path.join(PACKAGE_ROOT, '.tmp-hijack-'));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  /** Run a snippet as a real script and return its stdout and exit code. */
  async function runScript(name: string, source: string): Promise<{ stdout: string; code: number }> {
    const file = path.join(dir, `${name}.ts`);
    await fs.writeFile(file, source);

    try {
      const { stdout } = await run('npx', ['tsx', file], { cwd: PACKAGE_ROOT, timeout: 60_000 });
      return { stdout, code: 0 };
    } catch (error) {
      const failure = error as { stdout?: string; code?: number };
      return { stdout: failure.stdout ?? '', code: failure.code ?? 1 };
    }
  }

  it('installs no process-global handlers on import', async () => {
    const { stdout } = await runScript(
      'listeners',
      `const events = ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'];
const before = events.map(e => process.listenerCount(e));
await import(${JSON.stringify(CORE)});
const after = events.map(e => process.listenerCount(e));
console.log(JSON.stringify({ before, after }));
`
    );

    const { before, after } = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(after).toEqual(before);
  }, 90_000);

  it("does not kill the host on the host's own unhandled rejection", async () => {
    const { stdout } = await runScript(
      'survives',
      `await import(${JSON.stringify(CORE)});

// The host decides its own policy for its own bugs.
process.on('unhandledRejection', () => {});

Promise.reject(new Error('the host app has its own bug'));
setTimeout(() => console.log('HOST-SURVIVED'), 200);
`
    );

    // Previously the library printed its own diagnostic and called
    // process.exit(1), so this line never ran.
    expect(stdout).toContain('HOST-SURVIVED');
  }, 90_000);

  it('offers cleanup as an explicit opt-in', async () => {
    const { stdout } = await runScript(
      'optin',
      `const m = await import(${JSON.stringify(CORE)});
m.installCleanupHandlers();
console.log(JSON.stringify({
  sigint: process.listenerCount('SIGINT'),
  rejection: process.listenerCount('unhandledRejection'),
}));
`
    );

    const counts = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(counts.sigint).toBeGreaterThan(0);
    // Even opted in, the library must not police the host's rejections.
    expect(counts.rejection).toBe(0);
  }, 90_000);

  it('emits no unhandled rejection when a command fails', async () => {
    // Process tracking untracked the promise with `.finally()`, which returns
    // a second promise rejecting with the same reason and handled by nothing.
    // A caught failure therefore also reached the host's unhandledRejection
    // handler — fatal for a host that treats those as fatal, and invisible
    // from inside a test worker, hence a child process.
    const { stdout } = await runScript(
      'no-unhandled',
      `const { $ } = await import(${JSON.stringify(CORE)});

const unhandled = [];
process.on('unhandledRejection', reason => unhandled.push(String(reason)));

try { await $\`exit 3\`; } catch { /* the caller handles it */ }
await $\`exit 7\`.nothrow();

// Rejections surface on a later turn of the loop, so give them one.
await new Promise(resolve => { setTimeout(resolve, 500); });
console.log(JSON.stringify({ unhandled }));
`
    );

    const { unhandled } = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(unhandled).toEqual([]);
  }, 90_000);
});
