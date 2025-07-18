import type { CallableExecutionEngine } from '@xec/ush';

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createPackage } from '../../../src/stdlib/package.js';

import type { EnvironmentInfo } from '../../../src/modules/environment-types.js';

describe('stdlib/pkg', () => {
  let mockExecutor: CallableExecutionEngine;
  let mockEnv: EnvironmentInfo;
  let pkg: any;

  beforeEach(async () => {
    mockExecutor = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      // Reconstruct the command from template literal parts
      let cmd = strings[0];
      for (let i = 0; i < values.length; i++) {
        cmd += values[i] + strings[i + 1];
      }
      
      // Default mock responses
      if (cmd.includes('apt') || cmd.includes('yum') || cmd.includes('brew')) {
        if (cmd.includes('update')) {
          return Promise.resolve({ stdout: 'Updated package list', stderr: '', exitCode: 0 });
        }
        if (cmd.includes('install')) {
          return Promise.resolve({ stdout: 'Package installed successfully', stderr: '', exitCode: 0 });
        }
        if (cmd.includes('remove') || cmd.includes('uninstall')) {
          return Promise.resolve({ stdout: 'Package removed successfully', stderr: '', exitCode: 0 });
        }
        if (cmd.includes('list') || cmd.includes('dpkg -l')) {
          // Check if this is an installed() check with grep
          if (cmd.includes('grep')) {
            // Check the values array for the package name
            const packageName = values.find(v => typeof v === 'string');
            if (packageName === 'nonexistent') {
              // grep will fail if package not found
              return Promise.reject(new Error('grep: no match'));
            }
          }
          return Promise.resolve({ 
            stdout: 'nginx\napache2\nmysql-server', 
            stderr: '', 
            exitCode: 0 
          });
        }
        if (cmd.includes('search')) {
          return Promise.resolve({ 
            stdout: 'nginx - High performance web server\nnginx-full - nginx web server with full modules', 
            stderr: '', 
            exitCode: 0 
          });
        }
      }
      if (cmd.includes('which')) {
        if (cmd.includes('apt-get')) {
          return Promise.resolve({ stdout: '/usr/bin/apt-get', stderr: '', exitCode: 0 });
        }
        return Promise.reject(new Error('Command not found'));
      }
      if (cmd.includes('dpkg -s') || cmd.includes('rpm -q')) {
        if (cmd.includes('nginx')) {
          return Promise.resolve({ stdout: 'Status: install ok installed', stderr: '', exitCode: 0 });
        }
        return Promise.reject(new Error('Package not found'));
      }
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    });

    mockEnv = {
      type: 'local',
      capabilities: {
        shell: true,
        sudo: true,
        docker: false,
        systemd: true
      },
      platform: {
        os: 'linux',
        arch: 'x64',
        distro: 'ubuntu'
      }
    };

    pkg = await createPackage(mockExecutor as any, mockEnv);
  });

  describe('install', () => {
    it('should install package on Ubuntu', async () => {
      await pkg.install('nginx');
      
      // Check the apt-get update call
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get update'])
      );
      
      // Check the apt-get install call
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get install -y ']),
        'nginx'
      );
    });

    it('should install multiple packages', async () => {
      await pkg.install('nginx', 'mysql-server');
      
      // Check the apt-get update call
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get update'])
      );
      
      // Check the apt-get install call
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get install -y ']),
        'nginx mysql-server'
      );
    });

    it('should install on CentOS', async () => {
      mockEnv.platform.distro = 'centos';
      
      mockExecutor.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
        // Reconstruct command from template parts
        let cmd = '';
        if (Array.isArray(strings)) {
          cmd = strings[0];
          for (let i = 0; i < values.length; i++) {
            cmd += values[i] + strings[i + 1];
          }
        } else {
          cmd = String(strings);
        }
        
        if (cmd.includes('which')) {
          if (cmd.includes('apt-get')) {
            return Promise.reject(new Error('Command not found'));
          }
          if (cmd.includes('yum')) {
            return Promise.resolve({ stdout: '/usr/bin/yum', stderr: '', exitCode: 0 });
          }
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });
      
      const centosПkg = await createPackage(mockExecutor as any, mockEnv);
      
      await centosПkg.install('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo ', ' install -y ']),
        'yum',
        'nginx'
      );
    });

    it('should install on macOS', async () => {
      mockEnv.platform.os = 'darwin';
      
      mockExecutor.mockImplementation((strings: TemplateStringsArray) => {
        const cmd = strings[0];
        if (cmd.includes('which brew')) {
          return Promise.resolve({ stdout: '/usr/local/bin/brew', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });
      
      const macPkg = await createPackage(mockExecutor as any, mockEnv);
      
      await macPkg.install('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['brew install ']),
        'nginx'
      );
    });
  });

  describe('remove', () => {
    it('should remove package', async () => {
      await pkg.remove('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get remove -y ']),
        'nginx'
      );
    });

    // Test removed - Package.remove() doesn't support options
  });

  describe('update', () => {
    it('should update package list', async () => {
      await pkg.update();
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get update'])
      );
    });
  });

  describe('upgrade', () => {
    it('should upgrade all packages', async () => {
      await pkg.upgrade();
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get upgrade -y'])
      );
    });

    it('should upgrade specific package', async () => {
      await pkg.upgrade('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['sudo apt-get upgrade -y ']),
        'nginx'
      );
    });
  });

  // Package.list() method doesn't exist in the interface - removed tests

  describe('search', () => {
    it('should search for packages', async () => {
      const results = await pkg.search('nginx');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('nginx');
      expect(results[0].description).toBe('High performance web server');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining(['apt-cache search ']),
        'nginx'
      );
    });
  });

  describe('installed', () => {
    it('should check if package is installed', async () => {
      const installed = await pkg.installed('nginx');
      expect(installed).toBe(true);
    });

    it('should return false for non-installed package', async () => {
      // Override the mock for this specific test
      mockExecutor.mockImplementationOnce((strings: TemplateStringsArray, ...values: any[]) => {
        const cmd = strings[0] + (values[0] || '');
        // For the installed check, if grep doesn't find the package, it should fail
        if (cmd.includes('dpkg -l') && cmd.includes('grep')) {
          return Promise.reject(new Error('grep: no match'));
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });
      
      const installed = await pkg.installed('nonexistent');
      expect(installed).toBe(false);
    });
  });

  // Package.info() method doesn't exist in the interface - use version() instead

  // Package.autoremove() and clean() methods don't exist in the interface - removed tests
});