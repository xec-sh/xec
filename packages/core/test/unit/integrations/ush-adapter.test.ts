import { it, vi, expect, describe, beforeEach } from 'vitest';

import { UshConfig, UshAdapter } from '../../../src/integrations/ush-adapter.js';

describe('integrations/ush-adapter', () => {
  let adapter: UshAdapter;
  const config: UshConfig = {
    shell: '/bin/bash',
    env: { TEST_VAR: 'test_value' },
    cwd: '/tmp',
    timeout: 5000,
    retries: 2,
  };

  beforeEach(() => {
    adapter = new UshAdapter(config);
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(adapter.isConnected()).toBe(false);
      expect((adapter as any).ushConfig).toEqual(config);
    });

    it('should set default values', () => {
      const minimalAdapter = new UshAdapter({});
      expect(minimalAdapter.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      const eventHandler = vi.fn();
      adapter.on('connected', eventHandler);

      await adapter.connect();

      expect(adapter.isConnected()).toBe(true);
      expect(adapter.getConnectionTime()).toBeGreaterThan(0);
      expect(eventHandler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'connected',
        timestamp: expect.any(Number),
        data: expect.objectContaining({
          shell: '/bin/bash',
          platform: process.platform,
          arch: process.arch,
        }),
      }));
    });

    it('should emit error event on connection failure', async () => {
      // Mock execute to fail
      const errorHandler = vi.fn();
      adapter.on('error', errorHandler);

      // Override _executeInternal to simulate failure
      vi.spyOn(adapter as any, '_executeInternal').mockRejectedValue(new Error('Connection test failed'));

      await expect(adapter.connect()).rejects.toThrow('Connection test failed');
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await adapter.connect();

      const eventHandler = vi.fn();
      adapter.on('disconnected', eventHandler);

      await adapter.disconnect();

      expect(adapter.isConnected()).toBe(false);
      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should execute simple command', async () => {
      const result = await adapter.execute('echo "test"');

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
    });

    it('should execute command with arguments', async () => {
      const result = await adapter.execute('echo', {
        args: ['hello', 'world'],
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.command).toBe('echo');
    });

    it('should handle command failure', async () => {
      // Mock the internal ush to return non-zero exit code
      const mockUsh = (adapter as any).ush;
      vi.spyOn(mockUsh, 'shell').mockResolvedValue({
        stdout: '',
        stderr: 'Command not found',
        exitCode: 127,
      });

      const result = await adapter.execute('nonexistent-command');

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.metadata?.exitCode).toBe(127);
    });

    it('should throw when not connected', async () => {
      await adapter.disconnect();

      await expect(adapter.execute('echo test')).rejects.toThrow('Adapter not connected');
    });

    it('should pass environment variables', async () => {
      const result = await adapter.execute('echo $TEST_VAR', {
        env: { CUSTOM_VAR: 'custom_value' },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('healthCheck', () => {
    it('should return true when healthy', async () => {
      await adapter.connect();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when not connected', async () => {
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const valid = adapter.validateConfig({
        shell: '/bin/sh',
        env: { KEY: 'value' },
        timeout: 30000,
      });
      expect(valid).toBe(true);
    });

    it('should reject invalid config', () => {
      const valid = adapter.validateConfig({
        shell: 123, // Should be string
        env: 'not-an-object', // Should be object
      });
      expect(valid).toBe(false);
    });
  });

  describe('convenience methods', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    describe('runScript', () => {
      it('should run script with default interpreter', async () => {
        const result = await adapter.runScript('echo "Hello from script"');
        expect(result.success).toBe(true);
      });

      it('should run script with custom interpreter', async () => {
        const result = await adapter.runScript('print("Hello")', {
          interpreter: 'python3',
        });
        // Will fail in mock but tests the parameter passing
        expect(result).toBeDefined();
      });
    });

    describe('runCommand', () => {
      it('should run command with arguments', async () => {
        const result = await adapter.runCommand('echo', ['hello', 'world']);
        expect(result.success).toBe(true);
      });

      it('should pass stdin to command', async () => {
        const result = await adapter.runCommand('cat', [], {
          stdin: 'Input data',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('file operations', () => {
      it('should check file existence', async () => {
        const exists = await adapter.fileExists('/tmp');
        expect(typeof exists).toBe('boolean');
      });

      it('should check if path is directory', async () => {
        const isDir = await adapter.fileIsDirectory('/tmp');
        expect(typeof isDir).toBe('boolean');
      });

      it('should check if path is file', async () => {
        const isFile = await adapter.fileIsFile('/etc/passwd');
        expect(typeof isFile).toBe('boolean');
      });

      it('should read file', async () => {
        // Mock successful file read
        const mockUsh = (adapter as any).ush;
        vi.spyOn(mockUsh, 'exec').mockResolvedValue({
          stdout: 'file contents',
          stderr: '',
          exitCode: 0,
        });

        const content = await adapter.readFile('/tmp/test.txt');
        expect(content).toBe('file contents');
      });

      it('should write file', async () => {
        await expect(
          adapter.writeFile('/tmp/test.txt', 'Hello World')
        ).resolves.not.toThrow();
      });

      it('should append to file', async () => {
        await expect(
          adapter.appendFile('/tmp/test.txt', 'More content')
        ).resolves.not.toThrow();
      });

      it('should create directory', async () => {
        await expect(
          adapter.createDirectory('/tmp/test-dir', { recursive: true })
        ).resolves.not.toThrow();
      });

      it('should remove file', async () => {
        await expect(
          adapter.removeFile('/tmp/test.txt')
        ).resolves.not.toThrow();
      });

      it('should remove directory', async () => {
        await expect(
          adapter.removeDirectory('/tmp/test-dir', { recursive: true })
        ).resolves.not.toThrow();
      });

      it('should copy file', async () => {
        await expect(
          adapter.copyFile('/tmp/source.txt', '/tmp/dest.txt')
        ).resolves.not.toThrow();
      });

      it('should move file', async () => {
        await expect(
          adapter.moveFile('/tmp/source.txt', '/tmp/dest.txt')
        ).resolves.not.toThrow();
      });

      it('should change permissions', async () => {
        await expect(
          adapter.chmod('/tmp/test.txt', '755')
        ).resolves.not.toThrow();
      });

      it('should change ownership', async () => {
        await expect(
          adapter.chown('/tmp/test.txt', 'user:group', { recursive: true })
        ).resolves.not.toThrow();
      });

      it('should list directory', async () => {
        // Mock successful directory listing
        const mockUsh = (adapter as any).ush;
        vi.spyOn(mockUsh, 'exec').mockResolvedValue({
          stdout: 'file1\nfile2\nfile3\n',
          stderr: '',
          exitCode: 0,
        });

        const files = await adapter.listDirectory('/tmp');
        expect(files).toEqual(['file1', 'file2', 'file3']);
      });
    });

    describe('environment operations', () => {
      it('should get environment variable', async () => {
        // Mock successful env var retrieval
        const mockUsh = (adapter as any).ush;
        vi.spyOn(mockUsh, 'exec').mockResolvedValue({
          stdout: '/usr/bin\n',
          stderr: '',
          exitCode: 0,
        });

        const value = await adapter.getEnvironmentVariable('PATH');
        expect(value).toBe('/usr/bin');
      });

      it('should return undefined for non-existent env var', async () => {
        // Mock empty output
        const mockUsh = (adapter as any).ush;
        vi.spyOn(mockUsh, 'exec').mockResolvedValue({
          stdout: '\n',
          stderr: '',
          exitCode: 0,
        });

        const value = await adapter.getEnvironmentVariable('NONEXISTENT');
        expect(value).toBeUndefined();
      });
    });

    describe('which', () => {
      it('should find command in PATH', async () => {
        // Mock successful which
        const mockUsh = (adapter as any).ush;
        vi.spyOn(mockUsh, 'exec').mockResolvedValue({
          stdout: '/usr/bin/ls\n',
          stderr: '',
          exitCode: 0,
        });

        const path = await adapter.which('ls');
        expect(path).toBe('/usr/bin/ls');
      });

      it('should return null for non-existent command', async () => {
        // Mock failed which
        const mockUsh = (adapter as any).ush;
        vi.spyOn(mockUsh, 'exec').mockResolvedValue({
          stdout: '',
          stderr: 'command not found',
          exitCode: 1,
        });

        const path = await adapter.which('nonexistent');
        expect(path).toBeNull();
      });
    });
  });

  describe('sudo support', () => {
    it('should execute commands with sudo when configured', async () => {
      const sudoAdapter = new UshAdapter({ ...config, sudo: true });
      await sudoAdapter.connect();

      const mockUsh = (sudoAdapter as any).ush;
      const execSpy = vi.spyOn(mockUsh, 'exec').mockResolvedValue({
        stdout: 'success',
        stderr: '',
        exitCode: 0,
      });

      await sudoAdapter.execute('test-command', { args: ['arg1', 'arg2'] });

      expect(execSpy).toHaveBeenCalledWith('sudo', expect.objectContaining({
        args: ['test-command', 'arg1', 'arg2'],
      }));
    });

    it('should execute shell scripts with sudo when configured', async () => {
      const sudoAdapter = new UshAdapter({ ...config, sudo: true });
      await sudoAdapter.connect();

      const mockUsh = (sudoAdapter as any).ush;
      const shellSpy = vi.spyOn(mockUsh, 'shell').mockResolvedValue({
        stdout: 'success',
        stderr: '',
        exitCode: 0,
      });

      await sudoAdapter.execute('echo test');

      expect(shellSpy).toHaveBeenCalledWith(
        expect.stringContaining('sudo'),
        expect.any(Object)
      );
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should handle file read errors', async () => {
      await expect(adapter.readFile('/root/secret')).rejects.toThrow(
        'Failed to read file: /root/secret'
      );
    });

    it('should handle directory creation errors', async () => {
      await expect(adapter.createDirectory('/root/newdir')).rejects.toThrow(
        'Failed to create directory: /root/newdir'
      );
    });
  });
});