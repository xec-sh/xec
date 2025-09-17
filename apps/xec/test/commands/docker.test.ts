import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { $ } from '@xec-sh/core';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';

// Helper to execute xec commands
async function runXecCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await $`node apps/xec/dist/index.js ${args}`;
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.exitCode ?? 1
    };
  }
}

// Check if Docker is available - synchronous check using env var or detection
const SKIP_DOCKER_TESTS = process.env['SKIP_DOCKER_TESTS'] === 'true' || process.env['CI'] === 'true';

// Clean up test containers
async function cleanupTestContainers(prefix: string) {
  try {
    const result = await $`docker ps -aq --filter "name=${prefix}"`.catch(() => ({ stdout: '' }));
    const containers = result.stdout.trim().split('\n').filter(Boolean);

    for (const container of containers) {
      await $`docker rm -f ${container}`.catch(() => { });
    }
  } catch {
    // Ignore errors
  }
}

// Conditionally run Docker tests
const describeDocker = SKIP_DOCKER_TESTS ? describe.skip : describe;

describeDocker('Docker Command', () => {
  const TEST_PREFIX = 'xec-test-docker-';

  beforeAll(async () => {
    await cleanupTestContainers(TEST_PREFIX);
  });

  afterAll(async () => {
    await cleanupTestContainers(TEST_PREFIX);
  });

  describe('docker run', () => {
    it('should run a simple container', async () => {
      const containerName = `${TEST_PREFIX}run-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'run',
        '--name', containerName,
        '--rm',
        'alpine:latest',
        'echo', 'Hello from Alpine'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from Alpine');
    });

    it('should run container with port mapping', async () => {
      const containerName = `${TEST_PREFIX}port-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'run',
        '--name', containerName,
        '-p', '8888:80',
        '-d',
        'nginx:alpine'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(containerName);

      // Clean up
      await $`docker stop ${containerName}`;
      await $`docker rm ${containerName}`;
    });

    it('should run container with environment variables', async () => {
      const containerName = `${TEST_PREFIX}env-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'run',
        '--name', containerName,
        '--rm',
        '-e', 'TEST_VAR=test_value',
        '-e', 'ANOTHER_VAR=another_value',
        'alpine:latest',
        'sh', '-c', 'echo $TEST_VAR $ANOTHER_VAR'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test_value another_value');
    });

    it('should run container with volume mount', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-test-'));
      const testFile = path.join(tmpDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello from host');

      const containerName = `${TEST_PREFIX}volume-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'run',
        '--name', containerName,
        '--rm',
        '-v', `${tmpDir}:/data`,
        'alpine:latest',
        'cat', '/data/test.txt'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from host');

      // Clean up
      await fs.rm(tmpDir, { recursive: true });
    });

    it('should handle run command errors', async () => {
      const result = await runXecCommand([
        'docker', 'run',
        'non-existent-image:latest',
        'echo', 'test'
      ]);

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('docker exec', () => {
    let testContainerName: string;

    beforeAll(async () => {
      testContainerName = `${TEST_PREFIX}exec-${Date.now()}`;
      // Start a long-running container for exec tests
      await $`docker run -d --name ${testContainerName} alpine:latest sleep 300`;
    });

    afterAll(async () => {
      await $`docker rm -f ${testContainerName}`.catch(() => { });
    });

    it('should execute command in running container', async () => {
      const result = await runXecCommand([
        'docker', 'exec',
        testContainerName,
        'echo', 'Hello from exec'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from exec');
    });

    it('should execute command with working directory', async () => {
      const result = await runXecCommand([
        'docker', 'exec',
        '-w', '/tmp',
        testContainerName,
        'pwd'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('/tmp');
    });

    it('should handle exec command errors', async () => {
      const result = await runXecCommand([
        'docker', 'exec',
        'non-existent-container',
        'echo', 'test'
      ]);

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('docker stop', () => {
    it('should stop a running container', async () => {
      const containerName = `${TEST_PREFIX}stop-${Date.now()}`;

      // Start a container
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      // Stop it
      const result = await runXecCommand([
        'docker', 'stop', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(containerName);

      // Clean up
      await $`docker rm ${containerName}`;
    });

    it('should stop container with timeout', async () => {
      const containerName = `${TEST_PREFIX}stop-timeout-${Date.now()}`;

      // Start a container
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      // Stop it with timeout
      const result = await runXecCommand([
        'docker', 'stop',
        '-t', '5',
        containerName
      ]);

      expect(result.exitCode).toBe(0);

      // Clean up
      await $`docker rm ${containerName}`;
    });
  });

  describe('docker rm', () => {
    it('should remove a stopped container', async () => {
      const containerName = `${TEST_PREFIX}rm-${Date.now()}`;

      // Create and stop a container
      await $`docker create --name ${containerName} alpine:latest`;

      // Remove it
      const result = await runXecCommand([
        'docker', 'rm', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(containerName);
    });

    it('should force remove a running container', async () => {
      const containerName = `${TEST_PREFIX}rm-force-${Date.now()}`;

      // Start a container
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      // Force remove it
      const result = await runXecCommand([
        'docker', 'rm', '-f', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(containerName);
    });
  });

  describe('docker logs', () => {
    it('should show container logs', async () => {
      const containerName = `${TEST_PREFIX}logs-${Date.now()}`;

      // Run a container that produces output
      await $`docker run -d --name ${containerName} alpine:latest sh -c "echo 'Log line 1' && echo 'Log line 2' && sleep 300"`;

      // Wait a bit for logs
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get logs
      const result = await runXecCommand([
        'docker', 'logs', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Log line 1');
      expect(result.stdout).toContain('Log line 2');

      // Clean up
      await $`docker rm -f ${containerName}`;
    });

    it('should follow container logs', async () => {
      const containerName = `${TEST_PREFIX}logs-follow-${Date.now()}`;

      // Run a container that produces output
      await $`docker run -d --name ${containerName} alpine:latest sh -c "for i in 1 2 3; do echo Line-\$i; sleep 0.5; done"`;

      // Get logs with follow (but timeout quickly)
      const result = await runXecCommand([
        'docker', 'logs',
        '--tail', '10',
        containerName
      ]);

      expect(result.exitCode).toBe(0);

      // Clean up
      await $`docker rm -f ${containerName}`;
    });
  });

  describe('docker ps', () => {
    it('should list running containers', async () => {
      const containerName = `${TEST_PREFIX}ps-${Date.now()}`;

      // Start a container
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      // List containers
      const result = await runXecCommand(['docker', 'ps']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(containerName);

      // Clean up
      await $`docker rm -f ${containerName}`;
    });

    it('should list all containers including stopped', async () => {
      const containerName = `${TEST_PREFIX}ps-all-${Date.now()}`;

      // Create a stopped container
      await $`docker create --name ${containerName} alpine:latest`;

      // List all containers
      const result = await runXecCommand(['docker', 'ps', '-a']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(containerName);

      // Clean up
      await $`docker rm ${containerName}`;
    });
  });

  describe('docker images', () => {
    it('should list docker images', async () => {
      // Ensure we have at least alpine image
      await $`docker pull alpine:latest`;

      const result = await runXecCommand(['docker', 'images']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('alpine');
    });

    it('should filter images', async () => {
      const result = await runXecCommand([
        'docker', 'images',
        '--filter', 'reference=alpine'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('alpine');
    });
  });

  describe('docker pull', () => {
    it('should pull an image', async () => {
      // Pull a small image
      const result = await runXecCommand([
        'docker', 'pull', 'alpine:3.18'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/pull|download|complete|exist/);
    });

    it('should pull with platform specified', async () => {
      const result = await runXecCommand([
        'docker', 'pull',
        '--platform', 'linux/amd64',
        'alpine:3.18'
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('docker build', () => {
    it('should build an image from Dockerfile', async () => {
      // Create a temporary directory with Dockerfile
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-docker-build-'));
      const dockerfilePath = path.join(tmpDir, 'Dockerfile');

      await fs.writeFile(dockerfilePath, `
FROM alpine:latest
RUN echo "Building test image"
CMD ["echo", "Hello from built image"]
`);

      const imageName = `${TEST_PREFIX}build-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'build',
        '-t', imageName,
        '-f', dockerfilePath,
        tmpDir
      ]);

      expect(result.exitCode).toBe(0);

      // Test the built image
      const runResult = await $`docker run --rm ${imageName}`;
      expect(runResult.stdout).toContain('Hello from built image');

      // Clean up
      await $`docker rmi ${imageName}`;
      await fs.rm(tmpDir, { recursive: true });
    });

    it('should build with build args', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-docker-buildarg-'));
      const dockerfilePath = path.join(tmpDir, 'Dockerfile');

      await fs.writeFile(dockerfilePath, `
FROM alpine:latest
ARG TEST_ARG=default
RUN echo "Build arg: \${TEST_ARG}"
`);

      const imageName = `${TEST_PREFIX}buildarg-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'build',
        '-t', imageName,
        '--build-arg', 'TEST_ARG=custom_value',
        tmpDir
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Build arg: custom_value');

      // Clean up
      await $`docker rmi ${imageName}`;
      await fs.rm(tmpDir, { recursive: true });
    });
  });

  describe('docker service shortcuts', () => {
    describe('redis service', () => {
      it('should start redis service', async () => {
        const containerName = `${TEST_PREFIX}redis-${Date.now()}`;
        const result = await runXecCommand([
          'docker', 'redis',
          '--name', containerName,
          '--port', '16379'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Redis started');

        // Verify container is running
        const psResult = await $`docker ps --filter "name=${containerName}"`;
        expect(psResult.stdout).toContain(containerName);

        // Clean up
        await $`docker rm -f ${containerName}`;
      });
    });

    describe('postgres service', () => {
      it('should start postgres service', async () => {
        const containerName = `${TEST_PREFIX}postgres-${Date.now()}`;
        const result = await runXecCommand([
          'docker', 'postgres',
          '--name', containerName,
          '--port', '15432',
          '--database', 'testdb',
          '--user', 'testuser',
          '--password', 'testpass'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('PostgreSQL started');

        // Clean up
        await $`docker rm -f ${containerName}`;
      });
    });

    describe('mysql service', () => {
      it('should start mysql service', async () => {
        const containerName = `${TEST_PREFIX}mysql-${Date.now()}`;
        const result = await runXecCommand([
          'docker', 'mysql',
          '--name', containerName,
          '--port', '13306',
          '--database', 'testdb',
          '--root-password', 'rootpass'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('MySQL started');

        // Clean up
        await $`docker rm -f ${containerName}`;
      });
    });

    describe('mongodb service', () => {
      it('should start mongodb service', async () => {
        const containerName = `${TEST_PREFIX}mongodb-${Date.now()}`;
        const result = await runXecCommand([
          'docker', 'mongodb',
          '--name', containerName,
          '--port', '17017'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('MongoDB started');

        // Clean up
        await $`docker rm -f ${containerName}`;
      });
    });
  });

  describe('docker network', () => {
    const networkName = `${TEST_PREFIX}network-${Date.now()}`;

    afterAll(async () => {
      await $`docker network rm ${networkName}`.catch(() => { });
    });

    it('should create a network', async () => {
      const result = await runXecCommand([
        'docker', 'network', 'create', networkName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(networkName);
    });

    it('should list networks', async () => {
      const result = await runXecCommand([
        'docker', 'network', 'ls'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bridge');
      expect(result.stdout).toContain('host');
    });

    it('should inspect a network', async () => {
      const result = await runXecCommand([
        'docker', 'network', 'inspect', 'bridge'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"Name": "bridge"');
    });
  });

  describe('docker volume', () => {
    const volumeName = `${TEST_PREFIX}volume-${Date.now()}`;

    afterAll(async () => {
      await $`docker volume rm ${volumeName}`.catch(() => { });
    });

    it('should create a volume', async () => {
      const result = await runXecCommand([
        'docker', 'volume', 'create', volumeName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(volumeName);
    });

    it('should list volumes', async () => {
      const result = await runXecCommand([
        'docker', 'volume', 'ls'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(volumeName);
    });

    it('should inspect a volume', async () => {
      const result = await runXecCommand([
        'docker', 'volume', 'inspect', volumeName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`"Name": "${volumeName}"`);
    });
  });

  describe('docker compose', () => {
    it('should handle compose up command', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-compose-'));
      const composePath = path.join(tmpDir, 'docker-compose.yml');

      await fs.writeFile(composePath, `
version: '3.8'
services:
  test:
    image: alpine:latest
    command: echo "Compose test"
`);

      const result = await runXecCommand([
        'docker', 'compose',
        '-f', composePath,
        'up', '--abort-on-container-exit'
      ]);

      expect(result.exitCode).toBe(0);

      // Clean up
      await fs.rm(tmpDir, { recursive: true });
    });
  });

  describe('docker prune', () => {
    it('should prune stopped containers', async () => {
      // Create and stop a container
      const containerName = `${TEST_PREFIX}prune-${Date.now()}`;
      await $`docker create --name ${containerName} alpine:latest`;

      // Prune
      const result = await runXecCommand([
        'docker', 'prune', 'containers', '-f'
      ]);

      expect(result.exitCode).toBe(0);

      // Verify container is gone
      const psResult = await $`docker ps -a --filter "name=${containerName}" -q`;
      expect(psResult.stdout.trim()).toBe('');
    });
  });

  describe('docker help', () => {
    it('should show main help', async () => {
      const result = await runXecCommand(['docker', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Docker container management');
      expect(result.stdout).toContain('run');
      expect(result.stdout).toContain('exec');
      expect(result.stdout).toContain('stop');
    });

    it('should show subcommand help', async () => {
      const result = await runXecCommand(['docker', 'run', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Run a new container');
    });
  });
});

// Test Docker Fluent API integration
describeDocker('Docker Fluent API Integration', () => {
  const TEST_PREFIX = 'xec-fluent-test-';

  beforeAll(async () => {
    await cleanupTestContainers(TEST_PREFIX);
  });

  afterAll(async () => {
    await cleanupTestContainers(TEST_PREFIX);
  });

  it('should use fluent API for ephemeral containers', async () => {
    const containerName = `${TEST_PREFIX}ephemeral-${Date.now()}`;

    const docker = $.docker();
    const result = await docker
      .ephemeral('alpine:latest')
      .name(containerName)
      .exec`echo "Fluent API test"`;

    expect(result.stdout).toContain('Fluent API test');
    expect(result.exitCode).toBe(0);

    // Container should be auto-removed
    const psResult = await $`docker ps -a --filter "name=${containerName}" -q`;
    expect(psResult.stdout.trim()).toBe('');
  });

  it('should use fluent API with port mapping', async () => {
    const containerName = `${TEST_PREFIX}port-fluent-${Date.now()}`;

    const docker = $.docker();
    const container = docker
      .ephemeral('nginx:alpine')
      .name(containerName)
      .port(8889, 80);

    const info = await container.start();
    expect(info).toHaveProperty('id');
    expect(info).toHaveProperty('name', containerName);

    // Clean up
    await $`docker rm -f ${containerName}`;
  });

  it('should use fluent API for service shortcuts', async () => {
    const containerName = `${TEST_PREFIX}redis-fluent-${Date.now()}`;

    const docker = $.docker();
    const redis = docker.redis({
      name: containerName,
      port: 16380,
      persistent: false
    });

    const info = await redis.start();
    expect(info).toHaveProperty('port', '16380');
    expect(info).toHaveProperty('host');

    // Test connection
    const result = await redis.exec`redis-cli ping`;
    expect(result.stdout.trim()).toBe('PONG');

    // Clean up
    await redis.stop();
  });

  it('should use fluent API for docker build', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-fluent-build-'));
    const dockerfilePath = path.join(tmpDir, 'Dockerfile');

    await fs.writeFile(dockerfilePath, `
FROM alpine:latest
RUN echo "Fluent build test"
`);

    const imageName = `${TEST_PREFIX}fluent-build:latest`;

    const docker = $.docker();
    const builder = docker
      .build(tmpDir)
      .tag(imageName)
      .dockerfile(dockerfilePath);

    const result = await builder.run();
    expect(result.exitCode).toBe(0);

    // Clean up
    await $`docker rmi ${imageName}`;
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should handle container lifecycle', async () => {
    const containerName = `${TEST_PREFIX}lifecycle-${Date.now()}`;

    const docker = $.docker();
    const container = docker
      .container('alpine:latest')
      .name(containerName)
      .command('sleep 300');

    // Start container
    const info = await container.start();
    expect(info).toHaveProperty('id');

    // Execute command
    const execResult = await container.exec`echo "Running"`;
    expect(execResult.stdout).toContain('Running');

    // Get logs
    const logs = await container.logs();
    expect(logs).toBeDefined();

    // Stop container
    await container.stop();

    // Remove container
    await container.remove();

    // Verify removed
    const psResult = await $`docker ps -a --filter "name=${containerName}" -q`;
    expect(psResult.stdout.trim()).toBe('');
  });
});

// Test error handling
describeDocker('Docker Command Error Handling', () => {
  it('should handle invalid image names', async () => {
    const result = await runXecCommand([
      'docker', 'run',
      'invalid/image/name:!@#$%',
      'echo', 'test'
    ]);

    expect(result.exitCode).not.toBe(0);
  });

  it('should handle missing required arguments', async () => {
    const result = await runXecCommand(['docker', 'exec']);

    expect(result.exitCode).not.toBe(0);
  });

  it('should handle non-existent containers', async () => {
    const result = await runXecCommand([
      'docker', 'stop', 'non-existent-container-xyz'
    ]);

    expect(result.exitCode).not.toBe(0);
  });

  it('should handle build failures', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-build-fail-'));
    const dockerfilePath = path.join(tmpDir, 'Dockerfile');

    // Invalid Dockerfile
    await fs.writeFile(dockerfilePath, `
FROM non-existent-base-image:latest
RUN invalid-command
`);

    const result = await runXecCommand([
      'docker', 'build',
      '-t', 'test-fail',
      tmpDir
    ]);

    expect(result.exitCode).not.toBe(0);

    // Clean up
    await fs.rm(tmpDir, { recursive: true });
  });
});

describeDocker('Docker Service Commands', () => {
  it('should list available services', async () => {
    const result = await runXecCommand(['docker', 'service', 'list']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Redis');
    expect(result.stdout).toContain('Redis Cluster');
    expect(result.stdout).toContain('PostgreSQL');
    expect(result.stdout).toContain('MySQL');
    expect(result.stdout).toContain('MongoDB');
    expect(result.stdout).toContain('Kafka');
    expect(result.stdout).toContain('RabbitMQ');
    expect(result.stdout).toContain('SSH');
  });

  it('should show help for specific service', async () => {
    const result = await runXecCommand(['docker', 'service', 'redis', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--port');
    expect(result.stdout).toContain('--password');
    expect(result.stdout).toContain('--persistent');
  });

  it('should start Redis service with dry-run', async () => {
    const result = await runXecCommand(['docker', 'service', 'redis', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[DRY RUN]');
    expect(result.stdout).toContain('Would start Redis');
  });

  it('should start Redis cluster with dry-run', async () => {
    const result = await runXecCommand(['docker', 'service', 'redis-cluster', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[DRY RUN]');
    expect(result.stdout).toContain('Would start Redis Cluster');
  });
});