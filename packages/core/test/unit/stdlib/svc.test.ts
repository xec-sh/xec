import type { CallableExecutionEngine } from '@xec/ush';

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createService } from '../../../src/stdlib/service.js';

import type { EnvironmentInfo } from '../../../src/modules/environment-types.js';

describe('stdlib/svc', () => {
  let mockExecutor: CallableExecutionEngine;
  let mockEnv: EnvironmentInfo;
  let svc: any;

  beforeEach(async () => {
    mockExecutor = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      // Reconstruct the command from template literal parts
      let cmd = strings[0];
      for (let i = 0; i < values.length; i++) {
        cmd += values[i] + strings[i + 1];
      }
      
      // Default mock responses
      if (cmd.includes('systemctl') || cmd.includes('service')) {
        if (cmd.includes('status')) {
          if (cmd.includes('nginx')) {
            return Promise.resolve({ 
              stdout: 'Active: active (running)', 
              stderr: '', 
              exitCode: 0 
            });
          }
          if (cmd.includes('mysql')) {
            return Promise.resolve({ 
              stdout: 'Active: inactive (dead)', 
              stderr: '', 
              exitCode: 3 
            });
          }
        }
        if (cmd.includes('is-active')) {
          if (cmd.includes('nginx')) {
            return Promise.resolve({ stdout: 'active', stderr: '', exitCode: 0 });
          }
          return Promise.reject(new Error('inactive'));
        }
        if (cmd.includes('is-enabled')) {
          if (cmd.includes('nginx')) {
            return Promise.resolve({ stdout: 'enabled', stderr: '', exitCode: 0 });
          }
          return Promise.reject(new Error('disabled'));
        }
        if (cmd.includes('list-units')) {
          return Promise.resolve({ 
            stdout: `nginx.service    loaded active running
mysql.service    loaded inactive dead
redis.service    loaded active running`, 
            stderr: '', 
            exitCode: 0 
          });
        }
        // Other commands succeed silently
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('launchctl')) {
        if (cmd.includes('list')) {
          return Promise.resolve({ 
            stdout: 'com.nginx.nginx\ncom.mysql.mysql', 
            stderr: '', 
            exitCode: 0 
          });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('docker')) {
        if (cmd.includes('ps')) {
          if (cmd.includes('--format') && cmd.includes('Names') && cmd.includes('Status')) {
            return Promise.resolve({ 
              stdout: 'NAMES\tSTATUS\nweb\tUp 5 minutes\ndb\tUp 3 minutes', 
              stderr: '', 
              exitCode: 0 
            });
          }
          return Promise.resolve({ 
            stdout: 'CONTAINER ID   IMAGE   NAMES\nabc123   nginx   web\ndef456   mysql   db', 
            stderr: '', 
            exitCode: 0 
          });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
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

    svc = await createService(mockExecutor as any, mockEnv);
  });

  describe('start', () => {
    it('should start service on systemd', async () => {
      await svc.start('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'nginx'
      );
    });

    it('should start service on macOS', async () => {
      mockEnv.platform.os = 'darwin';
      mockEnv.capabilities.systemd = false;
      const macSvc = await createService(mockExecutor as any, mockEnv);
      
      await macSvc.start('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'nginx'
      );
    });

    it('should start container in Docker environment', async () => {
      mockEnv.type = 'docker';
      mockEnv.capabilities.systemd = false;
      const dockerSvc = await createService(mockExecutor as any, mockEnv);
      
      await dockerSvc.start('web');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'web'
      );
    });
  });

  describe('stop', () => {
    it('should stop service', async () => {
      await svc.stop('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'nginx'
      );
    });
  });

  describe('restart', () => {
    it('should restart service', async () => {
      await svc.restart('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'nginx'
      );
    });
  });

  describe('reload', () => {
    it('should reload service', async () => {
      await svc.reload('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'nginx'
      );
    });

    it('should fallback to restart if reload not supported', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Unknown operation'));
      await svc.reload('nginx');
      expect(mockExecutor).toHaveBeenCalledTimes(2);
    });
  });

  describe('status', () => {
    it('should get service status', async () => {
      const status = await svc.status('nginx');
      expect(status).toContain('active (running)');
    });

    it('should handle stopped service', async () => {
      const status = await svc.status('mysql');
      expect(status).toContain('inactive (dead)');
    });
  });

  describe('enable', () => {
    it('should enable service', async () => {
      await svc.enable('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'nginx'
      );
    });
  });

  describe('disable', () => {
    it('should disable service', async () => {
      await svc.disable('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        'nginx'
      );
    });
  });

  describe('isActive', () => {
    it('should check if service is active', async () => {
      const active = await svc.isActive('nginx');
      expect(active).toBe(true);
    });

    it('should return false for inactive service', async () => {
      const active = await svc.isActive('mysql');
      expect(active).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should check if service is enabled', async () => {
      const enabled = await svc.isEnabled('nginx');
      expect(enabled).toBe(true);
    });

    it('should return false for disabled service', async () => {
      const enabled = await svc.isEnabled('mysql');
      expect(enabled).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all services', async () => {
      const services = await svc.list();
      expect(services).toHaveLength(3);
      expect(services).toContain('nginx');
      expect(services).toContain('mysql');
      expect(services).toContain('redis');
    });

    it('should list active services', async () => {
      const services = await svc.list('active');
      expect(services).toHaveLength(2);
      expect(services).toContain('nginx');
      expect(services).toContain('redis');
    });

    it('should list containers in Docker environment', async () => {
      mockEnv.type = 'docker';
      mockEnv.capabilities.systemd = false;
      const dockerSvc = await createService(mockExecutor as any, mockEnv);
      
      const containers = await dockerSvc.list();
      expect(containers).toHaveLength(2);
      expect(containers).toContain('web');
      expect(containers).toContain('db');
    });
  });

  describe('logs', () => {
    it('should get service logs', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: 'nginx started\nServing requests on port 80', 
        stderr: '', 
        exitCode: 0 
      });
      
      const logs = await svc.logs('nginx');
      expect(logs).toContain('nginx started');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('journalctl -u '),
          expect.stringContaining(' -n ')
        ]),
        'nginx',
        100
      );
    });

    it('should get logs with custom lines', async () => {
      await svc.logs('nginx', { lines: 50 });
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('journalctl -u '),
          expect.stringContaining(' -n ')
        ]),
        'nginx',
        50
      );
    });

    it('should follow logs', async () => {
      await svc.logs('nginx', { follow: true });
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('journalctl -u '),
          expect.stringContaining(' -n '),
          expect.stringContaining(' -f')
        ]),
        'nginx',
        100
      );
    });
  });
});