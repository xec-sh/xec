import { test, expect, describe, afterAll, beforeAll } from '@jest/globals';

import { $ } from '../../src/index.js';
import { withTempDir } from '../../src/utils/temp.js';

// Skip these tests if Docker is not available
const hasDocker = await $`which docker`.quiet().then(r => r.ok).catch(() => false);

const describeIfDocker = hasDocker ? describe : describe.skip;

describeIfDocker('Docker Simplified API Integration Tests', () => {
  // Ensure we have a test image
  beforeAll(async () => {
    await $`docker pull alpine:latest`.quiet();
    await $`docker pull node:18-alpine`.quiet();
  });

  // Cleanup any test containers
  afterAll(async () => {
    await $`docker ps -aq --filter "name=xec-" | xargs -r docker rm -f`.quiet().nothrow();
    await $`docker ps -aq --filter "name=test-" | xargs -r docker rm -f`.quiet().nothrow();
  });

  describe('Simplified API', () => {
    test('should run ephemeral container with image option', async () => {
      const result = await $.docker({
        image: 'alpine:latest'
      })`echo "Hello from ephemeral"`;

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe('Hello from ephemeral');
    });

    test('should pass volumes to ephemeral container', async () => {
      await withTempDir(async (tempDir) => {
        // Create a test file
        await $`echo "test content" > ${tempDir.path}/test.txt`;

        const result = await $.docker({
          image: 'alpine:latest',
          volumes: [`${tempDir.path}:/data`]
        })`cat /data/test.txt`;

        expect(result.ok).toBe(true);
        expect(result.stdout.trim()).toBe('test content');
      });
    });

    test('should execute in existing container', async () => {
      // Create a test container
      const containerName = `test-container-${Date.now()}`;
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      try {
        const result = await $.docker({
          container: containerName,
          workdir: '/tmp'
        })`pwd`;

        expect(result.ok).toBe(true);
        expect(result.stdout.trim()).toBe('/tmp');
      } finally {
        await $`docker rm -f ${containerName}`.quiet();
      }
    });

    test('should pass environment variables', async () => {
      const result = await $.docker({
        image: 'alpine:latest',
        env: {
          MY_VAR: 'test-value',
          ANOTHER: 'another-value'
        }
      })`echo "MY_VAR=$MY_VAR ANOTHER=$ANOTHER"`;

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe('MY_VAR=test-value ANOTHER=another-value');
    });

    test('should set working directory', async () => {
      const result = await $.docker({
        image: 'alpine:latest',
        workdir: '/usr/local'
      })`pwd`;

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe('/usr/local');
    });

    test('should run as specific user', async () => {
      const result = await $.docker({
        image: 'alpine:latest',
        user: 'nobody'
      })`id -un`;

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe('nobody');
    });
  });

  describe('Fluent API', () => {
    test('should run ephemeral container with fluent API', async () => {
      const result = await $.docker()
        .ephemeral('alpine:latest')
        .run`echo "Hello from fluent API"`;

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe('Hello from fluent API');
    });

    test('should chain multiple options', async () => {
      await withTempDir(async (tempDir) => {
        const result = await $.docker()
          .ephemeral('alpine:latest')
          .volumes([`${tempDir.path}:/data`])
          .workdir('/data')
          .user('nobody')
          .env({ TEST: 'value' })
          .run`echo "$TEST" > test.txt && cat test.txt && pwd && id -un`;

        expect(result.ok).toBe(true);
        const lines = result.stdout.trim().split('\n');
        expect(lines[0]).toBe('value');
        expect(lines[1]).toBe('/data');
        expect(lines[2]).toBe('nobody');
      });
    });

    test('should execute in existing container with fluent API', async () => {
      const containerName = `test-fluent-${Date.now()}`;
      await $`docker run -d --name ${containerName} -w /app alpine:latest sleep 300`;

      try {
        const result = await $.docker()
          .container(containerName)
          .workdir('/tmp')
          .exec`pwd`;

        expect(result.ok).toBe(true);
        expect(result.stdout.trim()).toBe('/tmp');
      } finally {
        await $`docker rm -f ${containerName}`.quiet();
      }
    });

    test('exec should work as alias for run', async () => {
      const result = await $.docker()
        .ephemeral('alpine:latest')
        .exec`echo "Using exec method"`;

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe('Using exec method');
    });
  });

  describe('Container naming', () => {
    test('should generate unique container names for ephemeral containers', async () => {
      // Run two containers and check their names are different
      const promise1 = $.docker({ image: 'alpine:latest' })`sleep 2`;
      const promise2 = $.docker({ image: 'alpine:latest' })`sleep 2`;

      // Get container names from docker ps while they're running
      const psResult = await $`docker ps --format "{{.Names}}" | grep "^xec-alpine"`;
      const names = psResult.stdout.trim().split('\n').filter(Boolean);

      // Should have at least our containers
      expect(names.length).toBeGreaterThanOrEqual(2);
      
      // Names should be unique
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);

      // Wait for commands to complete
      await Promise.all([promise1, promise2]);
    });
  });

  describe('Error handling', () => {
    test('should handle command failures in ephemeral containers', async () => {
      const result = await $.docker({
        image: 'alpine:latest'
      })`exit 1`.nothrow();

      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    test('should handle missing container error', async () => {
      const result = await $.docker({
        container: 'non-existent-container'
      })`echo test`.nothrow();

      expect(result.ok).toBe(false);
      expect(result.stderr).toContain('No such container');
    });
  });

  describe('Advanced features', () => {
    test('should support privileged mode for ephemeral containers', async () => {
      const result = await $.docker()
        .ephemeral('alpine:latest')
        .privileged()
        .run`ls /dev | head -5`;

      expect(result.ok).toBe(true);
      expect(result.stdout.split('\n').length).toBeGreaterThan(3);
    });

    test('should support network configuration', async () => {
      // Create a custom network
      const networkName = `test-net-${Date.now()}`;
      await $`docker network create ${networkName}`;

      try {
        const result = await $.docker()
          .ephemeral('alpine:latest')
          .network(networkName)
          .run`ip addr show | grep -E "inet.*scope global" || echo "No global IPs"`;

        expect(result.ok).toBe(true);
      } finally {
        await $`docker network rm ${networkName}`.quiet();
      }
    });
  });
});