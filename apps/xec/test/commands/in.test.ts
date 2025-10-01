/**
 * Tests for in command v2 with real Docker and Kubernetes execution
 * Uses real containers and clusters instead of mocks
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { existsSync } from 'fs';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
import { it, expect, describe, afterAll, afterEach, beforeAll, beforeEach } from '@jest/globals';
import { describeSSH, getSSHConfig, KindClusterManager, DockerContainerManager } from '@xec-sh/testing';

import { InCommand } from '../../src/commands/in.js';

describe('In Command', () => {
  let tempDir: string;
  let projectDir: string;
  let command: InCommand;
  let originalCwd: string;
  let dockerManager: DockerContainerManager;
  let originalPath: string | undefined;
  let originalShell: string | undefined;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalPath = process.env.PATH;
    originalShell = process.env.SHELL;

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-in-test-'));
    projectDir = path.join(tempDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });

    command = new InCommand();
    dockerManager = DockerContainerManager.getInstance();

    // Don't change working directory, instead use absolute paths in tests
    // This avoids shell execution issues in temp directories

    // Ensure PATH includes common tool locations and shell binaries
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const additionalPaths = ['/usr/local/bin', '/opt/homebrew/bin', '/bin', '/usr/bin'];
    const currentPath = process.env.PATH || '';
    process.env.PATH = [...additionalPaths, currentPath].join(pathSeparator);

    // Ensure SHELL is set for proper shell execution
    if (!process.env.SHELL) {
      process.env.SHELL = '/bin/bash';
    }
  });

  afterEach(async () => {
    // Restore original environment
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
    }
    if (originalShell !== undefined) {
      process.env.SHELL = originalShell;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Docker Container Execution', () => {
    let testContainerName: string;

    beforeEach(async () => {
      testContainerName = 'xec-in-test-' + Date.now();
    });

    afterEach(async () => {
      // Cleanup test container
      if (dockerManager.isDockerAvailable() && testContainerName) {
        await $.local()`/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
      }
    });

    it('should execute commands in Docker containers', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute command in container - write to a file so we can verify
      await command.execute([
        'containers.test',
        'echo "Hello from Docker" > /tmp/test-output.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Verify command was executed by reading the file from container
      const verifyResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/test-output.txt`;
      expect(verifyResult.stdout).toContain('Hello from Docker');
    });

    it('should execute commands with environment variables', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName,
              env: {
                TEST_VAR: 'test_value',
                NODE_ENV: 'production'
              }
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute command that uses environment variable - write to file for verification
      await command.execute([
        'containers.test',
        'echo "TEST_VAR=$TEST_VAR NODE_ENV=$NODE_ENV" > /tmp/env-test.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Check output by reading the file from container
      const envResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/env-test.txt`;
      expect(envResult.stdout).toContain('TEST_VAR=test_value');
      expect(envResult.stdout).toContain('NODE_ENV=production');
    });

    it('should execute commands with custom working directory', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sh -c "mkdir -p /custom/dir && sleep 3600"`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      // Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName,
              workdir: '/custom/dir'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a file in the custom directory
      await $.local()`/usr/local/bin/docker exec ${testContainerName} sh -c "echo 'test content' > /custom/dir/test.txt"`;

      // Execute command that should run in custom workdir - write pwd to file
      await command.execute([
        'containers.test',
        'pwd > /tmp/pwd.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Also check files in the directory
      await command.execute([
        'containers.test',
        'ls > /tmp/ls.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Check output shows custom working directory
      const pwdResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/pwd.txt`;
      expect(pwdResult.stdout.trim()).toBe('/custom/dir');

      const lsResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/ls.txt`;
      expect(lsResult.stdout).toContain('test.txt');
    });
  });

  describe('Kubernetes Pod Execution', () => {
    let clusterManager: KindClusterManager;
    let clusterReady = false;

    beforeAll(async () => {
      clusterManager = new KindClusterManager({ name: 'xec-in-test-cluster' });

      // Only create cluster if Kind is available
      try {
        await clusterManager.createCluster();
        clusterReady = true;
      } catch (e) {
        console.log('Kind not available, skipping Kubernetes tests:', e);
      }
    }, 90000); // Increase timeout for cluster creation

    afterAll(async () => {
      if (clusterReady) {
        await clusterManager.deleteCluster();
        clusterManager.cleanup();
      }
    });

    it('should execute commands in Kubernetes pods', async function () {
      if (!clusterReady) {
        this.skip();
        return;
      }

      // Deploy a test pod
      await clusterManager.deployTestPod('test-pod', 'test');

      const config = {
        version: '2.0',
        targets: {
          pods: {
            test: {
              namespace: 'test',
              pod: 'test-pod',
              container: 'main',
              kubeconfig: clusterManager.getKubeConfigPath() // Add kubeconfig path
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Set KUBECONFIG environment variable
      const originalKubeconfig = process.env.KUBECONFIG;
      process.env.KUBECONFIG = clusterManager.getKubeConfigPath();

      try {
        // Execute command in pod - write to file
        await command.execute([
          'pods.test',
          'echo "Hello from Kubernetes" > /tmp/k8s-test.txt',
          { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);

        // Verify by reading the file
        const verifyCmd = clusterManager.kubectl('exec test-pod -n test -c main -- cat /tmp/k8s-test.txt');
        expect(verifyCmd).toContain('Hello from Kubernetes');
      } finally {
        // Restore KUBECONFIG
        if (originalKubeconfig) {
          process.env.KUBECONFIG = originalKubeconfig;
        } else {
          delete process.env.KUBECONFIG;
        }
      }
    }, 60000); // Increase timeout

    it('should execute commands in specific containers of multi-container pods', async function () {
      if (!clusterReady) {
        this.skip();
        return;
      }

      // Ensure test namespace exists
      try {
        await clusterManager.exec('kubectl create namespace test', { silent: true });
      } catch {
        // Namespace might already exist
      }

      // Deploy a multi-container pod
      await clusterManager.createMultiContainerPod('multi-pod', 'test');

      const config = {
        version: '2.0',
        targets: {
          pods: {
            app: {
              namespace: 'test',
              pod: 'multi-pod',
              container: 'app',
              kubeconfig: clusterManager.getKubeConfigPath() // Add kubeconfig path
            },
            sidecar: {
              namespace: 'test',
              pod: 'multi-pod',
              container: 'sidecar',
              kubeconfig: clusterManager.getKubeConfigPath() // Add kubeconfig path
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Set KUBECONFIG
      const originalKubeconfig = process.env.KUBECONFIG;
      process.env.KUBECONFIG = clusterManager.getKubeConfigPath();

      try {
        // Execute in app container
        await command.execute([
          'pods.app',
          'echo "From app container" > /tmp/app.txt',
          { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);

        // Execute in sidecar container
        await command.execute([
          'pods.sidecar',
          'echo "From sidecar container" > /tmp/sidecar.txt',
          { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);

        // Verify output from both containers
        const appOutput = clusterManager.kubectl('exec multi-pod -n test -c app -- cat /tmp/app.txt');
        const sidecarOutput = clusterManager.kubectl('exec multi-pod -n test -c sidecar -- cat /tmp/sidecar.txt');

        expect(appOutput).toContain('From app container');
        expect(sidecarOutput).toContain('From sidecar container');
      } finally {
        if (originalKubeconfig) {
          process.env.KUBECONFIG = originalKubeconfig;
        } else {
          delete process.env.KUBECONFIG;
        }
      }
    });
  });

  // SSH tests using real containers
  describeSSH('SSH Host Execution', () => {
    it('should execute commands on SSH hosts', async () => {
      const container = 'ubuntu-apt';
      const sshConfig = getSSHConfig(container);

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            test: {
              host: sshConfig.host,
              port: sshConfig.port,
              user: sshConfig.username,
              password: sshConfig.password
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute command on SSH host - write to file
      await command.execute([
        'hosts.test',
        'echo "Hello from SSH host" > /tmp/ssh-test.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Verify by reading the file
      const sshEngine = $.ssh({
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        password: sshConfig.password
      });

      const result = await sshEngine`cat /tmp/ssh-test.txt`;
      expect(result.stdout.trim()).toBe('Hello from SSH host');

      // Cleanup
      await sshEngine`rm -f /tmp/ssh-test.txt`;
    });

    it('should execute commands with environment variables on SSH hosts', async () => {
      const container = 'ubuntu-apt';
      const sshConfig = getSSHConfig(container);

      const config = {
        version: '2.0',
        targets: {
          hosts: {
            test: {
              host: sshConfig.host,
              port: sshConfig.port,
              user: sshConfig.username,
              password: sshConfig.password,
              env: {
                TEST_ENV: 'ssh_value',
                CUSTOM_VAR: 'custom'
              }
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a test file to capture environment variables
      const sshEngine = $.ssh({
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        password: sshConfig.password
      });

      // Execute command that writes env vars to a file
      await command.execute([
        'hosts.test',
        'echo "TEST_ENV=$TEST_ENV CUSTOM_VAR=$CUSTOM_VAR" > /tmp/env-test.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Read the file to verify env vars were set
      const result = await sshEngine`cat /tmp/env-test.txt`;
      expect(result.stdout).toContain('TEST_ENV=ssh_value');
      expect(result.stdout).toContain('CUSTOM_VAR=custom');

      // Cleanup
      await sshEngine`rm -f /tmp/env-test.txt`;
    });
  }, { containers: ['ubuntu-apt'] });

  describe('Script Execution', () => {
    let testContainerName: string;

    beforeEach(async () => {
      testContainerName = 'xec-script-test-' + Date.now();
    });

    afterEach(async () => {
      if (dockerManager.isDockerAvailable() && testContainerName) {
        await $.local()`/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
      }
    });

    it('should execute JavaScript files in containers', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a Node.js container
      const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
      const result = await $.local()`${dockerPath} run -d --name ${testContainerName} node:18-alpine sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start Node container: ' + result.stderr);
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            node: {
              container: testContainerName
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create a test script in the project directory
      const scriptPath = path.join(projectDir, 'test-script.js');
      await fs.writeFile(scriptPath, `
// This script will be executed with $target available for the container
const result = await $target\`echo "Script executed successfully"\`;
console.log(result.stdout);

// Also test that we can run multiple commands
const nodeVersion = await $target\`node --version\`;
console.log('Node version:', nodeVersion.stdout.trim());

// Write output to verify execution
await $target\`echo "Test completed" > /tmp/script-test-done.txt\`;
`);

      // Execute the script file using xec (this tests script execution feature)
      await command.execute([
        'containers.node',
        scriptPath,  // Use the absolute path to the script
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Check that the script executed by verifying the file it created
      const verifyResult = await $.local()`${dockerPath} exec ${testContainerName} cat /tmp/script-test-done.txt`;
      expect(verifyResult.stdout.trim()).toBe('Test completed');
    });
  });

  describe('Task Execution', () => {
    let testContainerName: string;

    beforeEach(async () => {
      testContainerName = 'xec-task-test-' + Date.now();
    });

    afterEach(async () => {
      if (dockerManager.isDockerAvailable() && testContainerName) {
        await $.local()`/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
      }
    });

    it('should execute configured tasks in containers', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName
            }
          }
        },
        tasks: {
          'test-task': {
            description: 'Test task',
            steps: [
              { command: 'echo "Step 1 executed" >> /tmp/task-output.txt' },
              { command: 'echo "Step 2 executed" >> /tmp/task-output.txt' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute task - the execute method expects arguments array with options as last element
      await command.execute(['containers.test', 'dummy', { task: 'test-task', quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }]);

      // Verify task steps were executed by reading the output file
      const taskOutput = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/task-output.txt`;
      expect(taskOutput.stdout).toContain('Step 1 executed');
      expect(taskOutput.stdout).toContain('Step 2 executed');
    });
  });

  describe('Wildcard Targeting', () => {
    let containerNames: string[] = [];

    beforeEach(async () => {
      // Create multiple containers for wildcard testing
      if (dockerManager.isDockerAvailable()) {
        const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
        for (let i = 1; i <= 3; i++) {
          const name = `xec-worker-${i}-${Date.now()}`;
          containerNames.push(name);
          await $.local()`${dockerPath} run -d --name ${name} alpine:latest sleep 3600`.nothrow();
        }
      }
    });

    afterEach(async () => {
      // Cleanup all test containers
      if (dockerManager.isDockerAvailable()) {
        const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
        for (const name of containerNames) {
          await $.local()`${dockerPath} rm -f ${name}`.nothrow();
        }
      }
      containerNames = [];
    });

    it('should execute commands on multiple containers with wildcards', async function () {
      if (!dockerManager.isDockerAvailable() || containerNames.length === 0) {
        this.skip();
        return;
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            'worker-1': { container: containerNames[0] },
            'worker-2': { container: containerNames[1] },
            'worker-3': { container: containerNames[2] },
            'database': { image: 'postgres:latest' } // Not started, shouldn't match
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute on all workers - write hostname to file
      await command.execute([
        'containers.worker-*',
        'echo "Worker $(hostname) reporting" > /tmp/worker-output.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Verify all workers executed the command
      const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
      for (const containerName of containerNames) {
        const output = await $.local()`${dockerPath} exec ${containerName} cat /tmp/worker-output.txt`;
        expect(output.stdout).toContain('Worker');
        expect(output.stdout).toContain('reporting');
      }
    });
  });

  describe('Error Handling', () => {
    it.skip('should handle non-existent containers gracefully', async () => {
      const config = {
        version: '2.0',
        targets: {
          containers: {
            missing: { container: 'non-existent-container' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      try {
        await command.execute([
          'containers.missing',
          'echo test',
          { quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);
        // If it doesn't throw, fail the test
        fail('Expected command.execute to throw an error');
      } catch (error: any) {
        console.log(error.message);
        expect(error.message).toMatch(/Container 'non-existent-container' not found/);
      }
    });

    it.skip('should handle command execution failures', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      const testContainerName = 'xec-error-test-' + Date.now();

      try {
        // Start a test container
        const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
        await $.local()`${dockerPath} run -d --name ${testContainerName} alpine:latest sleep 3600`;

        const config = {
          version: '2.0',
          targets: {
            containers: {
              test: { container: testContainerName }
            }
          }
        };

        await fs.writeFile(
          path.join(projectDir, '.xec', 'config.yaml'),
          yaml.dump(config)
        );

        // Execute a command that should fail
        let errorThrown = false;
        try {
          await command.execute([
            'containers.test',
            'exit 1',
            { quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
          ]);
        } catch (error: any) {
          errorThrown = true;
          // Just verify an error was thrown
          expect(error).toBeDefined();
        }
        expect(errorThrown).toBe(true);
      } finally {
        const dockerPath = existsSync('/usr/local/bin/docker') ? '/usr/local/bin/docker' : 'docker';
        await $.local()`${dockerPath} rm -f ${testContainerName}`.nothrow();
      }
    });

    it('should require target specification', async () => {
      const config = {
        version: '2.0',
        targets: {}
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      await expect(
        command.execute([{ quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }])
      ).rejects.toThrow(/Target specification is required/);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not execute commands in dry run mode', async () => {
      const config = {
        version: '2.0',
        targets: {
          containers: {
            app: { image: 'alpine:latest' }
          },
          hosts: {
            server: { host: 'example.com', user: 'deploy' }
          },
          pods: {
            web: { namespace: 'default', pod: 'web-pod' }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Capture console output - clack uses process.stdout.write
      const output: string[] = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = ((chunk: any, ...args: any[]) => {
        if (typeof chunk === 'string') {
          output.push(chunk);
        }
        return true;
      }) as any;

      try {
        // Test dry run for each target type
        await command.execute([
          'containers.app',
          'echo test',
          { dryRun: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);

        await command.execute([
          'hosts.server',
          'ls -la',
          { dryRun: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);

        await command.execute([
          'pods.web',
          'date',
          { dryRun: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);

        // Verify dry run output - clack uses special formatting
        const fullOutput = output.join('');
        expect(fullOutput).toContain('[DRY RUN] Would execute');
        expect(fullOutput).toContain('app');
        expect(fullOutput).toContain('echo test');
        expect(fullOutput).toContain('server');
        expect(fullOutput).toContain('ls -la');
        expect(fullOutput).toContain('web');
        expect(fullOutput).toContain('date');
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });

  describe('Additional Real Command Execution Tests', () => {
    let testContainerName: string;

    beforeEach(async () => {
      testContainerName = 'xec-advanced-test-' + Date.now();
    });

    afterEach(async () => {
      if (dockerManager.isDockerAvailable() && testContainerName) {
        await $.local()`/usr/local/bin/docker rm -f ${testContainerName}`.nothrow();
      }
    });

    it('should execute complex bash commands with pipes and redirects', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute complex command with pipes
      await command.execute([
        'containers.test',
        'echo "line1\nline2\nline3" | grep "line2" > /tmp/grep-result.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Verify result
      const grepResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/grep-result.txt`;
      expect(grepResult.stdout.trim()).toBe('line2');

      // Test command with multiple redirects and variable substitution
      await command.execute([
        'containers.test',
        'TEST_VAR="hello world"; echo $TEST_VAR > /tmp/var-test.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      const varResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/var-test.txt`;
      expect(varResult.stdout.trim()).toBe('hello world');
    });

    it('should handle interactive mode flag correctly', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute command that writes to tty (non-interactive mode should still work)
      await command.execute([
        'containers.test',
        'tty > /tmp/tty-test.txt || echo "not a tty" > /tmp/tty-test.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      const ttyResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/tty-test.txt`;
      expect(ttyResult.stdout.trim()).toBe('not a tty');
    });

    it('should execute commands with special characters correctly', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Test with special characters - write them individually to avoid complex escaping
      await command.execute([
        'containers.test',
        'echo "Test with spaces" > /tmp/special-chars.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      await command.execute([
        'containers.test',
        'echo "Pipe: |" >> /tmp/special-chars.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      await command.execute([
        'containers.test',
        'echo "Ampersand: &" >> /tmp/special-chars.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      await command.execute([
        'containers.test',
        'echo "Redirects: > <" >> /tmp/special-chars.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      await command.execute([
        'containers.test',
        "echo 'Single quote: \"' >> /tmp/special-chars.txt",
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      await command.execute([
        'containers.test',
        'echo "Backslash: \\\\" >> /tmp/special-chars.txt',
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      const specialResult = await $.local()`/usr/local/bin/docker exec ${testContainerName} cat /tmp/special-chars.txt`;
      expect(specialResult.stdout).toContain('Test with spaces');
      expect(specialResult.stdout).toContain('Pipe: |');
      expect(specialResult.stdout).toContain('Ampersand: &');
      expect(specialResult.stdout).toContain('Redirects: > <');
      expect(specialResult.stdout).toContain('Single quote: "');
      expect(specialResult.stdout).toContain('Backslash: \\');
    });

    it('should execute commands using REPL mode', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a Node.js container for REPL testing
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} node:18-alpine sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Test REPL mode with a single target (it should not throw since it's interactive)
      // We can't test the actual REPL interaction in unit tests
      // So let's just verify it doesn't crash when given valid input
      const replPromise = command.execute([
        'containers.test',
        '',
        { repl: true, quiet: true, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Since REPL is interactive, we need to force exit
      // In real usage, user would type .exit
      setTimeout(() => {
        process.stdin.emit('data', '.exit\n');
      }, 100);

      // The REPL should exit cleanly
      await expect(replPromise).resolves.toBeUndefined();
    });

    it('should execute parallel commands correctly', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Create two containers for parallel testing
      const container1 = 'xec-parallel-1-' + Date.now();
      const container2 = 'xec-parallel-2-' + Date.now();

      try {
        await $.local()`/usr/local/bin/docker run -d --name ${container1} alpine:latest sleep 3600`;
        await $.local()`/usr/local/bin/docker run -d --name ${container2} alpine:latest sleep 3600`;

        const config = {
          version: '2.0',
          targets: {
            containers: {
              'parallel-1': { container: container1 },
              'parallel-2': { container: container2 }
            }
          }
        };

        await fs.writeFile(
          path.join(projectDir, '.xec', 'config.yaml'),
          yaml.dump(config)
        );

        // Execute command in parallel
        await command.execute([
          'containers.parallel-*',
          'echo "Parallel execution" > /tmp/parallel.txt',
          { parallel: true, quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);

        // Verify both containers executed the command
        const result1 = await $.local()`/usr/local/bin/docker exec ${container1} cat /tmp/parallel.txt`;
        const result2 = await $.local()`/usr/local/bin/docker exec ${container2} cat /tmp/parallel.txt`;

        expect(result1.stdout.trim()).toBe('Parallel execution');
        expect(result2.stdout.trim()).toBe('Parallel execution');
      } finally {
        await $.local()`/usr/local/bin/docker rm -f ${container1} ${container2}`.nothrow();
      }
    });

    it.skip('should properly handle command timeouts', async function () {
      if (!dockerManager.isDockerAvailable()) {
        this.skip();
        return;
      }

      // Start a test container
      const result = await $.local()`/usr/local/bin/docker run -d --name ${testContainerName} alpine:latest sleep 3600`;
      if (result.exitCode !== 0) {
        throw new Error('Failed to start test container');
      }

      const config = {
        version: '2.0',
        targets: {
          containers: {
            test: {
              container: testContainerName
            }
          }
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Execute command that should timeout
      let errorThrown = false;
      try {
        await command.execute([
          'containers.test',
          'sleep 5',
          { quiet: true, timeout: '1s', configPath: path.join(projectDir, '.xec', 'config.yaml') }
        ]);
      } catch (error: any) {
        errorThrown = true;
        // Just verify an error was thrown
        expect(error).toBeDefined();
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe('Local Target Execution', () => {
    it('should execute commands on local target', async () => {
      const config = {
        version: '2.0',
        targets: {
          // Local targets don't go under a type, they're a special case
          local: {} // Global local target config
        }
      };

      await fs.writeFile(
        path.join(projectDir, '.xec', 'config.yaml'),
        yaml.dump(config)
      );

      // Create test file in temp directory
      const testFile = path.join(tempDir, 'local-test.txt');

      // Execute command on local target
      await command.execute([
        'local',
        `echo "Local execution test" > "${testFile}"`,
        { quiet: false, configPath: path.join(projectDir, '.xec', 'config.yaml') }
      ]);

      // Verify the file was created
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content.trim()).toBe('Local execution test');
    });
  });
});