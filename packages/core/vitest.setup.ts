import { execSync } from 'node:child_process';
import { beforeAll, afterAll } from 'vitest';
import { dockerManager } from '@xec-sh/testing';

import { configure } from './src/index.js';

// Configure the $ instance with all adapters for tests
configure({
  adapters: {
    ssh: {},
    docker: {},
  },
});

// Store whether we should manage containers globally
const shouldManageContainersGlobally = () => {
  const testFiles = process.argv.filter((arg) => arg.endsWith('.test.ts'));
  const isRunningOldSSHTests = testFiles.some(
    (file) =>
      file.includes('ssh') &&
      file.includes('test.ts') &&
      !file.includes('ssh-docker-integration.test.ts') &&
      !file.includes('package-managers.test.ts') &&
      !file.includes('ssh-authentication.test.ts') &&
      !file.includes('ssh-file-transfer.test.ts') &&
      !file.includes('ssh-performance.test.ts') &&
      !file.includes('ssh-complex-scenarios.test.ts') &&
      !file.includes('ssh-high-level.test.ts')
  );

  return isRunningOldSSHTests && !dockerManager.shouldSkipSSHTests();
};

// Only setup global container management for legacy tests
if (shouldManageContainersGlobally()) {
  let containersStarted = false;

  beforeAll(async () => {
    console.log('Setting up Docker containers for legacy SSH tests...');
    containersStarted = await dockerManager.startRequiredContainers();

    if (!containersStarted) {
      console.warn('Failed to start some Docker containers, SSH tests may fail');
    }
  }, 120000);

  afterAll(async () => {
    if (containersStarted) {
      console.log('Cleaning up Docker containers...');
      await dockerManager.stopAllContainers();
    }

    await new Promise((done) => setTimeout(done, 100));
  }, 60000);
}

/**
 * Global cleanup: remove ALL orphaned test containers after test run.
 * This prevents Docker from being polluted by containers that tests
 * failed to clean up (due to timeouts, crashes, or missing finally blocks).
 */
afterAll(async () => {
  try {
    // Remove containers matching test naming patterns
    const patterns = ['xec-test-', 'temp-ush-', 'volume-test-', 'multi-test-', 'xec-e2e-'];
    for (const pattern of patterns) {
      try {
        execSync(
          `docker ps -aq --filter "name=${pattern}" | xargs -r docker rm -f 2>/dev/null`,
          { stdio: 'pipe', timeout: 15000 }
        );
      } catch {
        // Ignore — no matching containers or Docker not available
      }
    }
  } catch {
    // Docker not available or cleanup failed — not critical
  }
}, 30000);
