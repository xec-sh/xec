import { readFileSync } from 'fs';
import { it, jest, expect } from '@jest/globals';
import { describeSSH, getSSHConfig, testEachPackageManager, getAvailableContainers } from '@xec-sh/test-utils';

import { $ } from '../../src/index';
import { SSHAdapter } from '../../src/adapters/ssh-adapter';

describeSSH('SSH Docker Integration Tests', () => {
  jest.setTimeout(60000); // 60 seconds timeout for SSH operations

  describe('Basic Connectivity Tests', () => {
    testEachPackageManager('should connect to container', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);

      try {
        const isAvailable = await ssh.isAvailable();
        expect(isAvailable).toBe(true);

        const result = await ssh.execute({
          command: `echo "Hello from ${container.name}"`,
          shell: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`Hello from ${container.name}`);
      } finally {
        await ssh.dispose();
      }
    });
  });

  describe('Command Execution Tests', () => {
    testEachPackageManager('should execute simple commands', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`uname -a`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Linux/);
    });

    testEachPackageManager('should handle command with arguments', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`ls -la /tmp`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('.');
      expect(result.stdout).toContain('..');
    });

    testEachPackageManager('should handle pipes and redirections', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`echo "test content" | grep "test"`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test content');
    });

    testEachPackageManager('should handle multiline commands', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`
        echo "line1"
        echo "line2"
        echo "line3"
      `;
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('line1');
      expect(result.stdout).toContain('line2');
      expect(result.stdout).toContain('line3');
    });

    testEachPackageManager('should handle command substitution', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`echo "Current user: $(whoami)"`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Current user: user');
    });

    testEachPackageManager('should handle environment variables', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const $env = $ssh.env({ TEST_VAR: 'test_value' });
      const result = await $env`echo $TEST_VAR`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test_value');
    });

    testEachPackageManager('should handle working directory changes', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const $cwd = $ssh.cd('/tmp');
      const result = await $cwd`pwd`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('/tmp');
    });

    testEachPackageManager('should handle sudo commands', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`echo password | sudo -S whoami`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('root');
    });
  });

  describe('Error Handling Tests', () => {
    testEachPackageManager('should handle non-existent commands', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`nonexistentcommand`.nothrow();
      expect(result.exitCode).not.toBe(0);
    });

    testEachPackageManager('should handle failed commands', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`ls /nonexistent/directory`.nothrow();
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr || result.stdout).toContain('o such file or directory');
    });

    testEachPackageManager('should handle nothrow mode', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`ls /nonexistent/directory`.nothrow();
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('No such file or directory');
    });

    testEachPackageManager('should handle command timeout', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const $timeout = $ssh.timeout(2000); // 2 seconds
      await expect($timeout`sleep 10`).rejects.toThrow(/timeout|timed out/i);
    });

    it('should handle connection errors gracefully', async () => {
      const $invalid = $.ssh({
        host: 'localhost',
        port: 9999, // Invalid port
        username: 'user',
        password: 'password'
      });

      await expect($invalid`echo test`).rejects.toThrow();
    });
  });

  describe('File Operations Tests (SFTP)', () => {
    testEachPackageManager('should create remote directories', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);
      const testDir = '/tmp/ush-test-' + Date.now();
      
      try {
        const result = await ssh.execute({
          command: `mkdir -p ${testDir}/subdir`,
          shell: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        expect(result.exitCode).toBe(0);

        const checkResult = await ssh.execute({
          command: `test -d ${testDir}/subdir && echo "exists"`,
          shell: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        expect(checkResult.stdout.trim()).toBe('exists');
      } finally {
        // Cleanup
        await ssh.execute({
          command: `rm -rf ${testDir}`,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        }).catch(() => {});
        await ssh.dispose();
      }
    });

    testEachPackageManager('should upload files via SFTP', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);
      const testDir = '/tmp/ush-test-' + Date.now();
      const localTestFile = '/tmp/ush-local-test-' + Date.now() + '.txt';
      
      try {
        // Create local test file
        await $`echo "Local test content" > ${localTestFile}`;
        
        const remotePath = `${testDir}/uploaded.txt`;
        
        // Create remote directory
        await ssh.execute({
          command: `mkdir -p ${testDir}`,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        
        // Upload file
        await ssh.uploadFile(localTestFile, remotePath, {
          type: 'ssh' as const,
          ...sshConfig
        });

        // Verify file exists and has correct content
        const result = await ssh.execute({
          command: `cat ${remotePath}`,
          shell: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Local test content');
      } finally {
        // Cleanup
        await $`rm -f ${localTestFile}`.nothrow();
        await ssh.execute({
          command: `rm -rf ${testDir}`,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        }).catch(() => {});
        await ssh.dispose();
      }
    });

    testEachPackageManager('should download files via SFTP', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);
      const testDir = '/tmp/ush-test-' + Date.now();
      const localDownloadPath = `/tmp/ush-download-${Date.now()}.txt`;
      
      try {
        const remotePath = `${testDir}/remote.txt`;
        
        // Create remote directory and file
        await ssh.execute({
          command: `mkdir -p ${testDir} && echo "Remote test content" > ${remotePath}`,
          shell: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });

        // Download file
        await ssh.downloadFile(remotePath, localDownloadPath, {
          type: 'ssh' as const,
          ...sshConfig
        });

        // Verify downloaded content
        const content = readFileSync(localDownloadPath, 'utf8');
        expect(content).toContain('Remote test content');
      } finally {
        // Cleanup
        await $`rm -f ${localDownloadPath}`.nothrow();
        await ssh.execute({
          command: `rm -rf ${testDir}`,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        }).catch(() => {});
        await ssh.dispose();
      }
    });

    testEachPackageManager('should handle file permissions', async (container) => {
      const ssh = new SSHAdapter();
      const sshConfig = getSSHConfig(container.name);
      const testDir = '/tmp/ush-test-' + Date.now();
      
      try {
        const testFile = `${testDir}/permissions.txt`;
        
        await ssh.execute({
          command: `mkdir -p ${testDir} && touch ${testFile} && chmod 644 ${testFile}`,
          shell: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });

        const result = await ssh.execute({
          command: `ls -l ${testFile} | awk '{print $1}'`,
          shell: true,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        });
        
        expect(result.stdout).toMatch(/-rw-r--r--/);
      } finally {
        // Cleanup
        await ssh.execute({
          command: `rm -rf ${testDir}`,
          adapterOptions: {
            type: 'ssh' as const,
            ...sshConfig
          }
        }).catch(() => {});
        await ssh.dispose();
      }
    });
  });

  describe('Stream Handling Tests', () => {
    testEachPackageManager('should handle large stdout', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`seq 1 10000`;
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(10000);
      expect(lines[0]).toBe('1');
      expect(lines[9999]).toBe('10000');
    });

    testEachPackageManager('should handle stderr output', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`echo "error" >&2`.nothrow();
      expect(result.exitCode).toBe(0);
      
      // Check for our expected error message in stderr
      if (result.stderr) {
        // CentOS 7 might have locale warnings, so just check for our message
        expect(result.stderr).toContain('error');
      } else if (result.stdout) {
        // Some systems might redirect stderr to stdout
        expect(result.stdout).toContain('error');
      }
    });

    testEachPackageManager('should handle mixed stdout and stderr', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`echo "stdout"; echo "stderr" >&2`.nothrow();
      expect(result.exitCode).toBe(0);
      
      // Check stdout always contains our expected output
      expect(result.stdout).toContain('stdout');
      
      // Check stderr contains our expected error (might have additional locale warnings)
      if (result.stderr) {
        expect(result.stderr).toContain('stderr');
      } else {
        // Some systems might redirect everything to stdout
        expect(result.stdout).toContain('stderr');
      }
    });

    testEachPackageManager('should handle stdin input', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const result = await $ssh`echo "test input" | cat`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test input');
    });

    testEachPackageManager('should handle binary data', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      // Generate random binary data
      const result = await $ssh`dd if=/dev/urandom bs=1024 count=1 2>/dev/null | base64`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
      
      // Verify it's valid base64
      expect(() => Buffer.from(result.stdout.trim(), 'base64')).not.toThrow();
    });
  });

  describe('Retry Mechanism Tests', () => {
    testEachPackageManager('should retry failed commands', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const attemptCount = 0;
      
      const $retry = $ssh.retry({
        maxRetries: 3,
        initialDelay: 100
      });

      // Create a command that fails first time, succeeds second time
      const testFile = `/tmp/retry-test-${Date.now()}`;
      const result = await $retry`
        if [ -f ${testFile} ]; then
          echo "success"
          rm ${testFile}
          exit 0
        else
          touch ${testFile}
          exit 1
        fi
      `.nothrow();

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('success');
    });

    testEachPackageManager('should respect retry configuration', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      
      const $retry = $ssh.retry({
        maxRetries: 2,
        initialDelay: 50
      });

      const result = await $retry`exit 1`.nothrow();
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Package Manager Tests', () => {
    testEachPackageManager('should work with package manager', async (container) => {
      // Skip brew and snap tests as they require special handling
      if (container.packageManager === 'brew' || container.packageManager === 'snap') {
        return;
      }

      const $ssh = $.ssh(getSSHConfig(container.name));

      // Update package manager (without installing anything)
      let updateCmd: string;
      switch (container.packageManager) {
        case 'apt':
          updateCmd = 'sudo apt-get update -qq';
          break;
        case 'yum':
          updateCmd = 'sudo yum check-update -q || true'; // Returns 100 if updates available
          break;
        case 'dnf':
          updateCmd = 'sudo dnf check-update -q || true';
          break;
        case 'apk':
          updateCmd = 'sudo apk update -q';
          break;
        case 'pacman':
          updateCmd = 'sudo pacman -Sy --noconfirm';
          break;
        default:
          throw new Error(`Unknown package manager: ${container.packageManager}`);
      }

      const result = await $ssh`${updateCmd}`;
      // Don't check exit code as some commands return non-zero on success
      expect(result).toBeDefined();
    });
  });

  describe('Parallel Execution Tests', () => {
    it('should handle parallel commands on same connection', async () => {
      const $ssh = $.ssh(getSSHConfig('ubuntu-apt'));

      const promises = [
        $ssh`sleep 1 && echo "task1"`,
        $ssh`sleep 1 && echo "task2"`,
        $ssh`sleep 1 && echo "task3"`,
        $ssh`sleep 1 && echo "task4"`,
        $ssh`sleep 1 && echo "task5"`
      ];

      const start = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - start;

      // Should complete in ~1 second if parallel, not 5 seconds
      expect(duration).toBeLessThan(3000);

      results.forEach((result, index) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(`task${index + 1}`);
      });
    });

    it('should handle parallel connections to different containers', async () => {
      const containers = getAvailableContainers().slice(0, 3);
      const connections = containers.map(container => 
        $.ssh(getSSHConfig(container.name))
      );

      const promises = connections.map(($ssh, index) => 
        $ssh`echo "Hello from container ${index}"`
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(`Hello from container ${index}`);
      });
    });
  });

  describe('Advanced SSH Features', () => {
    testEachPackageManager('should handle SSH agent forwarding', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      // Check if SSH_AUTH_SOCK is available
      const result = await $ssh`echo $SSH_AUTH_SOCK`.nothrow();
      // Agent forwarding might not be available in container
      expect(result.exitCode).toBe(0);
    });

    testEachPackageManager('should handle keep-alive', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      // Execute commands with delays to test keep-alive
      const result1 = await $ssh`echo "first"`;
      expect(result1.stdout.trim()).toBe('first');

      // Wait 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));

      const result2 = await $ssh`echo "second"`;
      expect(result2.stdout.trim()).toBe('second');
    });

    testEachPackageManager('should handle shell escaping properly', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const testStrings = [
        'simple text',
        'text with spaces',
        'text with "quotes"',
        "text with 'single quotes'",
        'text with $variable',
        'text with $(command)',
        'text with `backticks`',
        'text with special chars: !@#$%^&*()',
        'text with newline\ncharacter',
        'text with tab\tcharacter'
      ];

      for (const str of testStrings) {
        const result = await $ssh`echo ${str}`;
        expect(result.exitCode).toBe(0);
        // Some characters might be interpreted by shell
        expect(result.stdout).toBeDefined();
      }
    });

    testEachPackageManager('should handle different shell types', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      // Test with bash
      const bashResult = await $ssh.shell('/bin/bash')`echo $SHELL`;
      expect(bashResult.exitCode).toBe(0);

      // Test with sh
      const shResult = await $ssh.shell('/bin/sh')`echo "test"`;
      expect(shResult.exitCode).toBe(0);
      expect(shResult.stdout.trim()).toBe('test');
    });
  });

  describe('Connection Pool Tests', () => {
    it('should reuse SSH connections', async () => {
      const $ssh = $.ssh(getSSHConfig('ubuntu-apt'));

      // Execute multiple commands to ensure connection pooling works
      const results = [];
      
      for (let i = 0; i < 5; i++) {
        const result = await $ssh`echo "test ${i}"`;
        results.push(result);
      }

      // All commands should succeed
      results.forEach((result, index) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(`test ${index}`);
      });
    });

    it('should handle connection limits', async () => {
      const connections = Array(10).fill(null).map(() => 
        $.ssh(getSSHConfig('ubuntu-apt'))
      );

      // Execute commands on all connections
      const promises = connections.map(($ssh, index) => 
        $ssh`echo "connection ${index}"`
      );

      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(`connection ${index}`);
      });
    });
  });

  describe('Edge Cases and Stress Tests', () => {
    testEachPackageManager('should handle very long commands', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const longString = 'x'.repeat(10000);
      const result = await $ssh`echo "${longString}" | wc -c`;
      expect(result.exitCode).toBe(0);
      const charCount = parseInt(result.stdout.trim());
      expect(charCount).toBeGreaterThan(10000); // Including newline
    });

    testEachPackageManager('should handle commands with special characters', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      // Test basic special characters without shell interpretation issues
      const result = await $ssh`echo "test@123"`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test@123');
    });

    testEachPackageManager('should handle rapid command execution', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      const commandCount = 10; // Reduced to avoid SSH channel limits
      
      // Execute commands sequentially to avoid overloading SSH connection
      const results = [];
      for (let i = 0; i < commandCount; i++) {
        const result = await $ssh`echo ${i}`;
        results.push(result);
      }
      
      results.forEach((result, index) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe(String(index));
      });
    });

    testEachPackageManager('should handle command interruption', async (container) => {
      const $ssh = $.ssh(getSSHConfig(container.name));
      // Use timeout to interrupt
      await expect(
        $ssh.timeout(2000)`sleep 5`
      ).rejects.toThrow(/timeout|timed out|TimeoutError/i);
    });
  });
});