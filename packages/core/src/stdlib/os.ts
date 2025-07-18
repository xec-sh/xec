import type { CallableExecutionEngine } from '@xec/ush';

import type { Logger } from '../utils/logger.js';
import type { 
  OSInfo,
  CPUInfo,
  DiskInfo,
  OSPlatform,
  MemoryInfo,
  Architecture,
  EnvironmentInfo,
  OSNetworkInterface,
} from '../types/environment-types.js';

export async function createOSInfo(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<OSInfo> {
  
  const os: OSInfo = {
    platform(): OSPlatform {
      return env.platform.os;
    },

    arch(): Architecture {
      return env.platform.arch;
    },

    async hostname(): Promise<string> {
      try {
        const result = await $`hostname`;
        return result.stdout.trim();
      } catch (error) {
        log?.warn('Failed to get hostname', error);
        return 'unknown';
      }
    },

    async release(): Promise<string> {
      try {
        if (env.platform.os === 'linux') {
          // Try to get detailed Linux release info
          try {
            const result = await $`cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"'`;
            return result.stdout.trim();
          } catch {
            // Fallback to uname
            const result = await $`uname -r`;
            return result.stdout.trim();
          }
        } else if (env.platform.os === 'darwin') {
          const result = await $`sw_vers -productVersion`;
          return `macOS ${result.stdout.trim()}`;
        } else if (env.platform.os === 'win32') {
          const result = await $`ver`;
          return result.stdout.trim();
        } else {
          const result = await $`uname -r`;
          return result.stdout.trim();
        }
      } catch (error) {
        log?.warn('Failed to get OS release', error);
        return 'unknown';
      }
    },

    async cpus(): Promise<CPUInfo[]> {
      try {
        const cpuInfos: CPUInfo[] = [];
        
        if (env.platform.os === 'linux') {
          // Parse /proc/cpuinfo
          const result = await $`cat /proc/cpuinfo`;
          const cpuBlocks = result.stdout.split('\n\n').filter(Boolean);
          
          for (const block of cpuBlocks) {
            const lines = block.split('\n');
            const modelLine = lines.find((l: string) => l.startsWith('model name'));
            const mhzLine = lines.find((l: string) => l.startsWith('cpu MHz'));
            
            if (modelLine) {
              const modelParts = modelLine.split(':');
              const model = modelParts[1]?.trim() || 'unknown';
              
              let speed = 0;
              if (mhzLine) {
                const mhzParts = mhzLine.split(':');
                const mhzValue = mhzParts[1]?.trim();
                speed = mhzValue ? parseFloat(mhzValue) : 0;
              }
              
              cpuInfos.push({
                model,
                speed,
                cores: 1,
              });
            }
          }
          
          // Group by model and count cores
          const grouped = cpuInfos.reduce((acc: any, cpu) => {
            const existing = acc.find((c: any) => c.model === cpu.model);
            if (existing) {
              existing.cores++;
            } else {
              acc.push({ ...cpu });
            }
            return acc;
          }, [] as CPUInfo[]);
          
          return grouped;
        } else if (env.platform.os === 'darwin') {
          // macOS sysctl
          const modelResult = await $`sysctl -n machdep.cpu.brand_string`;
          const coresResult = await $`sysctl -n hw.ncpu`;
          const speedResult = await $`sysctl -n hw.cpufrequency_max 2>/dev/null || echo 0`;
          
          return [{
            model: modelResult.stdout.trim(),
            speed: parseInt(speedResult.stdout.trim()) / 1000000, // Convert to MHz
            cores: parseInt(coresResult.stdout.trim()),
          }];
        } else {
          // Fallback
          const result = await $`nproc 2>/dev/null || echo 1`;
          return [{
            model: 'unknown',
            speed: 0,
            cores: parseInt(result.stdout.trim()),
          }];
        }
      } catch (error) {
        log?.warn('Failed to get CPU info', error);
        return [{
          model: 'unknown',
          speed: 0,
          cores: 1,
        }];
      }
    },

    async memory(): Promise<MemoryInfo> {
      try {
        if (env.platform.os === 'linux') {
          const result = await $`free -b | grep Mem`;
          const parts = result.stdout.trim().split(/\s+/);
          const total = parseInt(parts[1] || '0');
          const used = parseInt(parts[2] || '0');
          const free = parseInt(parts[3] || '0');
          
          return { total, used, free };
        } else if (env.platform.os === 'darwin') {
          // macOS vm_stat
          const pageSize = await $`pagesize`;
          const pageSizeNum = parseInt(pageSize.stdout.trim());
          
          const vmStat = await $`vm_stat`;
          const lines = vmStat.stdout.split('\n');
          
          const getValue = (label: string): number => {
            const line = lines.find((l: string) => l.includes(label));
            if (!line) return 0;
            const match = line.match(/:\s*(\d+)/);
            return match ? parseInt(match[1]!) * pageSizeNum : 0;
          };
          
          const free = getValue('Pages free');
          const active = getValue('Pages active');
          const inactive = getValue('Pages inactive');
          const wired = getValue('Pages wired down');
          const compressed = getValue('Pages occupied by compressor');
          
          const total = free + active + inactive + wired + compressed;
          const used = active + wired + compressed;
          
          return { total, used, free };
        } else {
          // Fallback
          return {
            total: 0,
            used: 0,
            free: 0,
          };
        }
      } catch (error) {
        log?.warn('Failed to get memory info', error);
        return {
          total: 0,
          used: 0,
          free: 0,
        };
      }
    },

    async disk(): Promise<DiskInfo[]> {
      try {
        const disks: DiskInfo[] = [];
        
        // Use df command - portable across Unix-like systems
        const result = await $`df -k | grep -v Filesystem`;
        const lines = result.stdout.trim().split('\n');
        
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 6) {
            // Skip special filesystems
            const filesystem = parts[0];
            if (filesystem && (filesystem.startsWith('/dev/') || filesystem === 'tmpfs' || !filesystem.includes('/'))) {
              const mount = parts[5] || 'unknown';
              const total = parseInt(parts[1] || '0') * 1024; // Convert from KB to bytes
              const used = parseInt(parts[2] || '0') * 1024;
              const free = parseInt(parts[3] || '0') * 1024;
              
              disks.push({ mount, total, used, free });
            }
          }
        }
        
        return disks;
      } catch (error) {
        log?.warn('Failed to get disk info', error);
        return [];
      }
    },

    async user(): Promise<string> {
      try {
        const result = await $`whoami`;
        return result.stdout.trim();
      } catch (error) {
        log?.warn('Failed to get current user', error);
        return process.env['USER'] || process.env['USERNAME'] || 'unknown';
      }
    },

    async home(): Promise<string> {
      try {
        const result = await $`echo $HOME`;
        return result.stdout.trim();
      } catch (error) {
        log?.warn('Failed to get home directory', error);
        return process.env['HOME'] || process.env['USERPROFILE'] || '/tmp';
      }
    },

    async uptime(): Promise<number> {
      try {
        if (env.platform.os === 'linux' || env.platform.os === 'darwin') {
          // Get uptime in seconds
          const result = await $`cat /proc/uptime 2>/dev/null | cut -d' ' -f1 || uptime -s`;
          if (result.stdout.includes('.')) {
            // Linux /proc/uptime format
            return Math.floor(parseFloat(result.stdout.trim()));
          } else {
            // macOS uptime -s format (boot time)
            const bootTime = new Date(result.stdout.trim()).getTime();
            return Math.floor((Date.now() - bootTime) / 1000);
          }
        } else if (env.platform.os === 'win32' || env.platform.os === 'windows') {
          const result = await $`wmic os get lastbootuptime`;
          const lines = result.stdout.split('\n');
          const bootTimeStr = lines[1]?.trim() || '';
          // Parse Windows WMI datetime format
          const year = bootTimeStr.substring(0, 4);
          const month = bootTimeStr.substring(4, 6);
          const day = bootTimeStr.substring(6, 8);
          const hour = bootTimeStr.substring(8, 10);
          const minute = bootTimeStr.substring(10, 12);
          const second = bootTimeStr.substring(12, 14);
          const bootTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();
          return Math.floor((Date.now() - bootTime) / 1000);
        } else {
          return 0;
        }
      } catch (error) {
        log?.warn('Failed to get uptime', error);
        return 0;
      }
    },

    async loadavg(): Promise<[number, number, number]> {
      try {
        if (env.platform.os === 'linux' || env.platform.os === 'darwin') {
          const result = await $`cat /proc/loadavg 2>/dev/null | cut -d' ' -f1-3 || uptime | sed 's/.*load average: //' | sed 's/,//g'`;
          const loads = result.stdout.trim().split(/\s+/).map(parseFloat);
          return [loads[0] || 0, loads[1] || 0, loads[2] || 0];
        } else {
          // Windows doesn't have load average in the same way
          return [0, 0, 0];
        }
      } catch (error) {
        log?.warn('Failed to get load average', error);
        return [0, 0, 0];
      }
    },

    async networkInterfaces(): Promise<OSNetworkInterface[]> {
      try {
        const interfaces: OSNetworkInterface[] = [];
        
        if (env.platform.os === 'linux') {
          // Use ip command
          const result = await $`ip -j addr show 2>/dev/null || ifconfig -a`;
          
          if (result.stdout.startsWith('[')) {
            // JSON output from ip command
            const data = JSON.parse(result.stdout);
            for (const iface of data) {
              const name = iface.ifname;
              const mac = iface.address || '00:00:00:00:00:00';
              
              for (const addr of (iface.addr_info || [])) {
                interfaces.push({
                  name,
                  address: addr.local,
                  family: addr.family === 'inet' ? 'IPv4' : 'IPv6',
                  mac,
                  internal: name === 'lo' || name.startsWith('docker'),
                });
              }
            }
          } else {
            // Parse ifconfig output
            const blocks = result.stdout.split(/\n(?=\S)/);
            for (const block of blocks) {
              const lines = block.split('\n');
              const nameMatch = lines[0]?.match(/^(\S+)/);
              if (!nameMatch || !nameMatch[1]) continue;
              
              const name = nameMatch[1].replace(':', '');
              const macMatch = block.match(/(?:ether|HWaddr)\s+([0-9a-fA-F:]+)/);
              const mac = macMatch?.[1] || '00:00:00:00:00:00';
              
              // IPv4
              const ipv4Match = block.match(/inet\s+(?:addr:)?(\d+\.\d+\.\d+\.\d+)/);
              if (ipv4Match?.[1]) {
                interfaces.push({
                  name,
                  address: ipv4Match[1],
                  family: 'IPv4',
                  mac,
                  internal: name === 'lo' || name.startsWith('docker'),
                });
              }
              
              // IPv6
              const ipv6Matches = block.matchAll(/inet6\s+(?:addr:\s*)?([0-9a-fA-F:]+)/g);
              for (const match of ipv6Matches) {
                if (match[1]) {
                  interfaces.push({
                    name,
                    address: match[1],
                    family: 'IPv6',
                    mac,
                    internal: name === 'lo' || name.startsWith('docker'),
                  });
                }
              }
            }
          }
        } else if (env.platform.os === 'darwin') {
          // macOS ifconfig
          const result = await $`ifconfig -a`;
          const blocks = result.stdout.split(/\n(?=\w)/);
          
          for (const block of blocks) {
            const lines = block.split('\n');
            const nameMatch = lines[0]?.match(/^(\S+):/);
            if (!nameMatch || !nameMatch[1]) continue;
            
            const name = nameMatch[1];
            const macMatch = block.match(/ether\s+([0-9a-fA-F:]+)/);
            const mac = macMatch?.[1] || '00:00:00:00:00:00';
            
            // IPv4
            const ipv4Matches = block.matchAll(/inet\s+(\d+\.\d+\.\d+\.\d+)/g);
            for (const match of ipv4Matches) {
              if (match[1]) {
                interfaces.push({
                  name,
                  address: match[1],
                  family: 'IPv4',
                  mac,
                  internal: name === 'lo0',
                });
              }
            }
            
            // IPv6
            const ipv6Matches = block.matchAll(/inet6\s+([0-9a-fA-F:]+)(?:%\w+)?/g);
            for (const match of ipv6Matches) {
              if (match[1]) {
                interfaces.push({
                  name,
                  address: match[1],
                  family: 'IPv6',
                  mac,
                  internal: name === 'lo0',
                });
              }
            }
          }
        } else if (env.platform.os === 'win32' || env.platform.os === 'windows') {
          // Windows ipconfig
          const result = await $`ipconfig /all`;
          // Split by adapter sections, not just double newlines
          const sections = result.stdout.split(/\n(?=\w.*adapter)/);
          
          for (const section of sections) {
            const adapterMatch = section.match(/^(.*)adapter\s+(.+):/m);
            if (!adapterMatch || !adapterMatch[2]) continue;
            
            const name = adapterMatch[2].trim();
            const macMatch = section.match(/Physical Address.*:\s*([0-9A-F-]+)/i);
            const mac = macMatch?.[1]?.replace(/-/g, ':') || '00:00:00:00:00:00';
            const isInternal = name.includes('Loopback');
            
            // IPv4
            const ipv4Matches = section.matchAll(/IPv4 Address.*:\s*(\d+\.\d+\.\d+\.\d+)/g);
            for (const match of ipv4Matches) {
              if (match[1]) {
                interfaces.push({
                  name,
                  address: match[1],
                  family: 'IPv4',
                  mac,
                  internal: isInternal,
                });
              }
            }
            
            // IPv6
            const ipv6Matches = section.matchAll(/IPv6 Address.*:\s*([0-9a-fA-F:]+)/g);
            for (const match of ipv6Matches) {
              if (match[1]) {
                interfaces.push({
                  name,
                  address: match[1],
                  family: 'IPv6',
                  mac,
                  internal: isInternal,
                });
              }
            }
          }
        }
        
        return interfaces;
      } catch (error) {
        log?.warn('Failed to get network interfaces', error);
        return [];
      }
    },
  };

  return os;
}