import type { FileHandle } from 'node:fs/promises';

import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getSystemErrorName } from 'node:util';

export type RenameOutcome = 'not-published' | 'published-not-synced' | 'unknown';

export class RenameNoReplaceError extends Error {
  constructor(public readonly outcome: RenameOutcome, public readonly code: string, cause?: unknown) {
    super(`renameNoReplace: ${outcome} (${code})`, { cause });
    this.name = 'RenameNoReplaceError';
  }
}

/**
 * Publish a previously synced single-link regular file in the same trusted local
 * Linux directory. The caller exclusively owns the source name and keeps the
 * open directory handle alive until this operation settles.
 */
export async function renameNoReplace(directory: FileHandle, source: string, destination: string, signal?: AbortSignal): Promise<void> {
  if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch))
    throw new RenameNoReplaceError('not-published', 'ENOTSUP');
  const valid = (name: string) => typeof name === 'string' && name.length > 0 &&
    name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\0') &&
    // Node would otherwise replace unpaired UTF-16 surrogates while encoding argv.
    Buffer.from(name).toString() === name;
  if (!valid(source) || !valid(destination) || source === destination)
    throw new RenameNoReplaceError('not-published', 'EINVAL');
  if (!Number.isSafeInteger(directory?.fd) || directory.fd < 0)
    throw new RenameNoReplaceError('not-published', 'EBADF');
  if (signal?.aborted)
    throw new RenameNoReplaceError('not-published', 'ABORT_ERR', signal.reason);

  const helper = fileURLToPath(new URL(`./rename-noreplace-${process.arch}`, import.meta.url));
  await new Promise<void>((resolve, reject) => {
    // The kernel duplicates the already opened directory into the helper. No
    // path re-resolution or inherited user environment is needed.
    const child = spawn(helper, [source, destination], {
      env: {}, shell: false, signal, killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'pipe', directory.fd],
    });
    let diagnostic = '';
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => { diagnostic = (diagnostic + chunk).slice(0, 64); });
    let started = false;
    let error: NodeJS.ErrnoException | undefined;
    child.once('spawn', () => { started = true; });
    child.once('error', cause => { error = cause; });
    child.once('close', (status, killedBy) => {
      if (!started && error) {
        reject(new RenameNoReplaceError('not-published', error.code ?? 'EIO', error));
        return;
      }
      if (status === 0 && !killedBy && !diagnostic) { resolve(); return; }
      const number = /^[1-9][0-9]{0,3}\n$/.test(diagnostic) ? Number(diagnostic) : undefined;
      if (!number || killedBy || (status !== 1 && status !== 2 && status !== 3)) {
        reject(new RenameNoReplaceError('unknown', killedBy ?? error?.code ?? 'EPROTO', error));
        return;
      }
      const outcome: RenameOutcome = status === 1 ? 'not-published' : status === 2 ? 'published-not-synced' : 'unknown';
      reject(new RenameNoReplaceError(outcome, getSystemErrorName(-number)));
    });
  });
}
