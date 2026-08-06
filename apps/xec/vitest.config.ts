import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 60000,
    globals: true,
    // The command tests provision real infrastructure (Docker containers,
    // SSH servers, kind clusters). Running the files concurrently makes them
    // compete for the Docker daemon and registry, causing spurious timeouts.
    fileParallelism: false,
    // A net under the tests that provision containers: one that fails
    // halfway never reaches its own cleanup, and what it leaves behind
    // breaks the *next* run, which is the hardest kind of failure to read.
    globalSetup: ['./test/global-teardown.ts'],
  },
});
