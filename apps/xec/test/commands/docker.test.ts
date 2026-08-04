import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { $ } from '@xec-sh/core';
import { fileURLToPath } from 'url';

const cliEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/main.js');

// Strip ANSI escapes and spinner control characters from CLI output
function clean(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f]/g, '');
}

// Helper to execute xec commands
async function runXecCommand(args: string[]): Promise<{ stdout: string; stderr: string; output: string; exitCode: number }> {
  const result = await $`node ${cliEntry} ${args}`.nothrow();
  const stdout = clean(result.stdout);
  const stderr = clean(result.stderr);
  return {
    stdout,
    stderr,
    output: `${stdout}\n${stderr}`,
    exitCode: result.exitCode ?? 1
  };
}

// Check if Docker is available - synchronous check using env var or detection
const SKIP_DOCKER_TESTS = process.env['SKIP_DOCKER_TESTS'] === 'true' || process.env['CI'] === 'true';

// Clean up test containers
async function cleanupTestContainers(prefix: string) {
  try {
    const result = await $`docker ps -aq --filter "name=${prefix}"`.nothrow();
    const containers = result.stdout.trim().split('\n').filter(Boolean);

    for (const container of containers) {
      await $`docker rm -f ${container}`.nothrow();
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

  describe('docker container run', () => {
    it('should run a simple container', async () => {
      const containerName = `${TEST_PREFIX}run-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'container', 'run',
        '--name', containerName,
        '--rm',
        'alpine:latest'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Container started successfully');
    }, 60000);

    it('should run a detached container with port mapping', async () => {
      const containerName = `${TEST_PREFIX}port-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'container', 'run',
        '--name', containerName,
        '-p', '18888:80',
        '-d',
        'nginx:alpine'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Container started successfully');
      expect(result.output).toContain(containerName);

      // Verify it is actually running
      const psResult = await $`docker ps --filter ${`name=${containerName}`} --format {{.Names}}`;
      expect(psResult.stdout).toContain(containerName);

      // Clean up
      await $`docker rm -f ${containerName}`.nothrow();
    }, 60000);

    it('should run container with environment variables', async () => {
      // Use a long-running image so the container is still inspectable —
      // ephemeral containers are auto-removed once their command exits.
      const containerName = `${TEST_PREFIX}env-${Date.now()}`;
      // Image first: the variadic --env option would swallow a trailing
      // image argument. Long option: the root CLI intercepts `-e` as --eval.
      const result = await runXecCommand([
        'docker', 'container', 'run',
        'nginx:alpine',
        '--name', containerName,
        '-d',
        '--env', 'TEST_VAR=test_value', 'ANOTHER_VAR=another_value'
      ]);

      expect(result.exitCode).toBe(0);

      // Env vars must have been applied to the created container
      const inspect = await $`docker inspect --format {{.Config.Env}} ${containerName}`;
      expect(inspect.stdout).toContain('TEST_VAR=test_value');
      expect(inspect.stdout).toContain('ANOTHER_VAR=another_value');

      // Clean up
      await $`docker rm -f ${containerName}`.nothrow();
    }, 60000);

    it('should run container with volume mount', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-test-'));
      const testFile = path.join(tmpDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello from host');

      const containerName = `${TEST_PREFIX}volume-${Date.now()}`;
      // Image first (variadic --volumes); long option (`-v` is --verbose)
      const result = await runXecCommand([
        'docker', 'container', 'run',
        'nginx:alpine',
        '--name', containerName,
        '-d',
        '--volumes', `${tmpDir}:/data`
      ]);

      expect(result.exitCode).toBe(0);

      // Volume must have been mounted on the created container
      const inspect = await $`docker inspect --format ${'{{json .Mounts}}'} ${containerName}`;
      expect(inspect.stdout).toContain('/data');

      // Clean up
      await $`docker rm -f ${containerName}`.nothrow();
      await fs.rm(tmpDir, { recursive: true });
    }, 60000);

    it('should handle run command errors', async () => {
      const result = await runXecCommand([
        'docker', 'container', 'run',
        'xec-non-existent-image-xyz:latest'
      ]);

      expect(result.exitCode).not.toBe(0);
    }, 60000);
  });

  describe('docker container exec', () => {
    let testContainerName: string;

    beforeAll(async () => {
      testContainerName = `${TEST_PREFIX}exec-${Date.now()}`;
      // Start a long-running container for exec tests
      await $`docker run -d --name ${testContainerName} alpine:latest sleep 300`;
    });

    afterAll(async () => {
      await $`docker rm -f ${testContainerName}`.nothrow();
    });

    it('should execute command in running container', async () => {
      const result = await runXecCommand([
        'docker', 'container', 'exec',
        testContainerName,
        'echo', 'Hello from exec'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from exec');
    }, 30000);

    it('should execute command with working directory', async () => {
      const result = await runXecCommand([
        'docker', 'container', 'exec',
        '--workdir', '/tmp',
        testContainerName,
        'pwd'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('/tmp');
    }, 30000);

    it('should handle exec command errors', async () => {
      const result = await runXecCommand([
        'docker', 'container', 'exec',
        'xec-non-existent-container',
        'echo', 'test'
      ]);

      expect(result.exitCode).not.toBe(0);
    }, 30000);
  });

  describe('docker container stop', () => {
    it('should stop a running container', async () => {
      const containerName = `${TEST_PREFIX}stop-${Date.now()}`;

      // Start a container
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      // Stop it
      const result = await runXecCommand([
        'docker', 'container', 'stop', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Stopped 1 container(s)');

      // Clean up
      await $`docker rm ${containerName}`.nothrow();
    }, 60000);

    it('should stop container with timeout', async () => {
      const containerName = `${TEST_PREFIX}stop-timeout-${Date.now()}`;

      // Start a container
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      // Stop it with timeout
      const result = await runXecCommand([
        'docker', 'container', 'stop',
        '-t', '5',
        containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Stopped 1 container(s)');

      // Clean up
      await $`docker rm ${containerName}`.nothrow();
    }, 60000);
  });

  describe('docker container rm', () => {
    it('should remove a stopped container', async () => {
      const containerName = `${TEST_PREFIX}rm-${Date.now()}`;

      // Create and stop a container
      await $`docker create --name ${containerName} alpine:latest`;

      // Remove it
      const result = await runXecCommand([
        'docker', 'container', 'rm', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Removed 1 container(s)');
    }, 30000);

    it('should force remove a running container', async () => {
      const containerName = `${TEST_PREFIX}rm-force-${Date.now()}`;

      // Start a container
      await $`docker run -d --name ${containerName} alpine:latest sleep 300`;

      // Force remove it
      const result = await runXecCommand([
        'docker', 'container', 'rm', '-f', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Removed 1 container(s)');
    }, 30000);
  });

  describe('docker container logs', () => {
    it('should show container logs', async () => {
      const containerName = `${TEST_PREFIX}logs-${Date.now()}`;

      // Run a container that produces output
      await $`docker run -d --name ${containerName} alpine:latest sh -c "echo 'Log line 1' && echo 'Log line 2' && sleep 300"`;

      // Wait a bit for logs
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get logs
      const result = await runXecCommand([
        'docker', 'container', 'logs', containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Log line 1');
      expect(result.stdout).toContain('Log line 2');

      // Clean up
      await $`docker rm -f ${containerName}`.nothrow();
    }, 30000);

    it('should show tail of container logs', async () => {
      const containerName = `${TEST_PREFIX}logs-tail-${Date.now()}`;

      // Run a container that produces output
      await $`docker run -d --name ${containerName} alpine:latest sh -c "echo Line-1; echo Line-2; echo Line-3; sleep 300"`;

      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await runXecCommand([
        'docker', 'container', 'logs',
        '--tail', '1',
        containerName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Line-3');
      expect(result.stdout).not.toContain('Line-1');

      // Clean up
      await $`docker rm -f ${containerName}`.nothrow();
    }, 30000);
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
      await $`docker rm -f ${containerName}`.nothrow();
    }, 30000);

    it('should list all containers including stopped', async () => {
      const containerName = `${TEST_PREFIX}ps-all-${Date.now()}`;

      // Create a stopped container
      await $`docker create --name ${containerName} alpine:latest`;

      // List all containers
      const result = await runXecCommand(['docker', 'ps', '-a']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(containerName);

      // Clean up
      await $`docker rm ${containerName}`.nothrow();
    }, 30000);
  });

  describe('docker images', () => {
    it('should list docker images', async () => {
      // Ensure we have at least alpine image (best effort — it is present locally)
      await $`docker pull alpine:latest`.nothrow();

      const result = await runXecCommand(['docker', 'images']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('alpine');
    }, 60000);

    it('should list images via the image subcommand', async () => {
      const result = await runXecCommand(['docker', 'image', 'list']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('alpine');
    }, 30000);
  });

  describe('docker image pull', () => {
    it('should pull an image', async () => {
      const result = await runXecCommand([
        'docker', 'image', 'pull', 'alpine:3.18'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Successfully pulled alpine:3.18');
    }, 120000);
  });

  describe('docker image build', () => {
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
        'docker', 'image', 'build',
        '-t', imageName,
        '-f', dockerfilePath,
        tmpDir
      ]);

      expect(result.exitCode).toBe(0);

      // Test the built image
      const runResult = await $`docker run --rm ${imageName}`;
      expect(runResult.stdout).toContain('Hello from built image');

      // Clean up
      await $`docker rmi ${imageName}`.nothrow();
      await fs.rm(tmpDir, { recursive: true });
    }, 120000);

    it('should build with build args', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-docker-buildarg-'));
      const dockerfilePath = path.join(tmpDir, 'Dockerfile');

      await fs.writeFile(dockerfilePath, `
FROM alpine:latest
ARG TEST_ARG=default
RUN echo "Build arg: \${TEST_ARG}" > /arg.txt
CMD ["cat", "/arg.txt"]
`);

      const imageName = `${TEST_PREFIX}buildarg-${Date.now()}`;
      // Context first: the variadic --build-arg would swallow a trailing path
      const result = await runXecCommand([
        'docker', 'image', 'build',
        tmpDir,
        '-t', imageName,
        '-f', dockerfilePath,
        '--build-arg', 'TEST_ARG=custom_value'
      ]);

      expect(result.exitCode).toBe(0);

      // The build arg must have been applied
      const runResult = await $`docker run --rm ${imageName}`;
      expect(runResult.stdout).toContain('Build arg: custom_value');

      // Clean up
      await $`docker rmi ${imageName}`.nothrow();
      await fs.rm(tmpDir, { recursive: true });
    }, 120000);
  });

  describe('docker service shortcuts', () => {
    it('should start redis service', async () => {
      const containerName = `${TEST_PREFIX}redis-${Date.now()}`;
      const result = await runXecCommand([
        'docker', 'service', 'redis',
        '--name', containerName,
        '--port', '16379'
      ]);

      expect(result.exitCode).toBe(0);

      // Verify container is running
      const psResult = await $`docker ps --filter ${`name=${containerName}`} --format {{.Names}}`;
      expect(psResult.stdout).toContain(containerName);

      // Clean up
      await $`docker rm -f ${containerName}`.nothrow();
    }, 120000);

    // The remaining services use large images; option plumbing is verified
    // through --dry-run without pulling them.
    it('should plan postgres service with dry-run', async () => {
      const result = await runXecCommand([
        'docker', 'service', 'postgres',
        '--port', '15432',
        '--database', 'testdb',
        '--user', 'testuser',
        '--password', 'testpass',
        '--dry-run'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('[DRY RUN]');
      expect(result.output).toContain('15432');
    }, 30000);

    it('should plan mysql service with dry-run', async () => {
      const result = await runXecCommand([
        'docker', 'service', 'mysql',
        '--port', '13306',
        '--database', 'testdb',
        '--password', 'rootpass',
        '--dry-run'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('[DRY RUN]');
      expect(result.output).toContain('13306');
    }, 30000);

    it('should plan mongodb service with dry-run', async () => {
      const result = await runXecCommand([
        'docker', 'service', 'mongodb',
        '--port', '17017',
        '--dry-run'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('[DRY RUN]');
      expect(result.output).toContain('17017');
    }, 30000);
  });

  // NOTE: `network ls`/`network inspect` and `volume ls`/`volume inspect`
  // are no longer part of the CLI — only create/remove are exposed.
  describe('docker network', () => {
    it('should create and remove a network', async () => {
      const networkName = `${TEST_PREFIX}network-${Date.now()}`;

      const result = await runXecCommand([
        'docker', 'network', 'create', networkName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(`Network ${networkName} created`);

      const removeResult = await runXecCommand([
        'docker', 'network', 'rm', networkName
      ]);
      expect(removeResult.exitCode).toBe(0);

      // Verify it is gone
      const lsResult = await $`docker network ls --format {{.Name}}`;
      expect(lsResult.stdout).not.toContain(networkName);
    }, 30000);
  });

  describe('docker volume', () => {
    it('should create and remove a volume', async () => {
      const volumeName = `${TEST_PREFIX}volume-${Date.now()}`;

      const result = await runXecCommand([
        'docker', 'volume', 'create', volumeName
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(`Volume ${volumeName} created`);

      const removeResult = await runXecCommand([
        'docker', 'volume', 'rm', volumeName
      ]);
      expect(removeResult.exitCode).toBe(0);

      // Verify it is gone
      const lsResult = await $`docker volume ls --format {{.Name}}`;
      expect(lsResult.stdout).not.toContain(volumeName);
    }, 30000);
  });

  describe('docker compose', () => {
    it('should handle compose up and down', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-compose-'));
      const composePath = path.join(tmpDir, 'docker-compose.yml');
      const projectName = `xectestcompose${Date.now()}`;

      await fs.writeFile(composePath, `
services:
  test:
    image: alpine:latest
    command: sleep 60
`);

      const upResult = await runXecCommand([
        'docker', 'compose', 'up',
        '-f', composePath,
        '-p', projectName
      ]);

      expect(upResult.exitCode).toBe(0);
      expect(upResult.output).toContain('Services started');

      const downResult = await runXecCommand([
        'docker', 'compose', 'down',
        '-f', composePath,
        '-p', projectName
      ]);
      expect(downResult.exitCode).toBe(0);

      // Clean up
      await fs.rm(tmpDir, { recursive: true });
    }, 120000);
  });

  describe('docker prune', () => {
    it('should prune stopped containers', async () => {
      // Create and stop a container
      const containerName = `${TEST_PREFIX}prune-${Date.now()}`;
      await $`docker create --name ${containerName} alpine:latest`;

      // Prune
      const result = await runXecCommand([
        'docker', 'prune'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Cleanup complete');

      // Verify container is gone
      const psResult = await $`docker ps -a --filter ${`name=${containerName}`} -q`;
      expect(psResult.stdout.trim()).toBe('');
    }, 60000);
  });

  describe('docker help', () => {
    it('should show main help', async () => {
      const result = await runXecCommand(['docker', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Docker management');
      expect(result.output).toContain('container');
      expect(result.output).toContain('image');
      expect(result.output).toContain('service');
    }, 30000);

    it('should show container subcommand help', async () => {
      const result = await runXecCommand(['docker', 'container', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Manage Docker containers');
      expect(result.output).toContain('run');
      expect(result.output).toContain('exec');
      expect(result.output).toContain('stop');
    }, 30000);
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
    const docker = $.docker();
    const result = await docker
      .ephemeral('alpine:latest')
      .exec`echo "Fluent API test"`;

    expect(result.stdout).toContain('Fluent API test');
    expect(result.exitCode).toBe(0);
  }, 60000);

  it('should use fluent API with port mapping', async () => {
    const containerName = `${TEST_PREFIX}port-fluent-${Date.now()}`;

    const docker = $.docker();
    const container = docker
      .ephemeral('nginx:alpine')
      .name(containerName)
      .port(18889, 80);

    await container.start();

    const info = await container.info();
    expect(info).not.toBeNull();
    expect(info).toHaveProperty('id');

    // Clean up
    await $`docker rm -f ${containerName}`.nothrow();
  }, 60000);

  it('should use fluent API for service shortcuts', async () => {
    const containerName = `${TEST_PREFIX}redis-fluent-${Date.now()}`;

    const docker = $.docker();
    const redis = docker.redis({
      name: containerName,
      port: 16380,
      persistent: false
    });

    await redis.start();

    // Test connection through the running service
    const result = await redis.exec`redis-cli ping`;
    expect(result.stdout.trim()).toBe('PONG');

    // Clean up
    await redis.stop();
    await $`docker rm -f ${containerName}`.nothrow();
  }, 120000);

  it('should use fluent API for docker build', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-fluent-build-'));
    const dockerfilePath = path.join(tmpDir, 'Dockerfile');

    await fs.writeFile(dockerfilePath, `
FROM alpine:latest
RUN echo "Fluent build test"
`);

    const imageName = `${TEST_PREFIX}fluent-build:latest`;

    const docker = $.docker();
    const built = await docker
      .build(tmpDir)
      .tag(imageName)
      .dockerfile(dockerfilePath)
      .execute();

    expect(built).toBe(imageName);

    // The image must exist
    const imagesResult = await $`docker images --format {{.Repository}}:{{.Tag}}`;
    expect(imagesResult.stdout).toContain(imageName);

    // Clean up
    await $`docker rmi ${imageName}`.nothrow();
    await fs.rm(tmpDir, { recursive: true });
  }, 120000);

  it('should handle container lifecycle', async () => {
    const containerName = `${TEST_PREFIX}lifecycle-${Date.now()}`;

    // Create a running container, then drive it through the persistent API
    await $`docker run -d --name ${containerName} alpine:latest sh -c "echo lifecycle-start && sleep 300"`;

    const docker = $.docker();
    const container = docker.container(containerName);

    expect(await container.isRunning()).toBe(true);

    // Execute command
    const execResult = await container.exec`echo "Running"`;
    expect(execResult.stdout).toContain('Running');

    // Get logs
    const logs = await container.logs();
    expect(logs).toContain('lifecycle-start');

    // Stop container
    await container.stop();
    expect(await container.isRunning()).toBe(false);

    // Remove container
    await container.remove();

    // Verify removed
    const psResult = await $`docker ps -a --filter ${`name=${containerName}`} -q`;
    expect(psResult.stdout.trim()).toBe('');
  }, 120000);
});

// Test error handling
describeDocker('Docker Command Error Handling', () => {
  it('should handle invalid image names', async () => {
    const result = await runXecCommand([
      'docker', 'container', 'run',
      'invalid/image/name:!@#$%'
    ]);

    expect(result.exitCode).not.toBe(0);
  }, 60000);

  it('should handle missing required arguments', async () => {
    const result = await runXecCommand(['docker', 'container', 'exec']);

    expect(result.exitCode).not.toBe(0);
  }, 30000);

  it('should handle non-existent containers', async () => {
    const result = await runXecCommand([
      'docker', 'container', 'stop', 'xec-non-existent-container-xyz'
    ]);

    expect(result.exitCode).not.toBe(0);
  }, 30000);

  it('should handle build failures', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-build-fail-'));
    const dockerfilePath = path.join(tmpDir, 'Dockerfile');

    // Invalid Dockerfile
    await fs.writeFile(dockerfilePath, `
FROM xec-non-existent-base-image:latest
RUN invalid-command
`);

    const result = await runXecCommand([
      'docker', 'image', 'build',
      '-t', 'xec-test-build-fail',
      tmpDir
    ]);

    expect(result.exitCode).not.toBe(0);

    // Clean up
    await fs.rm(tmpDir, { recursive: true });
  }, 120000);
});

describeDocker('Docker Service Commands', () => {
  it('should list available services', async () => {
    const result = await runXecCommand(['docker', 'service', 'list']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Redis');
    expect(result.output).toContain('Redis Cluster');
    expect(result.output).toContain('PostgreSQL');
    expect(result.output).toContain('MySQL');
    expect(result.output).toContain('MongoDB');
    expect(result.output).toContain('Kafka');
    expect(result.output).toContain('RabbitMQ');
    expect(result.output).toContain('SSH');
  }, 30000);

  it('should show help for specific service', async () => {
    const result = await runXecCommand(['docker', 'service', 'redis', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('--port');
    expect(result.output).toContain('--password');
    expect(result.output).toContain('--persistent');
  }, 30000);

  it('should start Redis service with dry-run', async () => {
    const result = await runXecCommand(['docker', 'service', 'redis', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('[DRY RUN]');
    expect(result.output).toContain('6379');
  }, 30000);

  it('should start Redis cluster with dry-run', async () => {
    const result = await runXecCommand(['docker', 'service', 'redis-cluster', '--dry-run']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('[DRY RUN]');
  }, 30000);
});
