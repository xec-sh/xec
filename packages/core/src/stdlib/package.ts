import type { CallableExecutionEngine } from '@xec/ush';

import type { Logger } from '../utils/logger.js';
import type { 
  Package,
  PackageInfo,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createPackage(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<Package> {
  
  // Detect package manager based on environment
  const detectPackageManager = async (): Promise<'apt' | 'yum' | 'dnf' | 'brew' | 'apk' | 'pacman'> => {
    if (env.platform.os === 'darwin') {
      try {
        await $`which brew`;
        return 'brew';
      } catch {
        log?.warn('Homebrew not found on macOS');
      }
    }
    
    if (env.platform.os === 'linux') {
      // Check for various package managers
      const managers: Array<[string, 'apt' | 'yum' | 'dnf' | 'brew' | 'apk' | 'pacman']> = [
        ['apt-get', 'apt'],
        ['yum', 'yum'],
        ['dnf', 'dnf'],
        ['apk', 'apk'],
        ['pacman', 'pacman'],
      ];
      
      for (const [cmd, manager] of managers) {
        try {
          await $`which ${cmd}`;
          return manager;
        } catch {
          // Continue checking
        }
      }
    }
    
    throw new Error('No supported package manager found');
  };
  
  const packageManager: 'apt' | 'yum' | 'dnf' | 'brew' | 'apk' | 'pacman' = await detectPackageManager();
  
  const pkg: Package = {
    async install(...packages: string[]): Promise<void> {
      if (packages.length === 0) return;
      
      const packagesStr = packages.join(' ');
      
      switch (packageManager) {
        case 'apt':
          // Update cache first for apt
          if (env.capabilities.sudo) {
            await $`sudo apt-get update`;
            await $`sudo apt-get install -y ${packagesStr}`;
          } else {
            await $`apt-get update`;
            await $`apt-get install -y ${packagesStr}`;
          }
          break;
          
        case 'yum':
        case 'dnf':
          if (env.capabilities.sudo) {
            await $`sudo ${packageManager} install -y ${packagesStr}`;
          } else {
            await $`${packageManager} install -y ${packagesStr}`;
          }
          break;
          
        case 'brew':
          await $`brew install ${packagesStr}`;
          break;
          
        case 'apk':
          if (env.capabilities.sudo) {
            await $`sudo apk add ${packagesStr}`;
          } else {
            await $`apk add ${packagesStr}`;
          }
          break;
          
        case 'pacman':
          if (env.capabilities.sudo) {
            await $`sudo pacman -S --noconfirm ${packagesStr}`;
          } else {
            await $`pacman -S --noconfirm ${packagesStr}`;
          }
          break;
      }
      
      log?.info(`Installed packages: ${packages.join(', ')}`);
    },

    async remove(...packages: string[]): Promise<void> {
      if (packages.length === 0) return;
      
      const packagesStr = packages.join(' ');
      
      switch (packageManager) {
        case 'apt':
          if (env.capabilities.sudo) {
            await $`sudo apt-get remove -y ${packagesStr}`;
          } else {
            await $`apt-get remove -y ${packagesStr}`;
          }
          break;
          
        case 'yum':
        case 'dnf':
          if (env.capabilities.sudo) {
            await $`sudo ${packageManager} remove -y ${packagesStr}`;
          } else {
            await $`${packageManager} remove -y ${packagesStr}`;
          }
          break;
          
        case 'brew':
          await $`brew uninstall ${packagesStr}`;
          break;
          
        case 'apk':
          if (env.capabilities.sudo) {
            await $`sudo apk del ${packagesStr}`;
          } else {
            await $`apk del ${packagesStr}`;
          }
          break;
          
        case 'pacman':
          if (env.capabilities.sudo) {
            await $`sudo pacman -R --noconfirm ${packagesStr}`;
          } else {
            await $`pacman -R --noconfirm ${packagesStr}`;
          }
          break;
      }
      
      log?.info(`Removed packages: ${packages.join(', ')}`);
    },

    async update(): Promise<void> {
      switch (packageManager) {
        case 'apt':
          if (env.capabilities.sudo) {
            await $`sudo apt-get update`;
          } else {
            await $`apt-get update`;
          }
          break;
          
        case 'yum':
        case 'dnf':
          if (env.capabilities.sudo) {
            await $`sudo ${packageManager} check-update || true`;
          } else {
            await $`${packageManager} check-update || true`;
          }
          break;
          
        case 'brew':
          await $`brew update`;
          break;
          
        case 'apk':
          if (env.capabilities.sudo) {
            await $`sudo apk update`;
          } else {
            await $`apk update`;
          }
          break;
          
        case 'pacman':
          if (env.capabilities.sudo) {
            await $`sudo pacman -Sy`;
          } else {
            await $`pacman -Sy`;
          }
          break;
      }
      
      log?.info('Package database updated');
    },

    async upgrade(...packages: string[]): Promise<void> {
      const packagesStr = packages.length > 0 ? packages.join(' ') : '';
      
      switch (packageManager) {
        case 'apt':
          if (packagesStr) {
            if (env.capabilities.sudo) {
              await $`sudo apt-get upgrade -y ${packagesStr}`;
            } else {
              await $`apt-get upgrade -y ${packagesStr}`;
            }
          } else {
            if (env.capabilities.sudo) {
              await $`sudo apt-get upgrade -y`;
            } else {
              await $`apt-get upgrade -y`;
            }
          }
          break;
          
        case 'yum':
        case 'dnf':
          if (packagesStr) {
            if (env.capabilities.sudo) {
              await $`sudo ${packageManager} upgrade -y ${packagesStr}`;
            } else {
              await $`${packageManager} upgrade -y ${packagesStr}`;
            }
          } else {
            if (env.capabilities.sudo) {
              await $`sudo ${packageManager} upgrade -y`;
            } else {
              await $`${packageManager} upgrade -y`;
            }
          }
          break;
          
        case 'brew':
          if (packagesStr) {
            await $`brew upgrade ${packagesStr}`;
          } else {
            await $`brew upgrade`;
          }
          break;
          
        case 'apk':
          if (packagesStr) {
            if (env.capabilities.sudo) {
              await $`sudo apk upgrade ${packagesStr}`;
            } else {
              await $`apk upgrade ${packagesStr}`;
            }
          } else {
            if (env.capabilities.sudo) {
              await $`sudo apk upgrade`;
            } else {
              await $`apk upgrade`;
            }
          }
          break;
          
        case 'pacman':
          if (packagesStr) {
            if (env.capabilities.sudo) {
              await $`sudo pacman -S --noconfirm ${packagesStr}`;
            } else {
              await $`pacman -S --noconfirm ${packagesStr}`;
            }
          } else {
            if (env.capabilities.sudo) {
              await $`sudo pacman -Syu --noconfirm`;
            } else {
              await $`pacman -Syu --noconfirm`;
            }
          }
          break;
      }
      
      log?.info(packagesStr ? `Upgraded packages: ${packages.join(', ')}` : 'All packages upgraded');
    },

    async installed(name: string): Promise<boolean> {
      try {
        switch (packageManager) {
          case 'apt':
            await $`dpkg -l | grep -E "^ii\\s+${name}"`;
            return true;
            
          case 'yum':
          case 'dnf':
            await $`${packageManager} list installed | grep ${name}`;
            return true;
            
          case 'brew':
            await $`brew list | grep -E "^${name}$"`;
            return true;
            
          case 'apk':
            await $`apk info | grep -E "^${name}$"`;
            return true;
            
          case 'pacman':
            await $`pacman -Q ${name}`;
            return true;
            
          default:
            return false;
        }
      } catch {
        return false;
      }
    },

    async version(name: string): Promise<string | null> {
      try {
        let result;
        
        switch (packageManager) {
          case 'apt':
            result = await $`dpkg -l ${name} | grep "^ii" | awk '{print $3}'`;
            break;
            
          case 'yum':
          case 'dnf':
            result = await $`${packageManager} list installed ${name} | grep ${name} | awk '{print $2}'`;
            break;
            
          case 'brew':
            result = await $`brew list --versions ${name} | awk '{print $2}'`;
            break;
            
          case 'apk':
            result = await $`apk info ${name} | grep ${name} | cut -d- -f2-`;
            break;
            
          case 'pacman':
            result = await $`pacman -Q ${name} | awk '{print $2}'`;
            break;
            
          default:
            return null;
        }
        
        return result.stdout.trim() || null;
      } catch {
        return null;
      }
    },

    async search(query: string): Promise<PackageInfo[]> {
      try {
        const packages: PackageInfo[] = [];
        let result;
        
        switch (packageManager) {
          case 'apt':
            result = await $`apt-cache search ${query}`;
            const aptLines = result.stdout.trim().split('\n');
            for (const line of aptLines) {
              const [name, ...descParts] = line.split(' - ');
              if (name) {
                packages.push({
                  name: name.trim(),
                  version: '', // Version not provided in search
                  description: descParts.join(' - '),
                });
              }
            }
            break;
            
          case 'yum':
          case 'dnf':
            result = await $`${packageManager} search ${query}`;
            // Parse yum/dnf output
            const lines = result.stdout.split('\n');
            for (const line of lines) {
              if (line.includes(':')) {
                const [nameVer, desc] = line.split(':');
                if (nameVer) {
                  const name = nameVer.trim().split('.')[0];
                  if (name) {
                    packages.push({
                      name,
                      version: '',
                      description: desc?.trim() || '',
                    });
                  }
                }
              }
            }
            break;
            
          case 'brew':
            result = await $`brew search ${query}`;
            const brewPackages = result.stdout.trim().split(/\s+/);
            for (const name of brewPackages) {
              if (name) {
                packages.push({
                  name,
                  version: '',
                  description: '',
                });
              }
            }
            break;
            
          case 'apk':
            result = await $`apk search ${query}`;
            const apkLines = result.stdout.trim().split('\n');
            for (const line of apkLines) {
              const match = line.match(/^([^-]+)/);
              if (match && match[1]) {
                packages.push({
                  name: match[1],
                  version: '',
                  description: '',
                });
              }
            }
            break;
            
          case 'pacman':
            result = await $`pacman -Ss ${query}`;
            // Parse pacman output (alternating lines of name/version and description)
            const pacmanLines = result.stdout.trim().split('\n');
            for (let i = 0; i < pacmanLines.length; i += 2) {
              const nameMatch = pacmanLines[i]?.match(/^[^\/]+\/(\S+)\s+(\S+)/);
              if (nameMatch && nameMatch[1] && nameMatch[2] && pacmanLines[i + 1]) {
                packages.push({
                  name: nameMatch[1],
                  version: nameMatch[2],
                  description: pacmanLines[i + 1]?.trim() || '',
                });
              }
            }
            break;
        }
        
        return packages;
      } catch (error) {
        log?.warn(`Failed to search for packages: ${error}`);
        return [];
      }
    },

    manager() {
      return packageManager;
    },
  };

  return pkg;
}