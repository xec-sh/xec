import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

/**
 * Write a secret-bearing file via a same-directory temp file and rename.
 *
 * A direct writeFile can be interrupted half-way, leaving a truncated
 * ciphertext or index behind, and applies its mode only when it creates the
 * file — an existing file keeps whatever permissions it had. The rename
 * makes the replacement all-or-nothing and every write lands with 0600.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Buffer
): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`
  );

  await fs.writeFile(tmpPath, data, { mode: 0o600 });
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}
