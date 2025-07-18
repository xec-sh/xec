import type { CallableExecutionEngine } from '@xec-js/ush';

import type { Logger } from '../utils/logger.js';
import type {
  Service,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createService(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<Service> {

  // Detect service manager
  const getServiceManager = (): 'systemd' | 'launchd' | 'init' | 'docker' => {
    if (env.type === 'container' || env.type === 'docker') return 'docker';
    if (env.platform.os === 'darwin') return 'launchd';
    if (env.capabilities.systemd) return 'systemd';
    return 'init';
  };

  const serviceManager = getServiceManager();

  const svc: Service = {
    async start(name: string): Promise<void> {
      switch (serviceManager) {
        case 'systemd':
          if (env.capabilities.sudo) {
            await $`sudo systemctl start ${name}`;
          } else {
            await $`systemctl start ${name}`;
          }
          break;
        case 'launchd':
          await $`launchctl start ${name}`;
          break;
        case 'init':
          if (env.capabilities.sudo) {
            await $`sudo service ${name} start`;
          } else {
            await $`service ${name} start`;
          }
          break;
        case 'docker':
          // In Docker, manage containers
          await $`docker start ${name}`;
      }
      log?.info(`Started service: ${name}`);
    },

    async stop(name: string): Promise<void> {
      switch (serviceManager) {
        case 'systemd':
          if (env.capabilities.sudo) {
            await $`sudo systemctl stop ${name}`;
          } else {
            await $`systemctl stop ${name}`;
          }
          break;
        case 'launchd':
          await $`launchctl stop ${name}`;
          break;
        case 'init':
          if (env.capabilities.sudo) {
            await $`sudo service ${name} stop`;
          } else {
            await $`service ${name} stop`;
          }
          break;
        case 'docker':
          await $`docker stop ${name}`;
          break;
      }
      log?.info(`Stopped service: ${name}`);
    },

    async restart(name: string): Promise<void> {
      switch (serviceManager) {
        case 'systemd':
          if (env.capabilities.sudo) {
            await $`sudo systemctl restart ${name}`;
          } else {
            await $`systemctl restart ${name}`;
          }
          break;
        case 'launchd':
          await $`launchctl stop ${name}`;
          await $`launchctl start ${name}`;
          break;
        case 'init':
          if (env.capabilities.sudo) {
            await $`sudo service ${name} restart`;
          } else {
            await $`service ${name} restart`;
          }
          break;
        case 'docker':
          await $`docker restart ${name}`;
          break;
      }
      log?.info(`Restarted service: ${name}`);
    },

    async reload(name: string): Promise<void> {
      try {
        switch (serviceManager) {
          case 'systemd':
            if (env.capabilities.sudo) {
              await $`sudo systemctl reload ${name}`;
            } else {
              await $`systemctl reload ${name}`;
            }
            break;
          case 'launchd':
            // launchd doesn't have reload, use restart
            await this.restart(name);
            break;
          case 'init':
            if (env.capabilities.sudo) {
              await $`sudo service ${name} reload`;
            } else {
              await $`service ${name} reload`;
            }
            break;
          case 'docker':
            // Docker containers typically don't support reload, restart instead
            await $`docker restart ${name}`;
            break;
        }
        log?.info(`Reloaded service: ${name}`);
      } catch (error) {
        // Fallback to restart if reload is not supported
        log?.warn(`Reload failed for ${name}, falling back to restart`, error);
        await this.restart(name);
      }
    },

    async status(name: string): Promise<string> {
      try {
        switch (serviceManager) {
          case 'systemd':
            const statusResult = await $`systemctl status ${name}`;
            const lines = statusResult.stdout.split('\n');
            const activeLine = lines.find(line => line.includes('Active:'));
            if (activeLine) {
              const match = activeLine.match(/Active:\s+(.+)/);
              return match && match[1] ? match[1] : 'unknown';
            }
            return 'unknown';

          case 'launchd':
            const launchResult = await $`launchctl list | grep ${name} || echo ""`;
            return launchResult.stdout.trim().length > 0 ? 'active (running)' : 'inactive (dead)';

          case 'init':
            try {
              const initResult = await $`service ${name} status`;
              return initResult.stdout.includes('running') ? 'active (running)' : 'inactive (dead)';
            } catch {
              return 'inactive (dead)';
            }

          case 'docker':
            const dockerResult = await $`docker ps --filter "name=${name}" --format "{{.Status}}"`;
            return dockerResult.stdout.trim() || 'inactive (dead)';
        }
      } catch (error) {
        log?.warn(`Failed to get status for service ${name}`, error);
        return 'inactive (dead)';
      }
    },

    async enable(name: string): Promise<void> {
      switch (serviceManager) {
        case 'systemd':
          if (env.capabilities.sudo) {
            await $`sudo systemctl enable ${name}`;
          } else {
            await $`systemctl enable ${name}`;
          }
          break;
        case 'launchd':
          // launchd services are typically enabled by loading them
          await $`launchctl load -w /Library/LaunchDaemons/${name}.plist 2>/dev/null || launchctl load -w ~/Library/LaunchAgents/${name}.plist`;
          break;
        case 'init':
          if (env.capabilities.sudo) {
            await $`sudo update-rc.d ${name} enable`;
          } else {
            await $`update-rc.d ${name} enable`;
          }
          break;
        case 'docker':
          throw new Error('Service management not available in Docker containers');
      }
      log?.info(`Enabled service: ${name}`);
    },

    async disable(name: string): Promise<void> {
      switch (serviceManager) {
        case 'systemd':
          if (env.capabilities.sudo) {
            await $`sudo systemctl disable ${name}`;
          } else {
            await $`systemctl disable ${name}`;
          }
          break;
        case 'launchd':
          await $`launchctl unload -w /Library/LaunchDaemons/${name}.plist 2>/dev/null || launchctl unload -w ~/Library/LaunchAgents/${name}.plist`;
          break;
        case 'init':
          if (env.capabilities.sudo) {
            await $`sudo update-rc.d ${name} disable`;
          } else {
            await $`update-rc.d ${name} disable`;
          }
          break;
        case 'docker':
          throw new Error('Service management not available in Docker containers');
      }
      log?.info(`Disabled service: ${name}`);
    },

    async list(filter?: 'active' | 'inactive' | 'all'): Promise<string[]> {
      const services: string[] = [];

      try {
        switch (serviceManager) {
          case 'systemd': {
            const result = await $`systemctl list-units --type=service --all --no-pager`;
            const lines = result.stdout.split('\n').filter(line => line.trim()); // Remove empty lines

            for (const line of lines) {
              const match = line.match(/^\s*([^\s]+)\.service\s+\S+\s+(\S+)\s+\S+/) || line.match(/([^\s]+)\.service\s+\S+\s+(\S+)\s+\S+/);
              if (match) {
                const [, name, active] = match;
                if (name) {
                  const isActive = active === 'active';

                  // Apply filter
                  if (filter === 'active' && !isActive) continue;
                  if (filter === 'inactive' && isActive) continue;

                  services.push(name);
                }
              }
            }
            break;
          }
          case 'launchd': {
            const launchResult = await $`launchctl list`;
            const launchLines = launchResult.stdout.split('\n').slice(1); // Skip header

            for (const line of launchLines) {
              const parts = line.split('\t');
              if (parts.length >= 3) {
                const name = parts[2];
                if (name) {
                  services.push(name);
                }
              }
            }
            break;
          }
          case 'init': {
            const initResult = await $`service --status-all 2>&1`;
            const initLines = initResult.stdout.split('\n');

            for (const line of initLines) {
              const match = line.match(/\[ ([+-]) \]\s+(.+)/);
              if (match) {
                const [, status, name] = match;
                if (name) {
                  const isActive = status === '+';

                  // Apply filter
                  if (filter === 'active' && !isActive) continue;
                  if (filter === 'inactive' && isActive) continue;

                  services.push(name);
                }
              }
            }
            break;
          }
          case 'docker': {
            // List Docker containers
            const dockerResult = await $`docker ps --format "table {{.Names}}\t{{.Status}}"`;
            const dockerLines = dockerResult.stdout.split('\n').slice(1); // Skip header

            for (const line of dockerLines) {
              const parts = line.split('\t');
              if (parts.length >= 2) {
                const name = parts[0];
                const status = parts[1];
                const isRunning = status?.includes('Up') || false;

                // Apply filter
                if (filter === 'active' && !isRunning) continue;
                if (filter === 'inactive' && isRunning) continue;

                if (name) {
                  services.push(name);
                }
              }
            }
            break;
          }
        }
      } catch (error) {
        log?.warn('Failed to list services', error);
      }

      return services;
    },

    async exists(name: string): Promise<boolean> {
      try {
        switch (serviceManager) {
          case 'systemd':
            await $`systemctl list-unit-files ${name}.service`;
            return true;
          case 'launchd':
            await $`launchctl list | grep ${name}`;
            return true;
          case 'init':
            await $`service ${name} status > /dev/null 2>&1`;
            return true;
          case 'docker':
            return false;
        }
      } catch {
        return false;
      }
    },

    async isActive(name: string): Promise<boolean> {
      const status = await this.status(name);
      return status.includes('active (running)') || status.includes('active\n') || status.endsWith(' active') || status === 'active';
    },

    async isEnabled(name: string): Promise<boolean> {
      try {
        switch (serviceManager) {
          case 'systemd':
            const result = await $`systemctl is-enabled ${name}`;
            return result.stdout.trim() === 'enabled';
          case 'launchd':
            // launchd services are enabled if they exist
            return await this.exists(name);
          case 'init':
            // init services don't have a standard enabled/disabled state
            return false;
          case 'docker':
            // Docker containers are enabled if they exist
            return await this.exists(name);
        }
      } catch {
        return false;
      }
    },

    async logs(name: string, options?: { lines?: number; follow?: boolean }): Promise<string> {
      try {
        const lines = options?.lines || 100;
        const follow = options?.follow || false;

        switch (serviceManager) {
          case 'systemd':
            if (follow) {
              const result = await $`journalctl -u ${name} -n ${lines} -f`;
              return result.stdout;
            } else {
              const result = await $`journalctl -u ${name} -n ${lines}`;
              return result.stdout;
            }
          case 'launchd':
            // macOS doesn't have a direct equivalent, use log command
            const logResult = await $`log show --last ${lines} --predicate 'subsystem == "${name}"' --style compact`;
            return logResult.stdout;
          case 'init':
            // Try to read from common log locations
            try {
              const logResult = await $`tail -n ${lines} /var/log/${name}.log`;
              return logResult.stdout;
            } catch {
              // Fallback to syslog
              const syslogResult = await $`tail -n ${lines} /var/log/syslog | grep ${name}`;
              return syslogResult.stdout;
            }
          case 'docker':
            // In Docker, we can't access service logs directly
            return '';
        }
      } catch (error) {
        log?.warn(`Failed to get logs for service ${name}`, error);
        return '';
      }
    },
  };

  return svc;
}