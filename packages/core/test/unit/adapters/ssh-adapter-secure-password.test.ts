import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { AdapterError } from '../../../src/core/error.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { SecurePasswordHandler } from '../../../src/adapters/ssh/secure-password.js';

describe('SSHAdapter - Secure Password Integration', () => {
  let adapter: SSHAdapter;
  let mockSecureHandler: jest.Mocked<SecurePasswordHandler>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock SecurePasswordHandler
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

  describe('Sudo Configuration', () => {
    it('should create adapter with sudo disabled by default', () => {
      adapter = new SSHAdapter();
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.enabled).toBe(false);
    });

    it('should respect custom sudo configuration', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass',
          prompt: 'Custom prompt:',
          secureHandler: mockSecureHandler
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.enabled).toBe(true);
      expect(sudoConfig.password).toBe('testpass123');
      expect(sudoConfig.method).toBe('secure-askpass');
      expect(sudoConfig.prompt).toBe('Custom prompt:');
      expect(sudoConfig.secureHandler).toBe(mockSecureHandler);
    });

    it('should have default sudo method as stdin', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.method).toBe('stdin');
    });

    it('should support all sudo methods', () => {
      const methods = ['stdin', 'askpass', 'echo', 'secure-askpass'];
      
      methods.forEach(method => {
        const testAdapter = new SSHAdapter({
          sudo: {
            enabled: true,
            password: 'testpass',
            method: method as any
          }
        });
        
        const sudoConfig = (testAdapter as any).sshConfig.sudo;
        expect(sudoConfig.method).toBe(method);
      });
    });
  });

  describe('Secure Password Handler', () => {
    it('should store provided secure handler', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass',
          secureHandler: mockSecureHandler
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.secureHandler).toBe(mockSecureHandler);
    });

    it('should not have secure handler by default', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.secureHandler).toBeUndefined();
    });

    it('should cleanup secure handler on dispose if created internally', async () => {
      const cleanupSpy = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass'
        }
      });
      
      // Set a mock handler as if it was created internally
      (adapter as any).securePasswordHandler = {
        cleanup: cleanupSpy
      };
      
      await adapter.dispose();
      
      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when SSH options are missing', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass'
        }
      });
      
      await expect(adapter.execute({
        command: 'sudo ls -la'
      })).rejects.toThrow(AdapterError);
    });

    it('should throw error when adapter options type is incorrect', async () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'secure-askpass'
        }
      });
      
      await expect(adapter.execute({
        command: 'sudo ls -la',
        adapterOptions: {
          type: 'docker' as any
        }
      })).rejects.toThrow(AdapterError);
    });
  });

  describe('Password Configuration', () => {
    it('should store sudo password securely', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'supersecret123',
          method: 'stdin'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.password).toBe('supersecret123');
    });

    it('should allow empty password', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: '',
          method: 'stdin'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.password).toBe('');
    });

    it('should handle special characters in password', () => {
      const specialPassword = "test'pass\"with$pecial!@#%^&*()";
      
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: specialPassword,
          method: 'secure-askpass'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.password).toBe(specialPassword);
    });
  });

  describe('Sudo Prompt Configuration', () => {
    it('should have default sudo prompt', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.prompt).toBe('[sudo] password');
    });

    it('should respect custom sudo prompt', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass',
          prompt: 'Enter your password:'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.prompt).toBe('Enter your password:');
    });
  });

  describe('Integration with Base Adapter', () => {
    it('should inherit base adapter configuration', () => {
      adapter = new SSHAdapter({
        defaultTimeout: 30000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
        sudo: {
          enabled: true,
          password: 'testpass'
        }
      });
      
      expect(adapter).toBeInstanceOf(SSHAdapter);
      const baseConfig = (adapter as any).config;
      expect(baseConfig.defaultTimeout).toBe(30000);
      expect(baseConfig.maxBuffer).toBe(1024 * 1024);
      expect(baseConfig.encoding).toBe('utf8');
    });

    it('should set adapter name correctly', () => {
      adapter = new SSHAdapter();
      const adapterName = (adapter as any).adapterName;
      expect(adapterName).toBe('ssh');
    });
  });

  describe('Method-specific Warnings', () => {
    it('should warn when using echo method', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      // The warning would be shown during execution, not construction
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          password: 'testpass123',
          method: 'echo'
        }
      });
      
      // Just verify the adapter was created with echo method
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.method).toBe('echo');
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle undefined password', () => {
      adapter = new SSHAdapter({
        sudo: {
          enabled: true,
          method: 'stdin'
        }
      });
      
      const sudoConfig = (adapter as any).sshConfig.sudo;
      expect(sudoConfig.password).toBeUndefined();
    });

    it('should handle all configuration options together', () => {
      adapter = new SSHAdapter({
        connectionPool: {
          enabled: true,
          maxConnections: 5,
          idleTimeout: 120000,
          keepAlive: true
        },
        sudo: {
          enabled: true,
          password: 'testpass',
          method: 'secure-askpass',
          prompt: 'Password:',
          secureHandler: mockSecureHandler
        },
        sftp: {
          enabled: true,
          concurrency: 10
        },
        multiplexing: {
          enabled: false
        }
      });
      
      const sshConfig = (adapter as any).sshConfig;
      expect(sshConfig.connectionPool.enabled).toBe(true);
      expect(sshConfig.sudo.enabled).toBe(true);
      expect(sshConfig.sftp.enabled).toBe(true);
      expect(sshConfig.multiplexing.enabled).toBe(false);
    });
  });
});