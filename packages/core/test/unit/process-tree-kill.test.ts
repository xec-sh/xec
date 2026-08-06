import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { $ } from '../../src/index.js';
import { nodeCommand, itPosixShell } from '../helpers/platform.js';
import { listDescendants, killProcessTree } from '../../src/utils/process-tree.js';

/**
 * Killing a command must kill everything it spawned.
 *
 * `sh -c 'node server.js'` is a process tree; signalling only the shell
 * orphaned the server, which kept its port and its CPU. zx gets this right
 * via detached process groups plus a bundled ps wrapper — this pins the same
 * behaviour delivered with zero dependencies.
 */
describe('terminating a command terminates its whole tree', () => {
  /** Poll until the pid is gone or the deadline passes. */
  async function waitForDeath(pid: number, timeoutMs = 5_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0);
      } catch {
        return true;
      }
      await new Promise(resolve => { setTimeout(resolve, 50); });
    }
    return false;
  }

  /**
   * Start `sh -c 'node …'` where the grandchild writes its pid to a file.
   *
   * `.start()` is required because commands are lazy: without it nothing has
   * launched yet, and killing a command that never ran proves nothing.
   */
  function startNested(pidFile: string) {
    const grandchild = `process.on('SIGTERM',()=>process.exit(0));require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`;
    return $.exec(nodeCommand(grandchild)).nothrow().start();
  }

  async function readPid(pidFile: string, timeoutMs = 5_000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const raw = await fs.readFile(pidFile, 'utf8');
        if (raw.trim()) return Number(raw.trim());
      } catch {
        // Not written yet.
      }
      if (Date.now() > deadline) throw new Error('grandchild never reported its pid');
      await new Promise(resolve => { setTimeout(resolve, 50); });
    }
  }

  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-tree-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('kill() reaches the grandchild through the shell', async () => {
    const pidFile = path.join(dir, 'pid');
    const promise = startNested(pidFile);
    const grandchildPid = await readPid(pidFile);

    promise.kill();

    expect(await waitForDeath(grandchildPid)).toBe(true);
    await promise;
  }, 20_000);

  it('an aborted signal reaches the grandchild', async () => {
    const pidFile = path.join(dir, 'pid');
    const controller = new AbortController();
    // Configuration goes before start(): the chain returns a new command,
    // so configuring a running one is rejected rather than silently ignored.
    const grandchild = `process.on('SIGTERM',()=>process.exit(0));require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`;
    const promise = $.exec(nodeCommand(grandchild))
      .nothrow()
      .signal(controller.signal)
      .start();
    const grandchildPid = await readPid(pidFile);

    controller.abort();

    expect(await waitForDeath(grandchildPid)).toBe(true);
    await promise;
  }, 20_000);

  it('a timeout reaches the grandchild', async () => {
    const pidFile = path.join(dir, 'pid');
    const grandchild = `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`;
    const promise = $.exec(nodeCommand(grandchild))
      .timeout(1_000)
      .nothrow()
      .start();
    const grandchildPid = await readPid(pidFile);

    await promise;

    expect(await waitForDeath(grandchildPid)).toBe(true);
  }, 20_000);
});

describe('killProcessTree guards', () => {
  it('refuses a pid that would address every process on the machine', () => {
    // kill(-1) signals everything the user may signal; a 0/negative pid from
    // a dead child must never be allowed to become that.
    expect(() => killProcessTree(0)).toThrow('Invalid pid');
    expect(() => killProcessTree(-1 as number)).toThrow('Invalid pid');
    expect(() => killProcessTree(1.5 as number)).toThrow('Invalid pid');
  });

  // `listDescendants` reads `ps`; the Windows path of killProcessTree is
  // taskkill /t, which walks the tree itself and never calls this.
  itPosixShell('lists descendants of the current process', async () => {
    const child = await import('node:child_process');
    const proc = child.spawn('sleep', ['30']);

    try {
      const deadline = Date.now() + 3_000;
      let seen: number[] = [];
      while (Date.now() < deadline) {
        seen = listDescendants(process.pid);
        if (seen.includes(proc.pid!)) break;
        await new Promise(resolve => { setTimeout(resolve, 50); });
      }
      expect(seen).toContain(proc.pid);
    } finally {
      proc.kill('SIGKILL');
    }
  }, 10_000);
});
