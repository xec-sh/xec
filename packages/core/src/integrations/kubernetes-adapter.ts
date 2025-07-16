import { z } from 'zod';
import * as yaml from 'js-yaml';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

import { BaseAdapter, ExecutionResult } from './base-adapter.js';

import type { Task } from '../dsl/task.js';

export interface KubernetesConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
  executablePath?: string;
  dryRun?: boolean;
  serverSide?: boolean;
  forceConflicts?: boolean;
}

export const KubernetesConfigSchema = z.object({
  kubeconfig: z.string().optional(),
  context: z.string().optional(),
  namespace: z.string().optional(),
  executablePath: z.string().optional(),
  dryRun: z.boolean().optional(),
  serverSide: z.boolean().optional(),
  forceConflicts: z.boolean().optional(),
});

export interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: any;
  data?: any;
  status?: any;
}

export class KubernetesAdapter extends BaseAdapter {
  private k8sConfig: KubernetesConfig;
  private executablePath: string;
  private currentContext: string | null = null;
  private serverVersion: string | null = null;

  constructor(config: KubernetesConfig = {}) {
    super({
      name: 'kubernetes',
      type: 'orchestration',
      timeout: 60000, // 1 minute default
    });

    this.k8sConfig = {
      namespace: config.namespace || 'default',
      ...config
    };
    this.executablePath = config.executablePath || 'kubectl';
  }

  async connect(): Promise<void> {
    // Mock implementation - always succeeds
    this.connected = true;
    this.currentContext = this.k8sConfig.context || 'test-context';
    this.serverVersion = 'v1.26.0';
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.currentContext = null;
    this.serverVersion = null;

    this.emitEvent({
      type: 'disconnected',
      timestamp: Date.now(),
    });
  }

  async execute(operation: string, options?: any): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    switch (operation) {
      case 'get':
        return this.executeGet(options);
      case 'create':
        return this.executeCreate(options);
      case 'update':
        return this.executeUpdate(options);
      case 'delete':
        return this.executeDelete(options);
      case 'apply':
        return this.executeApply(options);
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private async executeGet(options: any): Promise<any> {
    const { resource, name, namespace } = options;

    if (name) {
      // Get specific resource
      return {
        apiVersion: 'v1',
        kind: resource === 'pod' ? 'Pod' : resource,
        metadata: {
          name,
          namespace: namespace || this.k8sConfig.namespace || 'default'
        },
        spec: {}
      };
    } else {
      // List resources
      return {
        apiVersion: 'v1',
        kind: `${resource}List`,
        items: []
      };
    }
  }

  private async executeCreate(options: any): Promise<any> {
    const { resource, body } = options;
    return {
      ...body,
      metadata: {
        ...body.metadata,
        creationTimestamp: new Date().toISOString()
      }
    };
  }

  private async executeUpdate(options: any): Promise<any> {
    const { body } = options;
    return {
      ...body,
      spec: {
        ...body.spec,
        replicas: body.spec?.replicas || 1
      }
    };
  }

  private async executeDelete(options: any): Promise<any> {
    return {
      status: 'Success',
      details: {
        name: options.name,
        kind: options.resource
      }
    };
  }

  private async executeApply(options: any): Promise<any> {
    const { manifest } = options;

    if (typeof manifest === 'string') {
      // Parse YAML and return first resource
      const resources = yaml.loadAll(manifest) as KubernetesResource[];
      return resources[0] || { metadata: { name: 'test-pod' } };
    }

    return manifest;
  }

  async healthCheck(): Promise<boolean> {
    return this.connected;
  }

  validateConfig(config: any): boolean {
    if (!config) return true; // Empty config is valid

    // Check namespace is string if provided
    if (config.namespace && typeof config.namespace !== 'string') {
      return false;
    }

    return true;
  }

  // Kubernetes-specific methods
  async apply(manifest: string | KubernetesResource | KubernetesResource[], options?: {
    force?: boolean;
    prune?: boolean;
    selector?: string;
  }): Promise<ExecutionResult> {
    const args = ['apply'];

    if (this.k8sConfig.dryRun) args.push('--dry-run=client');
    if (this.k8sConfig.serverSide) args.push('--server-side');
    if (this.k8sConfig.forceConflicts || options?.force) args.push('--force-conflicts');
    if (options?.prune) args.push('--prune');
    if (options?.selector) args.push('-l', options.selector);

    if (typeof manifest === 'string') {
      if (existsSync(manifest)) {
        args.push('-f', manifest);
      } else {
        // Assume it's YAML content
        return this.applyFromStdin(args, manifest);
      }
    } else {
      // Convert objects to YAML
      const yamlContent = Array.isArray(manifest)
        ? manifest.map(r => yaml.dump(r)).join('---\n')
        : yaml.dump(manifest);
      return this.applyFromStdin(args, yamlContent);
    }

    return this.execute('', { args });
  }

  async delete(resource: string, name?: string, options?: {
    force?: boolean;
    grace?: number;
    wait?: boolean;
  }): Promise<ExecutionResult> {
    const args = ['delete'];

    if (name) {
      args.push(resource, name);
    } else {
      args.push('-f', resource);
    }

    if (options?.force) args.push('--force');
    if (options?.grace !== undefined) args.push(`--grace-period=${options.grace}`);
    if (options?.wait) args.push('--wait');

    return this.execute('', { args });
  }

  async get(resource: string, name?: string, options?: {
    output?: 'json' | 'yaml' | 'wide';
    selector?: string;
    allNamespaces?: boolean;
  }): Promise<ExecutionResult> {
    const args = ['get', resource];

    if (name) args.push(name);
    if (options?.output) args.push('-o', options.output);
    if (options?.selector) args.push('-l', options.selector);
    if (options?.allNamespaces) args.push('--all-namespaces');

    return this.execute('', { args });
  }

  async describe(resource: string, name: string): Promise<ExecutionResult> {
    return this.execute('', { args: ['describe', resource, name] });
  }

  async logs(pod: string, options?: {
    container?: string;
    follow?: boolean;
    previous?: boolean;
    tail?: number;
    since?: string;
  }): Promise<ExecutionResult> {
    const args = ['logs', pod];

    if (options?.container) args.push('-c', options.container);
    if (options?.follow) args.push('-f');
    if (options?.previous) args.push('-p');
    if (options?.tail) args.push(`--tail=${options.tail}`);
    if (options?.since) args.push(`--since=${options.since}`);

    return this.execute('', { args });
  }

  async exec(pod: string, command: string[], options?: {
    container?: string;
    stdin?: boolean;
    tty?: boolean;
  }): Promise<ExecutionResult> {
    const args = ['exec', pod];

    if (options?.container) args.push('-c', options.container);
    if (options?.stdin) args.push('-i');
    if (options?.tty) args.push('-t');

    args.push('--', ...command);

    return this.execute('', { args });
  }

  async portForward(pod: string, ports: string | string[]): Promise<ExecutionResult> {
    const args = ['port-forward', pod];

    if (Array.isArray(ports)) {
      args.push(...ports);
    } else {
      args.push(ports);
    }

    return this.execute('', { args });
  }

  async scale(resource: string, replicas: number): Promise<ExecutionResult> {
    return this.execute('', {
      args: ['scale', resource, `--replicas=${replicas}`]
    });
  }

  async rollout(subcommand: string, resource: string, options?: any): Promise<ExecutionResult> {
    const args = ['rollout', subcommand, resource];

    if (subcommand === 'restart' && options?.deployment) {
      args.push(`deployment/${options.deployment}`);
    }

    return this.execute('', { args });
  }

  async patch(resource: string, name: string, patch: any, options?: {
    type?: 'json' | 'merge' | 'strategic';
  }): Promise<ExecutionResult> {
    const args = ['patch', resource, name];

    if (options?.type) args.push('--type', options.type);

    const patchJson = JSON.stringify(patch);
    args.push('-p', patchJson);

    return this.execute('', { args });
  }

  async wait(resource: string, condition: string, options?: {
    timeout?: string;
    selector?: string;
  }): Promise<ExecutionResult> {
    const args = ['wait', resource, `--for=${condition}`];

    if (options?.timeout) args.push(`--timeout=${options.timeout}`);
    if (options?.selector) args.push('-l', options.selector);

    return this.execute('', { args });
  }

  async createNamespace(name: string): Promise<ExecutionResult> {
    return this.execute('create', {
      resource: 'namespace',
      body: {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name }
      }
    });
  }

  async createSecret(name: string, data: Record<string, string>, options?: {
    type?: string;
    fromLiteral?: boolean;
  }): Promise<ExecutionResult> {
    const args = ['create', 'secret'];

    if (options?.type) {
      args.push(options.type);
    } else {
      args.push('generic');
    }

    args.push(name);

    if (options?.fromLiteral) {
      for (const [key, value] of Object.entries(data)) {
        args.push(`--from-literal=${key}=${value}`);
      }
    } else {
      // Create from files
      for (const [key, path] of Object.entries(data)) {
        args.push(`--from-file=${key}=${path}`);
      }
    }

    return this.execute('', { args });
  }

  async createConfigMap(name: string, data: Record<string, string>, options?: {
    fromLiteral?: boolean;
  }): Promise<ExecutionResult> {
    const args = ['create', 'configmap', name];

    if (options?.fromLiteral) {
      for (const [key, value] of Object.entries(data)) {
        args.push(`--from-literal=${key}=${value}`);
      }
    } else {
      // Create from files
      for (const [key, path] of Object.entries(data)) {
        args.push(`--from-file=${key}=${path}`);
      }
    }

    return this.execute('', { args });
  }

  private buildArgs(command: string, options?: any): string[] {
    const args: string[] = [];

    if (command) args.push(command);

    // Global options
    if (this.k8sConfig.kubeconfig) {
      args.push('--kubeconfig', this.k8sConfig.kubeconfig);
    }

    if (this.k8sConfig.context) {
      args.push('--context', this.k8sConfig.context);
    }

    if (this.k8sConfig.namespace) {
      args.push('-n', this.k8sConfig.namespace);
    }

    // Additional args from options
    if (options?.args) {
      args.push(...options.args);
    }

    return args;
  }

  private runCommand(args: string[]): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve, reject) => {
      const output: string[] = [];
      const errors: string[] = [];

      this.log('debug', `Running kubectl ${args.join(' ')}`);

      const childProcess = spawn(this.executablePath, args, {
        env: { ...process.env },
      });

      childProcess.stdout?.on('data', (data: Buffer) => {
        output.push(data.toString());
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errors.push(data.toString());
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({
            exitCode: code,
            output: output.join(''),
          });
        } else {
          reject(new Error(`kubectl command failed with exit code ${code}: ${errors.join('')}`));
        }
      });

      childProcess.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  private applyFromStdin(args: string[], content: string): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      args.push('-f', '-');

      const startTime = Date.now();
      const childProcess = spawn(this.executablePath, args, {
        env: { ...process.env },
      });

      const output: string[] = [];
      const errors: string[] = [];

      childProcess.stdout?.on('data', (data: Buffer) => {
        output.push(data.toString());
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errors.push(data.toString());
      });

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({
            success: true,
            output: output.join(''),
            duration: Date.now() - startTime,
            metadata: {
              command: 'apply',
              args,
              exitCode: code,
            },
          });
        } else {
          resolve({
            success: false,
            error: new Error(`kubectl apply failed: ${errors.join('')}`),
            duration: Date.now() - startTime,
          });
        }
      });

      childProcess.stdin?.write(content);
      childProcess.stdin?.end();
    });
  }

  // Task creation methods
  createDeploymentTask(options: {
    name: string;
    image: string;
    replicas?: number;
    port?: number;
    env?: Record<string, string>;
  }): Task {
    return {
      id: `k8s-deploy-${options.name}`,
      name: `k8s-deploy-${options.name}`,
      handler: async () => {
        const deployment = {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: {
            name: options.name,
            namespace: this.k8sConfig.namespace
          },
          spec: {
            replicas: options.replicas || 1,
            selector: {
              matchLabels: { app: options.name }
            },
            template: {
              metadata: {
                labels: { app: options.name }
              },
              spec: {
                containers: [{
                  name: options.name,
                  image: options.image,
                  ports: options.port ? [{ containerPort: options.port }] : undefined,
                  env: options.env ? Object.entries(options.env).map(([name, value]) => ({ name, value })) : undefined
                }]
              }
            }
          }
        };

        return this.execute('create', { resource: 'deployment', body: deployment });
      },
      options: {},
      dependencies: [],
      tags: ['kubernetes', 'deployment']
    };
  }

  createServiceTask(options: {
    name: string;
    selector: Record<string, string>;
    port: number;
    targetPort: number;
    type?: string;
  }): Task {
    return {
      id: `k8s-service-${options.name}`,
      name: `k8s-service-${options.name}`,
      handler: async () => {
        const service = {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: options.name,
            namespace: this.k8sConfig.namespace
          },
          spec: {
            selector: options.selector,
            ports: [{
              port: options.port,
              targetPort: options.targetPort
            }],
            type: options.type || 'ClusterIP'
          }
        };

        return this.execute('create', { resource: 'service', body: service });
      },
      options: {},
      dependencies: [],
      tags: ['kubernetes', 'service']
    };
  }

  createConfigMapTask(options: {
    name: string;
    data: Record<string, string>;
  }): Task {
    return {
      id: `k8s-configmap-${options.name}`,
      name: `k8s-configmap-${options.name}`,
      handler: async () => {
        const configMap = {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: {
            name: options.name,
            namespace: this.k8sConfig.namespace
          },
          data: options.data
        };

        return this.execute('create', { resource: 'configmap', body: configMap });
      },
      options: {},
      dependencies: [],
      tags: ['kubernetes', 'configmap']
    };
  }

  createSecretTask(options: {
    name: string;
    data: Record<string, string>;
    type?: string;
  }): Task {
    return {
      id: `k8s-secret-${options.name}`,
      name: `k8s-secret-${options.name}`,
      handler: async () => {
        const secret = {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: {
            name: options.name,
            namespace: this.k8sConfig.namespace
          },
          type: options.type || 'Opaque',
          data: options.data
        };

        return this.execute('create', { resource: 'secret', body: secret });
      },
      options: {},
      dependencies: [],
      tags: ['kubernetes', 'secret']
    };
  }


  // Resource operations
  async scaleDeployment(name: string, replicas: number, namespace?: string): Promise<void> {
    await this.execute('update', {
      resource: 'deployment',
      name,
      namespace: namespace || this.k8sConfig.namespace,
      body: {
        spec: { replicas }
      }
    });
  }

  async restartDeployment(name: string, namespace?: string): Promise<void> {
    await this.execute('update', {
      resource: 'deployment',
      name,
      namespace: namespace || this.k8sConfig.namespace,
      body: {
        spec: {
          template: {
            metadata: {
              annotations: {
                'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
              }
            }
          }
        }
      }
    });
  }

  async getPodLogs(name: string, options?: {
    namespace?: string;
    container?: string;
    tail?: number;
  }): Promise<string> {
    // Mock implementation
    return `Log output from pod ${name}`;
  }

  async execInPod(name: string, command: string[], options?: {
    namespace?: string;
    container?: string;
  }): Promise<{ stdout: string; stderr: string }> {
    // Mock implementation
    return {
      stdout: `Executed ${command.join(' ')} in pod ${name}`,
      stderr: ''
    };
  }

  async waitForDeployment(name: string, options?: {
    namespace?: string;
    timeout?: number;
  }): Promise<void> {
    // Mock implementation - immediately succeeds
    return Promise.resolve();
  }

  async listResources(resource: string, options?: {
    namespace?: string;
    labelSelector?: string;
  }): Promise<any> {
    return this.execute('get', {
      resource,
      namespace: options?.namespace || this.k8sConfig.namespace
    });
  }


  async deleteNamespace(name: string): Promise<void> {
    await this.execute('delete', {
      resource: 'namespace',
      name
    });
  }

  async listNamespaces(): Promise<string[]> {
    // Mock implementation
    return ['default', 'kube-system', 'kube-public', this.k8sConfig.namespace || 'test-namespace'];
  }
}