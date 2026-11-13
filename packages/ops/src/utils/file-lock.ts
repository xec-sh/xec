import path from 'node:path';
import { spawn } from 'node:child_process';
import fs, { constants } from 'node:fs/promises';

/**
 * Run a local operation under an exclusive kernel lock on macOS or Linux.
 * The parent directory must be private and owned by the current user.
 * Keep the lock file in place so all participants acquire the same inode.
 */
export async function withKernelFileLock<T>(
  file: string,
  body: () => Promise<T>,
  timeoutSeconds = 30,
): Promise<T> {
  if (!['darwin', 'linux'].includes(process.platform)) {
    throw new Error('Kernel file locks require macOS lockf or Linux flock');
  }
  const maximumTimeout = Math.floor(2_147_483_647 / 1000) - 5;
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 0 || timeoutSeconds > maximumTimeout) {
    throw new Error('Kernel lock timeout must be a nonnegative integer within the timer range');
  }
  const parent = await fs.lstat(path.dirname(file));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 ||
      (process.getuid && parent.uid !== process.getuid())) {
    throw new Error('Kernel lock requires a private parent directory owned by this user');
  }

  const handle = await fs.open(file, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o022) !== 0 ||
        (process.getuid && opened.uid !== process.getuid())) {
      throw new Error('Kernel lock requires a regular file owned by this user with no other writers or hard links');
    }
    // fd 3 shares Node's open file description. The helper acquires the lock;
    // Node retains it until finally closes this handle, including on process death.
    const command = process.platform === 'darwin' ? '/usr/bin/lockf' : 'flock';
    const args = process.platform === 'darwin'
      ? ['-t', String(timeoutSeconds), '3']
      : ['--exclusive', '--timeout', String(timeoutSeconds), '3'];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe', handle.fd] });
      let output = '';
      let errors = '';
      let timedOut = false;
      let force: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        force = setTimeout(() => child.kill('SIGKILL'), 1000);
      }, (timeoutSeconds + 5) * 1000);
      const clear = () => {
        clearTimeout(timer);
        if (force) clearTimeout(force);
      };
      child.stdout!.on('data', (chunk: Buffer) => { output = (output + chunk.toString()).slice(-1024); });
      child.stderr!.on('data', (chunk: Buffer) => { errors = (errors + chunk.toString()).slice(-1024); });
      child.once('error', error => {
        clear();
        reject(new Error('Native kernel lock helper is unavailable', { cause: error }));
      });
      child.once('close', code => {
        clear();
        if (code === 0 && !output && !errors && !timedOut) resolve();
        else reject(new Error(`Kernel lock was not acquired (exit ${code ?? 'signal'}): ${errors.trim()}`));
      });
    });

    const named = await fs.lstat(file);
    const currentParent = await fs.lstat(path.dirname(file));
    if (named.isSymbolicLink() || named.dev !== opened.dev || named.ino !== opened.ino ||
        currentParent.isSymbolicLink() || currentParent.dev !== parent.dev || currentParent.ino !== parent.ino ||
        (currentParent.mode & 0o077) !== 0) {
      throw new Error('Kernel lock path changed during acquisition');
    }
    if ((opened.mode & 0o777) !== 0o600) await handle.chmod(0o600);
    return await body();
  } finally {
    await handle.close();
  }
}
