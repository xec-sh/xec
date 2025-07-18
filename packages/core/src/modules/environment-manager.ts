import { $, CallableExecutionEngine } from '@xec/ush';

import { createModuleLogger } from '../utils/logger.js';
import { createStandardLibrary } from '../stdlib/index.js';
import { ExtendedTaskContext } from '../types/task-types.js';
import { EnvironmentInfo, EnvironmentType, EnvironmentProvider } from '../types/environment-types.js';

export class EnvironmentManager {
  private logger = createModuleLogger('environment-manager');
  private providers = new Map<EnvironmentType, EnvironmentProvider>();
  private currentEnvironment?: EnvironmentInfo;
  private shell?: CallableExecutionEngine;

  constructor() {
    // Register built-in environment providers
    this.registerBuiltinProviders();
  }

  private registerBuiltinProviders() {
    // Local environment provider
    this.registerProvider({
      name: 'local',
      detect: async () => 
        // Local is always available as fallback
         ({
          type: 'local',
          capabilities: {
            shell: true,
            sudo: process.platform !== 'win32',
            docker: await this.checkDockerAvailable(),
            systemd: process.platform === 'linux',
          },
          platform: {
            os: process.platform === 'darwin' ? 'darwin' : 
                process.platform === 'win32' ? 'windows' : 'linux',
            arch: process.arch as any,
            distro: await this.detectLinuxDistro(),
            version: process.version,
          },
        })
      ,
      createExecutor: () => {
        if (!this.shell) {
          this.shell = $.local();
        }
        return this.shell;
      },
    });

    // SSH environment provider
    this.registerProvider({
      name: 'ssh',
      detect: async () => {
        const sshConnection = process.env['SSH_CONNECTION'];
        if (sshConnection) {
          return {
            type: 'ssh',
            connection: {
              host: process.env['SSH_HOST'] || 'unknown',
              user: process.env['SSH_USER'] || process.env['USER'] || 'unknown',
            },
            capabilities: {
              shell: true,
              sudo: true,
              docker: await this.checkDockerAvailable(),
              systemd: true,
            },
            platform: {
              os: 'linux', // SSH typically connects to Linux
              arch: process.arch as any,
              distro: await this.detectLinuxDistro(),
            },
          };
        }
        return null;
      },
      createExecutor: (connection) => $.ssh({
          host: connection.host!,
          username: connection.user!,
        }),
    });

    // Docker environment provider
    this.registerProvider({
      name: 'docker',
      detect: async () => {
        const isDocker = await this.isRunningInDocker();
        if (isDocker) {
          return {
            type: 'docker',
            connection: {
              container: process.env['HOSTNAME'] || 'unknown',
            },
            capabilities: {
              shell: true,
              sudo: false, // Usually not needed in containers
              docker: false, // Docker-in-Docker is special case
              systemd: false, // Containers typically don't have systemd
            },
            platform: {
              os: 'linux',
              arch: process.arch as any,
              distro: await this.detectLinuxDistro(),
            },
          };
        }
        return null;
      },
      createExecutor: (connection) => $.docker({
          container: connection.container!,
        }),
    });
  }

  registerProvider(provider: EnvironmentProvider): void {
    this.providers.set(provider.name, provider);
  }

  async detectEnvironment(): Promise<EnvironmentInfo> {
    // Try to detect in order of specificity
    const checkOrder: EnvironmentType[] = ['kubernetes', 'docker', 'ssh', 'aws', 'azure', 'gcp', 'local'];
    
    for (const envType of checkOrder) {
      const provider = this.providers.get(envType);
      if (provider) {
        try {
          const info = await provider.detect();
          if (info) {
            this.currentEnvironment = info;
            this.logger.info(`Detected environment: ${envType}`);
            return info;
          }
        } catch (error) {
          this.logger.debug(`Failed to detect ${envType} environment`, error);
        }
      }
    }

    // Default to local
    const localProvider = this.providers.get('local')!;
    this.currentEnvironment = (await localProvider.detect())!;
    return this.currentEnvironment;
  }

  async createTaskContext(params: Record<string, any> = {}): Promise<ExtendedTaskContext> {
    if (!this.currentEnvironment) {
      await this.detectEnvironment();
    }

    const env = this.currentEnvironment!;
    const provider = this.providers.get(env.type)!;
    const $ = provider.createExecutor(env.connection || {});

    // Create base context
    const baseContext = {
      $,
      env,
      params,
      log: this.logger,
    };

    // Create stdlib with all utilities
    const stdlib = await createStandardLibrary(baseContext);

    // Merge stdlib into context, but rename env to env_vars to avoid conflict
    // Also separate template since it needs to be a function in TaskContext
    const { env: env_vars, template: templateEngine, ...stdlibRest } = stdlib;
    const context: ExtendedTaskContext = {
      ...baseContext,
      ...stdlibRest,
      env_vars,
      // Required properties for ExtendedTaskContext
      taskId: 'environment-context',
      vars: {},
      logger: this.logger,
      // Convert TemplateEngine to synchronous function (simplified)
      template: (template: string) => 
        // For now, just return the template as-is since async is not supported in TaskContext
        // In a real implementation, this would need to handle sync template rendering
         template
      ,
    };

    return context;
  }


  private async checkDockerAvailable(): Promise<boolean> {
    try {
      if (!this.shell) {
        this.shell = $.local();
      }
      await this.shell`docker version`;
      return true;
    } catch {
      return false;
    }
  }

  private async detectLinuxDistro(): Promise<string | undefined> {
    if (process.platform !== 'linux') {
      return undefined;
    }

    try {
      if (!this.shell) {
        this.shell = $.local();
      }
      const result = await this.shell`cat /etc/os-release | grep ^ID= | cut -d= -f2 | tr -d '"'`;
      return result.stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  private async isRunningInDocker(): Promise<boolean> {
    try {
      if (!this.shell) {
        this.shell = $.local();
      }
      await this.shell`test -f /.dockerenv`;
      return true;
    } catch {
      // Check for docker in cgroup
      try {
        const result = await this.shell!`cat /proc/1/cgroup | grep docker`;
        return result.stdout.length > 0;
      } catch {
        return false;
      }
    }
  }

  getCurrentEnvironment(): EnvironmentInfo | undefined {
    return this.currentEnvironment;
  }

  async cleanup(): Promise<void> {
    if (this.shell) {
      // Shell cleanup if needed
    }
  }
}