import type { CallableExecutionEngine } from '@xec/ush';

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createOSInfo } from '../../../src/stdlib/os.js';

import type { EnvironmentInfo } from '../../../src/modules/environment-types.js';

describe('stdlib/os', () => {
  let mockExecutor: CallableExecutionEngine;
  let mockEnv: EnvironmentInfo;
  let os: any;

  beforeEach(async () => {
    mockExecutor = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      // Reconstruct the command from template literal parts
      let cmd = strings[0];
      for (let i = 0; i < values.length; i++) {
        cmd += values[i] + strings[i + 1];
      }
      
      // Default mock responses
      if (cmd.includes('uname')) {
        if (cmd.includes('-s')) {
          return Promise.resolve({ stdout: 'Linux', stderr: '', exitCode: 0 });
        }
        if (cmd.includes('-r')) {
          return Promise.resolve({ stdout: '5.15.0-56-generic', stderr: '', exitCode: 0 });
        }
        if (cmd.includes('-m')) {
          return Promise.resolve({ stdout: 'x86_64', stderr: '', exitCode: 0 });
        }
      }
      if (cmd.includes('hostname')) {
        return Promise.resolve({ stdout: 'test-host', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('uptime')) {
        return Promise.resolve({ 
          stdout: ' 10:30:00 up 5 days, 3:45, 2 users, load average: 0.15, 0.20, 0.18', 
          stderr: '', 
          exitCode: 0 
        });
      }
      if (cmd.includes('free -m')) {
        return Promise.resolve({ 
          stdout: 'Mem:           8000        2000        4000        200        2000        5500', 
          stderr: '', 
          exitCode: 0 
        });
      }
      if (cmd.includes('df -k')) {
        return Promise.resolve({ 
          stdout: '/dev/sda1       100000000  50000000  50000000  50% /', 
          stderr: '', 
          exitCode: 0 
        });
      }
      if (cmd.includes('nproc')) {
        return Promise.resolve({ stdout: '8', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('getent passwd')) {
        return Promise.resolve({ 
          stdout: 'testuser:x:1000:1000:Test User:/home/testuser:/bin/bash', 
          stderr: '', 
          exitCode: 0 
        });
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

    os = await createOSInfo(mockExecutor as any, mockEnv);
  });

  describe('platform', () => {
    it('should return platform info', () => {
      const platform = os.platform();
      expect(platform).toBe('linux');
    });
  });

  describe('arch', () => {
    it('should return architecture', () => {
      const arch = os.arch();
      expect(arch).toBe('x64');
    });
  });

  describe('hostname', () => {
    it('should get hostname', async () => {
      const hostname = await os.hostname();
      expect(hostname).toBe('test-host');
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  // Note: uptime() method is not part of OSInfo interface

  describe('memory', () => {
    it('should get memory info on Linux', async () => {
      mockExecutor.mockImplementationOnce(() => Promise.resolve({
        stdout: 'Mem:        8388608000  2621440000  5767168000       0      0     0',
        stderr: '',
        exitCode: 0
      }));
      const memory = await os.memory();
      expect(memory.total).toBe(8388608000);
      expect(memory.free).toBe(5767168000);
      expect(memory.used).toBe(2621440000);
      // Note: available is not part of MemoryInfo interface
    });

    it('should get memory info on macOS', async () => {
      mockEnv.platform.os = 'darwin';
      
      // Set up mocks before creating the OSInfo instance
      mockExecutor.mockImplementationOnce(() => Promise.resolve({
        stdout: '4096',
        stderr: '',
        exitCode: 0
      })); // pagesize
      mockExecutor.mockImplementationOnce(() => Promise.resolve({
        stdout: `Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                            262144.
Pages active:                          524288.
Pages inactive:                        262144.
Pages wired down:                      131072.
Pages occupied by compressor:          65536.`,
        stderr: '',
        exitCode: 0
      })); // vm_stat
      
      const macOs = await createOSInfo(mockExecutor as any, mockEnv);
      const memory = await macOs.memory();
      expect(memory.total).toBeGreaterThan(0);
      expect(memory.free).toBe(262144 * 4096);
      expect(memory.used).toBe((524288 + 131072 + 65536) * 4096);
    });
  });

  describe('disk', () => {
    it('should get disk usage', async () => {
      mockExecutor.mockImplementationOnce(() => Promise.resolve({
        stdout: '/dev/disk1s1   100000000   50000000   50000000   50%   /\n/dev/disk2s1   200000000  100000000  100000000   50%   /data',
        stderr: '',
        exitCode: 0
      }));
      const disks = await os.disk();
      expect(disks).toHaveLength(2);
      expect(disks[0].mount).toBe('/');
      expect(disks[0].total).toBe(100000000 * 1024); // Convert KB to bytes
      expect(disks[0].used).toBe(50000000 * 1024);
      expect(disks[0].free).toBe(50000000 * 1024);
    });
  });

  describe('cpus', () => {
    it('should get CPU info', async () => {
      mockExecutor.mockImplementationOnce(() => Promise.resolve({
        stdout: `processor\t: 0
model name\t: Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz
cpu MHz\t\t: 3700.000

processor\t: 1
model name\t: Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz
cpu MHz\t\t: 3700.000

`,
        stderr: '',
        exitCode: 0
      }));
      const cpus = await os.cpus();
      expect(cpus).toHaveLength(1); // Grouped by model
      expect(cpus[0].model).toBe('Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz');
      expect(cpus[0].speed).toBe(3700);
      expect(cpus[0].cores).toBe(2); // Two cores with same model
    });
  });

  // Note: loadavg() method is not part of OSInfo interface

  describe('user', () => {
    it('should get current user', async () => {
      mockExecutor.mockImplementationOnce(() => Promise.resolve({
        stdout: 'testuser',
        stderr: '',
        exitCode: 0
      }));
      const user = await os.user();
      expect(user).toBe('testuser');
    });
  });

  describe('release', () => {
    it('should get OS release info', async () => {
      mockExecutor.mockImplementationOnce(() => Promise.resolve({
        stdout: '5.15.0-56-generic',
        stderr: '',
        exitCode: 0
      }));
      const release = await os.release();
      expect(release).toBe('5.15.0-56-generic');
    });
  });
});