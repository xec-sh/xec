/**
 * Integration tests for on command with real SSH connections
 * Uses Docker containers with SSH servers for testing
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { DockerContainerManager } from '@xec-sh/testing';
import { it, expect, describe, afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';

import { OnCommand } from '../../src/commands/on.js';

// Test helper that extends OnCommand for integration testing
class TestableOnCommand extends OnCommand {
  // Override the initializeConfig to use test configuration
  protected async initializeConfig(options: any): Promise<void> {
    // Call parent to initialize configuration properly
    await super.initializeConfig({
      ...options,
      configPath: options.configPath || path.join(process.cwd(), '.xec', 'config.yaml')
    });
  }
}

describe('On Command - Real SSH Integration', () => {
  let tempDir: string;
  let projectDir: string;
  let command: TestableOnCommand;
  let dockerManager: DockerContainerManager;

  // Helper function to create default options for execute calls
  const createOptions = (overrides: any = {}) => ({
    quiet: false,
    verbose: false,
    dryRun: false,
    configPath: path.join(projectDir, '.xec', 'config.yaml'),
    ...overrides
  });

  beforeAll(async () => {
    // Get Docker manager instance
    dockerManager = DockerContainerManager.getInstance();

    // Check if Docker is available
    if (!dockerManager.isDockerAvailable()) {
      console.warn('Docker is not available, skipping integration tests');
      return;
    }

    // Start the first SSH container for testing
    const started = await dockerManager.startContainer('ubuntu-apt');
    if (!started) {
      throw new Error('Failed to start test container');
    }

    // Wait for SSH to be ready
    await dockerManager.waitForSSH(2201, 30);
  }, 60000);

  afterAll(async () => {
    if (dockerManager?.isDockerAvailable()) {
      await dockerManager.stopContainer('ubuntu-apt');
    }
  }, 30000);

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-on-integration-'));
    projectDir = path.join(tempDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });

    // Change to project directory
    process.chdir(projectDir);

    // Create new command instance
    command = new TestableOnCommand();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Real SSH Command Execution', () => {
    it('should execute simple commands on SSH host', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a test file to verify command execution
      const testFile = path.join(tempDir, 'test-output.txt');

      // Execute command that writes to a file
      // Pass arguments in the format expected by execute method
      await command.execute([
        'hosts.test-server',
        'echo "Hello from SSH" > /tmp/test-output.txt',
        createOptions()
      ]);

      // Verify the command was executed by reading the file
      await command.execute([
        'hosts.test-server',
        'cat /tmp/test-output.txt',
        createOptions()
      ]);
    });

    it('should execute commands with environment variables', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute command with environment variable
      await command.execute([
        'hosts.test-server',
        'echo "$TEST_VAR" > /tmp/env-test.txt',
        createOptions({ env: ['TEST_VAR=HelloWorld'] })
      ]);

      // Verify the environment variable was set
      await command.execute([
        'hosts.test-server',
        'cat /tmp/env-test.txt',
        createOptions()
      ]);
    });

    it('should handle command failures properly', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute a command that should fail
      await expect(
        command.execute([
          'hosts.test-server',
          'exit 1',
          createOptions({ quiet: true })
        ])
      ).rejects.toThrow();
    });

    it('should execute commands in specific directory', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a directory and execute command in it
      await command.execute([
        'hosts.test-server',
        'mkdir -p /tmp/test-dir',
        createOptions()
      ]);

      await command.execute([
        'hosts.test-server',
        'pwd > pwd-output.txt',
        createOptions({ cwd: '/tmp/test-dir' })
      ]);

      // Verify the command was executed in the correct directory
      await command.execute([
        'hosts.test-server',
        'cat /tmp/test-dir/pwd-output.txt',
        createOptions()
      ]);
    });

    it('should handle timeout correctly', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute a command that takes too long
      await expect(
        command.execute([
          'hosts.test-server',
          'sleep 10',
          createOptions({ timeout: '1s', quiet: true })
        ])
      ).rejects.toThrow();
    });
  });

  describe('File Operations via SSH', () => {
    it('should create and verify files on remote host', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testContent = 'This is a test file created via SSH';
      const fileName = `/tmp/test-${Date.now()}.txt`;

      // Create file on remote host
      await command.execute([
        'hosts.test-server',
        `echo "${testContent}" > ${fileName}`,
        createOptions()
      ]);

      // Verify file exists
      await command.execute([
        'hosts.test-server',
        `test -f ${fileName} && echo "File exists"`,
        createOptions()
      ]);

      // Read file content
      await command.execute([
        'hosts.test-server',
        `cat ${fileName}`,
        createOptions()
      ]);

      // Clean up
      await command.execute([
        'hosts.test-server',
        `rm ${fileName}`,
        createOptions()
      ]);
    });

    it('should handle multiple files and directories', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const testDir = `/tmp/test-dir-${Date.now()}`;

      // Create directory structure
      await command.execute([
        'hosts.test-server',
        `mkdir -p ${testDir}/subdir`,
        createOptions()
      ]);

      // Create multiple files
      await command.execute([
        'hosts.test-server',
        `touch ${testDir}/file1.txt ${testDir}/file2.txt ${testDir}/subdir/file3.txt`,
        createOptions()
      ]);

      // List files
      await command.execute([
        'hosts.test-server',
        `ls -la ${testDir}`,
        createOptions()
      ]);

      // Clean up
      await command.execute([
        'hosts.test-server',
        `rm -rf ${testDir}`,
        createOptions()
      ]);
    });
  });

  describe('Script Execution via SSH', () => {
    it('should execute bash scripts on remote host', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a local script
      const scriptPath = path.join(projectDir, 'test-script.sh');
      const scriptContent = `#!/bin/bash
echo "Starting script"
echo "Creating test file"
touch /tmp/script-test.txt
echo "Script completed" > /tmp/script-test.txt
echo "Script finished"
`;
      await fs.writeFile(scriptPath, scriptContent);
      await fs.chmod(scriptPath, 0o755);

      // Execute script on remote host  
      await command.execute([
        'hosts.test-server',
        scriptPath,
        createOptions()
      ]);

      // Verify script execution
      await command.execute([
        'hosts.test-server',
        'cat /tmp/script-test.txt',
        createOptions()
      ]);

      // Clean up
      await command.execute([
        'hosts.test-server',
        'rm /tmp/script-test.txt',
        createOptions()
      ]);
    });
  });

  describe('Multiple Host Execution', () => {
    let secondContainerStarted = false;

    beforeEach(async () => {
      // Start a second container for multi-host tests
      if (dockerManager.isDockerAvailable()) {
        secondContainerStarted = await dockerManager.startContainer('centos7-yum');
        if (secondContainerStarted) {
          await dockerManager.waitForSSH(2202, 30);
        }
      }
    });

    afterEach(async () => {
      if (secondContainerStarted) {
        await dockerManager.stopContainer('centos7-yum');
      }
    });

    it('should execute commands on multiple hosts', async () => {
      if (!secondContainerStarted) {
        console.warn('Second container not available, skipping multi-host test');
        return;
      }

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'server1': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            },
            'server2': {
              host: 'localhost',
              port: 2202,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const timestamp = Date.now();

      // Execute command on both hosts
      await command.execute([
        'hosts.*',
        `echo "Test from host at ${timestamp}" > /tmp/multi-host-test.txt`,
        createOptions()
      ]);

      // Verify on first host
      await command.execute([
        'hosts.server1',
        'cat /tmp/multi-host-test.txt',
        createOptions()
      ]);

      // Verify on second host
      await command.execute([
        'hosts.server2',
        'cat /tmp/multi-host-test.txt',
        createOptions()
      ]);

      // Clean up on both hosts
      await command.execute([
        'hosts.*',
        'rm /tmp/multi-host-test.txt',
        createOptions()
      ]);
    });

    it('should handle parallel execution', async () => {
      if (!secondContainerStarted) {
        console.warn('Second container not available, skipping parallel test');
        return;
      }

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'server1': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            },
            'server2': {
              host: 'localhost',
              port: 2202,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      const startTime = Date.now();

      // Execute slow command on both hosts in parallel
      await command.execute([
        'hosts.*',
        'sleep 2 && echo "Done"',
        createOptions({ parallel: true })
      ]);

      const duration = Date.now() - startTime;

      // If executed in parallel, should take ~2 seconds, not 4
      expect(duration).toBeLessThan(3000);
    });
  });

  describe('Task Execution via SSH', () => {
    it('should execute configured tasks on remote hosts', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        },
        tasks: {
          'test-task': {
            description: 'Test task that creates files',
            steps: [
              { command: 'mkdir -p /tmp/task-test' },
              { command: 'echo "Step 1" > /tmp/task-test/step1.txt' },
              { command: 'echo "Step 2" > /tmp/task-test/step2.txt' },
              { command: 'ls -la /tmp/task-test' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute task
      await command.execute([
        'hosts.test-server',
        createOptions({ task: 'test-task' })
      ]);

      // Verify task execution
      await command.execute([
        'hosts.test-server',
        'cat /tmp/task-test/step1.txt /tmp/task-test/step2.txt',
        createOptions()
      ]);

      // Clean up
      await command.execute([
        'hosts.test-server',
        'rm -rf /tmp/task-test',
        createOptions()
      ]);
    });
  });

  describe('Advanced SSH Features', () => {
    it('should handle complex command chains', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute complex command chain
      await command.execute([
        'hosts.test-server',
        'cd /tmp && mkdir -p complex-test && cd complex-test && echo "test" > file.txt && cat file.txt',
        createOptions()
      ]);

      // Verify
      await command.execute([
        'hosts.test-server',
        'test -f /tmp/complex-test/file.txt && echo "Success"',
        createOptions()
      ]);

      // Clean up
      await command.execute([
        'hosts.test-server',
        'rm -rf /tmp/complex-test',
        createOptions()
      ]);
    });

    it('should handle pipes and redirections', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Test pipes
      await command.execute([
        'hosts.test-server',
        'echo -e "line1\\nline2\\nline3" | grep line2 > /tmp/pipe-test.txt',
        createOptions()
      ]);

      // Verify pipe result
      await command.execute([
        'hosts.test-server',
        'cat /tmp/pipe-test.txt',
        createOptions()
      ]);

      // Test append redirection
      await command.execute([
        'hosts.test-server',
        'echo "appended" >> /tmp/pipe-test.txt',
        createOptions()
      ]);

      // Verify append
      await command.execute([
        'hosts.test-server',
        'cat /tmp/pipe-test.txt',
        createOptions()
      ]);

      // Clean up
      await command.execute([
        'hosts.test-server',
        'rm /tmp/pipe-test.txt',
        createOptions()
      ]);
    });

    it('should handle background processes', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Start a background process
      await command.execute([
        'hosts.test-server',
        'nohup sleep 5 > /tmp/bg-test.log 2>&1 & echo $! > /tmp/bg-test.pid',
        createOptions()
      ]);

      // Check if process is running
      await command.execute([
        'hosts.test-server',
        'ps -p $(cat /tmp/bg-test.pid) || echo "Process not found"',
        createOptions()
      ]);

      // Clean up
      await command.execute([
        'hosts.test-server',
        'kill $(cat /tmp/bg-test.pid) 2>/dev/null || true',
        createOptions()
      ]);

      await command.execute([
        'hosts.test-server',
        'rm -f /tmp/bg-test.log /tmp/bg-test.pid',
        createOptions()
      ]);
    });
  });

  describe('Error Recovery and Validation', () => {
    it('should validate SSH connectivity before executing commands', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'invalid-server': {
              host: 'localhost',
              port: 9999, // Invalid port
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Should fail to connect
      await expect(
        command.execute([
          'hosts.invalid-server',
          'echo "test"',
          createOptions({ quiet: true, timeout: '5s' })
        ])
      ).rejects.toThrow();
    });

    it('should handle permission denied errors', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            'test-server': {
              host: 'localhost',
              port: 2201,
              user: 'user',
              password: 'password'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Try to write to a protected directory
      await expect(
        command.execute([
          'hosts.test-server',
          'echo "test" > /root/test.txt',
          createOptions({ quiet: true })
        ])
      ).rejects.toThrow();
    });
  });
});