import type { EventEmitter } from 'node:events';

import { ExecutionError } from '../../core/error.js';

export class SSHError extends ExecutionError {
  constructor(message: string, code: string | null = null) { super(message, code ?? 'SSH_ERROR'); this.name = 'SSHError'; }
}

export interface SSHRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

type ConnectionWatch = { failure?: Error; subscribers: Set<(error: Error) => void>; detach: () => void };
const watches = new WeakMap<EventEmitter, ConnectionWatch>();
export function connectionFailure(connection: EventEmitter): Error | undefined { return watches.get(connection)?.failure; }

/** One transport observer per connection, regardless of concurrent channels and requests. */
export function watchConnection(connection: EventEmitter, failed: (error: Error) => void): () => void {
  let watch = watches.get(connection);
  if (!watch) {
    const subscribers = new Set<(error: Error) => void>();
    const lost = (error: Error) => {
      if (owned.failure) return;
      owned.failure = error; owned.detach();
      const callbacks = [...subscribers]; subscribers.clear();
      for (const callback of callbacks) callback(error);
    };
    const closed = () => lost(new SSHError('SSH connection closed before operation completion', 'ECONNRESET'));
    const owned: ConnectionWatch = { subscribers, detach: () => {
      connection.off('error', lost); connection.off('close', closed); connection.off('end', closed);
    } };
    connection.on('error', lost); connection.once('close', closed); connection.once('end', closed);
    watches.set(connection, owned); watch = owned;
  }
  if (watch.failure) { const failure = watch.failure; queueMicrotask(() => failed(failure)); return () => {}; }
  const owned = watch; owned.subscribers.add(failed);
  return () => {
    owned.subscribers.delete(failed);
    if (!owned.subscribers.size && !owned.failure) { owned.detach(); watches.delete(connection); }
  };
}

/** Opening a resource owns listeners until one terminal outcome and disposes late replies. */
export function requestResource<T>(
  connection: EventEmitter,
  name: string,
  request: SSHRequestOptions,
  open: (done: (error: Error | undefined | null, resource: T) => void) => void,
  dispose: (resource: T) => void,
): Promise<T> {
  const timeoutMs = request.timeoutMs ?? 15000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new SSHError(`${name} timeout must be positive`, 'EINVAL'));
  const priorFailure = connectionFailure(connection);
  if (priorFailure) return Promise.reject(priorFailure);
  if (request.signal?.aborted) return Promise.reject(new SSHError(`${name} cancelled`, 'ABORT_ERR'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      unwatch();
      request.signal?.removeEventListener('abort', cancelled);
    };
    const failed = (error: Error) => { if (!settled) { settled = true; cleanup(); reject(error); } };
    const cancelled = () => failed(new SSHError(`${name} cancelled`, 'ABORT_ERR'));
    const timer = setTimeout(() => failed(new SSHError(`${name} timed out`, 'ETIMEDOUT')), timeoutMs);
    const unwatch = watchConnection(connection, failed);
    request.signal?.addEventListener('abort', cancelled, { once: true });
    try {
      open((error, resource) => {
        if (settled) { if (resource) dispose(resource); return; }
        if (error) { failed(error); return; }
        settled = true; cleanup(); resolve(resource);
      });
    } catch (error) { failed(error instanceof Error ? error : new Error(String(error))); }
  });
}
