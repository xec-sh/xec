import type { CallableExecutionEngine } from '@xec/ush';

import { it, vi, expect, describe, beforeEach } from 'vitest';

import { createFileSystem } from '../../../src/stdlib/fs.js';

import type { EnvironmentInfo } from '../../../src/modules/environment-types.js';

describe('stdlib/fs', () => {
  let mockExecutor: CallableExecutionEngine;
  let mockEnv: EnvironmentInfo;
  let fs: any;

  beforeEach(async () => {
    mockExecutor = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      // Reconstruct the command from template literal parts
      let cmd = strings[0];
      for (let i = 0; i < values.length; i++) {
        cmd += values[i] + strings[i + 1];
      }
      
      // Default mock responses
      if (cmd.includes('cat') && !cmd.includes('<<')) {
        return Promise.resolve({ stdout: 'file content', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('test -e')) {
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('ls -1')) {
        return Promise.resolve({ stdout: 'file1\nfile2\ndir1', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('stat')) {
        return Promise.resolve({ 
          stdout: '1024 33188 1000 1000 1234567890 1234567890 1234567890', 
          stderr: '', 
          exitCode: 0 
        });
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

    fs = await createFileSystem(mockExecutor as any, mockEnv);
  });

  describe('read', () => {
    it('should read file content', async () => {
      const content = await fs.read('/test/file.txt');
      expect(content).toBe('file content');
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array), '/test/file.txt');
    });

    it('should throw error on read failure', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Permission denied'));
      await expect(fs.read('/protected/file')).rejects.toThrow('Failed to read file');
    });
  });

  describe('write', () => {
    it('should write string content', async () => {
      await fs.write('/test/file.txt', 'Hello World');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        '/test/file.txt', 
        'Hello World'
      );
    });

    it('should write buffer content', async () => {
      const buffer = Buffer.from('Binary data');
      await fs.write('/test/file.bin', buffer);
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 
        '/test/file.bin', 
        'Binary data'
      );
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const exists = await fs.exists('/test/file.txt');
      expect(exists).toBe(true);
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array), '/test/file.txt');
    });

    it('should return false for non-existing file', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('File not found'));
      const exists = await fs.exists('/missing/file.txt');
      expect(exists).toBe(false);
    });
  });

  describe('mkdir', () => {
    it('should create directory', async () => {
      await fs.mkdir('/test/dir');
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array), '', '/test/dir');
    });

    it('should create directory recursively', async () => {
      await fs.mkdir('/test/nested/dir', { recursive: true });
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array), '-p', '/test/nested/dir');
    });
  });

  describe('ls', () => {
    it('should list directory contents', async () => {
      const files = await fs.ls('/test');
      expect(files).toEqual(['file1', 'file2', 'dir1']);
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array), '/test');
    });

    it('should handle empty directory', async () => {
      mockExecutor.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      const files = await fs.ls('/empty');
      expect(files).toEqual([]);
    });
  });

  describe('copy', () => {
    it('should copy files in local environment', async () => {
      await fs.copy('/source/file.txt', '/dest/file.txt');
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array), '/source/file.txt', '/dest/file.txt');
    });

    it('should handle Docker container copy', async () => {
      mockEnv.type = 'docker';
      mockEnv.connection = { container: 'mycontainer' };
      
      const dockerFs = await createFileSystem(mockExecutor as any, mockEnv);
      
      // Host to container
      await dockerFs.copy('host:/source/file.txt', '/dest/file.txt');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), '/source/file.txt', 'mycontainer', '/dest/file.txt'
      );
      
      // Container to host
      await dockerFs.copy('/source/file.txt', 'host:/dest/file.txt');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), 'mycontainer', '/source/file.txt', '/dest/file.txt'
      );
    });

    it('should handle Kubernetes pod copy', async () => {
      mockEnv.type = 'kubernetes';
      mockEnv.connection = { pod: 'mypod', namespace: 'default' };
      
      const k8sFs = await createFileSystem(mockExecutor as any, mockEnv);
      
      // Host to pod
      await k8sFs.copy('host:/source/file.txt', '/dest/file.txt');
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.any(Array), '/source/file.txt', 'default', 'mypod', '/dest/file.txt'
      );
    });
  });

  describe('stat', () => {
    it('should get file stats on Linux', async () => {
      mockExecutor.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
        let cmd = strings[0];
        for (let i = 0; i < values.length; i++) {
          cmd += values[i] + strings[i + 1];
        }
        
        if (cmd.includes('stat -c')) {
          return Promise.resolve({ 
            stdout: '1024 33188 1000 1000 1234567890 1234567890 1234567890', 
            stderr: '', 
            exitCode: 0 
          });
        }
        if (cmd.includes('test -f')) {
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });
      
      const stat = await fs.stat('/test/file.txt');
      
      expect(stat.size).toBe(1024);
      expect(stat.uid).toBe(1000);
      expect(stat.gid).toBe(1000);
      expect(stat.isFile()).toBe(true);
      expect(stat.isDirectory()).toBe(false);
    });

    it('should get file stats on macOS', async () => {
      mockEnv.platform.os = 'darwin';
      const macFs = await createFileSystem(mockExecutor as any, mockEnv);
      
      mockExecutor.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
        let cmd = strings[0];
        for (let i = 0; i < values.length; i++) {
          cmd += values[i] + strings[i + 1];
        }
        
        if (cmd.includes('stat -f')) {
          return Promise.resolve({ 
            stdout: '1024 33188 1000 1000 1234567890 1234567890 1234567890', 
            stderr: '', 
            exitCode: 0 
          });
        }
        if (cmd.includes('test -f')) {
          return Promise.reject(new Error('Not a file'));
        }
        if (cmd.includes('test -d')) {
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });
      
      const stat = await macFs.stat('/test/dir');
      
      expect(stat.isFile()).toBe(false);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('temp', () => {
    it('should create temporary file on Linux', async () => {
      mockExecutor.mockResolvedValueOnce({ 
        stdout: '/tmp/tmp.abc123', 
        stderr: '', 
        exitCode: 0 
      });
      
      const tempFile = await fs.temp();
      expect(tempFile).toBe('/tmp/tmp.abc123');
      expect(mockExecutor).toHaveBeenCalledWith(expect.any(Array), 'mktemp -t tmp.XXXXXX');
    });

    it('should create temporary file on macOS', async () => {
      mockEnv.platform.os = 'darwin';
      const macFs = await createFileSystem(mockExecutor as any, mockEnv);
      
      mockExecutor.mockResolvedValueOnce({ 
        stdout: '/var/folders/tmp.xyz789', 
        stderr: '', 
        exitCode: 0 
      });
      
      const tempFile = await macFs.temp({ prefix: 'test', suffix: '.tmp' });
      expect(tempFile).toBe('/var/folders/tmp.xyz789');
    });
  });

  describe('path utilities', () => {
    it('should join paths', () => {
      expect(fs.join('/path', 'to', 'file.txt')).toBe('/path/to/file.txt');
    });

    it('should resolve paths', () => {
      expect(fs.resolve('file.txt')).toMatch(/file\.txt$/);
    });

    it('should get dirname', () => {
      expect(fs.dirname('/path/to/file.txt')).toBe('/path/to');
    });

    it('should get basename', () => {
      expect(fs.basename('/path/to/file.txt')).toBe('file.txt');
    });

    it('should get extension', () => {
      expect(fs.extname('/path/to/file.txt')).toBe('.txt');
    });
  });
});