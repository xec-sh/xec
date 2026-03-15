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
  // Check if we're running SSH tests without the new helper
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
