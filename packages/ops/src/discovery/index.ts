/**
 * Infrastructure discovery — find hosts, containers, pods dynamically.
 *
 * @example
 * ```typescript
 * import { Discovery } from '@xec-sh/ops/discovery';
 *
 * const discovery = Discovery.create()
 *   .docker({ label: 'env=prod', status: 'running' })
 *   .kubernetes({ namespace: 'production', label: 'app=web' })
 *   .ssh({ hosts: ['10.0.0.1', '10.0.0.2'], port: 22 })
 *   .custom('consul', async () => {
 *     const resp = await fetch('http://consul:8500/v1/catalog/service/web');
 *     const services = await resp.json();
 *     return services.map(s => ({ id: s.Node, host: s.Address, port: s.ServicePort }));
 *   });
 *
 * const targets = await discovery.scan();
 * // [{ id: 'web-1', type: 'docker', host: '...', meta: {...} }, ...]
 * ```
 *
 * @module @xec-sh/ops/discovery
 */

import { connect } from 'node:net';

import { runOperation, type OperationExec, type OperationOptions } from '../utils/operation-scope.js';

export interface DiscoveredTarget {
  id: string;
  type: 'docker' | 'kubernetes' | 'ssh' | 'custom';
  host?: string;
  port?: number;
  container?: string;
  pod?: string;
  namespace?: string;
  labels?: Record<string, string>;
  meta?: Record<string, unknown>;
}

export interface DockerDiscoveryOptions {
  label?: string;
  name?: string;
  status?: 'running' | 'exited' | 'all';
  network?: string;
}

export interface K8sDiscoveryOptions {
  namespace?: string;
  label?: string;
  fieldSelector?: string;
  context?: string;
}

export interface SshDiscoveryOptions {
  hosts: string[];
  port?: number;
  timeout?: number;
}

interface DiscoverySource {
  type: string;
  scan: (exec: OperationExec, signal: AbortSignal) => Promise<DiscoveredTarget[]>;
}

export class Discovery {
  private sources: DiscoverySource[] = [];

  private constructor() {}

  static create(): Discovery {
    return new Discovery();
  }

  /** Discover Docker containers */
  docker(opts: DockerDiscoveryOptions = {}): this {
    this.sources.push({
      type: 'docker',
      scan: async (exec) => {
        // argv, never a shell string: these options come from config or CI
        // variables, and interpolating them into a command line let
        // `label: "x; touch OWNED; echo"` execute.
        const args: string[] = ['ps'];
        if (opts.status === 'all' || opts.status === 'exited') args.push('-a');
        if (opts.label) args.push('--filter', `label=${opts.label}`);
        if (opts.name) args.push('--filter', `name=${opts.name}`);
        if (opts.status && opts.status !== 'all') args.push('--filter', `status=${opts.status}`);
        if (opts.network) args.push('--filter', `network=${opts.network}`);
        args.push('--format', '{{json .}}');

        try {
          const result = await exec({ command: 'docker', args, shell: false });
          const output = result.buffer().toString('utf8');

          return output
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const data = JSON.parse(line);
              if (typeof data.Names !== 'string' || !data.Names) throw new Error('Docker returned a container without a name');
              return {
                id: `docker:${data.Names}`,
                type: 'docker' as const,
                container: data.Names,
                host: 'localhost',
                labels: this.parseLabels(data.Labels || ''),
                meta: { image: data.Image, status: data.Status, ports: data.Ports },
              };
            });
        } catch (error) {
          throw new Error('Docker discovery failed', { cause: error });
        }
      },
    });
    return this;
  }

  /** Discover Kubernetes pods */
  kubernetes(opts: K8sDiscoveryOptions = {}): this {
    this.sources.push({
      type: 'kubernetes',
      scan: async (exec) => {
        const args: string[] = ['get', 'pods', '-o', 'json'];
        if (opts.namespace) args.push('-n', opts.namespace);
        if (opts.label) args.push('-l', opts.label);
        if (opts.fieldSelector) args.push(`--field-selector=${opts.fieldSelector}`);
        if (opts.context) args.push(`--context=${opts.context}`);

        try {
          const result = await exec({ command: 'kubectl', args, shell: false });
          const data = JSON.parse(result.buffer().toString('utf8'));
          if (!Array.isArray(data.items)) throw new Error('kubectl did not return a pod list');

          return data.items.map((pod: Record<string, unknown>) => {
            const metadata = pod['metadata'] as Record<string, unknown> | undefined;
            const status = pod['status'] as Record<string, unknown> | undefined;
            const spec = pod['spec'] as Record<string, unknown> | undefined;
            const containers = spec?.['containers'] as Array<Record<string, string>> | undefined;
            return {
              id: `k8s:${metadata?.['namespace']}/${metadata?.['name']}`,
              type: 'kubernetes' as const,
              pod: metadata?.['name'] as string | undefined,
              namespace: metadata?.['namespace'] as string | undefined,
              host: status?.['podIP'] as string | undefined,
              labels: metadata?.['labels'] as Record<string, string> | undefined,
              meta: {
                phase: status?.['phase'],
                node: spec?.['nodeName'],
                containers: containers?.map((c) => c['name']),
              },
            };
          });
        } catch (error) {
          throw new Error('Kubernetes discovery failed', { cause: error });
        }
      },
    });
    return this;
  }

  /** Discover SSH hosts by testing connectivity */
  ssh(opts: SshDiscoveryOptions): this {
    this.sources.push({
      type: 'ssh',
      scan: async (_exec, signal) => {
        const port = opts.port ?? 22;
        const timeout = opts.timeout ?? 2000;
        const targets: DiscoveredTarget[] = [];
        for (const host of opts.hosts) {
          signal.throwIfAborted();
          const reachable = await new Promise<boolean>((resolve) => {
            const socket = connect({ host, port });
            let connected = false;
            const abort = () => socket.destroy();
            const timer = setTimeout(() => socket.destroy(), timeout);
            socket.once('connect', () => { connected = true; socket.destroy(); });
            socket.once('error', () => socket.destroy());
            socket.once('close', () => {
              clearTimeout(timer);
              signal.removeEventListener('abort', abort);
              resolve(connected);
            });
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
          });
          signal.throwIfAborted();
          if (reachable) targets.push({ id: `ssh:${host}`, type: 'ssh', host, port });
        }
        return targets;
      },
    });
    return this;
  }

  /** Add a custom discovery source */
  custom(name: string, scanFn: (signal?: AbortSignal) => Promise<DiscoveredTarget[]>): this {
    this.sources.push({ type: name, scan: (_exec, signal) => scanFn(signal) });
    return this;
  }

  /** Run all discovery sources */
  async scan(options: OperationOptions = {}): Promise<DiscoveredTarget[]> {
    return runOperation({ timeout: 30_000, ...options }, async ({ exec, signal }) => {
      const settled = await Promise.allSettled(this.sources.map(source => source.scan(exec, signal)));
      const errors = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (errors.length) throw new AggregateError(errors.map(result => result.reason), 'Discovery failed');
      return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    }, { exactOutput: true });
  }

  /** Run discovery and group by type */
  async scanGrouped(options: OperationOptions = {}): Promise<Record<string, DiscoveredTarget[]>> {
    const targets = await this.scan(options);
    const grouped: Record<string, DiscoveredTarget[]> = {};
    for (const target of targets) {
      (grouped[target.type] ??= []).push(target);
    }
    return grouped;
  }

  private parseLabels(labelStr: string): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const pair of labelStr.split(',')) {
      const index = pair.indexOf('=');
      const key = (index < 0 ? pair : pair.slice(0, index)).trim();
      if (key) labels[key] = index < 0 ? '' : pair.slice(index + 1).trim();
    }
    return labels;
  }
}
