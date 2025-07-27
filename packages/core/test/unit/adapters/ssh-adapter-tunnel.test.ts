import { jest } from '@jest/globals';

import { SSHAdapter } from '../../../src/adapters/ssh-adapter.js';

import type { NodeSSH } from '../../../src/utils/ssh.js';

describe('SSH Adapter Tunnel Tests', () => {
  let adapter: SSHAdapter;
  let mockSSH: jest.Mocked<NodeSSH>;

  beforeEach(() => {
    adapter = new SSHAdapter({
      connectionPool: { enabled: false }
    });

    // Mock SSH connection
    mockSSH = {
      isConnected: jest.fn().mockReturnValue(true),
      dispose: jest.fn(),
      createTunnel: jest.fn(),
      execCommand: jest.fn()
    } as any;

    // Mock the connection pool
    (adapter as any).connectionPool = new Map([
      ['test-host:22', {
        ssh: mockSSH,
        host: 'test-host',
        lastUsed: Date.now(),
        useCount: 1,
        created: Date.now(),
        errors: 0,
        reconnectAttempts: 0,
        config: { host: 'test-host', type: 'ssh' }
      }]
    ]);

    // Set last used SSH options
    (adapter as any).lastUsedSSHOptions = { host: 'test-host', type: 'ssh' };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tunnel()', () => {
    it('should create a tunnel with specific port', async () => {
      const tunnelInfo = {
        localPort: 8080,
        localHost: '127.0.0.1',
        remoteHost: 'remote.server',
        remotePort: 3306,
        close: jest.fn()
      };

      mockSSH.createTunnel.mockResolvedValue(tunnelInfo);

      const tunnel = await adapter.tunnel({
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      });

      expect(mockSSH.createTunnel).toHaveBeenCalledWith({
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      });

      expect(tunnel.localPort).toBe(8080);
      expect(tunnel.localHost).toBe('127.0.0.1');
      expect(tunnel.remoteHost).toBe('remote.server');
      expect(tunnel.remotePort).toBe(3306);
      expect(tunnel.isOpen).toBe(true);
    });

    it('should create a tunnel with dynamic port', async () => {
      const tunnelInfo = {
        localPort: 12345, // Dynamically allocated
        localHost: '127.0.0.1',
        remoteHost: 'database.internal',
        remotePort: 5432,
        close: jest.fn()
      };

      mockSSH.createTunnel.mockResolvedValue(tunnelInfo);

      const tunnel = await adapter.tunnel({
        localPort: 0, // Request dynamic port
        remoteHost: 'database.internal',
        remotePort: 5432
      });

      expect(mockSSH.createTunnel).toHaveBeenCalledWith({
        localPort: 0,
        remoteHost: 'database.internal',
        remotePort: 5432
      });

      expect(tunnel.localPort).toBe(12345);
      expect(tunnel.isOpen).toBe(true);
    });

    it('should track active tunnels', async () => {
      const tunnelInfo = {
        localPort: 8080,
        localHost: '127.0.0.1',
        remoteHost: 'remote.server',
        remotePort: 3306,
        close: jest.fn()
      };

      mockSSH.createTunnel.mockResolvedValue(tunnelInfo);

      const tunnel = await adapter.tunnel({
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      });

      expect((adapter as any).activeTunnels.size).toBe(1);
      expect((adapter as any).activeTunnels.has('8080-remote.server:3306')).toBe(true);
    });

    it('should remove tunnel from tracking on close', async () => {
      const tunnelInfo = {
        localPort: 8080,
        localHost: '127.0.0.1',
        remoteHost: 'remote.server',
        remotePort: 3306,
        close: jest.fn()
      };

      mockSSH.createTunnel.mockResolvedValue(tunnelInfo);

      const tunnel = await adapter.tunnel({
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      });

      expect((adapter as any).activeTunnels.size).toBe(1);

      await tunnel.close();

      expect(tunnelInfo.close).toHaveBeenCalled();
      expect((adapter as any).activeTunnels.size).toBe(0);
    });

    it('should throw error when no SSH connection is available', async () => {
      (adapter as any).lastUsedSSHOptions = null;

      await expect(adapter.tunnel({
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      })).rejects.toThrow('No SSH connection available');
    });

    it('should emit tunnel events', async () => {
      const emitSpy = jest.spyOn(adapter as any, 'emitAdapterEvent');
      
      const tunnelInfo = {
        localPort: 8080,
        localHost: '127.0.0.1',
        remoteHost: 'remote.server',
        remotePort: 3306,
        close: jest.fn()
      };

      mockSSH.createTunnel.mockResolvedValue(tunnelInfo);

      const tunnel = await adapter.tunnel({
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      });

      // Check tunnel created event
      expect(emitSpy).toHaveBeenCalledWith('ssh:tunnel-created', {
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      });

      emitSpy.mockClear();
      await tunnel.close();

      // Check tunnel closed event
      expect(emitSpy).toHaveBeenCalledWith('ssh:tunnel-closed', {
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      });
    });
  });

  describe('dispose()', () => {
    it('should close all active tunnels on dispose', async () => {
      const tunnel1Info = {
        localPort: 8080,
        localHost: '127.0.0.1',
        remoteHost: 'server1',
        remotePort: 3306,
        close: jest.fn()
      };

      const tunnel2Info = {
        localPort: 8081,
        localHost: '127.0.0.1',
        remoteHost: 'server2',
        remotePort: 5432,
        close: jest.fn()
      };

      mockSSH.createTunnel
        .mockResolvedValueOnce(tunnel1Info)
        .mockResolvedValueOnce(tunnel2Info);

      const tunnel1 = await adapter.tunnel({
        localPort: 8080,
        remoteHost: 'server1',
        remotePort: 3306
      });

      const tunnel2 = await adapter.tunnel({
        localPort: 8081,
        remoteHost: 'server2',
        remotePort: 5432
      });

      expect((adapter as any).activeTunnels.size).toBe(2);

      await adapter.dispose();

      expect(tunnel1Info.close).toHaveBeenCalled();
      expect(tunnel2Info.close).toHaveBeenCalled();
      expect((adapter as any).activeTunnels.size).toBe(0);
    });
  });
});