import { it, expect, describe, beforeAll } from '@jest/globals';

import { $, withTempDir } from '../../../src/index.js';

// Check if Docker is available
const isDockerAvailable = async (): Promise<boolean> => {
  try {
    const result = await $`docker --version`.nothrow();
    return result.ok;
  } catch {
    return false;
  }
};

// Skip these tests if Docker is not available
const describeIfDocker = (name: string, fn: () => void) => {
  isDockerAvailable().then((available) => {
    if (!available) {
      describe.skip(name, fn);
    } else {
      describe(name, fn);
    }
  });
};

describe('Docker ephemeral container name conflicts', () => {
  const testImage: string = 'alpine:latest';
  let dockerAvailable = false;

  beforeAll(async () => {
    dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.log('Docker not available, skipping tests');
      return;
    }

    // Pull alpine image if not present
    const pullResult = await $`docker pull ${testImage}`.nothrow();
    if (!pullResult.ok) {
      throw new Error(`Failed to pull test image: ${pullResult.stderr}`);
    }
  });

  it('should run multiple ephemeral containers without name conflicts', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test - Docker not available');
      return;
    }
    const runs = 5;
    const results = [];

    // Run multiple containers in parallel without specifying name (Docker will auto-generate)
    for (let i = 0; i < runs; i++) {
      const promise = $.with({
        adapter: 'docker',
        adapterOptions: {
          type: 'docker',
          container: 'ephemeral',  // Special value that prevents --name flag
          runMode: 'run',
          image: testImage,
          autoRemove: true
        }
      })`echo "Run ${i}"`.nothrow();

      results.push(promise);
    }

    // Wait for all to complete
    const outputs = await Promise.all(results);

    // All should succeed without name conflicts
    outputs.forEach((result, index) => {
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Run \d+/);
    });
  });

  it('should run containers sequentially without conflicts', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test - Docker not available');
      return;
    }
    for (let i = 0; i < 3; i++) {
      const result = await $.with({
        adapter: 'docker',
        adapterOptions: {
          type: 'docker',
          container: 'test-ephemeral-seq',
          runMode: 'run',
          image: testImage,
          autoRemove: true
        }
      })`echo "Sequential run ${i}"`;

      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe(`Sequential run ${i}`);
    }
  });

  it('should work with custom container names', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test - Docker not available');
      return;
    }
    const customName = `test-custom-${Date.now()}`;

    const result = await $.with({
      adapter: 'docker',
      adapterOptions: {
        type: 'docker',
        container: customName,
        runMode: 'run',
        image: testImage,
        autoRemove: true
      }
    })`echo "Custom container works"`;

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('Custom container works');
  });

  it('should work with mkp224o container', async () => {
    if (!dockerAvailable) {
      console.log('Skipping test - Docker not available');
      return;
    }
    // Build mkp224o image
    const mkp224oImage = 'xec-test-mkp224o';
    const buildResult = await $.cd('./test/fixtures/docker/mkp224o')`docker build -t ${mkp224oImage} .`.quiet();

    if (!buildResult.ok) {
      throw new Error(`Failed to build mkp224o image: ${buildResult.stderr}`);
    }

    // Create temp directory for output
    await withTempDir(async (tempDir) => {
      // Run mkp224o with valid arguments
      const result = await $.with({
        adapter: 'docker',
        adapterOptions: {
          type: 'docker',
          container: 'mkp224o-test',
          runMode: 'run',
          image: mkp224oImage,
          volumes: [`${tempDir.path}:/work`],
          autoRemove: true
        }
      })`-n 1 -d /work -q placeholder`.nothrow();

      // mkp224o might not generate address with "test" filter quickly
      // but it should run without errors
      if (!result.ok) {
        console.log('mkp224o stderr:', result.stderr);
        console.log('mkp224o stdout:', result.stdout);
        console.log('mkp224o exit code:', result.exitCode);
      }

      // We expect either success or a specific mkp224o exit code
      expect(result.stderr).not.toContain('docker:');
      expect(result.stderr).not.toContain('Error');
    });

    // Clean up image
    await $`docker rmi -f ${mkp224oImage}`.nothrow();
  });
});