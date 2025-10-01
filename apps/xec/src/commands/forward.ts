import { z } from 'zod';
import * as net from 'net';
import { $ } from '@xec-sh/core';
import { prism } from '@xec-sh/kit';
import { Command } from 'commander';

import { validateOptions } from '../utils/validation.js';
import { ConfigAwareCommand, ConfigAwareOptions } from '../utils/command-base.js';
import { InteractiveHelpers, InteractiveOptions } from '../utils/interactive-helpers.js';

import type { ResolvedTarget } from '../config/types.js';

interface ForwardOptions extends ConfigAwareOptions, InteractiveOptions {
  bind?: string;
  reverse?: boolean;
  background?: boolean;
}

interface PortMapping {
  local: number;
  remote: number;
}

interface ForwardSession {
  target: ResolvedTarget;
  mapping: PortMapping;
  process?: any;
  cleanup?: () => Promise<void>;
}

export class ForwardCommand extends ConfigAwareCommand {
  private sessions: Map<string, ForwardSession> = new Map();

  constructor() {
    super({
      name: 'forward',
      aliases: ['fwd'],
      description: 'Forward ports from remote systems',
      arguments: '<target> <port-mapping>',
      options: [
        {
          flags: '-p, --profile <profile>',
          description: 'Configuration profile to use',
        },
        {
          flags: '-i, --interactive',
          description: 'Interactive mode for setting up port forwarding',
        },
        {
          flags: '-b, --bind <address>',
          description: 'Local bind address (default: 127.0.0.1)',
          defaultValue: '127.0.0.1',
        },
        {
          flags: '-r, --reverse',
          description: 'Reverse port forwarding (remote to local)',
        },
        {
          flags: '--background',
          description: 'Run in background',
        },
      ],
      examples: [
        {
          command: 'xec forward hosts.db 5432',
          description: 'Forward PostgreSQL port from SSH host',
        },
        {
          command: 'xec forward pods.webapp 8080:80',
          description: 'Forward local 8080 to pod port 80',
        },
        {
          command: 'xec forward containers.redis 6379',
          description: 'Forward Redis port from Docker container',
        },
        {
          command: 'xec forward hosts.gateway 8080:80,9090:90',
          description: 'Forward multiple ports',
        },
        {
          command: 'xec forward hosts.server 0:3000',
          description: 'Auto-select available local port',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          profile: z.string().optional(),
          interactive: z.boolean().optional(),
          bind: z.string().optional(),
          reverse: z.boolean().optional(),
          background: z.boolean().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  protected override getCommandConfigKey(): string {
    return 'forward';
  }

  override async execute(args: any[]): Promise<void> {
    let [targetSpec, portSpec] = args.slice(0, -1);
    const options = args[args.length - 1] as ForwardOptions;

    // Handle interactive mode
    if (options.interactive) {
      const interactiveResult = await this.runInteractiveMode(options);
      if (!interactiveResult) return;

      targetSpec = interactiveResult.targetSpec;
      portSpec = interactiveResult.portSpec;
      Object.assign(options, interactiveResult.options);
    }

    if (!targetSpec || !portSpec) {
      // Only enter interactive mode if explicitly not in quiet/background mode
      if (!options.quiet && !options.background && process.stdin.isTTY) {
        const interactiveResult = await this.runInteractiveMode(options);
        if (!interactiveResult) return;

        targetSpec = interactiveResult.targetSpec;
        portSpec = interactiveResult.portSpec;
        Object.assign(options, interactiveResult.options);
      } else {
        throw new Error('Target and port mapping are required');
      }
    }

    // Initialize configuration
    await this.initializeConfig(options);

    // Apply command defaults from config
    const defaults = this.getCommandDefaults();
    const mergedOptions = this.applyDefaults(options, defaults);

    // Resolve target
    const target = await this.resolveTarget(targetSpec);

    // Parse port mappings
    const mappings = this.parsePortMappings(portSpec);

    if (mergedOptions.dryRun) {
      this.log('[DRY RUN] Would forward ports:', 'info');
      for (const mapping of mappings) {
        this.log(`  ${mergedOptions.bind}:${mapping.local} -> ${this.formatTargetDisplay(target)}:${mapping.remote}`, 'info');
      }
      return;
    }

    // Set up signal handlers for cleanup
    this.setupCleanupHandlers();

    // Forward each port
    for (const mapping of mappings) {
      await this.forwardPort(target, mapping, mergedOptions);
    }

    // If not running in background, wait for interrupt
    if (!mergedOptions.background) {
      this.log('Press Ctrl+C to stop port forwarding...', 'info');
      await new Promise(() => { }); // Wait indefinitely
    }
  }

  private parsePortMappings(portSpec: string): PortMapping[] {
    const mappings: PortMapping[] = [];
    const parts = portSpec.split(',');

    for (const part of parts) {
      const [localStr, remoteStr] = part.includes(':') ? part.split(':') : [part, part];
      const local = parseInt(localStr || '0', 10);
      const remote = parseInt(remoteStr || '0', 10);

      if (isNaN(remote) || remote < 1 || remote > 65535) {
        throw new Error(`Invalid remote port: ${remoteStr}`);
      }

      if (localStr !== '0' && (isNaN(local) || local < 1 || local > 65535)) {
        throw new Error(`Invalid local port: ${localStr}`);
      }

      mappings.push({ local, remote });
    }

    return mappings;
  }

  private async forwardPort(
    target: ResolvedTarget,
    mapping: PortMapping,
    options: ForwardOptions
  ): Promise<void> {
    // Auto-select local port if needed
    let localPort = mapping.local;
    if (localPort === 0) {
      localPort = await this.findAvailablePort();
      mapping.local = localPort;
    }

    const sessionId = `${target.id}:${mapping.local}:${mapping.remote}`;

    if (this.sessions.has(sessionId)) {
      throw new Error(`Port forwarding already active`);
    }

    const targetDisplay = this.formatTargetDisplay(target);

    if (!options.quiet) {
      this.startSpinner(`Setting up port forward ${options.bind}:${localPort} -> ${targetDisplay}:${mapping.remote}...`);
    }

    try {
      let session: ForwardSession;

      switch (target.type) {
        case 'ssh':
          session = await this.forwardSSH(target, mapping, options);
          break;
        case 'docker':
          session = await this.forwardDocker(target, mapping, options);
          break;
        case 'kubernetes':
          session = await this.forwardKubernetes(target, mapping, options);
          break;
        default:
          throw new Error(`Port forwarding not supported for target type: ${target.type}`);
      }

      this.sessions.set(sessionId, session);

      if (!options.quiet) {
        this.stopSpinner();
        this.log(
          `${prism.green('✓')} Forwarding ${prism.cyan(`${options.bind}:${localPort}`)} -> ${prism.cyan(`${targetDisplay}:${mapping.remote}`)}`,
          'success'
        );
      }
    } catch (error) {
      if (!options.quiet) {
        this.stopSpinner();
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`${prism.red('✗')} Failed to forward port: ${errorMessage}`, 'error');
      throw error;
    }
  }

  private async forwardSSH(
    target: ResolvedTarget,
    mapping: PortMapping,
    options: ForwardOptions
  ): Promise<ForwardSession> {
    const config = target.config as any;
    const sshOptions = {
      host: config.host,
      username: config.user || process.env['USER'] || 'root',
      port: config.port || 22,
      privateKey: config.privateKey,
      password: config.password,
      privateKeyPath: config.privateKeyPath,
    };

    // Create SSH tunnel
    const engine = $.ssh(sshOptions);

    if (options.reverse) {
      // Reverse tunnel: remote port -> local port
      // Note: Reverse tunnels may require different handling
      throw new Error('Reverse tunneling is not yet implemented in this version');
    } else {
      // First, establish a connection by executing a simple command
      // This is required before creating a tunnel
      await engine`echo "Establishing connection for tunnel"`.quiet();

      // Forward tunnel: local port -> remote port
      const tunnel = await engine.tunnel({
        localPort: mapping.local,
        localHost: options.bind || 'localhost',
        remoteHost: 'localhost',
        remotePort: mapping.remote
      });

      return {
        target,
        mapping,
        process: tunnel,
        cleanup: async () => {
          // Close the tunnel explicitly
          if (tunnel && typeof tunnel.close === 'function') {
            await tunnel.close();
          }
        },
      };
    }
  }

  private async forwardDocker(
    target: ResolvedTarget,
    mapping: PortMapping,
    options: ForwardOptions
  ): Promise<ForwardSession> {
    const config = target.config as any;
    const container = config.container || target.name;

    if (options.reverse) {
      throw new Error('Reverse port forwarding is not supported for Docker containers');
    }

    // Use docker port forwarding via socat in a separate container
    const socatContainer = `xec-forward-${container}-${mapping.local}-${mapping.remote}`;

    // Create a local engine with shell set to true to let node find the shell
    const local = () => $.local().with({ shell: true });

    // Stop any existing socat container
    try {
      await local()`/usr/local/bin/docker stop ${socatContainer}`.nothrow();
      await local()`/usr/local/bin/docker rm ${socatContainer}`.nothrow();
    } catch { }

    // Get container network
    const inspectResult = await local()`/usr/local/bin/docker inspect ${container} --format='{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'`;
    const networkId = inspectResult.stdout.trim();

    // Start socat container
    const socatCommand = `socat TCP-LISTEN:${mapping.remote},fork,reuseaddr TCP:${container}:${mapping.remote}`;

    await local()`/usr/local/bin/docker run -d --name ${socatContainer} --network ${networkId} -p ${options.bind}:${mapping.local}:${mapping.remote} alpine/socat ${socatCommand}`;

    return {
      target,
      mapping,
      process: socatContainer,
      cleanup: async () => {
        try {
          await local()`/usr/local/bin/docker stop ${socatContainer}`;
          await local()`/usr/local/bin/docker rm ${socatContainer}`;
        } catch { }
      },
    };
  }

  private async forwardKubernetes(
    target: ResolvedTarget,
    mapping: PortMapping,
    options: ForwardOptions
  ): Promise<ForwardSession> {
    const config = target.config as any;
    const namespace = config.namespace || 'default';
    const pod = config.pod || target.name;

    if (options.reverse) {
      throw new Error('Reverse port forwarding is not supported for Kubernetes pods');
    }

    // Use kubectl port-forward
    const args = [
      'port-forward',
      '-n', namespace,
      pod,
      `${mapping.local}:${mapping.remote}`,
      '--address', options.bind || '127.0.0.1'
    ];

    // Start port forwarding in background
    const process = $.local()`kubectl ${args.join(' ')}`.nothrow();

    // Wait a bit to ensure it started
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      target,
      mapping,
      process,
      cleanup: async () => {
        // The process will be killed automatically when the parent exits
        if (process && typeof process.kill === 'function') {
          process.kill();
        }
      },
    };
  }

  private async findAvailablePort(startPort: number = 20000): Promise<number> {
    for (let port = startPort; port < 65535; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error('No available ports found');
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          // Other errors we treat as port available
          resolve(true);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      // Try to listen on 127.0.0.1 specifically
      server.listen(port, '127.0.0.1');
    });
  }

  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      this.log('\nStopping port forwards...', 'info');

      for (const [sessionId, session] of this.sessions) {
        try {
          if (session.cleanup) {
            await session.cleanup();
          }
          this.log(`Stopped forwarding for ${sessionId}`, 'info');
        } catch (error) {
          this.log(`Failed to cleanup ${sessionId}: ${error}`, 'error');
        }
      }

      this.sessions.clear();
      process.exit(0);
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }

  private async runInteractiveMode(options: ForwardOptions): Promise<{
    targetSpec: string;
    portSpec: string;
    options: Partial<ForwardOptions>;
  } | null> {
    InteractiveHelpers.startInteractiveMode('Interactive Port Forward Mode');

    try {
      // Select target type
      const targetType = await InteractiveHelpers.selectFromList(
        'What do you want to forward from?',
        [
          { value: 'ssh', label: 'SSH host' },
          { value: 'docker', label: 'Docker container' },
          { value: 'kubernetes', label: 'Kubernetes pod' },
        ],
        (item) => `${InteractiveHelpers.getTargetIcon(item.value)} ${item.label}`
      );

      if (!targetType) return null;

      // Select target
      const target = await InteractiveHelpers.selectTarget({
        message: 'Select target:',
        type: targetType.value as any,
        allowCustom: true,
      });

      if (!target || Array.isArray(target)) return null;

      // Get remote port
      const remotePort = await InteractiveHelpers.inputText('Enter remote port:', {
        placeholder: '3306, 5432, 6379, 8080, etc.',
        validate: (value) => {
          if (!value) return 'Port is required';
          const port = parseInt(value);
          if (isNaN(port) || port < 1 || port > 65535) {
            return 'Please enter a valid port number (1-65535)';
          }
          return undefined;
        },
      });

      if (!remotePort) return null;

      // Local port configuration
      const localPortOption = await InteractiveHelpers.selectFromList(
        'Local port configuration:',
        [
          { value: 'same', label: `Use same port (${remotePort})` },
          { value: 'custom', label: 'Specify custom port' },
          { value: 'auto', label: 'Auto-select available port' },
        ],
        (item) => item.label
      );

      if (!localPortOption) return null;

      let localPort: string;
      switch (localPortOption.value) {
        case 'same':
          localPort = remotePort;
          break;
        case 'custom': {
          const customPort = await InteractiveHelpers.inputText('Enter local port:', {
            placeholder: '8080',
            validate: (value) => {
              if (!value) return 'Port is required';
              const port = parseInt(value);
              if (isNaN(port) || port < 1 || port > 65535) {
                return 'Please enter a valid port number (1-65535)';
              }
              return undefined;
            },
          });
          if (!customPort) return null;
          localPort = customPort;
          break;
        }
        case 'auto':
          localPort = '0';
          break;
        default:
          localPort = remotePort;
      }

      // Additional options
      const forwardOptions: Partial<ForwardOptions> = {};

      // Bind address
      const customBind = await InteractiveHelpers.confirmAction(
        'Use custom bind address? (default: 127.0.0.1)',
        false
      );

      if (customBind) {
        const bindAddress = await InteractiveHelpers.inputText('Enter bind address:', {
          placeholder: '0.0.0.0',
          initialValue: '127.0.0.1',
        });
        if (bindAddress) {
          forwardOptions.bind = bindAddress;
        }
      }

      // Background mode
      forwardOptions.background = await InteractiveHelpers.confirmAction(
        'Run in background?',
        false
      );

      // Build specs
      const targetSpec = target.id;
      const portSpec = localPort === remotePort ? remotePort : `${localPort}:${remotePort}`;

      // Show summary
      InteractiveHelpers.showInfo('\nPort Forward Summary:');
      console.log(`  Target: ${prism.cyan(targetSpec)} (${target.type})`);
      console.log(`  Port mapping: ${prism.cyan(`${forwardOptions.bind || '127.0.0.1'}:${localPort === '0' ? 'auto' : localPort} → ${remotePort}`)}`);
      if (forwardOptions.background) console.log(`  Mode: ${prism.gray('background')}`);

      const confirm = await InteractiveHelpers.confirmAction(
        '\nProceed with port forwarding?',
        true
      );

      if (!confirm) {
        InteractiveHelpers.endInteractiveMode('Port forwarding cancelled');
        return null;
      }

      return {
        targetSpec,
        portSpec,
        options: forwardOptions,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        InteractiveHelpers.endInteractiveMode('Port forwarding cancelled');
      } else {
        InteractiveHelpers.showError(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }
}

export default function command(program: Command): void {
  const cmd = new ForwardCommand();
  program.addCommand(cmd.create());
}