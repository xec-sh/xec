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
 *   .ssh({ hosts: ['10.0.0.0/24'], port: 22 })
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

import { execSync } from 'node:child_process';

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
  scan: () => Promise<DiscoveredTarget[]>;
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
      scan: async () => {
        const filters: string[] = [];
        if (opts.label) filters.push(`--filter label=${opts.label}`);
        if (opts.name) filters.push(`--filter name=${opts.name}`);
        if (opts.status && opts.status !== 'all') filters.push(`--filter status=${opts.status}`);
        if (opts.network) filters.push(`--filter network=${opts.network}`);

        try {
          const cmd = `docker ps ${opts.status === 'all' ? '-a' : ''} ${filters.join(' ')} --format '{{json .}}'`;
          const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

          return output
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const data = JSON.parse(line);
              return {
                id: `docker:${data.Names}`,
                type: 'docker' as const,
                container: data.Names,
                host: 'localhost',
                labels: this.parseLabels(data.Labels || ''),
                meta: { image: data.Image, status: data.Status, ports: data.Ports },
              };
            });
        } catch {
          return [];
        }
      },
    });
    return this;
  }

  /** Discover Kubernetes pods */
  kubernetes(opts: K8sDiscoveryOptions = {}): this {
    this.sources.push({
      type: 'kubernetes',
      scan: async () => {
        const args: string[] = ['get', 'pods', '-o', 'json'];
        if (opts.namespace) args.push('-n', opts.namespace);
        if (opts.label) args.push('-l', opts.label);
        if (opts.fieldSelector) args.push(`--field-selector=${opts.fieldSelector}`);
        if (opts.context) args.push(`--context=${opts.context}`);

        try {
          const output = execSync(`kubectl ${args.join(' ')}`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          const data = JSON.parse(output);

          return (data.items || []).map((pod: Record<string, unknown>) => {
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
        } catch {
          return [];
        }
      },
    });
    return this;
  }

  /** Discover SSH hosts by testing connectivity */
  ssh(opts: SshDiscoveryOptions): this {
    this.sources.push({
      type: 'ssh',
      scan: async () => {
        const port = opts.port ?? 22;
        const timeout = opts.timeout ?? 2000;
        const targets: DiscoveredTarget[] = [];

        for (const host of opts.hosts) {
          try {
            const { connect } = await import('node:net');
            const reachable = await new Promise<boolean>((resolve) => {
              const socket = connect({ host, port, timeout }, () => {
                socket.destroy();
                resolve(true);
              });
              socket.on('error', () => resolve(false));
              socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
              });
            });

            if (reachable) {
              targets.push({
                id: `ssh:${host}`,
                type: 'ssh',
                host,
                port,
              });
            }
          } catch {
            // Host not reachable
          }
        }
        return targets;
      },
    });
    return this;
  }

  /** Add a custom discovery source */
  custom(name: string, scanFn: () => Promise<DiscoveredTarget[]>): this {
    this.sources.push({ type: name, scan: scanFn });
    return this;
  }

  /** Run all discovery sources */
  async scan(): Promise<DiscoveredTarget[]> {
    const results = await Promise.all(this.sources.map((s) => s.scan()));
    return results.flat();
  }

  /** Run discovery and group by type */
  async scanGrouped(): Promise<Record<string, DiscoveredTarget[]>> {
    const targets = await this.scan();
    const grouped: Record<string, DiscoveredTarget[]> = {};
    for (const target of targets) {
      (grouped[target.type] ??= []).push(target);
    }
    return grouped;
  }

  private parseLabels(labelStr: string): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const pair of labelStr.split(',')) {
      const [key, value] = pair.split('=');
      if (key) labels[key.trim()] = value?.trim() ?? '';
    }
    return labels;
  }
}
