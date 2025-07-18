import type { CallableExecutionEngine } from '@xec/ush';

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createOSInfo } from '../../../src/stdlib/os.js';

import type { EnvironmentInfo } from '../../../src/modules/environment-types.js';

describe('OS Extended Functions', () => {
  let mockExecutor: CallableExecutionEngine;
  let mockEnv: EnvironmentInfo;

  beforeEach(() => {
    mockExecutor = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      const command = strings.join('');
      return Promise.resolve({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
    }) as any;

    mockEnv = {
      type: 'local',
      capabilities: {
        shell: true,
        sudo: false,
        docker: false,
        systemd: true,
      },
      platform: {
        os: 'linux',
        arch: 'x64',
      },
    };
  });

  describe('uptime()', () => {
    it('should return uptime in seconds on Linux', async () => {
      mockEnv.platform.os = 'linux';
      mockExecutor = vi.fn().mockResolvedValue({
        stdout: '12345.67 98765.43\n',
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const uptime = await os.uptime();

      expect(uptime).toBe(12345);
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('/proc/uptime')])
      );
    });

    it('should return uptime on macOS', async () => {
      mockEnv.platform.os = 'darwin';
      const bootTime = new Date(Date.now() - 3600000); // 1 hour ago
      // Format date as macOS `uptime -s` output: "2024-12-23 10:30:00"
      const year = bootTime.getFullYear();
      const month = String(bootTime.getMonth() + 1).padStart(2, '0');
      const day = String(bootTime.getDate()).padStart(2, '0');
      const hours = String(bootTime.getHours()).padStart(2, '0');
      const minutes = String(bootTime.getMinutes()).padStart(2, '0');
      const seconds = String(bootTime.getSeconds()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      
      mockExecutor = vi.fn().mockResolvedValue({
        stdout: formattedDate + '\n',
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const uptime = await os.uptime();

      expect(uptime).toBeGreaterThan(3500); // Should be around 3600 seconds
      expect(uptime).toBeLessThan(3700);
    });

    it('should return uptime on Windows', async () => {
      mockEnv.platform.os = 'windows';
      const now = new Date();
      const bootTime = new Date(now.getTime() - 7200000); // 2 hours ago
      const wmiFormat = `${bootTime.getFullYear()}${String(bootTime.getMonth() + 1).padStart(2, '0')}${String(bootTime.getDate()).padStart(2, '0')}${String(bootTime.getHours()).padStart(2, '0')}${String(bootTime.getMinutes()).padStart(2, '0')}${String(bootTime.getSeconds()).padStart(2, '0')}.000000+000`;
      
      mockExecutor = vi.fn().mockResolvedValue({
        stdout: `LastBootUpTime\n${wmiFormat}\n`,
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const uptime = await os.uptime();

      expect(uptime).toBeGreaterThan(7100); // Should be around 7200 seconds
      expect(uptime).toBeLessThan(7300);
    });

    it('should return 0 on error', async () => {
      mockExecutor = vi.fn().mockRejectedValue(new Error('Command failed')) as any;
      const logger = { warn: vi.fn() } as any;

      const os = await createOSInfo(mockExecutor, mockEnv, logger);
      const uptime = await os.uptime();

      expect(uptime).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('Failed to get uptime', expect.any(Error));
    });
  });

  describe('loadavg()', () => {
    it('should return load averages on Linux', async () => {
      mockEnv.platform.os = 'linux';
      mockExecutor = vi.fn().mockResolvedValue({
        stdout: '1.23 4.56 7.89 2/456 12345\n',
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const loadavg = await os.loadavg();

      expect(loadavg).toEqual([1.23, 4.56, 7.89]);
    });

    it('should return load averages on macOS', async () => {
      mockEnv.platform.os = 'darwin';
      mockExecutor = vi.fn().mockResolvedValue({
        stdout: '1.50 2.75 3.25',
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const loadavg = await os.loadavg();

      expect(loadavg).toEqual([1.50, 2.75, 3.25]);
    });

    it('should return [0, 0, 0] on Windows', async () => {
      mockEnv.platform.os = 'windows';

      const os = await createOSInfo(mockExecutor, mockEnv);
      const loadavg = await os.loadavg();

      expect(loadavg).toEqual([0, 0, 0]);
    });

    it('should return [0, 0, 0] on error', async () => {
      mockExecutor = vi.fn().mockRejectedValue(new Error('Command failed')) as any;
      const logger = { warn: vi.fn() } as any;

      const os = await createOSInfo(mockExecutor, mockEnv, logger);
      const loadavg = await os.loadavg();

      expect(loadavg).toEqual([0, 0, 0]);
      expect(logger.warn).toHaveBeenCalledWith('Failed to get load average', expect.any(Error));
    });
  });

  describe('networkInterfaces()', () => {
    it('should parse Linux ip JSON output', async () => {
      mockEnv.platform.os = 'linux';
      const ipJsonOutput = JSON.stringify([
        {
          ifname: 'eth0',
          address: '00:11:22:33:44:55',
          addr_info: [
            { family: 'inet', local: '192.168.1.100' },
            { family: 'inet6', local: 'fe80::1' },
          ],
        },
        {
          ifname: 'lo',
          address: '00:00:00:00:00:00',
          addr_info: [
            { family: 'inet', local: '127.0.0.1' },
          ],
        },
      ]);

      mockExecutor = vi.fn().mockResolvedValue({
        stdout: ipJsonOutput,
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const interfaces = await os.networkInterfaces();

      expect(interfaces).toHaveLength(3);
      expect(interfaces[0]).toEqual({
        name: 'eth0',
        address: '192.168.1.100',
        family: 'IPv4',
        mac: '00:11:22:33:44:55',
        internal: false,
      });
      expect(interfaces[1]).toEqual({
        name: 'eth0',
        address: 'fe80::1',
        family: 'IPv6',
        mac: '00:11:22:33:44:55',
        internal: false,
      });
      expect(interfaces[2]).toEqual({
        name: 'lo',
        address: '127.0.0.1',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
      });
    });

    it('should parse Linux ifconfig output', async () => {
      mockEnv.platform.os = 'linux';
      const ifconfigOutput = `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255
        inet6 fe80::1  prefixlen 64  scopeid 0x20<link>
        ether 00:11:22:33:44:55  txqueuelen 1000  (Ethernet)

lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0
        inet6 ::1  prefixlen 128  scopeid 0x10<host>`;

      mockExecutor = vi.fn().mockResolvedValue({
        stdout: ifconfigOutput,
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const interfaces = await os.networkInterfaces();

      expect(interfaces).toHaveLength(4);
      expect(interfaces.some(i => i.name === 'eth0' && i.address === '192.168.1.100')).toBe(true);
      expect(interfaces.some(i => i.name === 'lo' && i.address === '127.0.0.1')).toBe(true);
    });

    it('should parse macOS ifconfig output', async () => {
      mockEnv.platform.os = 'darwin';
      const ifconfigOutput = `en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether aa:bb:cc:dd:ee:ff
	inet 192.168.1.200 netmask 0xffffff00 broadcast 192.168.1.255
	inet6 fe80::abcd%en0 prefixlen 64 scopeid 0x4

lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
	inet 127.0.0.1 netmask 0xff000000`;

      mockExecutor = vi.fn().mockResolvedValue({
        stdout: ifconfigOutput,
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const interfaces = await os.networkInterfaces();

      expect(interfaces).toHaveLength(3);
      expect(interfaces[0]).toEqual({
        name: 'en0',
        address: '192.168.1.200',
        family: 'IPv4',
        mac: 'aa:bb:cc:dd:ee:ff',
        internal: false,
      });
      expect(interfaces[2]).toEqual({
        name: 'lo0',
        address: '127.0.0.1',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
      });
    });

    it('should parse Windows ipconfig output', async () => {
      mockEnv.platform.os = 'windows';
      const ipconfigOutput = `
Ethernet adapter Ethernet:

   Physical Address. . . . . . . . . : 11-22-33-44-55-66
   IPv4 Address. . . . . . . . . . . : 192.168.1.50
   IPv6 Address. . . . . . . . . . . : 2001:db8::1

Ethernet adapter Loopback Pseudo-Interface 1:

   IPv4 Address. . . . . . . . . . . : 127.0.0.1`;

      mockExecutor = vi.fn().mockResolvedValue({
        stdout: ipconfigOutput,
        stderr: '',
        exitCode: 0,
      }) as any;

      const os = await createOSInfo(mockExecutor, mockEnv);
      const interfaces = await os.networkInterfaces();

      expect(interfaces).toHaveLength(3);
      expect(interfaces[0]).toEqual({
        name: 'Ethernet',
        address: '192.168.1.50',
        family: 'IPv4',
        mac: '11:22:33:44:55:66',
        internal: false,
      });
      expect(interfaces[2]).toEqual({
        name: 'Loopback Pseudo-Interface 1',
        address: '127.0.0.1',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
      });
    });

    it('should return empty array on error', async () => {
      mockExecutor = vi.fn().mockRejectedValue(new Error('Command failed')) as any;
      const logger = { warn: vi.fn() } as any;

      const os = await createOSInfo(mockExecutor, mockEnv, logger);
      const interfaces = await os.networkInterfaces();

      expect(interfaces).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith('Failed to get network interfaces', expect.any(Error));
    });
  });
});