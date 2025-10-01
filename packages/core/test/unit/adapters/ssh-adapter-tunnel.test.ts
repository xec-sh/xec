import { describeSSH, getSSHConfig } from '@xec-sh/testing';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

import type { Command } from '../../../src/types/command.js';

// Test with real SSH connections using Docker containers
describeSSH('SSH Adapter Tunnel Tests', () => {
  let adapter: SSHAdapter;

  beforeEach(() => {
    adapter = new SSHAdapter({
      connectionPool: {
        enabled: true,
        maxConnections: 5,
        idleTimeout: 30000,
        keepAlive: true
      }
    });
  });

  afterEach(async () => {
    // Clean up adapter and all connections
    await adapter.dispose();
  });

  describe('tunnel() with real SSH connection', () => {
    it('should create a tunnel to SSH service', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // First establish SSH connection by executing a command
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      const result = await adapter.execute(connectCommand);
      expect(result.stdout).toContain('connected');

      // Create tunnel to SSH port on the remote host (port 22)
      const localPort = 18080 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts
      const tunnel = await adapter.tunnel({
        localPort,
        remoteHost: 'localhost', // localhost on the remote side
        remotePort: 22 // SSH port
      });

      expect(tunnel).toBeDefined();
      expect(tunnel.localPort).toBe(localPort);
      expect(tunnel.localHost).toBeDefined();
      expect(tunnel.remoteHost).toBe('localhost');
      expect(tunnel.remotePort).toBe(22);
      expect(tunnel.isOpen).toBe(true);

      // Test that we can connect through the tunnel to SSH
      const { NodeSSH } = await import('../../../src/adapters/ssh/ssh.js');
      const tunnelSSH = new NodeSSH();

      const connected = await tunnelSSH.connect({
        host: '127.0.0.1',
        port: tunnel.localPort,
        username: sshConfig.username,
        password: sshConfig.password,
        readyTimeout: 5000
      }).then(() => true).catch(() => false);

      expect(connected).toBe(true);

      if (connected) {
        // Execute a command through the tunneled SSH connection
        const tunnelResult = await tunnelSSH.execCommand('echo "tunneled"');
        expect(tunnelResult.stdout.trim()).toBe('tunneled');
        await tunnelSSH.dispose();
      }

      // Clean up
      await tunnel.close();
      expect(tunnel.isOpen).toBe(false);
    });

    it('should create a tunnel with dynamic port allocation', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // First establish SSH connection by executing a command
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Create tunnel with dynamic port (0 means let the system choose)
      const tunnel = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      expect(tunnel).toBeDefined();
      expect(tunnel.localPort).toBeGreaterThan(0); // Should have been assigned a port
      expect(tunnel.localPort).not.toBe(0);
      expect(tunnel.isOpen).toBe(true);

      // Test connectivity through the dynamically allocated port
      const { NodeSSH } = await import('../../../src/adapters/ssh/ssh.js');
      const tunnelSSH = new NodeSSH();

      const connected = await tunnelSSH.connect({
        host: '127.0.0.1',
        port: tunnel.localPort,
        username: sshConfig.username,
        password: sshConfig.password,
        readyTimeout: 5000
      }).then(() => true).catch(() => false);

      expect(connected).toBe(true);

      if (connected) {
        await tunnelSSH.dispose();
      }

      // Clean up
      await tunnel.close();
    });

    it('should create tunnel to a remote service (SSH echo test)', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // First establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Instead of netcat, we'll tunnel to the SSH port itself and verify we can connect
      // This is simpler and more reliable than trying to set up netcat
      const tunnel = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22  // SSH port on the remote
      });

      expect(tunnel.isOpen).toBe(true);
      expect(tunnel.localPort).toBeGreaterThan(0);

      // Verify we can connect through the tunnel to SSH
      const { NodeSSH } = await import('../../../src/adapters/ssh/ssh.js');
      const tunnelSSH = new NodeSSH();

      // Try to connect through the tunnel
      const connected = await tunnelSSH.connect({
        host: '127.0.0.1',
        port: tunnel.localPort,
        username: sshConfig.username,
        password: sshConfig.password,
        readyTimeout: 5000
      }).then(() => true).catch(() => false);

      expect(connected).toBe(true);

      if (connected) {
        // Execute a simple command through the tunneled connection to verify it works
        const result = await tunnelSSH.execCommand('echo "tunnel_test_success"');
        expect(result.stdout.trim()).toBe('tunnel_test_success');
        await tunnelSSH.dispose();
      }

      // Clean up
      await tunnel.close();
      expect(tunnel.isOpen).toBe(false);
    });

    it('should track active tunnels correctly', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Check no tunnels initially
      expect((adapter as any).activeTunnels.size).toBe(0);

      // Create first tunnel
      const tunnel1 = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      expect((adapter as any).activeTunnels.size).toBe(1);

      // Create second tunnel
      const tunnel2 = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      expect((adapter as any).activeTunnels.size).toBe(2);

      // Close first tunnel
      await tunnel1.close();
      expect((adapter as any).activeTunnels.size).toBe(1);

      // Close second tunnel
      await tunnel2.close();
      expect((adapter as any).activeTunnels.size).toBe(0);
    });

    it('should handle multiple close calls on same tunnel gracefully', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      const tunnel = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      expect(tunnel.isOpen).toBe(true);

      // First close
      await tunnel.close();

      // The tunnel object should update its state
      // Note: The current implementation may not update isOpen, let's check the actual behavior
      // We should check if multiple closes throw or not

      // Second close should not throw
      await expect(tunnel.close()).resolves.not.toThrow();
    });

    it('should throw error when no SSH connection is available', async () => {
      // Don't connect first
      await expect(adapter.tunnel({
        localPort: 8080,
        remoteHost: 'remote.server',
        remotePort: 3306
      })).rejects.toThrow('No SSH connection available');
    });

    it('should pass localHost option correctly', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Create tunnel binding to all interfaces
      const tunnel = await adapter.tunnel({
        localPort: 0,
        localHost: '0.0.0.0',
        remoteHost: 'localhost',
        remotePort: 22
      });

      expect(tunnel.localHost).toBe('0.0.0.0');

      await tunnel.close();
    });

    it('should handle tunnel creation failure gracefully', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Try to create tunnel to non-existent port (should fail)
      // Using port 1 which is typically reserved and inaccessible
      await expect(adapter.tunnel({
        localPort: 1, // Port 1 requires root privileges
        remoteHost: 'localhost',
        remotePort: 22
      })).rejects.toThrow();

      // Should not track failed tunnel
      expect((adapter as any).activeTunnels.size).toBe(0);
    });

    it('should emit tunnel events', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      const events: any[] = [];
      const eventHandler = (eventType: string, data: any) => {
        events.push({ type: eventType, data });
      };

      // Listen for events
      adapter.on('ssh:tunnel-created', (data) => eventHandler('ssh:tunnel-created', data));
      adapter.on('ssh:tunnel-closed', (data) => eventHandler('ssh:tunnel-closed', data));
      adapter.on('tunnel:created', (data) => eventHandler('tunnel:created', data));

      const tunnel = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      // Check tunnel created events
      const createdEvents = events.filter(e => e.type.includes('created'));
      expect(createdEvents.length).toBeGreaterThan(0);

      const sshCreatedEvent = events.find(e => e.type === 'ssh:tunnel-created');
      expect(sshCreatedEvent).toBeDefined();
      expect(sshCreatedEvent?.data).toMatchObject({
        localPort: tunnel.localPort,
        remoteHost: 'localhost',
        remotePort: 22
      });

      // Clear events
      events.length = 0;

      await tunnel.close();

      // Check tunnel closed events
      const closedEvents = events.filter(e => e.type.includes('closed'));
      expect(closedEvents.length).toBeGreaterThan(0);

      const sshClosedEvent = events.find(e => e.type === 'ssh:tunnel-closed');
      expect(sshClosedEvent).toBeDefined();
    });

    it('should create tunnel to remote service and verify file content', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Create a file on the remote host through SSH first
      const remoteFile = '/tmp/tunnel-test.txt';
      const testContent = `test-${Date.now()}`;

      const writeCommand: Command = {
        command: `echo "${testContent}" > ${remoteFile}`,
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };
      await adapter.execute(writeCommand);

      // Now create a tunnel to SSH port itself (port 22 on the container)
      const tunnel = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      expect(tunnel.isOpen).toBe(true);

      // Verify we can connect through the tunnel
      // We'll use another SSH connection through the tunnel to verify it works
      const { NodeSSH } = await import('../../../src/adapters/ssh/ssh.js');
      const ssh = new NodeSSH();

      const connected = await ssh.connect({
        host: '127.0.0.1',
        port: tunnel.localPort,
        username: sshConfig.username,
        password: sshConfig.password,
        readyTimeout: 5000
      }).then(() => true).catch(() => false);

      expect(connected).toBe(true);

      if (connected) {
        // Read the file we created earlier through the tunneled connection
        const result = await ssh.execCommand(`cat ${remoteFile}`);
        expect(result.stdout.trim()).toBe(testContent);
        await ssh.dispose();
      }

      // Clean up
      await tunnel.close();

      const cleanupCommand: Command = {
        command: `rm -f ${remoteFile}`,
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };
      await adapter.execute(cleanupCommand);
    });
  });

  describe('dispose() with tunnels', () => {
    it('should close all active tunnels on dispose', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Create multiple tunnels
      const tunnel1 = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      const tunnel2 = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      expect((adapter as any).activeTunnels.size).toBe(2);

      // Store initial state
      const tunnel1Port = tunnel1.localPort;
      const tunnel2Port = tunnel2.localPort;

      // Dispose should close all tunnels
      await adapter.dispose();

      expect((adapter as any).activeTunnels.size).toBe(0);

      // Verify tunnels are actually closed by trying to connect
      const net = await import('net');

      const canConnect = async (port: number): Promise<boolean> => new Promise((resolve) => {
        const client = new net.Socket();
        client.on('connect', () => {
          client.destroy();
          resolve(true);
        });
        client.on('error', () => {
          resolve(false);
        });
        client.connect(port, '127.0.0.1');
        setTimeout(() => {
          client.destroy();
          resolve(false);
        }, 100);
      });

      // Both tunnels should be closed
      expect(await canConnect(tunnel1Port)).toBe(false);
      expect(await canConnect(tunnel2Port)).toBe(false);
    });

    it('should handle errors gracefully when closing tunnels during dispose', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      const tunnel1 = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      const tunnel2 = await adapter.tunnel({
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 22
      });

      // Force an error on one tunnel's close method
      const originalClose = tunnel1.close;
      tunnel1.close = async () => {
        throw new Error('Simulated close error');
      };

      expect((adapter as any).activeTunnels.size).toBe(2);

      // Dispose should handle the error and still close other tunnels
      await expect(adapter.dispose()).resolves.not.toThrow();

      // Restore original close for cleanup
      tunnel1.close = originalClose;

      // Both tunnels should be removed from tracking even if one failed
      expect((adapter as any).activeTunnels.size).toBe(0);
    });
  });

  describe('concurrent tunnel operations', () => {
    it('should handle multiple concurrent tunnel creations', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Establish SSH connection
      const connectCommand: Command = {
        command: 'echo "connected"',
        adapterOptions: {
          type: 'ssh',
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password
        }
      };

      await adapter.execute(connectCommand);

      // Create multiple tunnels concurrently
      const tunnelPromises = Array.from({ length: 5 }, (_, i) =>
        adapter.tunnel({
          localPort: 0,
          remoteHost: 'localhost',
          remotePort: 22
        })
      );

      const tunnels = await Promise.all(tunnelPromises);

      // All tunnels should be created successfully
      expect(tunnels.length).toBe(5);
      tunnels.forEach(tunnel => {
        expect(tunnel.isOpen).toBe(true);
        expect(tunnel.localPort).toBeGreaterThan(0);
      });

      // All tunnels should be tracked
      expect((adapter as any).activeTunnels.size).toBe(5);

      // Clean up all tunnels
      await Promise.all(tunnels.map(t => t.close()));
      expect((adapter as any).activeTunnels.size).toBe(0);
    });

    it('should handle tunnel operations with connection pooling', async () => {
      const sshConfig = getSSHConfig('ubuntu-apt');

      // Create adapter with connection pooling
      const pooledAdapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 2,
          idleTimeout: 30000,
          keepAlive: true
        }
      });

      try {
        // Connect to SSH
        const connectCommand: Command = {
          command: 'echo "connected"',
          adapterOptions: {
            type: 'ssh',
            host: sshConfig.host,
            port: sshConfig.port,
            username: sshConfig.username,
            password: sshConfig.password
          }
        };

        await pooledAdapter.execute(connectCommand);

        // Create tunnel using pooled connection
        const tunnel = await pooledAdapter.tunnel({
          localPort: 0,
          remoteHost: 'localhost',
          remotePort: 22
        });

        expect(tunnel.isOpen).toBe(true);

        // Execute command (should reuse the same connection from pool)
        const echoCommand: Command = {
          command: 'echo "test through pooled connection"',
          adapterOptions: {
            type: 'ssh',
            host: sshConfig.host,
            port: sshConfig.port,
            username: sshConfig.username,
            password: sshConfig.password
          }
        };

        const result = await pooledAdapter.execute(echoCommand);
        expect(result.stdout).toContain('test through pooled connection');

        // Tunnel should still be active
        expect(tunnel.isOpen).toBe(true);

        await tunnel.close();
      } finally {
        await pooledAdapter.dispose();
      }
    });
  });
}, {
  containers: ['ubuntu-apt'], // Only use one container for tunnel tests
  timeout: 120000
});