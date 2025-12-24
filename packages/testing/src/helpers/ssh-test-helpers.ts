import { afterAll, describe, beforeAll } from '@jest/globals';

import { dockerManager, ContainerConfig, DOCKER_CONTAINERS } from '../docker/container-manager.js';
import { isDockerAvailable, isSshpassAvailable } from '../utils/binary-detector.js';

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
    containers = ['ubuntu-apt'], // Default to just one container for faster tests
    timeout = 180000, // 3 minutes timeout
    skipIfNoDocker = true
  } = config;

  // Check if we should skip
  const shouldSkip = dockerManager.shouldSkipSSHTests() ||
    (skipIfNoDocker && !dockerManager.isDockerAvailable());

  const describeFn = shouldSkip ? describe.skip : describe;

  describeFn(name, () => {
    let containersStarted = false;
    let startedContainersList: string[] = [];

    beforeAll(async () => {
      if (!dockerManager.isDockerAvailable()) {
        console.warn('Docker is not available, SSH tests will be skipped');
        return;
      }

      console.log(`Starting Docker containers for ${name}...`);

      // Start only the specified containers
      containersStarted = true;
      startedContainersList = [];

      for (const containerName of containers) {
        try {
          // Check if container is already running (from another test)
          if (dockerManager.isContainerRunning(containerName)) {
            console.log(`Container ${containerName} is already running, reusing`);
            startedContainersList.push(containerName);
            continue;
          }

          const started = await dockerManager.startContainer(containerName);
          if (started) {
            startedContainersList.push(containerName);
          } else {
            console.warn(`Failed to start container ${containerName}, continuing...`);
          }
        } catch (error) {
          console.warn(`Error starting container ${containerName}:`, error);
        }
      }

      if (startedContainersList.length === 0) {
        containersStarted = false;
        throw new Error('Failed to start any required Docker containers');
      }

      // Wait for SSH to be fully ready on all started containers
      for (const containerName of startedContainersList) {
        const container = DOCKER_CONTAINERS.find(c => c.name === containerName);
        if (container) {
          await dockerManager.waitForSSH(container.port, 15);
        }
      }
    }, timeout);

    afterAll(async () => {
      // Don't stop containers by default - let them be reused by other tests
      // Only stop if explicitly requested or if there are too many running
      if (process.env['STOP_CONTAINERS_AFTER_TESTS'] === 'true' && startedContainersList.length > 0) {
        console.log(`Cleaning up Docker containers for ${name}...`);

        for (const containerName of startedContainersList) {
          try {
            await dockerManager.stopContainer(containerName);
          } catch (error) {
            console.warn(`Error stopping container ${containerName}:`, error);
          }
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