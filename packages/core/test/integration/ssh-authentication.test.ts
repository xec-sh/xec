import type { SSHAgent } from '../../src/adapters/ssh/contracts.js';

import { join } from 'path';
import { tmpdir } from 'os';
import { sign } from 'node:crypto';
import { promises as fs } from 'fs';
import { describeSSH, getSSHConfig, testEachPackageManager } from '@xec-sh/testing';

import { $ } from '../../src/index.js';
import { NodeSSH } from '../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../src/adapters/ssh/index.js';

/** Isolated fixture credentials; restore the container's previous keys even on failure. */
async function withAuthorizedKey(
  name: string,
  action: (key: { privateKey: string; privateKeyPath: string; publicKey: string; passphrase: string }) => Promise<void>,
  passphrase = '',
) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'xec-ssh-auth-'));
  const privateKeyPath = join(directory, 'id_rsa');
  const admin = new NodeSSH();
  try {
    await $`ssh-keygen -t rsa -b 2048 -m PEM -f ${privateKeyPath} -N ${passphrase} -q`.timeout('10s');
    const privateKey = await fs.readFile(privateKeyPath, 'utf8');
    const publicKey = (await fs.readFile(`${privateKeyPath}.pub`, 'utf8')).trim();
    await admin.connect(getSSHConfig(name));
    const setup = await admin.execCommand('mkdir -p .ssh && chmod 700 .ssh');
    expect(setup.code).toBe(0);
    await admin.withSFTP(async sftp => {
      const path = '.ssh/authorized_keys';
      const original = await new Promise<Buffer | undefined>((resolve, reject) => sftp.readFile(path, (error, bytes) => {
        if ((error as { code?: number } | undefined)?.code === 2) resolve(undefined);
        else if (error) reject(error); else resolve(bytes);
      }));
      const write = (bytes: Buffer) => new Promise<void>((resolve, reject) => sftp.writeFile(path, bytes, { mode: 0o600 }, error => error ? reject(error) : resolve()));
      try {
        await write(Buffer.concat([original ?? Buffer.alloc(0), Buffer.from(`\n${publicKey}\n`)]));
        await action({ privateKey, privateKeyPath, publicKey, passphrase });
      } finally {
        if (original !== undefined) await write(original);
        else await new Promise<void>((resolve, reject) => sftp.unlink(path, error => error ? reject(error) : resolve()));
      }
    });
  } finally { admin.dispose(true); await fs.rm(directory, { recursive: true, force: true }); }
}

describeSSH('SSH Authentication Tests', () => {

  describe('Password Authentication', () => {
    testEachPackageManager('should authenticate with correct password', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      try {
        const result = await ssh.execute({
          command: 'whoami',
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(sshConfig.username);
      } finally {
        await ssh.dispose();
      }
    });

    testEachPackageManager('should fail with incorrect password', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      await expect(ssh.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'ssh',
          ...sshConfig,
          password: 'wrongpassword'
        }
      })).rejects.toThrow(/authentication|password|failed|Connection/i);

      await ssh.dispose();
    });

    testEachPackageManager('should fail with non-existent user', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      await expect(ssh.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'ssh',
          ...sshConfig,
          username: 'nonexistentuser'
        }
      })).rejects.toThrow(/authentication|failed|Connection/i);

      await ssh.dispose();
    });
  });

  describe('Private Key Authentication', () => {
    for (const form of ['path', 'buffer', 'encrypted'] as const) {
      testEachPackageManager(`authenticates with ${form} key without password fallback`, async container => {
        await withAuthorizedKey(container.name, async key => {
          const sshConfig = getSSHConfig(container.name);
          const ssh = new SSHAdapter();
          try {
            const result = await ssh.execute({ command: 'whoami', adapterOptions: {
              type: 'ssh', ...sshConfig, password: undefined,
              ...(form === 'path' ? { privateKeyPath: key.privateKeyPath } : { privateKey: Buffer.from(key.privateKey) }),
              ...(form === 'encrypted' ? { passphrase: key.passphrase } : {}),
            } });
            expect(result.exitCode).toBe(0); expect(result.stdout.trim()).toBe(sshConfig.username);
          } finally { await ssh.dispose(); }
        }, form === 'encrypted' ? 'fixture-passphrase' : '');
      });
    }

    testEachPackageManager('rejects an invalid private key', async container => {
      const ssh = new SSHAdapter();
      try {
        await expect(ssh.execute({ command: 'whoami', adapterOptions: {
          type: 'ssh', ...getSSHConfig(container.name), password: undefined, privateKey: Buffer.from('invalid-key-content'),
        } })).rejects.toThrow();
      } finally { await ssh.dispose(); }
    });
  });

  describe('Connection Options', () => {
    it('should respect connection timeout', async () => {
      const ssh = new SSHAdapter({
        defaultConnectOptions: {
          readyTimeout: 2000, // SSH2 library timeout option
          timeout: 2000
        }
      });

      const start = Date.now();
      await expect(ssh.execute({
        command: 'whoami',
        timeout: 2000, // Command execution timeout
        adapterOptions: {
          type: 'ssh',
          host: '192.0.2.1', // Non-routable IP
          port: 22,
          username: 'test',
          password: 'test'
        }
      })).rejects.toThrow(/timeout|timed out|Connection|ETIMEDOUT|ECONNREFUSED/i);

      const duration = Date.now() - start;
      // Connection should timeout within reasonable time
      // Allow up to 25 seconds due to OS-level TCP timeout
      expect(duration).toBeLessThan(25000);

      await ssh.dispose();
    });

    testEachPackageManager('should handle connection with valid credentials', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      try {
        // Should work with valid connection
        const result = await ssh.execute({
          command: 'echo ready',
          timeout: 5000,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('ready');
      } finally {
        await ssh.dispose();
      }
    });

    it('should handle custom SSH port', async () => {
      // Test with alpine container on different port
      const ssh = new SSHAdapter();
      const alpineConfig = getSSHConfig('alpine-apk');

      try {
        const result = await ssh.execute({
          command: 'cat /etc/os-release | grep ^ID=',
          adapterOptions: {
            type: 'ssh' as const,
            ...alpineConfig
          }
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('alpine');
      } finally {
        await ssh.dispose();
      }
    });
  });

  describe('Authentication Methods', () => {
    testEachPackageManager('authenticates with a valid key despite an invalid password', async container => {
      await withAuthorizedKey(container.name, async key => {
        const ssh = new SSHAdapter();
        try {
          const result = await ssh.execute({ command: 'whoami', adapterOptions: {
            type: 'ssh', ...getSSHConfig(container.name), privateKey: key.privateKey, password: 'incorrect-fixture-password',
          } });
          expect(result.stdout.trim()).toBe('user');
        } finally { await ssh.dispose(); }
      });
    });

    testEachPackageManager('authenticates through a plain Xec agent with no password or local agent', async container => {
      await withAuthorizedKey(container.name, async key => {
        let signatures = 0;
        const agent: SSHAgent = {
          getIdentities: done => done(null, [key.publicKey]),
          sign: (_key, data, options, done) => {
            try { signatures++; done(null, sign(options.hash ?? 'sha1', data, key.privateKey)); }
            catch (error) { done(error as Error); }
          },
        };
        const ssh = new SSHAdapter();
        try {
          const result = await ssh.execute({ command: 'whoami', adapterOptions: {
            type: 'ssh', ...getSSHConfig(container.name), password: undefined, agent,
          } });
          expect(result.stdout.trim()).toBe('user'); expect(signatures).toBeGreaterThan(0);
        } finally { await ssh.dispose(); }
      });
    });
  });

  describe('Host Key Verification', () => {
    testEachPackageManager('should connect with basic authentication', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      try {
        const result = await ssh.execute({
          command: 'echo "authenticated"',
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('authenticated');
      } finally {
        await ssh.dispose();
      }
    });

    testEachPackageManager('verifies the configured known_hosts file and rejects a different trusted key', async container => {
      const directory = await fs.mkdtemp(join(tmpdir(), 'xec-ssh-trust-'));
      const knownHostsPath = join(directory, 'known_hosts');
      const sshConfig = getSSHConfig(container.name);
      const ssh = new SSHAdapter();
      try {
        const scan = await $`ssh-keyscan -p ${sshConfig.port} ${sshConfig.host}`.timeout('10s');
        await fs.writeFile(knownHostsPath, scan.stdout);
        const target = { type: 'ssh' as const, ...sshConfig, hostKeyChecking: 'strict' as const, knownHostsPath };
        const result = await ssh.execute({ command: 'echo verified', adapterOptions: target });
        expect(result.exitCode).toBe(0);
        await ssh.dispose();
        // A valid but different key must fail, including when passwords are correct.
        const path = join(directory, 'untrusted');
        await $`ssh-keygen -t rsa -b 2048 -f ${path} -N "" -q`.timeout('10s');
        await fs.writeFile(knownHostsPath, `[${sshConfig.host}]:${sshConfig.port} ${await fs.readFile(path + '.pub', 'utf8')}`);
        const changed = new SSHAdapter();
        try { await expect(changed.execute({ command: 'true', adapterOptions: target })).rejects.toThrow(/host key|REMOTE HOST|not in|mismatch/i); }
        finally { await changed.dispose(); }
      } finally { await ssh.dispose(); await fs.rm(directory, { recursive: true, force: true }); }
    });
  });

  describe('Sudo Authentication', () => {
    testEachPackageManager('should execute sudo commands with password', async (container) => {
      const sshConfig = getSSHConfig(container.name);
      const ssh = new SSHAdapter({
        sudo: {
          enabled: true,
          password: sshConfig.password,
          method: 'echo' // Less secure but works for testing
        }
      });

      try {
        // Test sudo command execution with password
        // The adapter should automatically wrap the command with sudo
        const result = await ssh.execute({
          command: 'whoami', // Don't include sudo - adapter will add it
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('root');
      } finally {
        await ssh.dispose();
      }
    });

    testEachPackageManager('should handle sudo with NOPASSWD', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      try {
        // Check if user has NOPASSWD sudo (unlikely in test containers)
        const result = await ssh.execute({
          command: 'sudo -n true 2>&1',
          nothrow: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });

        if (result.exitCode === 0) {
          // User has NOPASSWD
          const whoamiResult = await ssh.execute({
            command: 'sudo whoami',
            adapterOptions: {
              type: 'ssh' as const,
              ...sshConfig
            }
          });
          expect(whoamiResult.stdout.trim()).toBe('root');
        } else {
          // User needs password - verify sudo -n failed as expected
          expect(result.exitCode).not.toBe(0);
          // The output should contain some indication of password requirement
          const output = result.stdout + result.stderr;
          expect(output.toLowerCase()).toMatch(/password|sudo|authentication/);
        }
      } finally {
        await ssh.dispose();
      }
    });
  });

  describe('Multiple Authentication Attempts', () => {
    testEachPackageManager('should handle multiple failed attempts gracefully', async (container) => {
      const sshConfig = getSSHConfig(container.name);
      let attemptCount = 0;
      const passwords = ['wrong1', 'wrong2', sshConfig.password];

      for (const password of passwords) {
        const ssh = new SSHAdapter();

        try {
          attemptCount++;
          const result = await ssh.execute({
            command: 'whoami',
            adapterOptions: {
              type: 'ssh' as const,
              ...sshConfig,
              password
            }
          });

          // Should only succeed with correct password
          expect(password).toBe(sshConfig.password);
          expect(result.exitCode).toBe(0);
          await ssh.dispose();
          break;
        } catch (error) {
          // Expected for wrong passwords
          if (password !== sshConfig.password) {
            expect(error instanceof Error ? error.message : String(error)).toMatch(/authentication|password|failed|Connection/i);
          } else {
            throw error;
          }
        } finally {
          await ssh.dispose();
        }
      }

      expect(attemptCount).toBe(3);
    });
  });

  describe('$ Helper Authentication', () => {
    testEachPackageManager('should work with $ helper for SSH', async (container) => {
      const sshConfig = getSSHConfig(container.name);

      const $ssh = $.ssh(sshConfig);

      const result = await $ssh`whoami`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(sshConfig.username);
    });

    testEachPackageManager('should chain SSH with other helpers', async (container) => {
      const sshConfig = getSSHConfig(container.name);

      const $ssh = $.ssh(sshConfig).cd('/tmp').env({ TEST_VAR: 'value' });

      const result = await $ssh`pwd && echo $TEST_VAR`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('/tmp');
      expect(result.stdout).toContain('value');
    });
  });

  describe('Session Persistence', () => {
    testEachPackageManager('isolates shell environment between commands on the same connection', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      try {
        // Set an environment variable
        await ssh.execute({
          command: 'export TEST_SESSION_VAR="persistent value"',
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });

        // A new exec channel starts a new shell on the reused connection
        const result = await ssh.execute({
          command: 'echo $TEST_SESSION_VAR',
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });

        // Note: Each command runs in a new shell, so env vars don't persist
        // This is expected behavior
        expect(result.stdout.trim()).toBe('');
      } finally {
        await ssh.dispose();
      }
    });

    testEachPackageManager('should handle connection reuse', async (container) => {
      const ssh = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 10,
          idleTimeout: 300000,
          keepAlive: true
        }
      });
      const sshConfig = getSSHConfig(container.name);

      try {
        // Multiple commands on same connection
        for (let i = 0; i < 5; i++) {
          const result = await ssh.execute({
            command: `echo "Command ${i}"`,
            adapterOptions: {
              type: 'ssh' as const,
              ...sshConfig
            }
          });
          expect(result.exitCode).toBe(0);
          expect(result.stdout.trim()).toBe(`Command ${i}`);
        }
      } finally {
        await ssh.dispose();
      }
    });
  });
});