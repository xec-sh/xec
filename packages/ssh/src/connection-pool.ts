import type { SSHConnectionConfig } from './contracts.js';
import type { SSHRequestOptions } from './request-lifecycle.js';
import type { ConnectionPoolMetrics, PooledConnectionMetrics } from './connection-pool-metrics.js';

import { randomUUID } from 'node:crypto';
import { connect as netConnect } from 'node:net';
import { setInterval, clearInterval } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';

import { SSHError } from './errors.js';
import { KeyedMutex } from './mutex.js';
import { SSHClient } from './client.js';
import { readRegularFile } from './files.js';
import { SSHKeyValidator } from './ssh-key-validator.js';
import { validateTimeoutMs } from './request-lifecycle.js';
import { SSHConnectionIdentity } from './connection-identity.js';
import { ConnectionPoolMetricsCollector } from './connection-pool-metrics.js';

export interface SSHConnectionPoolOptions {
  enabled: boolean;
  maxConnections: number;
  idleTimeout: number;
  maxLifetime: number;
  keepAlive: boolean;
  keepAliveInterval: number;
  /** Retry connection establishment only; no channel or command is ever replayed. */
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectDelay: number;
}

export interface SSHConnectionLease {
  readonly client: SSHClient;
  /** Mark an unsuccessful operation; retirement never interrupts another lease. */
  markFailed(): void;
  /** Idempotent: releasing twice never decrements a different borrower's pin. */
  release(): void;
}

export interface SSHTunnelOptions {
  localPort?: number;
  localHost?: string;
  remoteHost: string;
  remotePort: number;
}
export interface SSHReverseTunnelOptions extends SSHRequestOptions {
  remotePort: number;
  remoteHost?: string;
  localHost?: string;
  localPort: number;
}
export interface SSHTunnel {
  readonly localPort: number;
  readonly localHost: string;
  readonly remoteHost: string;
  readonly remotePort: number;
  readonly isOpen: boolean;
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export type SSHConnectionPoolEvent =
  | { type: 'connect'; host: string; port: number; username: string }
  | { type: 'disconnect'; host: string; port: number; reason: string }
  | { type: 'reconnect'; host: string; attempt: number }
  | { type: 'metrics'; metrics: ConnectionPoolMetrics }
  | { type: 'cleanup'; cleaned: number; remaining: number }
  | { type: 'tunnel-created' | 'tunnel-closed'; localPort: number; remoteHost: string; remotePort: number };

interface Connection {
  key: string;
  client: SSHClient;
  config: SSHConnectionConfig;
  reusable: boolean;
  retiring: boolean;
  created: number;
  lastUsed: number;
  useCount: number;
  active: number;
  errors: number;
}

/** Owns transport admission, connection leases and listener lifetimes. */
export class SSHConnectionPool {
  readonly options: Readonly<SSHConnectionPoolOptions>;
  private readonly connections = new Map<string, Connection>();
  private readonly connecting = new Map<SSHClient, { abort: AbortController; settled: Promise<void> }>();
  private readonly tunnels = new Set<SSHTunnel>();
  private readonly mutex = new KeyedMutex<string>();
  private readonly identity = new SSHConnectionIdentity();
  private readonly metrics = new ConnectionPoolMetricsCollector();
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;
  private readonly shutdown = new AbortController();
  private disposal?: Promise<void>;
  private observerFailure?: SSHError;

  constructor(
    options: Partial<SSHConnectionPoolOptions> = {},
    private readonly defaults: SSHConnectionConfig = {},
    private readonly onEvent?: (event: SSHConnectionPoolEvent) => void
  ) {
    this.options = Object.freeze({
      enabled: options.enabled ?? true,
      maxConnections: options.maxConnections ?? 10,
      idleTimeout: options.idleTimeout ?? 300_000,
      maxLifetime: options.maxLifetime ?? 3_600_000,
      keepAlive: options.keepAlive ?? true,
      keepAliveInterval: options.keepAliveInterval ?? 30_000,
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelay: options.reconnectDelay ?? 1000,
    });
    for (const [name, value] of Object.entries(this.options)) {
      if (['enabled', 'keepAlive', 'autoReconnect'].includes(name)) {
        if (typeof value !== 'boolean') throw new SSHError(`SSH ${name} must be a boolean`, 'EINVAL');
      } else if (name === 'keepAliveInterval' || name === 'reconnectDelay') {
        validateTimeoutMs(value as number, `SSH ${name}`, true);
      } else if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < (name === 'maxConnections' ? 1 : 0)
      ) {
        throw new SSHError(
          `SSH ${name} must be a ${name === 'maxConnections' ? 'positive' : 'non-negative'} integer`,
          'EINVAL'
        );
      }
    }
    if (this.options.enabled) {
      this.timer = setInterval(() => this.cleanup(), 60_000);
      this.timer.unref();
    }
  }

  async acquire(
    config: SSHConnectionConfig,
    request: Pick<SSHRequestOptions, 'signal'> = {},
    exclusive = false
  ): Promise<SSHConnectionLease> {
    this.assertActive(request.signal, config.signal);
    const effective = this.connectionOptions(config);
    if (effective.privateKeyPath) {
      if (effective.privateKey) throw new SSHError('Specify privateKey or privateKeyPath, not both', 'EINVAL');
      // Identity and authentication consume the same bounded bytes. The owning
      // transport parses them once before authentication.
      effective.privateKey = await readRegularFile(effective.privateKeyPath, 1024 * 1024, {
        signal: AbortSignal.any(
          [this.shutdown.signal, request.signal, effective.signal].filter((value): value is AbortSignal => !!value)
        ),
      });
      delete effective.privateKeyPath;
    }
    const reusable = this.options.enabled && !exclusive && !effective.sock;
    const key = reusable ? this.identity.key(effective) : `exclusive:${randomUUID()}`;
    const acquire = async () => {
      this.assertActive(request.signal, effective.signal);
      if (reusable) {
        const existing = this.connections.get(key);
        if (existing) {
          if (existing.retiring || (existing.errors > 3 && existing.active > 0)) {
            throw new SSHError('SSH connection is retiring while active operations finish', 'ENOBUFS');
          }
          const expired = this.options.maxLifetime > 0 && Date.now() - existing.created > this.options.maxLifetime;
          if (!existing.client.isConnected() || (existing.active === 0 && (expired || existing.errors > 3))) {
            this.close(existing, 'retired');
          } else {
            const verificationSignal = AbortSignal.any(
              [this.shutdown.signal, request.signal, effective.signal].filter((value): value is AbortSignal => !!value)
            );
            try {
              await existing.client.revalidateTrust({ signal: verificationSignal });
            } catch (error) {
              // Cancelling one borrower does not revoke a shared identity.
              if (verificationSignal.aborted) throw error;
              existing.retiring = true;
              if (!existing.active) this.close(existing, 'trust-rejected');
              throw error;
            }
            this.assertActive(request.signal, effective.signal);
            if (!existing.client.isConnected()) {
              this.close(existing, 'transport-closed');
              throw new SSHError('SSH connection closed before acquisition', 'ECONNRESET');
            }
            existing.active++;
            existing.useCount++;
            existing.lastUsed = Date.now();
            this.metrics.onConnectionReused();
            const lease = this.lease(existing);
            try {
              this.notifyMetrics(true);
              return lease;
            } catch (error) {
              lease.release();
              throw error;
            }
          }
        }
      }
      for (let attempt = 0; ; attempt++) {
        try {
          return this.lease(await this.create(effective, key, reusable, request.signal));
        } catch (error) {
          // Only authoritative pre-dispatch transport failures authorize retry.
          const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
          if (
            !this.options.autoReconnect ||
            attempt >= this.options.maxReconnectAttempts ||
            !['ECONNRESET', 'EPIPE'].includes(String(code))
          )
            throw error;
          this.assertActive(request.signal, effective.signal);
          this.emit({ type: 'reconnect', host: effective.host ?? '', attempt: attempt + 1 }, true);
          const signal = AbortSignal.any(
            [this.shutdown.signal, request.signal, effective.signal].filter((value): value is AbortSignal => !!value)
          );
          await delay(this.options.reconnectDelay, undefined, { signal });
        }
      }
    };
    const signal = AbortSignal.any(
      [this.shutdown.signal, request.signal, effective.signal].filter((value): value is AbortSignal => !!value)
    );
    return reusable ? this.mutex.withLock(key, acquire, signal) : acquire();
  }

  private connectionOptions(config: SSHConnectionConfig): SSHConnectionConfig {
    const effective: SSHConnectionConfig = {
      keepaliveInterval: this.options.keepAlive ? this.options.keepAliveInterval : 0,
      keepaliveCountMax: 3,
      hostKeyChecking: 'strict',
      ...this.defaults,
      ...Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)),
      port: config.port ?? this.defaults.port ?? 22,
    };
    if (config.privateKey !== undefined && config.privateKeyPath === undefined) delete effective.privateKeyPath;
    if (config.privateKeyPath !== undefined && config.privateKey === undefined) delete effective.privateKey;
    return effective;
  }

  private assertActive(...signals: (AbortSignal | undefined)[]): void {
    if (this.disposed) throw new SSHError('SSH connection pool is disposed', 'ESHUTDOWN');
    if (signals.some((signal) => signal?.aborted)) throw new SSHError('SSH connection cancelled', 'ABORT_ERR');
  }

  private async create(
    config: SSHConnectionConfig,
    key: string,
    reusable: boolean,
    signal?: AbortSignal
  ): Promise<Connection> {
    this.assertActive(signal, config.signal);
    const validation = SSHKeyValidator.validateSSHOptions(config);
    if (!validation.isValid) throw new SSHError(`Invalid SSH options: ${validation.issues.join(', ')}`, 'EINVAL');
    if (this.connections.size + this.connecting.size >= this.options.maxConnections) {
      const idle = [...this.connections.values()]
        .filter((connection) => !connection.active)
        .sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (idle) this.close(idle, 'capacity');
    }
    if (this.connections.size + this.connecting.size >= this.options.maxConnections) {
      throw new SSHError('SSH connection capacity is busy; no active connection was evicted', 'ENOBUFS');
    }
    const client = new SSHClient();
    const abort = new AbortController();
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.connecting.set(client, { abort, settled });
    try {
      const combined = AbortSignal.any(
        [abort.signal, signal, config.signal].filter((value): value is AbortSignal => !!value)
      );
      await client.connect({ ...config, signal: combined });
      if (this.disposed || combined.aborted) throw new SSHError('SSH connection cancelled', 'ABORT_ERR');
      if (!client.isConnected()) throw new SSHError('SSH connection closed before acquisition', 'ECONNRESET');
      const now = Date.now();
      const connection: Connection = {
        key,
        client,
        config,
        reusable,
        retiring: false,
        created: now,
        lastUsed: now,
        useCount: 1,
        active: 1,
        errors: 0,
      };
      this.connections.set(key, connection);
      this.metrics.onConnectionCreated();
      this.emit(
        { type: 'connect', host: config.host ?? '', port: config.port ?? 22, username: config.username ?? '' },
        true
      );
      this.notifyMetrics(true);
      return connection;
    } catch (error) {
      const owned = this.connections.get(key);
      if (owned?.client === client) this.close(owned, 'admission-failed');
      else client.dispose(true);
      this.metrics.onConnectionFailed();
      throw error;
    } finally {
      this.connecting.delete(client);
      settle();
    }
  }

  private lease(connection: Connection): SSHConnectionLease {
    let released = false;
    let failed = false;
    return {
      client: connection.client,
      markFailed: () => {
        if (!released && !failed) {
          failed = true;
          connection.errors++;
        }
      },
      release: () => {
        if (released) return;
        released = true;
        connection.active--;
        connection.lastUsed = Date.now();
        const expired = this.options.maxLifetime > 0 && Date.now() - connection.created > this.options.maxLifetime;
        if (!connection.active && (!connection.reusable || connection.retiring || connection.errors > 3 || expired))
          this.close(connection, 'released');
      },
    };
  }

  private close(connection: Connection, reason: string): void {
    if (this.connections.get(connection.key) !== connection) return;
    this.connections.delete(connection.key);
    connection.client.dispose(true);
    this.metrics.onConnectionDestroyed();
    this.emit({ type: 'disconnect', host: connection.config.host ?? '', port: connection.config.port ?? 22, reason });
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const connection of this.connections.values()) {
      if (connection.active) continue;
      const reason = !connection.client.isConnected()
        ? 'transport-closed'
        : this.options.idleTimeout > 0 && now - connection.lastUsed > this.options.idleTimeout
          ? 'idle-timeout'
          : this.options.maxLifetime > 0 && now - connection.created > this.options.maxLifetime
            ? 'max-lifetime'
            : undefined;
      if (reason) {
        this.close(connection, reason);
        cleaned++;
      }
    }
    if (cleaned) {
      this.metrics.onCleanup();
      this.emit({ type: 'cleanup', cleaned, remaining: this.connections.size });
    }
  }

  getMetrics(): ConnectionPoolMetrics {
    const metrics = new Map<string, PooledConnectionMetrics>();
    for (const [key, connection] of this.connections)
      metrics.set(key, {
        created: new Date(connection.created),
        lastUsed: new Date(connection.lastUsed),
        useCount: connection.useCount,
        isAlive: connection.client.isConnected(),
        isActive: connection.active > 0,
        errors: connection.errors,
      });
    return this.metrics.getMetrics(this.connections.size, metrics);
  }
  private emit(event: SSHConnectionPoolEvent, failAdmission = false): void {
    // An admission callback failure releases only that admission. Background
    // observers cannot interrupt active operations: retain their first failure
    // for dispose(), without poisoning unrelated connections or a timer thread.
    try {
      this.onEvent?.(event);
    } catch (error) {
      const failure = new SSHError('SSH pool observer failed', 'SSH_OBSERVER_ERROR', { cause: error });
      if (failAdmission) throw failure;
      this.observerFailure ??= failure;
    }
  }
  private notifyMetrics(failAdmission = false): void {
    this.emit({ type: 'metrics', metrics: this.getMetrics() }, failAdmission);
  }

  async tunnel(options: SSHTunnelOptions, config: SSHConnectionConfig): Promise<SSHTunnel> {
    this.validatePorts(options.localPort ?? 0, options.remotePort, true);
    const lease = await this.acquire(config);
    try {
      const tunnel = await lease.client.createTunnel(options);
      if (this.disposed) {
        await tunnel.close();
        throw new SSHError('SSH connection pool is disposed', 'ESHUTDOWN');
      }
      return this.trackTunnel(tunnel, lease);
    } catch (error) {
      lease.release();
      throw error;
    }
  }

  async reverseTunnel(options: SSHReverseTunnelOptions, config: SSHConnectionConfig): Promise<SSHTunnel> {
    this.validatePorts(options.localPort, options.remotePort, false);
    const lease = await this.acquire(config, options, true);
    const remoteHost = options.remoteHost ?? '127.0.0.1';
    const localHost = options.localHost ?? 'localhost';
    const bridges = new Set<ReturnType<typeof netConnect>>();
    const destroyBridges = () => {
      for (const socket of bridges) socket.destroy();
      bridges.clear();
    };
    try {
      const forwarded = await lease.client.forwardIn(
        remoteHost,
        options.remotePort,
        (_details, accept) => {
          const channel = accept();
          const local = netConnect(options.localPort, localHost);
          bridges.add(local);
          local.once('connect', () => {
            channel.pipe(local).pipe(channel);
          });
          local.on('error', () => channel.destroy());
          local.once('close', () => {
            bridges.delete(local);
            channel.destroy();
          });
          channel.on('error', () => local.destroy());
          channel.once('close', () => local.destroy());
        },
        options
      );
      if (this.disposed) {
        await forwarded.dispose();
        throw new SSHError('SSH connection pool is disposed', 'ESHUTDOWN');
      }
      void forwarded.closed.then(destroyBridges);
      return this.trackTunnel(
        {
          localPort: options.localPort,
          localHost,
          remoteHost,
          remotePort: forwarded.port,
          closed: forwarded.closed,
          close: () => forwarded.dispose(),
        },
        lease,
        destroyBridges
      );
    } catch (error) {
      destroyBridges();
      lease.release();
      throw error;
    }
  }

  private validatePorts(local: number, remote: number, forward: boolean): void {
    if (
      !Number.isInteger(local) ||
      local < (forward ? 0 : 1) ||
      local > 65535 ||
      !Number.isInteger(remote) ||
      remote < (forward ? 1 : 0) ||
      remote > 65535
    ) {
      throw new SSHError('Invalid SSH tunnel port', 'EINVAL');
    }
  }

  private trackTunnel(value: Omit<SSHTunnel, 'isOpen'>, lease: SSHConnectionLease, cleanup = () => {}): SSHTunnel {
    let open = true;
    let closing: Promise<void> | undefined;
    const release = () => {
      if (!open) return;
      open = false;
      cleanup();
      lease.release();
      this.tunnels.delete(tunnel);
      this.emit({
        type: 'tunnel-closed',
        localPort: value.localPort,
        remoteHost: value.remoteHost,
        remotePort: value.remotePort,
      });
    };
    const tunnel: SSHTunnel = {
      ...value,
      get isOpen() {
        return open;
      },
      close: () => {
        if (!open) return Promise.resolve();
        closing ??= value
          .close()
          .then(release)
          .catch((error) => {
            closing = undefined;
            throw error;
          });
        return closing;
      },
    };
    this.tunnels.add(tunnel);
    void value.closed.then(release);
    this.emit({
      type: 'tunnel-created',
      localPort: value.localPort,
      remoteHost: value.remoteHost,
      remotePort: value.remotePort,
    });
    return tunnel;
  }

  dispose(): Promise<void> {
    return (this.disposal ??= this.closeOwned());
  }
  private async closeOwned(): Promise<void> {
    this.disposed = true;
    this.shutdown.abort();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const pending = [...this.connecting.entries()];
    for (const [client, { abort }] of pending) {
      abort.abort();
      client.dispose(true);
    }
    await Promise.all(pending.map(([, value]) => value.settled));
    const closed = await Promise.allSettled([...this.tunnels].map((tunnel) => tunnel.close()));
    for (const connection of this.connections.values()) this.close(connection, 'pool-dispose');
    this.mutex.clear();
    const failures = closed
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (this.observerFailure) failures.push(this.observerFailure);
    if (failures.length) throw new AggregateError(failures, 'SSH pool cleanup or observation failed');
  }
}
