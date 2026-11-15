import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

import { SSHError } from './errors.js';

/** Bounded regular-file input for trust stores and private keys; never wait for a FIFO peer. */
export async function readRegularFile(
  path: string,
  maxBytes: number,
  options: { signal?: AbortSignal } = {},
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new SSHError('Invalid SSH file size limit', 'EINVAL');
  options.signal?.throwIfAborted();
  let file: FileHandle | undefined;
  let result = Buffer.alloc(0);
  const failures: unknown[] = [];
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    options.signal?.throwIfAborted();
    const metadata = await file.stat();
    if (!metadata.isFile()) throw new SSHError('Expected a regular SSH file', 'EINVAL');
    if (metadata.size > maxBytes) throw new SSHError(`SSH file exceeds the ${maxBytes} byte size limit`, 'EFBIG');
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      options.signal?.throwIfAborted();
      // The extra byte detects growth past the limit without allocating the growing file.
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - size + 1));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      options.signal?.throwIfAborted();
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > maxBytes) throw new SSHError(`SSH file exceeds the ${maxBytes} byte size limit`, 'EFBIG');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    result = Buffer.concat(chunks, size);
  } catch (error) { failures.push(error); }
  finally {
    try { await file?.close(); } catch (error) { failures.push(error); }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'SSH file read and cleanup failed', { cause: failures[0] });
  options.signal?.throwIfAborted();
  return result;
}
