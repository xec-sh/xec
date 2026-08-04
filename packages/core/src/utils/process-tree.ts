import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';

/**
 * Terminate a process together with everything it spawned.
 *
 * `child.kill()` signals only the direct child. For a shell command that is
 * almost never the real process: `sh -c 'node server.js'` killed the shell
 * and orphaned the server, which kept the port, the file locks and the CPU.
 * zx solves this with a bundled `ps` wrapper; this is the same capability
 * with zero dependencies — one `ps` invocation on POSIX, `taskkill /t` on
 * Windows, both argv-form with no shell in between.
 *
 * The strategy on POSIX is layered:
 *
 * 1. Signal the process group (`kill(-pid)`). Children spawned with
 *    `detached: true` lead their own group, so this reaches the whole tree
 *    in one syscall with no race against new forks.
 * 2. Walk `ps -eo pid=,ppid=` and signal any live descendant individually —
 *    covers processes that moved themselves into a new group via `setsid`.
 * 3. Signal the root pid itself, in case it was not a group leader.
 *
 * Every signal is best-effort: the tree is racing us to exit, and ESRCH on a
 * process that died first is success, not failure.
 *
 * @param pid - Root process id.
 * @param signal - Signal to deliver; defaults to SIGTERM.
 */
export function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    // A negative or zero pid addresses "every process I may signal" — a typo
    // here must never turn cleanup into a machine-wide massacre.
    throw new Error(`Invalid pid for killProcessTree: ${pid}`);
  }

  if (platform() === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true });
    return;
  }

  const kill = (target: number): void => {
    try {
      process.kill(target, signal);
    } catch {
      // Already gone, or not ours to signal.
    }
  };

  // 1. The whole group, if pid leads one.
  kill(-pid);

  // 2. Descendants that escaped the group.
  for (const descendant of listDescendants(pid)) {
    kill(descendant);
  }

  // 3. The root itself.
  kill(pid);
}

/**
 * Collect every live descendant of `pid`, deepest first.
 *
 * One `ps` snapshot, walked breadth-first. A process forked between the
 * snapshot and the signal can be missed — that window is why the group
 * signal in {@link killProcessTree} comes first, not this walk.
 *
 * @param pid - Root process id.
 * @returns Descendant pids, children before parents nowhere guaranteed —
 *   callers signal them all, so ordering does not matter.
 */
export function listDescendants(pid: number): number[] {
  const result = spawnSync('ps', ['-eo', 'pid=,ppid='], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  const childrenOf = new Map<number, number[]>();
  for (const line of result.stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const child = Number(match[1]);
    const parent = Number(match[2]);
    const siblings = childrenOf.get(parent);
    if (siblings) {
      siblings.push(child);
    } else {
      childrenOf.set(parent, [child]);
    }
  }

  const descendants: number[] = [];
  const queue = [pid];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenOf.get(current) ?? []) {
      descendants.push(child);
      queue.push(child);
    }
  }

  return descendants;
}
