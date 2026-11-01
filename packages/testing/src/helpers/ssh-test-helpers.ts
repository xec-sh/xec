import { it, afterAll, describe, beforeAll } from 'vitest';

import { dockerManager, ContainerConfig, DOCKER_CONTAINERS } from '../docker/container-manager.js';

const requestedFixtures = process.env['XEC_SSH_TEST_CONTAINERS']?.split(',').map(name => name.trim());
if (requestedFixtures?.some(name => !DOCKER_CONTAINERS.some(container => container.name === name))) {
  throw new Error('XEC_SSH_TEST_CONTAINERS contains an unknown or empty fixture name');
}
const matrixContainers = requestedFixtures
  ? DOCKER_CONTAINERS.filter(container => requestedFixtures.includes(container.name)) : DOCKER_CONTAINERS;

let collectingContainers: Set<string> | undefined;

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
    containers = ['ubuntu-apt'], // Matrix tests add their required fixtures during collection
    timeout = 180000, // 3 minutes timeout
    skipIfNoDocker = true
  } = config;

  // Check if we should skip
  const shouldSkip = dockerManager.shouldSkipSSHTests() ||
    (skipIfNoDocker && !dockerManager.isDockerAvailable());

  const describeFn = shouldSkip ? describe.skip : describe;

  describeFn(name, () => {
    const required = new Set(containers);
    const owned: string[] = [];

    beforeAll(async () => {
      if (!dockerManager.isDockerAvailable()) {
        throw new Error('Docker is required for this SSH suite');
      }

      console.log(`Starting Docker containers for ${name}...`);

      for (const containerName of required) {
        if (!dockerManager.isContainerRunning(containerName)) {
          if (!await dockerManager.startContainer(containerName)) throw new Error(`Required SSH fixture failed to start: ${containerName}`);
          owned.push(containerName);
        }
        const container = DOCKER_CONTAINERS.find(c => c.name === containerName);
        if (!container || !await dockerManager.waitForSSH(container.port, 15)) throw new Error(`Required SSH fixture is not ready: ${containerName}`);
      }
    }, timeout);

    afterAll(async () => {
      // Don't stop containers by default - let them be reused by other tests
      // Only stop if explicitly requested or if there are too many running
      if (process.env['STOP_CONTAINERS_AFTER_TESTS'] === 'true' && owned.length > 0) {
        console.log(`Cleaning up Docker containers for ${name}...`);

        for (const containerName of owned) {
          try {
            await dockerManager.stopContainer(containerName);
          } catch (error) {
            console.warn(`Error stopping container ${containerName}:`, error);
          }
        }
      }
    }, timeout / 2);

    const previous = collectingContainers;
    collectingContainers = required;
    try { fn(); } finally { collectingContainers = previous; }
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
    readyTimeout: 30000,
    // Fixture containers regenerate their host key on every rebuild, so a
    // recorded key is guaranteed to go stale. Disabling verification here is
    // deliberate and scoped to throwaway containers — it must never be the
    // default for real hosts, and it keeps test runs from writing fixture
    // keys into the developer's ~/.ssh/known_hosts.
    hostKeyChecking: 'off' as const
  };
}

/**
 * Helper to get all available containers
 */
export function getAvailableContainers(): ContainerConfig[] {
  return matrixContainers;
}

/**
 * Run a test for each package manager
 */
export function testEachPackageManager(
  testName: string,
  testFn: (container: ContainerConfig) => Promise<void> | void
): void {
  matrixContainers.forEach(container => {
    collectingContainers?.add(container.name);
    it(`${testName} (${container.packageManager} on ${container.name})`, async () => {
      await testFn(container);
    });
  });
}

testEachPackageManager.only = function testOnly(
  testName: string,
  testFn: (container: ContainerConfig) => Promise<void> | void
): void {
  matrixContainers.forEach(container => {
    collectingContainers?.add(container.name);
    it.only(`${testName} (${container.packageManager} on ${container.name})`, async () => {
      await testFn(container);
    });
  });
};

testEachPackageManager.skip = function testSkip(
  testName: string,
  testFn: (container: ContainerConfig) => Promise<void> | void
): void {
  matrixContainers.forEach(container => {
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
    collectingContainers?.add(container.name);
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