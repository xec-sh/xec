import type { SSHConnectionConfig } from './contracts.js';

import { createHash } from 'node:crypto';

/** Pool identity includes the complete effective authentication and trust policy. */
export class SSHConnectionIdentity {
  private readonly references = new WeakMap<object, number>();
  private sequence = 0;

  private reference(value: object): number {
    let id = this.references.get(value);
    if (id === undefined) { id = ++this.sequence; this.references.set(value, id); }
    return id;
  }

  key(config: SSHConnectionConfig): string {
    const visiting = new Set<object>();
    const encode = (value: unknown): unknown => {
      if (Buffer.isBuffer(value)) return ['bytes', value.toString('base64')];
      if (typeof value === 'function') return ['reference', this.reference(value)];
      if (value === null || typeof value !== 'object') return [typeof value, value];
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        return ['reference', this.reference(value)];
      }
      if (visiting.has(value)) throw new Error('Cyclic SSH connection configuration');
      visiting.add(value);
      const result = Array.isArray(value) ? ['array', value.map(encode)]
        : ['object', Object.keys(value).sort().map(key => [key, encode((value as Record<string, unknown>)[key])])];
      visiting.delete(value);
      return result;
    };
    // Cancellation belongs to the borrowing operation, not to the authenticated
    // identity. Every acquisition checks it independently before reusing a socket.
    const { signal: _signal, agent, sock, ...values } = config;
    const identity = [encode(values), typeof agent === 'object' && agent ? ['agent', this.reference(agent)] : encode(agent),
      sock ? ['socket', this.reference(sock)] : null];
    return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }
}
