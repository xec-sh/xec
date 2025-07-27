import { jest } from '@jest/globals';
import { dockerManager } from '@xec-sh/test-utils';

import { configure } from './src/index.js';

// Common test setup
jest.setTimeout(30000);

// Configure the $ instance with all adapters for tests
configure({
  adapters: {
    ssh: {},
    docker: {}
  }
});

// Setup Docker containers for SSH tests
// Note: Individual test suites using describeSSH will manage their own containers
// This global setup is only for tests that don't use the helper

// Store whether we should manage containers globally
const shouldManageContainersGlobally = () => {
  // Check if we're running SSH tests without the new helper
  const testFiles = process.argv.filter(arg => arg.endsWith('.test.ts'));
  const isRunningOldSSHTests = testFiles.some(file =>
    file.includes('ssh-docker-integration.test.ts') &&
    !file.includes('package-managers.test.ts')
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
  }, 120000); // 2 minute timeout for container startup

  afterAll(async () => {
    if (containersStarted) {
      console.log('Cleaning up Docker containers...');
      await dockerManager.stopAllContainers();
    }

    // Give a small delay for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  }, 60000); // 1 minute timeout for cleanup
}