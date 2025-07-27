import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SSHAdapter } from '../../../src/adapters/ssh-adapter.js';
import { SecurePasswordHandler } from '../../../src/utils/secure-password.js';

// Mock the ssh module
jest.mock('../../../src/utils/ssh.js', () => ({
  NodeSSH: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    execCommand: jest.fn(),
    dispose: jest.fn(),
    isConnected: jest.fn(),
    putFile: jest.fn(),
    getFile: jest.fn(),
    putDirectory: jest.fn()
  }))
}));

describe('SSHAdapter - Secure Password Integration', () => {
  let adapter: SSHAdapter;
  let mockSSH: any;
  let mockSecureHandler: jest.Mocked<SecurePasswordHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mocked SSH instance
    const { NodeSSH } = require('../../../src/utils/ssh.js');
    mockSSH = new NodeSSH();
    
    // Setup default mock implementations
    mockSSH.connect.mockResolvedValue(undefined);
    mockSSH.execCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      code: 0,
      signal: null
    });
    mockSSH.putFile.mockResolvedValue(undefined);
    mockSSH.isConnected.mockReturnValue(true);

    // Mock SecurePasswordHandler
    mockSecureHandler = {
      createAskPassScript: jest.fn<(password: string) => Promise<string>>().mockResolvedValue('/tmp/askpass-mock.sh'),
      cleanup: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      createSecureEnv: jest.fn<(path: string, env?: Record<string, string>) => Record<string, string>>().mockReturnValue({
        SUDO_ASKPASS: '/tmp/askpass-mock.sh',
        SUDO_LECTURE: 'no',
        SUDO_ASKPASS_REQUIRE: '1'
      })
    } as any;
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.dispose();
    }
  });

  describe('secure-askpass sudo method', () => {
    it('should use secure-askpass method when configured', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass',
          secureHandler: mockSecureHandler
        }
      });

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      // Should create askpass script
      expect(mockSecureHandler.createAskPassScript).toHaveBeenCalledWith('testpass123');

      // Should upload script to remote
      expect(mockSSH.putFile).toHaveBeenCalledWith(
        '/tmp/askpass-mock.sh',
        expect.stringMatching(/^\/tmp\/askpass-\d+-[a-z0-9]+\.sh$/)
      );

      // Should make script executable
      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^chmod 700 \/tmp\/askpass-\d+-[a-z0-9]+\.sh$/)
      );

      // Should execute command with SUDO_ASKPASS
      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^SUDO_ASKPASS=\/tmp\/askpass-\d+-[a-z0-9]+\.sh sudo -A ls -la$/),
        expect.any(Object)
      );
    });

    it('should create SecurePasswordHandler if not provided', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass'
        }
      });

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      // Should still upload and execute
      expect(mockSSH.putFile).toHaveBeenCalled();
      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        expect.stringMatching(/SUDO_ASKPASS=.*sudo -A/),
        expect.any(Object)
      );
    });

    it('should cleanup remote askpass script after execution', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass'
        }
      });

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      // Wait for cleanup timeout
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should have scheduled cleanup
      const cleanupCalls = mockSSH.execCommand.mock.calls.filter(
        (call: any[]) => call[0]?.includes('rm -f /tmp/askpass-')
      );
      expect(cleanupCalls.length).toBeGreaterThan(0);
    });

    it('should fallback to stdin method on secure-askpass failure', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass',
          secureHandler: mockSecureHandler
        }
      });

      // Make createAskPassScript fail
      mockSecureHandler.createAskPassScript.mockRejectedValueOnce(new Error('Permission denied'));

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      // Should fallback to stdin method
      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^sudo -S ls -la$/),
        expect.any(Object)
      );
    });

    it('should not wrap command if it already starts with sudo', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass'
        }
      });

      const command = {
        command: 'sudo ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      // Should not double-wrap with sudo
      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        'sudo ls -la',
        expect.any(Object)
      );
    });

    it('should handle special characters in password', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: "test'pass\"with$pecial!",
          method: 'secure-askpass',
          secureHandler: mockSecureHandler
        }
      });

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      // Should properly escape password
      expect(mockSecureHandler.createAskPassScript).toHaveBeenCalledWith("test'pass\"with$pecial!");
    });

    it('should cleanup secure handler on dispose', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass',
          secureHandler: mockSecureHandler
        }
      });

      // Execute to ensure handler is used
      await adapter.execute({
        command: 'ls',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      });

      await adapter.dispose();

      expect(mockSecureHandler.cleanup).toHaveBeenCalled();
    });
  });

  describe('other sudo methods with secure features', () => {
    it('should support stdin method', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'stdin'
        }
      });

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        'sudo -S ls -la',
        expect.objectContaining({
          stdin: expect.stringContaining('testpass123\n')
        })
      );
    });

    it('should support askpass method', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'askpass'
        }
      });

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        'SUDO_ASKPASS=/usr/bin/ssh-askpass sudo -A ls -la',
        expect.any(Object)
      );
    });

    it('should warn when using echo method', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'echo'
        }
      });

      const command = {
        command: 'ls -la',
        adapterOptions: {
          type: 'ssh' as const,
          host: 'localhost',
          username: 'testuser',
          password: 'sshpass'
        }
      };

      await adapter.execute(command);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Using echo for sudo password is insecure. Consider using stdin or askpass method.'
      );

      expect(mockSSH.execCommand).toHaveBeenCalledWith(
        expect.stringMatching(/^echo 'testpass123' \| sudo -S ls -la$/),
        expect.any(Object)
      );

      consoleWarnSpy.mockRestore();
    });
  });
});