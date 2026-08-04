import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describeSSH, getSSHConfig } from '@xec-sh/testing';

import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

/**
 * Reverse tunnelling (`ssh -R`) was advertised by the CLI's `--reverse` flag
 * while the implementation threw 'not yet implemented', so the option existed
 * only as a promise. These tests exercise the real path: a local service, a
 * remote listener, and traffic actually crossing the tunnel.
 */
describeSSH('SSH reverse tunnel', () => {
  /** Start a throwaway HTTP server and return its port plus a stop function. */
  async function startLocalService(body: string): Promise<{ port: number; stop: () => void }> {
    const server = createServer((_request, response) => response.end(body));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

    return {
      port: (server.address() as AddressInfo).port,
      stop: () => server.close(),
    };
  }

  it('forwards traffic from the remote host to a local service', async () => {
    const service = await startLocalService('hello-through-the-tunnel');
    const sshConfig = getSSHConfig('ubuntu-apt');
    const adapter = new SSHAdapter();
    const options = { type: 'ssh' as const, ...sshConfig };

    try {
      // The adapter binds a tunnel to the last used connection.
      await adapter.execute({ command: 'true', adapterOptions: options, shell: true });

      // Port 0 asks the server to pick a free port, avoiding collisions
      // between concurrent test runs.
      const tunnel = await adapter.reverseTunnel({ remotePort: 0, localPort: service.port });

      try {
        expect(tunnel.remotePort).toBeGreaterThan(0);
        expect(tunnel.isOpen).toBe(true);

        const fetched = await adapter.execute({
          command:
            `curl -s --max-time 5 http://127.0.0.1:${tunnel.remotePort}/ || ` +
            `wget -qO- --timeout=5 http://127.0.0.1:${tunnel.remotePort}/`,
          adapterOptions: options,
          shell: true,
          nothrow: true,
        });

        expect(fetched.stdout).toContain('hello-through-the-tunnel');
      } finally {
        await tunnel.close();
      }
    } finally {
      service.stop();
      await adapter.dispose();
    }
  }, 60000);

  it('reports the tunnel closed and stops forwarding', async () => {
    const service = await startLocalService('should-become-unreachable');
    const sshConfig = getSSHConfig('ubuntu-apt');
    const adapter = new SSHAdapter();
    const options = { type: 'ssh' as const, ...sshConfig };

    try {
      await adapter.execute({ command: 'true', adapterOptions: options, shell: true });
      const tunnel = await adapter.reverseTunnel({ remotePort: 0, localPort: service.port });
      const port = tunnel.remotePort;

      await tunnel.close();
      expect(tunnel.isOpen).toBe(false);

      // Closing must actually unbind the remote listener, not merely flip a
      // flag — otherwise the port stays held for the life of the connection.
      const afterClose = await adapter.execute({
        command: `curl -s --max-time 3 http://127.0.0.1:${port}/ || echo unreachable`,
        adapterOptions: options,
        shell: true,
        nothrow: true,
      });

      expect(afterClose.stdout).not.toContain('should-become-unreachable');
    } finally {
      service.stop();
      await adapter.dispose();
    }
  }, 60000);

  it('closing twice is safe', async () => {
    const service = await startLocalService('x');
    const sshConfig = getSSHConfig('ubuntu-apt');
    const adapter = new SSHAdapter();
    const options = { type: 'ssh' as const, ...sshConfig };

    try {
      await adapter.execute({ command: 'true', adapterOptions: options, shell: true });
      const tunnel = await adapter.reverseTunnel({ remotePort: 0, localPort: service.port });

      await tunnel.close();
      await expect(tunnel.close()).resolves.toBeUndefined();
    } finally {
      service.stop();
      await adapter.dispose();
    }
  }, 60000);

  it('refuses to open a tunnel before any connection exists', async () => {
    const adapter = new SSHAdapter();

    await expect(adapter.reverseTunnel({ remotePort: 0, localPort: 1234 })).rejects.toThrow(
      /No SSH connection available/
    );

    await adapter.dispose();
  });
});
