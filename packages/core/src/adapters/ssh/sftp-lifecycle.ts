import type { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import type { SFTPClient as SFTPWrapper } from './contracts.js';
import type { SSHRequestOptions } from './request-lifecycle.js';

import { SSHError, watchConnection } from './request-lifecycle.js';
import { ExecutionOutcomeUnknownError } from '../../core/error.js';

export interface SFTPRequestOptions extends SSHRequestOptions {
  /** Maximum request inactivity; transfer progress renews the deadline. Default 30 seconds. */
  operationTimeoutMs?: number;
  /** Bounds requests and streams owned by one subsystem. Default 256. */
  maxPendingRequests?: number;
}

const READS = new Set(['read', 'fastGet', 'readFile', 'stat', 'lstat', 'fstat', 'opendir', 'readdir', 'realpath', 'readlink',
  'ext_openssh_statvfs', 'ext_openssh_fstatvfs', 'ext_openssh_limits', 'ext_openssh_expandPath', 'ext_users_groups_by_id']);
const CALLBACK_METHODS = new Set([...READS, 'open', 'close', 'write', 'fastPut', 'writeFile', 'appendFile', 'unlink', 'rename',
  'mkdir', 'rmdir', 'symlink', 'chmod', 'fchmod', 'chown', 'fchown', 'utimes', 'futimes', 'setstat', 'fsetstat',
  'ext_openssh_lsetstat', 'ext_openssh_rename', 'ext_openssh_hardlink', 'ext_openssh_fsync', 'ext_copy_data', 'ext_copy_file']);

type Pending = (error: Error) => void;
type OwnedStream = Readable & Writable & { bytesRead?: number; bytesWritten?: number; fd?: Buffer | null };

/** Guard public requests at the Xec boundary, without modifying private transport internals. */
export function manageSFTP(sftp: SFTPWrapper, connection: EventEmitter, options: SFTPRequestOptions): SFTPWrapper {
  const timeoutMs = options.operationTimeoutMs ?? 30000, limit = options.maxPendingRequests ?? 256;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(limit) || limit < 1 || limit > 65536) {
    sftp.end(); throw new SSHError('Invalid SFTP operation limits', 'EINVAL');
  }
  const pending = new Set<Pending>(), streams = new Map<OwnedStream, { write: boolean; cleanup: () => void }>();
  let terminal: Error | undefined;
  const stop = (error: Error, destroy = true) => {
    if (terminal) return;
    terminal = error;
    unwatch();
    sftp.off('close', closed); sftp.off('end', closed);
    options.signal?.removeEventListener('abort', aborted);
    // Each callback is delivered separately, after all owned resources are released.
    const callbacks = [...pending]; pending.clear();
    for (const finish of callbacks) finish(error);
    for (const [stream, owned] of streams) {
      owned.cleanup(); stream.destroy(owned.write ? new ExecutionOutcomeUnknownError(error) : error);
    }
    streams.clear();
    if (destroy) sftp.destroy();
  };
  const closed = () => stop(new SSHError('SFTP subsystem closed before request completion', 'ECONNRESET'));
  const aborted = () => stop(new SSHError('SFTP session cancelled', 'ABORT_ERR'));
  const unwatch = watchConnection(connection, stop);
  // Retain this error observer for late errors after teardown.
  sftp.on('error', stop); sftp.once('close', closed); sftp.once('end', closed);
  options.signal?.addEventListener('abort', aborted, { once: true });
  if (options.signal?.aborted) aborted();

  const wrappers = new Map<PropertyKey, unknown>();
  return new Proxy(sftp, {
    get(target, property, receiver) {
      if (wrappers.has(property)) return wrappers.get(property);
      const member = Reflect.get(target, property, target);
      if (typeof member !== 'function' || typeof property !== 'string') return member;
      let wrapper: (...args: any[]) => unknown;
      if (property === 'exists') {
        wrapper = (path, callback) => (receiver as SFTPWrapper).stat(path, error => {
          const missing = (error as (Error & { code?: number | string }) | undefined)?.code;
          callback(!error, error && missing !== 2 && missing !== 'ENOENT' ? error : undefined);
        });
      } else if (property === 'end' || property === 'destroy') {
        wrapper = (...args) => {
          stop(new SSHError('SFTP session disposed', 'ECONNRESET'), false);
          const result = Reflect.apply(member, target, args); return result === target ? receiver : result;
        };
      } else if (property === 'createReadStream' || property === 'createWriteStream') {
        wrapper = (...args) => {
          if (terminal) throw terminal;
          if (streams.size + pending.size >= limit) throw new SSHError('SFTP pending request limit exceeded', 'ENOBUFS');
          const stream = Reflect.apply(member, target, args) as OwnedStream;
          const write = property === 'createWriteStream';
          let bytes = 0, lastProgress = Date.now();
          const timer = setInterval(() => {
            const current = (write ? stream.bytesWritten : stream.bytesRead) ?? 0;
            // Consumer backpressure and an idle, already opened writer are not network stalls.
            const idle = stream.fd != null && (write ? stream.writableLength === 0 && !stream.writableEnded
              : stream.readableLength > 0 && stream.readableFlowing !== true);
            if (current !== bytes || idle) { bytes = current; lastProgress = Date.now(); }
            else if (Date.now() - lastProgress >= timeoutMs) stop(new SSHError('SFTP stream made no progress before its deadline', 'ETIMEDOUT'));
          }, Math.max(1, Math.min(timeoutMs, 1000)));
          const cleanup = () => { clearInterval(timer); streams.delete(stream); };
          streams.set(stream, { write, cleanup });
          stream.once('close', cleanup);
          stream.once('error', cleanup);
          return stream;
        };
      } else if (CALLBACK_METHODS.has(property)) {
        wrapper = (...args) => {
          const suppliedCallback = typeof args.at(-1) === 'function' ? args.pop() : undefined;
          // Even optional callbacks must be owned so a write cannot hang silently.
          const callback = suppliedCallback ?? ((error?: Error) => { if (error) target.emit('error', error); });
          if (terminal) { queueMicrotask(() => callback(terminal)); return undefined; }
          if (pending.size + streams.size >= limit) { queueMicrotask(() => callback(new SSHError('SFTP pending request limit exceeded', 'ENOBUFS'))); return undefined; }
          let settled = false, timer: ReturnType<typeof setTimeout>;
          const finish = (error?: Error | null, ...values: unknown[]) => {
            if (settled) return;
            settled = true; clearTimeout(timer); pending.delete(lost);
            const code = (error as (Error & { code?: unknown }) | undefined)?.code;
            const uncertain = error && !READS.has(property) && typeof code !== 'number'
              && code !== 'ENOENT' && code !== 'EACCES' && code !== 'EINVAL';
            const outcome = uncertain && !(error instanceof ExecutionOutcomeUnknownError) ? new ExecutionOutcomeUnknownError(error) : error;
            queueMicrotask(() => callback(outcome, ...values));
          };
          const lost = (error: Error) => finish(READS.has(property) ? error : new ExecutionOutcomeUnknownError(error));
          const timedOut = () => stop(new SSHError(`SFTP ${property} made no progress before its deadline`, 'ETIMEDOUT'));
          const renew = () => { if (!settled) { clearTimeout(timer); timer = setTimeout(timedOut, timeoutMs); } };
          pending.add(lost); renew();
          if (property === 'fastGet' || property === 'fastPut') {
            const supplied = args[2] && typeof args[2] === 'object' ? args[2] : {};
            args = [args[0], args[1], { ...supplied, step: (...progress: unknown[]) => {
              if (settled) return;
              renew();
              try { supplied.step?.(...progress); }
              catch (error) { stop(error instanceof Error ? error : new Error(String(error))); }
            } }];
          }
          args.push(finish);
          try { return Reflect.apply(member, target, args); }
          catch (error) { finish(error instanceof Error ? error : new Error(String(error))); return undefined; }
        };
      } else wrapper = (...args) => {
        const result = Reflect.apply(member, target, args);
        // EventEmitter's chainable methods must not expose the unguarded subsystem.
        return result === target ? receiver : result;
      };
      wrappers.set(property, wrapper);
      return wrapper;
    },
  });
}
