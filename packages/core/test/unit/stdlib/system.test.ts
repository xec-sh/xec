import * as os from 'os';
import * as path from 'path';
import { it, vi, expect, describe, beforeEach } from 'vitest';

import { tasks, helpers, systemModule } from '../../../src/stdlib/system/index.js';

import type { TaskContext } from '../../../src/core/types.js';

// Mock os module
vi.mock('os');

describe('stdlib/system', () => {
  let mockContext: TaskContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      taskId: 'test-task',
      vars: {},
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn()
      }
    };

    // Set up default mocks
    vi.mocked(os.hostname).mockReturnValue('test-host');
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.arch).mockReturnValue('x64');
    vi.mocked(os.release).mockReturnValue('5.10.0');
    vi.mocked(os.cpus).mockReturnValue([
      { model: 'Intel', speed: 2400 },
      { model: 'Intel', speed: 2400 }
    ] as any);
    vi.mocked(os.totalmem).mockReturnValue(8589934592); // 8GB
    vi.mocked(os.freemem).mockReturnValue(4294967296); // 4GB
    vi.mocked(os.uptime).mockReturnValue(3600); // 1 hour
    vi.mocked(os.loadavg).mockReturnValue([0.5, 0.7, 0.9]);
    vi.mocked(os.userInfo).mockReturnValue({
      username: 'testuser',
      uid: 1000,
      gid: 1000,
      shell: '/bin/bash',
      homedir: '/home/testuser'
    } as any);
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
  });

  describe('module structure', () => {
    it('should export system module with correct metadata', () => {
      expect(systemModule.name).toBe('@xec/stdlib-system');
      expect(systemModule.version).toBe('1.0.0');
      expect(systemModule.description).toBe('System operations and monitoring for Xec');
      expect(systemModule.dependencies).toContain('@xec/stdlib-core');
    });

    it('should export tasks and helpers', () => {
      expect(systemModule.exports.tasks).toBe(tasks);
      expect(systemModule.exports.helpers).toBe(helpers);
      expect(systemModule.exports.patterns).toEqual({});
      expect(systemModule.exports.integrations).toEqual({});
    });
  });

  describe('helpers', () => {
    describe('OS information', () => {
      it('should get hostname', () => {
        expect(helpers.hostname()).toBe('test-host');
      });

      it('should get platform', () => {
        expect(helpers.platform()).toBe('linux');
      });

      it('should get architecture', () => {
        expect(helpers.arch()).toBe('x64');
      });

      it('should get release', () => {
        expect(helpers.release()).toBe('5.10.0');
      });

      it('should get cpus', () => {
        const cpus = helpers.cpus();
        expect(cpus).toHaveLength(2);
        expect(cpus[0]).toHaveProperty('model', 'Intel');
      });

      it('should get total memory', () => {
        expect(helpers.totalmem()).toBe(8589934592);
      });

      it('should get free memory', () => {
        expect(helpers.freemem()).toBe(4294967296);
      });

      it('should get uptime', () => {
        expect(helpers.uptime()).toBe(3600);
      });

      it('should get load average', () => {
        expect(helpers.loadavg()).toEqual([0.5, 0.7, 0.9]);
      });
    });

    describe('user information', () => {
      it('should get user info', () => {
        const info = helpers.userInfo();
        expect(info.username).toBe('testuser');
        expect(info.uid).toBe(1000);
      });

      it('should get home directory', () => {
        expect(helpers.homedir()).toBe('/home/testuser');
      });

      it('should get temp directory', () => {
        expect(helpers.tmpdir()).toBe('/tmp');
      });
    });

    describe('path operations', () => {
      it('should join paths', () => {
        expect(helpers.joinPath('a', 'b', 'c')).toBe(path.join('a', 'b', 'c'));
      });

      it('should resolve paths', () => {
        expect(helpers.resolvePath('a', 'b')).toBe(path.resolve('a', 'b'));
      });

      it('should get dirname', () => {
        expect(helpers.dirname('/home/user/file.txt')).toBe('/home/user');
      });

      it('should get basename', () => {
        expect(helpers.basename('/home/user/file.txt')).toBe('file.txt');
        expect(helpers.basename('/home/user/file.txt', '.txt')).toBe('file');
      });

      it('should get extension', () => {
        expect(helpers.extname('/home/user/file.txt')).toBe('.txt');
      });
    });

    describe('environment', () => {
      it('should get environment variable', () => {
        process.env.TEST_VAR = 'test_value';
        expect(helpers.getEnv('TEST_VAR')).toBe('test_value');
        expect(helpers.getEnv('MISSING', 'default')).toBe('default');
        delete process.env.TEST_VAR;
      });

      it('should set environment variable', () => {
        helpers.setEnv('NEW_VAR', 'new_value');
        expect(process.env.NEW_VAR).toBe('new_value');
        delete process.env.NEW_VAR;
      });

      it('should get all env vars', () => {
        const env = helpers.envVars();
        expect(env).toEqual(process.env);
      });
    });

    describe('process info', () => {
      it('should get process id', () => {
        expect(helpers.pid()).toBe(process.pid);
      });

      it('should get parent process id', () => {
        expect(helpers.ppid()).toBe(process.ppid);
      });

      it('should get current working directory', () => {
        expect(helpers.cwd()).toBe(process.cwd());
      });

      it('should get argv', () => {
        expect(helpers.argv()).toBe(process.argv);
      });

      it('should get exec path', () => {
        expect(helpers.execPath()).toBe(process.execPath);
      });

      it('should get version', () => {
        expect(helpers.version()).toBe(process.version);
      });

      it('should get versions', () => {
        expect(helpers.versions()).toBe(process.versions);
      });
    });

    describe('memory and cpu usage', () => {
      it('should get memory usage', () => {
        const mockUsage = {
          rss: 50331648,
          heapTotal: 10485760,
          heapUsed: 5242880,
          external: 1048576,
          arrayBuffers: 524288
        };
        vi.spyOn(process, 'memoryUsage').mockReturnValue(mockUsage);

        const usage = helpers.memoryUsage();
        expect(usage).toEqual(mockUsage);
      });

      it('should get cpu usage', () => {
        const mockUsage = { user: 100000, system: 50000 };
        vi.spyOn(process, 'cpuUsage').mockReturnValue(mockUsage);

        const usage = helpers.cpuUsage();
        expect(usage).toEqual(mockUsage);
      });
    });

    describe('system checks', () => {
      it('should check if Windows', () => {
        vi.mocked(os.platform).mockReturnValue('win32');
        expect(helpers.isWindows()).toBe(true);

        vi.mocked(os.platform).mockReturnValue('linux');
        expect(helpers.isWindows()).toBe(false);
      });

      it('should check if Linux', () => {
        vi.mocked(os.platform).mockReturnValue('linux');
        expect(helpers.isLinux()).toBe(true);

        vi.mocked(os.platform).mockReturnValue('darwin');
        expect(helpers.isLinux()).toBe(false);
      });

      it('should check if Mac', () => {
        vi.mocked(os.platform).mockReturnValue('darwin');
        expect(helpers.isMac()).toBe(true);

        vi.mocked(os.platform).mockReturnValue('linux');
        expect(helpers.isMac()).toBe(false);
      });

      it('should check if 64-bit', () => {
        vi.mocked(os.arch).mockReturnValue('x64');
        expect(helpers.is64Bit()).toBe(true);

        vi.mocked(os.arch).mockReturnValue('arm64');
        expect(helpers.is64Bit()).toBe(true);

        vi.mocked(os.arch).mockReturnValue('x32');
        expect(helpers.is64Bit()).toBe(false);
      });
    });
  });

  describe('tasks', () => {
    describe('sysInfo task', () => {
      it('should get system information', async () => {
        const result = await tasks.sysInfo.handler(mockContext);

        expect(result).toEqual({
          hostname: 'test-host',
          platform: 'linux',
          arch: 'x64',
          release: '5.10.0',
          cpus: 2,
          totalMemory: 8589934592,
          freeMemory: 4294967296,
          uptime: 3600
        });
      });
    });

    describe('checkRequirements task', () => {
      it('should pass when requirements are met', async () => {
        mockContext.vars = {
          minMemory: 1024 * 1024 * 1024, // 1GB
          minCpus: 2,
          requiredPlatforms: ['linux', 'darwin']
        };

        const result = await tasks.checkRequirements.handler(mockContext);

        expect(result).toEqual({
          passed: true,
          system: {
            memory: 8589934592,
            cpus: 2,
            platform: 'linux'
          }
        });
      });

      it('should fail when memory is insufficient', async () => {
        mockContext.vars = {
          minMemory: 16 * 1024 * 1024 * 1024, // 16GB
          minCpus: 1,
          requiredPlatforms: ['linux']
        };

        await expect(tasks.checkRequirements.handler(mockContext))
          .rejects.toThrow('System requirements not met');
      });

      it('should fail when CPUs are insufficient', async () => {
        mockContext.vars = {
          minMemory: 1024,
          minCpus: 4,
          requiredPlatforms: ['linux']
        };

        await expect(tasks.checkRequirements.handler(mockContext))
          .rejects.toThrow('System requirements not met');
      });

      it('should fail when platform is not supported', async () => {
        mockContext.vars = {
          minMemory: 1024,
          minCpus: 1,
          requiredPlatforms: ['darwin', 'win32']
        };

        await expect(tasks.checkRequirements.handler(mockContext))
          .rejects.toThrow('Unsupported platform: linux');
      });
    });

    describe('environment variable tasks', () => {
      it('should set environment variable', async () => {
        mockContext.vars = { name: 'TEST_VAR', value: 'test_value' };

        const result = await tasks.setEnvVar.handler(mockContext);

        expect(process.env.TEST_VAR).toBe('test_value');
        expect(result).toEqual({ set: { TEST_VAR: 'test_value' } });

        delete process.env.TEST_VAR;
      });

      it('should get environment variable', async () => {
        process.env.EXISTING_VAR = 'existing_value';
        mockContext.vars = { name: 'EXISTING_VAR' };

        const result = await tasks.getEnvVar.handler(mockContext);

        expect(result).toEqual({ EXISTING_VAR: 'existing_value' });

        delete process.env.EXISTING_VAR;
      });

      it('should use default value for missing env var', async () => {
        mockContext.vars = { name: 'MISSING_VAR', default: 'default_value' };

        const result = await tasks.getEnvVar.handler(mockContext);

        expect(result).toEqual({ MISSING_VAR: 'default_value' });
      });
    });

    describe('memoryUsage task', () => {
      it('should get memory usage', async () => {
        const mockProcessUsage = {
          rss: 50331648,
          heapTotal: 10485760,
          heapUsed: 5242880,
          external: 1048576,
          arrayBuffers: 524288
        };
        vi.spyOn(process, 'memoryUsage').mockReturnValue(mockProcessUsage);

        const result = await tasks.memoryUsage.handler(mockContext);

        expect(result).toEqual({
          process: mockProcessUsage,
          system: {
            total: 8589934592,
            free: 4294967296,
            used: 4294967296
          },
          percentUsed: 50
        });
      });
    });

    describe('checkLoad task', () => {
      it('should check system load and report healthy', async () => {
        mockContext.vars = {
          maxLoad1: 0.8,
          maxLoad5: 0.7,
          maxLoad15: 0.6
        };
        vi.mocked(os.loadavg).mockReturnValue([0.5, 0.7, 0.9]);

        const result = await tasks.checkLoad.handler(mockContext);

        expect(result).toEqual({
          loadAverage: { load1: 0.5, load5: 0.7, load15: 0.9 },
          normalized: {
            load1: 0.25,
            load5: 0.35,
            load15: 0.45
          },
          cpuCount: 2,
          warnings: [],
          healthy: true
        });
      });

      it('should report warnings when load is high', async () => {
        mockContext.vars = {
          maxLoad1: 0.2,
          maxLoad5: 0.3,
          maxLoad15: 0.4
        };
        vi.mocked(os.loadavg).mockReturnValue([0.5, 0.7, 0.9]);

        const result = await tasks.checkLoad.handler(mockContext);

        expect(result.warnings).toHaveLength(3);
        expect(result.warnings[0]).toContain('1-minute load average too high');
        expect(result.warnings[1]).toContain('5-minute load average too high');
        expect(result.warnings[2]).toContain('15-minute load average too high');
        expect(result.healthy).toBe(false);
      });
    });

    describe('task metadata', () => {
      it('should have proper task structure', () => {
        Object.values(tasks).forEach(task => {
          expect(task).toHaveProperty('id');
          expect(task).toHaveProperty('name');
          expect(task).toHaveProperty('description');
          expect(task).toHaveProperty('handler');
          expect(task).toHaveProperty('options');
        });
      });

      it('should have descriptive names', () => {
        expect(tasks.sysInfo.description).toBe('Get system information');
        expect(tasks.checkRequirements.description).toBe('Check system requirements');
        expect(tasks.setEnvVar.description).toBe('Set environment variable');
        expect(tasks.getEnvVar.description).toBe('Get environment variable');
        expect(tasks.memoryUsage.description).toBe('Get current memory usage');
        expect(tasks.checkLoad.description).toBe('Check system load average');
      });

      it('should have proper variable definitions', () => {
        expect(tasks.checkRequirements.options.vars).toHaveProperty('minMemory');
        expect(tasks.checkRequirements.options.vars).toHaveProperty('minCpus');
        expect(tasks.checkRequirements.options.vars).toHaveProperty('requiredPlatforms');

        expect(tasks.setEnvVar.options.vars).toHaveProperty('name');
        expect(tasks.setEnvVar.options.vars).toHaveProperty('value');

        expect(tasks.getEnvVar.options.vars).toHaveProperty('name');
        expect(tasks.getEnvVar.options.vars).toHaveProperty('default');

        expect(tasks.checkLoad.options.vars).toHaveProperty('maxLoad1');
        expect(tasks.checkLoad.options.vars).toHaveProperty('maxLoad5');
        expect(tasks.checkLoad.options.vars).toHaveProperty('maxLoad15');
      });
    });
  });
});