import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';

import { $ } from '../../src/index.js';
import { DockerAdapter } from '../../../src/adapters/docker/index.js';

// Skip if Docker is not available
const DOCKER_AVAILABLE = await (async () => {
  try {
    // Set up PATH with Docker location
    if (!process.env['PATH']?.includes('/usr/local/bin')) {
      process.env['PATH'] = `${process.env['PATH']}:/usr/local/bin`;
    }
    const adapter = new DockerAdapter();
    return await adapter.isAvailable();
  } catch {
    return false;
  }
})();

const describeIfDocker = DOCKER_AVAILABLE ? describe : describe.skip;

describeIfDocker('DockerAdapter Integration Tests', () => {
  let adapter: DockerAdapter;
  const TEST_IMAGE = 'alpine:latest';
  const TEST_CONTAINER = `xec-test-${Date.now()}`;

  beforeAll(async () => {
    adapter = new DockerAdapter();

    // Pull test image if needed
    console.log(`Preparing test container ${TEST_CONTAINER}...`);
    await $`docker pull ${TEST_IMAGE}`.nothrow();

    // Create and start test container with a command that keeps it running
    await $`docker run -d --name ${TEST_CONTAINER} -it ${TEST_IMAGE} sh -c "while true; do sleep 3600; done"`.nothrow();
  });

  afterAll(async () => {
    // Cleanup
    console.log(`Cleaning up test container ${TEST_CONTAINER}...`);
    await $`docker rm -f ${TEST_CONTAINER}`.nothrow();
    await adapter.dispose();
  });

  describe('Basic Operations', () => {
    it('should execute simple command', async () => {
      const result = await adapter.execute({
        command: 'echo',
        args: ['Hello from Docker'],
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('Hello from Docker');
      expect(result.adapter).toBe('docker');
      expect(result.container).toBe(TEST_CONTAINER);
    });

    it('should execute command with shell', async () => {
      const result = await adapter.execute({
        command: 'echo $((2 + 2))',
        shell: true,
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('4');
    });

    it('should handle command failure', async () => {
      const result = await adapter.execute({
        command: 'false',
        nothrow: true,
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      expect(result.exitCode).toBe(1);
    });

    it('should capture stderr', async () => {
      const result = await adapter.execute({
        command: 'sh',
        args: ['-c', 'echo "error" >&2'],
        shell: false,
        nothrow: true,
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      // Debug output
      if (result.stderr.trim() !== 'error') {
        console.log('Stderr test failed:');
        console.log('stdout:', result.stdout);
        console.log('stderr:', result.stderr);
        console.log('exitCode:', result.exitCode);
      }

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe('error');
    });
  });

  describe('Environment and Working Directory', () => {
    it('should set environment variables', async () => {
      const result = await adapter.execute({
        command: 'sh',
        args: ['-c', 'echo "$VAR1 $VAR2"'],
        shell: false,
        env: { VAR1: 'hello', VAR2: 'world' },
        nothrow: true,
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      // Debug output
      if (result.stdout.trim() !== 'hello world') {
        console.log('Environment variables test failed:');
        console.log('stdout:', result.stdout);
        console.log('stderr:', result.stderr);
        console.log('exitCode:', result.exitCode);
      }

      expect(result.stdout.trim()).toBe('hello world');
    });

    it('should use working directory', async () => {
      const result = await adapter.execute({
        command: 'pwd',
        adapterOptions: {
          type: 'docker',
          container: TEST_CONTAINER,
          workdir: '/tmp'
        }
      });

      expect(result.stdout.trim()).toBe('/tmp');
    });

    it('should run as different user', async () => {
      const result = await adapter.execute({
        command: 'whoami',
        adapterOptions: {
          type: 'docker',
          container: TEST_CONTAINER,
          user: 'nobody'
        }
      });

      expect(result.stdout.trim()).toBe('nobody');
    });
  });

  describe('stdin handling', () => {
    it('should pass string stdin', async () => {
      const result = await adapter.execute({
        command: 'cat',
        stdin: 'Hello stdin',
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      expect(result.stdout).toBe('Hello stdin');
    });

    it('should pass Buffer stdin', async () => {
      const result = await adapter.execute({
        command: 'cat',
        stdin: Buffer.from('Buffer input'),
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      expect(result.stdout).toBe('Buffer input');
    });

    it('should handle multiline stdin', async () => {
      const input = 'line1\nline2\nline3\n';
      const result = await adapter.execute({
        command: 'wc',
        args: ['-l'],
        stdin: input,
        adapterOptions: { type: 'docker', container: TEST_CONTAINER }
      });

      expect(result.stdout.trim()).toBe('3');
    });
  });

  describe('Container Management', () => {
    it('should list containers', async () => {
      const containers = await adapter.listContainers();
      expect(containers).toBeInstanceOf(Array);
      expect(containers).toContain(TEST_CONTAINER);
    });

    it('should create and remove container', async () => {
      const tempContainer = `ush-temp-${Date.now()}`;

      await adapter.createContainer({
        name: tempContainer,
        image: TEST_IMAGE
      });

      // Verify it exists
      const containers = await adapter.listContainers(true);
      expect(containers).toContain(tempContainer);

      // Remove it
      await adapter.removeContainer(tempContainer);

      // Verify it's gone
      const containersAfter = await adapter.listContainers(true);
      expect(containersAfter).not.toContain(tempContainer);
    });

    it('should start and stop container', async () => {
      const tempContainer = `ush-temp-${Date.now()}`;

      try {
        // Create an interactive container with sh
        await $`docker create --name ${tempContainer} -it ${TEST_IMAGE} sh`;

        // Start it
        await adapter.startContainer(tempContainer);

        // Execute command to verify it's running
        const result = await adapter.execute({
          command: 'echo',
          args: ['running'],
          nothrow: true,
          adapterOptions: { type: 'docker', container: tempContainer }
        });
        expect(result.stdout.trim()).toBe('running');

        // Stop it
        await adapter.stopContainer(tempContainer);
      } finally {
        // Clean up
        await adapter.removeContainer(tempContainer, true);
      }
    });
  });

  describe('Auto-create functionality', () => {
    it('should auto-create container if enabled', async () => {
      const autoAdapter = new DockerAdapter({
        autoCreate: {
          enabled: true,
          image: TEST_IMAGE,
          autoRemove: true
        }
      });

      const nonExistentContainer = `non-existent-${Date.now()}`;

      const result = await autoAdapter.execute({
        command: 'echo',
        args: ['auto created'],
        adapterOptions: { type: 'docker', container: nonExistentContainer }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('auto created');

      // Cleanup should happen automatically
      await autoAdapter.dispose();

      // Verify temp container was removed
      const containers = await adapter.listContainers(true);
      const tempContainers = containers.filter(c => c.startsWith('temp-ush-'));
      expect(tempContainers).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent container', async () => {
      const result = await adapter.execute({
        command: 'echo',
        args: ['test'],
        nothrow: true,
        adapterOptions: { type: 'docker', container: 'non-existent-container' }
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('No such container');
    });

    it('should handle invalid image when creating container', async () => {
      await expect(
        adapter.createContainer({
          name: 'invalid-test',
          image: 'non-existent-image:latest'
        })
      ).rejects.toThrow();
    });

    it('should timeout long running commands', async () => {
      await expect(
        adapter.execute({
          command: 'sleep',
          args: ['10'],
          timeout: 100,
          adapterOptions: { type: 'docker', container: TEST_CONTAINER }
        })
      ).rejects.toThrow(/timed out/);
    }, 2000);
  });

  describe('$ helper integration', () => {
    it('should work with $ helper', async () => {
      const $docker = $.docker({ container: TEST_CONTAINER });

      const result = await $docker`echo "Hello from $ helper"`;
      expect(result.stdout.trim()).toBe('Hello from $ helper');
      expect(result.container).toBe(TEST_CONTAINER);
    });

    it('should chain with other helpers', async () => {
      const $docker = $.docker({ container: TEST_CONTAINER })
        .env({ TEST: 'value' });

      const result = await $docker`sh -c 'echo $TEST && cd /tmp && pwd'`;
      const lines = result.stdout.trim().split('\n');
      expect(lines[0]).toBe('value');
      expect(lines[1]).toBe('/tmp');
    });

    it('should work with retry', async () => {
      const attempt = 0;
      const $docker = $.docker({ container: TEST_CONTAINER })
        .retry({ maxRetries: 2 });

      // This simulates a flaky command
      const result = await $docker`sh -c 'if [ ! -f /tmp/retry-test ]; then touch /tmp/retry-test && exit 1; else echo "success"; fi'`.nothrow();

      expect(result.stdout.trim()).toBe('success');
    });
  });
});

describe('DockerAdapter Advanced Features', () => {
  let adapter: DockerAdapter;

  beforeAll(() => {
    adapter = new DockerAdapter();
  });

  afterAll(async () => {
    await adapter.dispose();
  });

  describeIfDocker('Volume and Port Mapping', () => {
    it('should create container with volume mapping', async () => {
      const containerName = `volume-test-${Date.now()}`;
      const testFile = `test-${Date.now()}.txt`;
      const hostPath = `/tmp/${testFile}`;
      const containerPath = '/data';

      try {
        // Write test file on host first
        await $`echo "test content" > ${hostPath}`;

        // Create container with proper interactive flags
        await $`docker create --name ${containerName} -it -v /tmp:/data alpine:latest sh`;
        await adapter.startContainer(containerName);

        // Read file from container
        const result = await adapter.execute({
          command: 'cat',
          args: [`${containerPath}/${testFile}`],
          nothrow: true,
          adapterOptions: { type: 'docker', container: containerName }
        });

        expect(result.stdout.trim()).toBe('test content');
      } finally {
        // Cleanup
        await $`rm -f ${hostPath}`.nothrow();
        await adapter.removeContainer(containerName, true);
      }
    });

    it('should create container with port mapping', async () => {
      const containerName = `port-test-${Date.now()}`;

      await adapter.createContainer({
        name: containerName,
        image: 'alpine:latest',
        ports: ['8080:80']
      });

      // Verify container was created with port mapping
      const inspectResult = await $`docker inspect ${containerName} --format '{{json .HostConfig.PortBindings}}'`;
      expect(inspectResult.stdout).toContain('8080');
      expect(inspectResult.stdout).toContain('80');

      // Cleanup
      await adapter.removeContainer(containerName, true);
    });
  });

  describeIfDocker('Multiple Container Scenario', () => {
    it('should handle operations on multiple containers', async () => {
      const containers = [
        `multi-test-1-${Date.now()}`,
        `multi-test-2-${Date.now()}`,
        `multi-test-3-${Date.now()}`
      ];

      try {
        // Create all containers with interactive mode
        await Promise.all(
          containers.map(name =>
            $`docker create --name ${name} -it alpine:latest sh`
          )
        );

        // Start all containers
        await Promise.all(
          containers.map(name => adapter.startContainer(name))
        );

        // Execute commands in parallel
        const results = await Promise.all(
          containers.map((name, i) =>
            adapter.execute({
              command: 'echo',
              args: [`Hello from container ${i + 1}`],
              nothrow: true,
              adapterOptions: { type: 'docker', container: name }
            })
          )
        );

        results.forEach((result, i) => {
          expect(result.stdout.trim()).toBe(`Hello from container ${i + 1}`);
        });
      } finally {
        // Cleanup all containers
        await Promise.all(
          containers.map(name => adapter.removeContainer(name, true))
        );
      }
    });
  });
});