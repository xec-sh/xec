import { unifiedConfig } from '../config/unified-config.js';

import type { SSHTunnel } from './ssh-api.js';
import type { ExecutionResult } from '../core/result.js';
import type { K8sLogStream, K8sPortForward } from './kubernetes-api.js';
import type { ProcessPromise, ExecutionEngine } from '../core/execution-engine.js';

/**
 * Convenience API for common operations
 * Provides simple, intuitive methods that align with user mental models
 */
export class ConvenienceAPI {
  constructor(private engine: ExecutionEngine) { }

  /**
   * Execute on a remote host (SSH)
   * @example
   * $.onHost('prod', 'uptime')
   * $.onHost(['web1', 'web2'], 'systemctl status nginx')
   */
  async onHost(
    hosts: string | string[],
    command: string | TemplateStringsArray,
    ...values: any[]
  ): Promise<ExecutionResult | ExecutionResult[]> {
    const hostArray = Array.isArray(hosts) ? hosts : [hosts];

    // Handle single host
    if (hostArray.length === 1) {
      const hostConfig = await this.resolveHost(hostArray[0]!);
      const $ssh = this.engine.ssh(hostConfig);

      if (typeof command === 'string') {
        const cmd = command;
        return $ssh`${cmd}`;
      } else {
        return $ssh(command, ...values);
      }
    }

    // Handle multiple hosts in parallel
    const tasks = hostArray.map(async (host) => {
      const hostConfig = await this.resolveHost(host!);
      const $ssh = this.engine.ssh(hostConfig);

      if (typeof command === 'string') {
        const cmd = command;
        return $ssh`${cmd}`;
      } else {
        return $ssh(command, ...values);
      }
    });

    return Promise.all(tasks);
  }

  /**
   * Execute in a container or pod
   * @example
   * $.in('myapp', 'npm test')
   * $.in('pod:web-pod', 'date')
   * $.in('container:nginx', 'nginx -t')
   */
  async in(
    target: string,
    command?: string | TemplateStringsArray,
    ...values: any[]
  ): Promise<ProcessPromise | ExecutionResult> {
    // Parse target type
    if (target.startsWith('pod:')) {
      const podName = target.substring(4);
      const podConfig = await this.resolvePod(podName);
      const $k8s = this.engine.k8s(podConfig);

      if (!command) {
        // Interactive shell
        return $k8s`/bin/sh`;
      }

      if (typeof command === 'string') {
        const cmd = command;
        return $k8s`${cmd}`;
      } else {
        return $k8s(command, ...values);
      }
    } else {
      // Default to container
      const containerName = target.startsWith('container:')
        ? target.substring(10)
        : target;

      const containerConfig = await this.resolveContainer(containerName);
      const $docker = this.engine.docker(containerConfig);

      if (!command) {
        // Interactive shell
        return $docker`/bin/sh`;
      }

      if (typeof command === 'string') {
        const cmd = command;
        return $docker`${cmd}`;
      } else {
        return $docker(command, ...values);
      }
    }
  }

  /**
   * Copy files between local and remote locations
   * @example
   * $.copy('./file.txt', 'prod:/tmp/')
   * $.copy('prod:/logs/*.log', './logs/')
   * $.copy('./data', 'container:myapp:/data')
   * $.copy('pod:web:/logs', './backups/')
   */
  async copy(source: string, destination: string): Promise<void> {
    const sourceInfo = this.parseLocation(source);
    const destInfo = this.parseLocation(destination);

    // Local to local (just use cp)
    if (sourceInfo.type === 'local' && destInfo.type === 'local') {
      await this.engine.run`cp -r ${source} ${destination}`;
      return;
    }

    // SSH operations
    if (sourceInfo.type === 'ssh' || destInfo.type === 'ssh') {
      if (sourceInfo.type === 'ssh' && destInfo.type === 'local') {
        // Download from SSH
        const hostConfig = await this.resolveHost(sourceInfo.host!);
        const $ssh = this.engine.ssh(hostConfig);
        await $ssh.downloadFile(sourceInfo.path, destInfo.path);
      } else if (sourceInfo.type === 'local' && destInfo.type === 'ssh') {
        // Upload to SSH
        const hostConfig = await this.resolveHost(destInfo.host!);
        const $ssh = this.engine.ssh(hostConfig);
        await $ssh.uploadFile(sourceInfo.path, destInfo.path);
      } else {
        throw new Error('Direct SSH to SSH copy not supported yet');
      }
      return;
    }

    // Docker operations
    if (sourceInfo.type === 'docker' || destInfo.type === 'docker') {
      const containerName = sourceInfo.type === 'docker'
        ? sourceInfo.container!
        : destInfo.container!;

      const containerConfig = await this.resolveContainer(containerName);
      const container = await this.engine.docker(containerConfig).start();

      if (sourceInfo.type === 'docker' && destInfo.type === 'local') {
        await container.copyFrom(sourceInfo.path, destInfo.path);
      } else if (sourceInfo.type === 'local' && destInfo.type === 'docker') {
        await container.copyTo(sourceInfo.path, destInfo.path);
      } else {
        throw new Error('Direct container to container copy not supported yet');
      }
      return;
    }

    // Kubernetes operations
    if (sourceInfo.type === 'k8s' || destInfo.type === 'k8s') {
      const podName = sourceInfo.type === 'k8s'
        ? sourceInfo.pod!
        : destInfo.pod!;

      const podConfig = await this.resolvePod(podName);
      const k8sContext = this.engine.k8s(podConfig);
      const pod = k8sContext.pod(podConfig.pod);

      if (sourceInfo.type === 'k8s' && destInfo.type === 'local') {
        await pod.copyFrom(sourceInfo.path, destInfo.path);
      } else if (sourceInfo.type === 'local' && destInfo.type === 'k8s') {
        await pod.copyTo(sourceInfo.path, destInfo.path);
      } else {
        throw new Error('Direct pod to pod copy not supported yet');
      }
    }
  }

  /**
   * Set up port forwarding
   * @example
   * $.forward('prod:3306', 3307)  // SSH tunnel
   * $.forward('pod:web:80', 8080) // K8s port forward
   * $.forward('container:db:5432') // Docker, auto-assign local port
   */
  async forward(
    source: string,
    localPort?: number
  ): Promise<SSHTunnel | K8sPortForward | { localPort: number; close: () => Promise<void> }> {
    const parts = source.split(':');

    if (parts[0] === 'pod') {
      // Kubernetes port forward
      const [, podName, remotePort] = parts;
      if (!podName || !remotePort) {
        throw new Error('Invalid pod forward format. Use: pod:name:port');
      }
      const podConfig = await this.resolvePod(podName);
      const k8sContext = this.engine.k8s(podConfig);
      const pod = k8sContext.pod(podConfig.pod);

      if (localPort) {
        return pod.portForward(localPort, parseInt(remotePort, 10));
      } else {
        return pod.portForwardDynamic(parseInt(remotePort, 10));
      }
    } else if (parts[0] === 'container') {
      // Docker port forward (actually just expose)
      const [, containerName, remotePort] = parts;
      throw new Error('Docker port forwarding not implemented yet');
    } else {
      // SSH tunnel
      const [hostName, remotePort] = parts;
      if (!hostName || !remotePort) {
        throw new Error('Invalid SSH tunnel format. Use: host:port');
      }
      const hostConfig = await this.resolveHost(hostName);
      const $ssh = this.engine.ssh(hostConfig);

      const tunnel = await $ssh.tunnel({
        localPort: localPort || 0,
        remoteHost: 'localhost',
        remotePort: parseInt(remotePort, 10)
      });

      return tunnel;
    }
  }

  /**
   * Stream logs from various sources
   * @example
   * $.logs('container:myapp', { follow: true })
   * $.logs('pod:web', { tail: 100 })
   * $.logs('prod:/var/log/app.log', { follow: true })
   */
  async logs(
    source: string,
    options: {
      follow?: boolean;
      tail?: number;
      since?: string;
      timestamps?: boolean;
      onData?: (data: string) => void;
    } = {}
  ): Promise<string | K8sLogStream | void> {
    if (source.startsWith('container:')) {
      // Docker logs
      const containerName = source.substring(10);
      const containerConfig = await this.resolveContainer(containerName);
      const container = await this.engine.docker(containerConfig).start();

      if (options.follow && options.onData) {
        await container.streamLogs(options.onData, {
          follow: true,
          tail: options.tail,
          timestamps: options.timestamps
        });
      } else {
        return container.logs({
          tail: options.tail,
          timestamps: options.timestamps
        });
      }
    } else if (source.startsWith('pod:')) {
      // Kubernetes logs
      const podName = source.substring(4);
      const podConfig = await this.resolvePod(podName);
      const k8sContext = this.engine.k8s(podConfig);
      const pod = k8sContext.pod(podConfig.pod);

      if (options.follow && options.onData) {
        return pod.streamLogs(options.onData, {
          follow: true,
          tail: options.tail,
          timestamps: options.timestamps
        });
      } else {
        return pod.logs({
          tail: options.tail,
          timestamps: options.timestamps
        });
      }
    } else if (source.includes(':')) {
      // SSH tail
      const [hostName, filePath] = source.split(':', 2);
      if (!hostName || !filePath) {
        throw new Error('Invalid SSH log source format. Use: host:path');
      }
      const hostConfig = await this.resolveHost(hostName);
      const $ssh = this.engine.ssh(hostConfig);

      if (options.follow) {
        const tailCmd = `tail -f ${options.tail ? `-n ${options.tail}` : ''} ${filePath}`;
        const proc = $ssh`${tailCmd}`;

        if (options.onData) {
          // Stream the output
          const stream = await proc;
          options.onData(stream.stdout);
        }

        return proc as any;
      } else {
        const tailCmd = `tail ${options.tail ? `-n ${options.tail}` : '-n 50'} ${filePath}`;
        const result = await $ssh`${tailCmd}`;
        return result.stdout as string;
      }
    } else {
      // Local file
      if (options.follow) {
        const tailCmd = `tail -f ${options.tail ? `-n ${options.tail}` : ''} ${source}`;
        const proc = this.engine.run`${tailCmd}`;

        if (options.onData) {
          const stream = await proc;
          options.onData(stream.stdout);
        }

        return proc as any;
      } else {
        const tailCmd = `tail ${options.tail ? `-n ${options.tail}` : '-n 50'} ${source}`;
        const result = await this.engine.run`${tailCmd}`;
        return result.stdout as string;
      }
    }
  }

  /**
   * Execute commands with automatic context detection
   * @example
   * $.smart('myapp npm test')     // Detects container
   * $.smart('prod uptime')         // Detects SSH host
   * $.smart('web-pod date')        // Detects pod
   */
  async smart(command: string): Promise<ExecutionResult> {
    const parts = command.split(' ');
    const firstPart = parts[0]!;
    const restCommand = parts.slice(1).join(' ');

    // Try to resolve as host
    try {
      const config = await unifiedConfig.load();
      if (firstPart && config.hosts?.[firstPart]) {
        const result = await this.onHost(firstPart, restCommand);
        return Array.isArray(result) ? result[0]! : result;
      }
    } catch { }

    // Try to resolve as container
    try {
      const config = await unifiedConfig.load();
      if (firstPart && config.containers?.[firstPart]) {
        return await this.in(firstPart, restCommand) as ExecutionResult;
      }
    } catch { }

    // Try to resolve as pod
    try {
      const config = await unifiedConfig.load();
      if (firstPart && config.pods?.[firstPart]) {
        return await this.in(`pod:${firstPart}`, restCommand) as ExecutionResult;
      }
    } catch { }

    // Default to local execution
    return await this.engine.run`${command}`;
  }

  /**
   * Resolve host name to SSH configuration
   */
  private async resolveHost(name: string): Promise<any> {
    const config = await unifiedConfig.load();
    const hostConfig = config.hosts?.[name];

    if (!hostConfig) {
      // Assume it's a direct hostname
      return { host: name };
    }

    return unifiedConfig.hostToSSHOptions(name);
  }

  /**
   * Resolve container name to Docker configuration
   */
  private async resolveContainer(name: string): Promise<any> {
    const config = await unifiedConfig.load();
    const containerConfig = config.containers?.[name];

    if (!containerConfig) {
      // Assume it's a direct container name
      return { container: name };
    }

    return {
      ...containerConfig,
      container: containerConfig.container || containerConfig.name || name
    };
  }

  /**
   * Resolve pod name to Kubernetes configuration
   */
  private async resolvePod(name: string): Promise<any> {
    const config = await unifiedConfig.load();
    const podConfig = config.pods?.[name];

    if (!podConfig) {
      // Assume it's a direct pod name
      return { pod: name };
    }

    return unifiedConfig.podToK8sOptions(name);
  }

  /**
   * Parse location string to determine type and path
   */
  private parseLocation(location: string): {
    type: 'local' | 'ssh' | 'docker' | 'k8s';
    path: string;
    host?: string;
    container?: string;
    pod?: string;
  } {
    if (location.startsWith('container:')) {
      const [containerPart, ...pathParts] = location.substring(10).split(':');
      return {
        type: 'docker',
        container: containerPart,
        path: pathParts.join(':') || '/'
      };
    }

    if (location.startsWith('pod:')) {
      const [podPart, ...pathParts] = location.substring(4).split(':');
      return {
        type: 'k8s',
        pod: podPart,
        path: pathParts.join(':') || '/'
      };
    }

    if (location.includes(':') && !location.match(/^[a-zA-Z]:\\/)) {
      // SSH format: host:path
      const [host, ...pathParts] = location.split(':');
      return {
        type: 'ssh',
        host,
        path: pathParts.join(':')
      };
    }

    // Local path
    return {
      type: 'local',
      path: location
    };
  }
}

/**
 * Extended execution engine with convenience methods
 */
export interface ExtendedExecutionEngine extends ExecutionEngine {
  onHost: ConvenienceAPI['onHost'];
  in: ConvenienceAPI['in'];
  copy: ConvenienceAPI['copy'];
  forward: ConvenienceAPI['forward'];
  logs: ConvenienceAPI['logs'];
  smart: ConvenienceAPI['smart'];
}

/**
 * Create and attach convenience methods to an execution engine
 */
export function attachConvenienceMethods(engine: ExecutionEngine): ExtendedExecutionEngine {
  const api = new ConvenienceAPI(engine);

  // Attach methods to the engine
  return Object.assign(engine, {
    onHost: api.onHost.bind(api),
    in: api.in.bind(api),
    copy: api.copy.bind(api),
    forward: api.forward.bind(api),
    logs: api.logs.bind(api),
    smart: api.smart.bind(api)
  }) as ExtendedExecutionEngine;
}