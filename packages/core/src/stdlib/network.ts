import type { CallableExecutionEngine } from '@xec-js/ush';

import type { Logger } from '../utils/logger.js';
import type {
  Network,
  PingResult,
  PingOptions,
  TracerouteHop,
  EnvironmentInfo,
  TracerouteResult,
  NetworkInterface,
} from '../types/environment-types.js';

export async function createNetwork(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<Network> {

  const net: Network = {
    async ping(host: string, options?: PingOptions): Promise<PingResult> {
      const count = options?.count || 4;
      const timeout = options?.timeout || 5;

      try {
        let cmd: string;
        if (env.platform.os === 'darwin') {
          cmd = `ping -c ${count} -W ${timeout * 1000} ${host}`;
        } else {
          cmd = `ping -c ${count} -W ${timeout} ${host}`;
        }

        const result = await $`${cmd}`;

        // Parse ping output
        const lines = result.stdout.split('\n');
        const statsLine = lines.find((l: string) => l.includes('min/avg/max'));

        if (statsLine) {
          const match = statsLine.match(/(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)/);
          if (match) {
            return {
              host,
              packets_sent: count,
              packets_received: count, // Simplified
              packet_loss: 0,
              min: parseFloat(match[1] || '0'),
              avg: parseFloat(match[2] || '0'),
              max: parseFloat(match[3] || '0'),
            };
          }
        }

        return {
          host,
          packets_sent: count,
          packets_received: 0,
          packet_loss: 100,
          min: 0,
          avg: 0,
          max: 0,
        };
      } catch (error) {
        return {
          host,
          packets_sent: count,
          packets_received: 0,
          packet_loss: 100,
          min: 0,
          avg: 0,
          max: 0,
        };
      }
    },

    async traceroute(host: string): Promise<TracerouteResult> {
      try {
        const cmd = env.platform.os === 'darwin' ? 'traceroute' : 'traceroute';
        const result = await $`${cmd} ${host}`;

        const hops: TracerouteHop[] = [];
        const lines = result.stdout.split('\n').slice(1); // Skip header

        for (const line of lines) {
          const match = line.match(/^\s*(\d+)\s+([^\s]+)\s+\(([^)]+)\)/);
          if (match) {
            const hop = parseInt(match[1] || '0');
            const ip = match[3] || '';

            // Extract RTT values
            const rttMatches = line.matchAll(/(\d+\.?\d*)\s*ms/g);
            const rtt = Array.from(rttMatches).map((m: any) => parseFloat(m[1]));

            hops.push({ hop, ip, rtt });
          }
        }

        return { host, hops };
      } catch (error) {
        log?.warn(`Traceroute failed for ${host}`, error);
        return { host, hops: [] };
      }
    },

    async isPortOpen(host: string, port: number): Promise<boolean> {
      try {
        // Use nc (netcat) or telnet
        await $`nc -z -w 2 ${host} ${port} 2>/dev/null || (echo | telnet ${host} ${port} 2>/dev/null | grep Connected)`;
        return true;
      } catch {
        return false;
      }
    },

    async waitForPort(host: string, port: number, timeout: number = 30000): Promise<void> {
      const startTime = Date.now();
      const checkInterval = 1000;

      while (Date.now() - startTime < timeout) {
        if (await this.isPortOpen(host, port)) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      throw new Error(`Timeout waiting for ${host}:${port}`);
    },

    async resolve(hostname: string): Promise<string[]> {
      try {
        const result = await $`nslookup ${hostname} | grep Address | grep -v '#' | awk '{print $2}'`;
        return result.stdout.trim().split('\n').filter(Boolean);
      } catch (error) {
        log?.warn(`Failed to resolve ${hostname}`, error);
        return [];
      }
    },

    async reverse(ip: string): Promise<string[]> {
      try {
        const result = await $`nslookup ${ip} | grep 'name =' | awk '{print $4}' | sed 's/\\.$//'`;
        return result.stdout.trim().split('\n').filter(Boolean);
      } catch (error) {
        log?.warn(`Failed to reverse lookup ${ip}`, error);
        return [];
      }
    },

    async interfaces(): Promise<NetworkInterface[]> {
      try {
        const interfaces: NetworkInterface[] = [];

        if (env.platform.os === 'linux') {
          const result = await $`ip addr show`;
          // Parse ip addr output
          const blocks = result.stdout.split(/^\d+:/m).slice(1);

          for (const block of blocks) {
            const nameMatch = block.match(/^\s*(\S+):/);
            const name = nameMatch ? nameMatch[1] : '';

            const addresses: string[] = [];
            const inetMatches = block.matchAll(/inet\s+(\S+)/g);
            for (const match of inetMatches) {
              if (match[1]) {
                addresses.push(match[1]!.split('/')[0] || '');
              }
            }

            const macMatch = block.match(/link\/ether\s+(\S+)/);
            const mac = macMatch ? macMatch[1] : undefined;

            const up = block.includes('state UP');

            if (name) {
              interfaces.push({ name, addresses, mac, up });
            }
          }
        } else if (env.platform.os === 'darwin') {
          const result = await $`ifconfig`;
          // Parse ifconfig output
          const blocks = result.stdout.split(/^[^\s]/m);

          for (const block of blocks) {
            const nameMatch = block.match(/^(\S+):/);
            const name = nameMatch ? nameMatch[1] : '';

            const addresses: string[] = [];
            const inetMatches = block.matchAll(/inet\s+(\S+)/g);
            for (const match of inetMatches) {
              if (match[1]) {
                addresses.push(match[1]);
              }
            }

            const macMatch = block.match(/ether\s+(\S+)/);
            const mac = macMatch ? macMatch[1] : undefined;

            const up = !block.includes('status: inactive');

            if (name) {
              interfaces.push({ name, addresses, mac, up });
            }
          }
        }

        return interfaces;
      } catch (error) {
        log?.warn('Failed to get network interfaces', error);
        return [];
      }
    },

    async publicIP(): Promise<string> {
      try {
        // Use external service to get public IP
        const result = await $`curl -s https://api.ipify.org || curl -s https://icanhazip.com`;
        return result.stdout.trim();
      } catch (error) {
        log?.warn('Failed to get public IP', error);
        return '';
      }
    },

    async privateIP(): Promise<string> {
      try {
        const interfaces = await this.interfaces();

        // Look for common private IP ranges
        for (const iface of interfaces) {
          if (iface.up && iface.name !== 'lo') {
            for (const addr of iface.addresses) {
              if (addr.startsWith('192.168.') ||
                addr.startsWith('10.') ||
                addr.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) {
                return addr;
              }
            }
          }
        }

        // Fallback to first non-loopback address
        for (const iface of interfaces) {
          if (iface.up && iface.name !== 'lo' && iface.addresses.length > 0) {
            return iface.addresses[0] || '127.0.0.1';
          }
        }

        return '127.0.0.1';
      } catch (error) {
        log?.warn('Failed to get private IP', error);
        return '127.0.0.1';
      }
    },
  };

  return net;
}