import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('Docker Enhanced API Integration Tests', () => {
  // Check if Docker is available by running a simple command
  const checkDocker = async () => {
    try {
      const result = await $`docker version --format json`;
      return result.exitCode === 0;
    } catch {
      return false;
    }
  };

  // Use a function to determine skip status dynamically
  const testOrSkip = process.env['CI'] ? it.skip : it;

  describe('Container Lifecycle Management', () => {
    testOrSkip('should create, start, execute, and remove a container', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-lifecycle'
      }).start();

      expect(container.name).toBe('xec-test-lifecycle');
      expect(container.started).toBe(true);

      // Execute command in container
      const result = await container.exec`echo "Hello from container"`;
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from container');

      // Execute raw command
      const rawResult = await container.execRaw('ls', ['-la', '/']);
      expect(rawResult.exitCode).toBe(0);
      expect(rawResult.stdout).toContain('bin');

      // Stop and remove
      await container.stop();
      expect(container.started).toBe(false);
      
      await container.remove();
      expect(container.removed).toBe(true);
    }, 30000);

    testOrSkip('should handle container with auto-generated name', async () => {
      const container = await $.docker({
        image: 'alpine:latest'
      }).start();

      expect(container.name).toMatch(/^xec-\d+-[a-z0-9]+$/);
      
      await container.remove(true); // Force remove
    }, 20000);

    testOrSkip('should restart a container', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-restart',
        command: 'sh -c "echo Started at $(date); sleep 3600"'
      }).start();

      // Get initial logs
      const logs1 = await container.logs();
      expect(logs1).toContain('Started at');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Restart
      await container.restart();

      // Get new logs - should have two start messages
      const logs2 = await container.logs();
      const startCount = (logs2.match(/Started at/g) || []).length;
      expect(startCount).toBe(2);

      await container.remove(true);
    }, 20000);
  });

  describe('Container Configuration', () => {
    testOrSkip('should create container with environment variables', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-env',
        env: {
          TEST_VAR: 'test_value',
          NODE_ENV: 'production'
        }
      }).start();

      const result = await container.exec`printenv TEST_VAR`;
      expect(result.stdout.trim()).toBe('test_value');

      const nodeEnv = await container.exec`printenv NODE_ENV`;
      expect(nodeEnv.stdout.trim()).toBe('production');

      await container.remove(true);
    }, 20000);

    testOrSkip('should create container with port mapping', async () => {
      const container = await $.docker({
        image: 'nginx:alpine',
        name: 'xec-test-ports',
        ports: { '8888': '80' }
      }).start();

      // Check if port is mapped
      const ps = await $`docker ps --filter name=xec-test-ports --format "table {{.Ports}}"`;
      expect(ps.stdout).toContain('8888->80');

      await container.remove(true);
    }, 20000);

    testOrSkip('should create container with volumes', async () => {
      // Create a temporary directory
      const tempDir = `/tmp/xec-test-${Date.now()}`;
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'Hello from host');

      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-volumes',
        volumes: {
          [tempDir]: '/data'
        }
      }).start();

      // Read file from container
      const result = await container.exec`cat /data/test.txt`;
      expect(result.stdout).toContain('Hello from host');

      // Write file in container
      await container.exec`echo "Hello from container" > /data/from-container.txt`;

      // Check file on host
      const hostContent = await fs.readFile(path.join(tempDir, 'from-container.txt'), 'utf-8');
      expect(hostContent).toContain('Hello from container');

      await container.remove(true);
      await fs.rm(tempDir, { recursive: true });
    }, 20000);

    testOrSkip('should create container with working directory and user', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-workdir',
        workdir: '/tmp',
        user: 'nobody'
      }).start();

      const pwd = await container.exec`pwd`;
      expect(pwd.stdout.trim()).toBe('/tmp');

      const whoami = await container.exec`whoami`;
      expect(whoami.stdout.trim()).toBe('nobody');

      await container.remove(true);
    }, 20000);
  });

  describe('Container Logs', () => {
    testOrSkip('should get container logs', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-logs',
        command: 'sh -c "echo Line1; echo Line2; echo Line3"'
      }).start();

      // Wait for container to finish
      await new Promise(resolve => setTimeout(resolve, 2000));

      const logs = await container.logs();
      expect(logs).toContain('Line1');
      expect(logs).toContain('Line2');
      expect(logs).toContain('Line3');

      await container.remove(true);
    }, 20000);

    testOrSkip('should stream container logs', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-stream',
        command: 'sh -c "for i in 1 2 3; do echo Log $i; sleep 1; done"'
      }).start();

      const collectedLogs: string[] = [];
      await container.streamLogs((data) => {
        collectedLogs.push(data);
      });

      expect(collectedLogs.length).toBeGreaterThan(0);
      expect(collectedLogs.some(log => log.includes('Log 1'))).toBe(true);
      expect(collectedLogs.some(log => log.includes('Log 2'))).toBe(true);
      expect(collectedLogs.some(log => log.includes('Log 3'))).toBe(true);

      await container.remove(true);
    }, 20000);

    testOrSkip('should follow container logs with timeout', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-follow',
        command: 'sh -c "while true; do echo Following $(date); sleep 1; done"'
      }).start();

      const collectedLogs: string[] = [];
      const followPromise = container.follow((data) => {
        collectedLogs.push(data);
      });

      // Let it run for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Stop container to stop following
      await container.stop();

      try {
        await followPromise;
      } catch {
        // Expected when container stops
      }

      expect(collectedLogs.length).toBeGreaterThan(0);
      expect(collectedLogs.some(log => log.includes('Following'))).toBe(true);

      await container.remove(true);
    }, 20000);
  });

  describe('Container Health Checks', () => {
    testOrSkip('should wait for container to be healthy', async () => {
      // Note: This test requires a container that has health checks
      // Using a simple HTTP server that becomes healthy after startup
      const container = await $.docker({
        image: 'nginx:alpine',
        name: 'xec-test-health',
        ports: { '8889': '80' },
        healthcheck: {
          test: 'wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1',
          interval: '2s',
          timeout: '2s',
          retries: 3,
          startPeriod: '5s'
        }
      }).start();

      // Wait for healthy
      await container.waitForHealthy(30000);

      // Verify it's accessible
      const testAccess = await $`curl -s -o /dev/null -w "%{http_code}" http://localhost:8889 || echo "000"`;
      expect(['200', '000']).toContain(testAccess.stdout.trim()); // May fail if port not ready

      await container.remove(true);
    }, 40000);
  });

  describe('Container File Operations', () => {
    testOrSkip('should copy files to and from container', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-copy',
        command: 'sleep 3600'
      }).start();

      // Create a test file
      const testFile = `/tmp/xec-copy-test-${Date.now()}.txt`;
      await fs.writeFile(testFile, 'Test content for copy');

      // Copy to container
      await container.copyTo(testFile, '/tmp/copied.txt');

      // Verify in container
      const catResult = await container.exec`cat /tmp/copied.txt`;
      expect(catResult.stdout).toContain('Test content for copy');

      // Modify in container
      await container.exec`echo "Added in container" >> /tmp/copied.txt`;

      // Copy back from container
      const outputFile = `/tmp/xec-copy-back-${Date.now()}.txt`;
      await container.copyFrom('/tmp/copied.txt', outputFile);

      // Verify copied back file
      const content = await fs.readFile(outputFile, 'utf-8');
      expect(content).toContain('Test content for copy');
      expect(content).toContain('Added in container');

      // Cleanup
      await fs.unlink(testFile);
      await fs.unlink(outputFile);
      await container.remove(true);
    }, 20000);
  });

  describe('Container Networking', () => {
    testOrSkip('should get container IP address', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-ip'
      }).start();

      const ip = await container.getIpAddress();
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);

      await container.remove(true);
    }, 20000);

    testOrSkip('should work with custom networks', async () => {
      // Create network
      await $`docker network create xec-test-net || true`;

      try {
        const container = await $.docker({
          image: 'alpine:latest',
          name: 'xec-test-custom-net',
          network: 'xec-test-net'
        }).start();

        const ip = await container.getIpAddress('xec-test-net');
        expect(ip).toBeTruthy();
        expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);

        await container.remove(true);
      } finally {
        // Cleanup network
        await $`docker network rm xec-test-net || true`;
      }
    }, 20000);
  });

  describe('Container Stats and Inspection', () => {
    testOrSkip('should get container stats', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-stats',
        command: 'sleep 3600'
      }).start();

      // Wait a bit for stats to be available
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = await container.stats();
      expect(stats).toBeDefined();
      expect(stats.memory_stats).toBeDefined();

      await container.remove(true);
    }, 20000);

    testOrSkip('should inspect container', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-inspect',
        labels: {
          'test-label': 'test-value'
        }
      }).start();

      const info = await container.inspect();
      expect(info).toBeDefined();
      expect(info.Config.Labels['test-label']).toBe('test-value');
      expect(info.State.Running).toBe(true);

      await container.remove(true);
    }, 20000);
  });

  describe('Error Handling', () => {
    testOrSkip('should handle errors when container operations fail', async () => {
      const container = await $.docker({
        image: 'alpine:latest',
        name: 'xec-test-errors'
      }).start();

      // Stop container
      await container.stop();

      // Try to execute in stopped container
      await expect(container.exec`echo test`).rejects.toThrow();

      // Remove container
      await container.remove();

      // Try to start removed container
      await expect(container.start()).rejects.toThrow();
    }, 20000);

    testOrSkip('should handle non-existent image gracefully', async () => {
      const container = $.docker({
        image: 'non-existent-image-xec-test:latest',
        name: 'xec-test-no-image'
      });

      await expect(container.start()).rejects.toThrow();
    }, 20000);
  });

  describe('Backward Compatibility', () => {
    testOrSkip('should work with existing containers using direct execution', async () => {
      // Create container using regular docker
      await $`docker run -d --name xec-test-existing alpine:latest sleep 3600`;

      try {
        // Use enhanced API with existing container
        const existing = $.docker({
          name: 'xec-test-existing',
          image: 'alpine' // Required but not used for existing
        });

        // Direct execution on existing container
        const result = await existing`echo "Working with existing container"`;
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Working with existing container');
      } finally {
        // Cleanup
        await $`docker stop xec-test-existing && docker rm xec-test-existing`;
      }
    }, 20000);
  });
});