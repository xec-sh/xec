import { afterAll, describe, beforeAll } from '@jest/globals';

import { dockerManager, ContainerConfig, DOCKER_CONTAINERS } from '../docker/container-manager';

export interface SSHTestConfig {
  containers?: string[]; // Specific containers to start, or all if not specified
  timeout?: number; // Timeout for container operations
  skipIfNoDocker?: boolean; // Skip tests if Docker is not available
}

/**
 * Wrapper for SSH test suites that automatically manages Docker containers
 */
export function describeSSH(
  name: string, 
  fn: () => void, 
  config: SSHTestConfig = {}
): void {
  const {
    containers = DOCKER_CONTAINERS.map(c => c.name),
    timeout = 120000,
    skipIfNoDocker = true
  } = config;

  // Check if we should skip
  const shouldSkip = dockerManager.shouldSkipSSHTests() || 
    (skipIfNoDocker && !dockerManager.isDockerAvailable());

  const describeFn = shouldSkip ? describe.skip : describe;

  describeFn(name, () => {
    let containersStarted = false;

    beforeAll(async () => {
      if (!dockerManager.isDockerAvailable()) {
        console.warn('Docker is not available, SSH tests will be skipped');
        return;
      }

      console.log(`Starting Docker containers for ${name}...`);
      
      // Start only the specified containers
      containersStarted = true;
      for (const containerName of containers) {
        const started = await dockerManager.startContainer(containerName);
        if (!started) {
          containersStarted = false;
          console.error(`Failed to start container ${containerName}`);
        }
      }

      if (!containersStarted) {
        throw new Error('Failed to start required Docker containers');
      }

      // Wait a bit for SSH to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
    }, timeout);

    afterAll(async () => {
      if (containersStarted) {
        console.log(`Cleaning up Docker containers for ${name}...`);
        
        // Only stop the containers we started
        for (const containerName of containers) {
          await dockerManager.stopContainer(containerName);
        }
      }
    }, timeout / 2);

    // Run the test suite
    fn();
  });
}

/**
 * Helper to get SSH configuration for a specific container
 */
export function getSSHConfig(containerName: string) {
  const container = DOCKER_CONTAINERS.find(c => c.name === containerName);
  if (!container) {
    throw new Error(`Unknown container: ${containerName}`);
  }

  return {
    host: 'localhost',
    port: container.port,
    username: 'user',
    password: 'password',
    connectTimeout: 30000,
    readyTimeout: 30000
  };
}

/**
 * Helper to get all available containers
 */
export function getAvailableContainers(): ContainerConfig[] {
  return DOCKER_CONTAINERS;
}

/**
 * Run a test for each package manager
 */
export function testEachPackageManager(
  testName: string,
  testFn: (container: ContainerConfig) => Promise<void> | void
): void {
  DOCKER_CONTAINERS.forEach(container => {
    it(`${testName} (${container.packageManager} on ${container.name})`, async () => {
      await testFn(container);
    });
  });
}

testEachPackageManager.only = function(
  testName: string,
  testFn: (container: ContainerConfig) => Promise<void> | void
): void {
  DOCKER_CONTAINERS.forEach(container => {
    it.only(`${testName} (${container.packageManager} on ${container.name})`, async () => {
      await testFn(container);
    });
  });
};

testEachPackageManager.skip = function(
  testName: string,
  testFn: (container: ContainerConfig) => Promise<void> | void
): void {
  DOCKER_CONTAINERS.forEach(container => {
    it.skip(`${testName} (${container.packageManager} on ${container.name})`, async () => {
      await testFn(container);
    });
  });
};

/**
 * Skip test if running in CI with limited resources
 */
export function skipInCI(fn: () => void): void {
  if (process.env['CI']) {
    it.skip('Skipped in CI', fn);
  } else {
    fn();
  }
}

/**
 * Run test only for specific package managers
 */
export function testPackageManagers(
  packageManagers: string[],
  testName: string,
  testFn: (container: ContainerConfig) => Promise<void> | void
): void {
  const containers = DOCKER_CONTAINERS.filter(c => 
    packageManagers.includes(c.packageManager)
  );

  containers.forEach(container => {
    it(`${testName} (${container.packageManager})`, async () => {
      await testFn(container);
    });
  });
}

/**
 * Helper to wait for container to be ready
 */
export async function waitForContainer(containerName: string, maxWait = 30000): Promise<boolean> {
  const container = DOCKER_CONTAINERS.find(c => c.name === containerName);
  if (!container) {
    throw new Error(`Unknown container: ${containerName}`);
  }

  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    if (dockerManager.isContainerRunning(containerName)) {
      // Also check SSH connectivity
      const sshReady = await dockerManager.waitForSSH(container.port, 1);
      if (sshReady) {
        return true;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return false;
}