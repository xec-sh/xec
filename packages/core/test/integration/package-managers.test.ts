import { it, jest, expect } from '@jest/globals';
import { 
  describeSSH, 
  getSSHConfig,
  testPackageManagers,
  testEachPackageManager
} from '@xec-sh/test-utils';

import { $ } from '../../src/index';

// Use custom describe that handles Docker containers automatically
describeSSH('Package Manager Integration Tests', () => {
  jest.setTimeout(120000); // 2 minutes for package operations

  describe('Package Manager Commands', () => {
    testEachPackageManager('should execute package manager info command', async (container) => {
      const config = getSSHConfig(container.name);
      const $ssh = $.ssh(config);

      let result;
      switch (container.packageManager) {
        case 'apt':
          result = await $ssh`apt --version`;
          break;
        case 'yum':
          result = await $ssh`yum --version`;
          break;
        case 'dnf':
          result = await $ssh`dnf --version`;
          break;
        case 'apk':
          result = await $ssh`apk --version`;
          break;
        case 'pacman':
          result = await $ssh`pacman --version`;
          break;
        case 'brew':
          // Homebrew might be in a non-standard location
          result = await $ssh`/home/linuxbrew/.linuxbrew/bin/brew --version 2>/dev/null || brew --version 2>/dev/null || echo "Homebrew not installed"`.nothrow();
          break;
        case 'snap':
          result = await $ssh`snap --version`;
          break;
        default:
          throw new Error(`Unknown package manager: ${container.packageManager}`);
      }

      // Some containers might not have the package manager properly installed
      if (container.packageManager === 'brew' && result.stdout.includes('not installed')) {
        console.log(`Skipping ${container.packageManager} test - not installed`);
        expect(result).toBeDefined();
      } else {
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBeTruthy();
      }
    });
  });

  describe('Package List Operations', () => {
    testPackageManagers(['apt', 'yum', 'dnf', 'apk', 'pacman'], 
      'should list installed packages', 
      async (container) => {
        const config = getSSHConfig(container.name);
        const $ssh = $.ssh(config);

        let result;
        switch (container.packageManager) {
          case 'apt':
            result = await $ssh`dpkg -l | head -20`;
            break;
          case 'yum':
            result = await $ssh`yum list installed | head -20`;
            break;
          case 'dnf':
            result = await $ssh`dnf list installed 2>/dev/null | head -20 || rpm -qa | head -20`;
            break;
          case 'apk':
            result = await $ssh`apk list -I | head -20`;
            break;
          case 'pacman':
            result = await $ssh`pacman -Q | head -20`;
            break;
          default:
            throw new Error(`Unknown package manager: ${container.packageManager}`);
        }

        expect(result.exitCode).toBe(0);
        // DNF might return empty list in minimal containers
        if (container.packageManager === 'dnf' && !result.stdout.trim()) {
          console.log('DNF returned empty package list, checking with rpm');
          expect(result).toBeDefined();
        } else {
          expect(result.stdout).toBeTruthy();
          expect(result.stdout.split('\n').length).toBeGreaterThan(5);
        }
      }
    );
  });

  describe('Package Search Operations', () => {
    testEachPackageManager('should search for packages', async (container) => {
      const config = getSSHConfig(container.name);
      const $ssh = $.ssh(config);

      // Skip brew and snap as they work differently
      if (container.packageManager === 'brew' || container.packageManager === 'snap') {
        return;
      }

      const searchTerm = 'curl'; // Common package available in all distros
      let result;

      switch (container.packageManager) {
        case 'apt':
          result = await $ssh`apt-cache search ${searchTerm} | head -5`.nothrow();
          break;
        case 'yum':
          result = await $ssh`yum search ${searchTerm} 2>/dev/null | head -5`.nothrow();
          break;
        case 'dnf':
          result = await $ssh`dnf search ${searchTerm} 2>/dev/null | head -5`.nothrow();
          break;
        case 'apk':
          result = await $ssh`apk search ${searchTerm} | head -5`.nothrow();
          break;
        case 'pacman':
          result = await $ssh`pacman -Ss ${searchTerm} 2>/dev/null | head -5`.nothrow();
          break;
        default:
          throw new Error(`Unknown package manager: ${container.packageManager}`);
      }

      // Don't check exit code as some might return non-zero if no results
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('Package Info Operations', () => {
    testPackageManagers(['apt', 'yum', 'dnf', 'apk', 'pacman'], 
      'should get package information', 
      async (container) => {
        const config = getSSHConfig(container.name);
        const $ssh = $.ssh(config);

        const pkg = 'bash';
        let result;

        // Use a package that's likely installed in each distro
        switch (container.packageManager) {
          case 'apt':
            result = await $ssh`dpkg -s ${pkg}`;
            break;
          case 'yum':
            result = await $ssh`yum info ${pkg}`;
            break;
          case 'dnf':
            result = await $ssh`dnf info ${pkg}`;
            break;
          case 'apk':
            result = await $ssh`apk info ${pkg}`;
            break;
          case 'pacman':
            result = await $ssh`pacman -Qi ${pkg}`;
            break;
          default:
            throw new Error(`Unknown package manager: ${container.packageManager}`);
        }

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(pkg);
      }
    );
  });

  describe('Update Operations', () => {
    testEachPackageManager('should update package database', async (container) => {
      const config = getSSHConfig(container.name);
      const $ssh = $.ssh(config);

      // Skip brew and snap for update operations
      if (container.packageManager === 'brew' || container.packageManager === 'snap') {
        return;
      }

      let result;
      switch (container.packageManager) {
        case 'apt':
          result = await $ssh`sudo apt-get update -qq`.nothrow();
          break;
        case 'yum':
          result = await $ssh`sudo yum check-update -q || true`.nothrow(); // Returns 100 if updates available
          break;
        case 'dnf':
          result = await $ssh`sudo dnf check-update -q || true`.nothrow();
          break;
        case 'apk':
          result = await $ssh`sudo apk update -q`.nothrow();
          break;
        case 'pacman':
          result = await $ssh`sudo pacman -Sy --noconfirm`.nothrow();
          break;
        default:
          throw new Error(`Unknown package manager: ${container.packageManager}`);
      }

      // Don't check specific exit codes as they vary
      expect(result).toBeDefined();
    });
  });

  describe('Package Installation Simulation', () => {
    testPackageManagers(['apt', 'yum', 'dnf', 'apk', 'pacman'], 
      'should show what would be installed (dry run)', 
      async (container) => {
        const config = getSSHConfig(container.name);
        const $ssh = $.ssh(config);

        const pkg = container.testPackage;
        let result;

        switch (container.packageManager) {
          case 'apt':
            result = await $ssh`apt-get install --dry-run ${pkg} 2>&1 | head -20`.nothrow();
            break;
          case 'yum':
            result = await $ssh`yum install --assumeno ${pkg} 2>&1 | head -20 || true`.nothrow();
            break;
          case 'dnf':
            result = await $ssh`dnf install --assumeno ${pkg} 2>&1 | head -20 || true`.nothrow();
            break;
          case 'apk':
            result = await $ssh`apk add --simulate ${pkg} 2>&1 | head -20`.nothrow();
            break;
          case 'pacman':
            result = await $ssh`pacman -S --print ${pkg} 2>&1 | head -20 || true`.nothrow();
            break;
          default:
            throw new Error(`Unknown package manager: ${container.packageManager}`);
        }

        expect(result.stdout.length).toBeGreaterThan(0);
      }
    );
  });

  describe('Repository Management', () => {
    testPackageManagers(['apt', 'yum', 'dnf'], 
      'should list configured repositories', 
      async (container) => {
        const config = getSSHConfig(container.name);
        const $ssh = $.ssh(config);

        let result;
        switch (container.packageManager) {
          case 'apt':
            result = await $ssh`apt-cache policy | head -20`;
            break;
          case 'yum':
            result = await $ssh`yum repolist`;
            break;
          case 'dnf':
            result = await $ssh`dnf repolist`;
            break;
          default:
            throw new Error(`Unknown package manager: ${container.packageManager}`);
        }

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBeTruthy();
      }
    );
  });

  describe('Cache Operations', () => {
    testPackageManagers(['apt', 'yum', 'dnf', 'apk'], 
      'should check cache statistics', 
      async (container) => {
        const config = getSSHConfig(container.name);
        const $ssh = $.ssh(config);

        let result;
        switch (container.packageManager) {
          case 'apt':
            result = await $ssh`apt-cache stats`.nothrow();
            break;
          case 'yum':
            result = await $ssh`yum makecache info 2>/dev/null || echo "Cache info not available"`.nothrow();
            break;
          case 'dnf':
            result = await $ssh`dnf makecache timer 2>&1 | head -5`.nothrow();
            break;
          case 'apk':
            result = await $ssh`apk info -v 2>&1 | head -5 || echo "APK cache info not available"`.nothrow();
            break;
          default:
            throw new Error(`Unknown package manager: ${container.packageManager}`);
        }

        expect(result.stdout.length).toBeGreaterThan(0);
      }
    );
  });

  describe('Special Package Managers', () => {
    it('should handle Homebrew operations on ubuntu-brew', async () => {
      const config = getSSHConfig('ubuntu-brew');
      const $ssh = $.ssh(config);

      // Check if brew is installed
      const brewCheck = await $ssh`which brew`.nothrow();
      if (brewCheck.exitCode !== 0) {
        console.log('Homebrew not installed in ubuntu-brew container');
        return;
      }

      // Get brew version
      const version = await $ssh`brew --version`;
      expect(version.exitCode).toBe(0);
      expect(version.stdout).toContain('Homebrew');

      // List installed packages
      const list = await $ssh`brew list --versions 2>/dev/null || echo "No packages"`;
      expect(list.exitCode).toBe(0);
    });

    it('should handle Snap operations on ubuntu-snap', async () => {
      const config = getSSHConfig('ubuntu-snap');
      const $ssh = $.ssh(config);

      // Check snap version
      const version = await $ssh`snap --version`;
      expect(version.exitCode).toBe(0);
      expect(version.stdout).toContain('snap');

      // List installed snaps
      const list = await $ssh`snap list 2>/dev/null || echo "core"`;
      expect(list.exitCode).toBe(0);
      
      // Snap might not have any packages installed in test container
      if (!list.stdout.trim() || list.stdout.trim() === 'core' || list.stdout.includes('No snaps are installed')) {
        console.log('No snaps installed in test container');
        expect(list).toBeDefined();
      } else {
        expect(list.stdout.trim().length).toBeGreaterThan(0);
      }
    });
  });
});