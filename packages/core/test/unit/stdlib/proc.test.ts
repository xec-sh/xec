import type { CallableExecutionEngine } from '@xec-js/ush';

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { createProcess } from '../../../src/stdlib/process.js';

import type { EnvironmentInfo } from '../../../src/modules/environment-types.js';

describe('stdlib/proc', () => {
  let mockExecutor: CallableExecutionEngine;
  let mockEnv: EnvironmentInfo;
  let proc: any;

  beforeEach(async () => {
    mockExecutor = vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
      // Reconstruct the command from template literal parts
      let cmd = strings[0];
      for (let i = 0; i < values.length; i++) {
        cmd += values[i] + strings[i + 1];
      }

      // Default mock responses
      if (cmd.includes('ps')) {
        if (cmd.includes('-p 1234')) {
          return Promise.resolve({
            stdout: '1234 node /app/server.js',
            stderr: '',
            exitCode: 0
          });
        }
        if (cmd.includes('grep nginx')) {
          return Promise.resolve({
            stdout: 'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nnginx     5678  0.0  0.1  12345  1234 ?        Ss   10:00   0:00 nginx: master process\nnginx     5679  0.0  0.1  12345  1234 ?        S    10:00   0:00 nginx: worker process',
            stderr: '',
            exitCode: 0
          });
        }
      }
      if (cmd.includes('kill')) {
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('pidof')) {
        return Promise.resolve({ stdout: '1234 5678', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('pgrep -P 1234')) {
        return Promise.resolve({ stdout: '5678\n5679\n5680', stderr: '', exitCode: 0 });
      }
      if (cmd.includes('lsof -t -i:3000')) {
        return Promise.resolve({
          stdout: '1234',
          stderr: '',
          exitCode: 0
        });
      }
      if (cmd.includes('lsof')) {
        return Promise.resolve({
          stdout: 'node    1234 user    3u  IPv4  12345      0t0  TCP *:3000 (LISTEN)',
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

    proc = await createProcess(mockExecutor as any, mockEnv);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('exec', () => {
    it('should execute command', async () => {
      const result = await proc.exec('echo "hello world"');
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
      expect(result.exitCode).toBe(0);
    });

    it('should execute with options', async () => {
      const result = await proc.exec('ls -la', {
        cwd: '/tmp',
        env: { CUSTOM_VAR: 'value' }
      });
      expect(result.exitCode).toBe(0);
    });

    it('should throw on non-zero exit code by default', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Command failed',
        exitCode: 1
      });
      await expect(proc.exec('false')).rejects.toThrow('Command failed');
    });

    it('should not throw when ignoreError is true', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Command failed',
        exitCode: 1
      });
      const result = await proc.exec('false', { ignoreError: true });
      expect(result.exitCode).toBe(1);
    });
  });

  describe('spawn', () => {
    it('should spawn process in background', async () => {
      const pid = await proc.spawn('node server.js', {
        detached: true,
        logFile: '/tmp/server.log'
      });
      expect(typeof pid).toBe('number');
      expect(pid).toBeGreaterThan(0);
    });
  });

  describe('kill', () => {
    it('should kill process by PID', async () => {
      await proc.kill(1234);
      expect(mockExecutor).toHaveBeenCalledWith(['kill -', ' ', ''], 'TERM', 1234);
    });

    it('should kill with custom signal', async () => {
      await proc.kill(1234, 'KILL');
      expect(mockExecutor).toHaveBeenCalledWith(['kill -', ' ', ''], 'KILL', 1234);
    });

    it('should kill by name', async () => {
      await proc.kill('nginx');
      expect(mockExecutor).toHaveBeenCalledWith(['pkill -', ' ', ''], 'TERM', 'nginx');
    });
  });

  describe('list', () => {
    it('should list processes by name', async () => {
      const processes = await proc.list('nginx');
      expect(processes).toHaveLength(2);
      expect(processes[0].name).toContain('nginx: master process');
      expect(processes[1].name).toContain('nginx: worker process');
    });

    it('should return empty array when no processes found', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('No processes'));
      const processes = await proc.list('nonexistent');
      expect(processes).toEqual([]);
    });
  });

  describe('exists', () => {
    it('should check if process exists by PID', async () => {
      const exists = await proc.exists(1234);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent PID', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('No such process'));
      const exists = await proc.exists(99999);
      expect(exists).toBe(false);
    });

    it('should check if process exists by name', async () => {
      const exists = await proc.exists('nginx');
      expect(exists).toBe(true);
    });
  });

  describe('wait', () => {
    it('should wait for process to exit', async () => {
      let callCount = 0;
      mockExecutor.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
        return Promise.reject(new Error('Process not found'));
      });

      await proc.wait(1234, { checkInterval: 10 });
      expect(callCount).toBe(3);
    });

    it('should timeout when process does not exit', async () => {
      mockExecutor.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await expect(
        proc.wait(1234, { timeout: 100, checkInterval: 10 })
      ).rejects.toThrow('Timeout waiting for process');
    });
  });

  describe('signal', () => {
    it('should send signal to process', async () => {
      await proc.signal(1234, 'HUP');
      expect(mockExecutor).toHaveBeenCalledWith(['kill -', ' ', ''], 'HUP', 1234);
    });
  });

  describe('getPidByPort', () => {
    it('should get PID by port', async () => {
      const pid = await proc.getPidByPort(3000);
      expect(pid).toBe(1234);
    });

    it('should return null when port not in use', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('No process'));
      const pid = await proc.getPidByPort(9999);
      expect(pid).toBeNull();
    });
  });

  describe('tree', () => {
    it('should get process tree', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: '5678\n5679\n5680',
        stderr: '',
        exitCode: 0
      });

      const tree = await proc.tree(1234);
      expect(tree).toEqual([1234, 5678, 5679, 5680]);
    });
  });
});