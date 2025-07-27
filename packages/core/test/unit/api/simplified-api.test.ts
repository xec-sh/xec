import { test, jest, expect, describe } from '@jest/globals';

import { $, configure } from '../../../src/index.js';

describe('Simplified API', () => {
  describe('$ function', () => {
    test('should execute commands with template literals', async () => {
      const result = await $`echo "Hello World"`;
      expect(result.stdout.trim()).toBe('Hello World');
      expect(result.exitCode).toBe(0);
    });

    test('should interpolate values in template literals', async () => {
      const name = 'USH';
      const result = await $`echo "Hello ${name}"`;
      expect(result.stdout.trim()).toBe('Hello USH');
    });

    test('should handle command failure', async () => {
      // First ensure throwOnNonZeroExit is true
      configure({ throwOnNonZeroExit: true });
      
      await expect($`exit 42`).rejects.toThrow();
      
      // Reset to default
      configure({ throwOnNonZeroExit: false });
    });

    test('should support method chaining', async () => {
      const result = await $.env({ TEST: 'value' })`echo $TEST`;
      expect(result.stdout.trim()).toBe('value');
    });

    test('should support timeout', async () => {
      await expect(
        $.timeout(100)`sleep 1`
      ).rejects.toThrow('timed out');
    });

    test('should support cd', async () => {
      const tempDir = '/tmp';
      const result = await $.cd(tempDir)`pwd`;
      // On macOS, /tmp is a symlink to /private/tmp
      const expectedPath = result.stdout.trim();
      expect([tempDir, '/private/tmp']).toContain(expectedPath);
    });
  });

  describe('configure function', () => {
    test('should update default configuration', async () => {
      // Configure to not throw on non-zero exit
      configure({ throwOnNonZeroExit: false });
      
      const result = await $`exit 1`;
      expect(result.exitCode).toBe(1);
      
      // Reset configuration
      configure({ throwOnNonZeroExit: true });
    });

    test('should apply timeout configuration', async () => {
      configure({ defaultTimeout: 50 });
      
      await expect($`sleep 0.1`).rejects.toThrow();
      
      // Reset configuration
      configure({ defaultTimeout: 120000 });
    });
  });

  describe('adapter methods', () => {
    test('should have ssh method', () => {
      expect(typeof $.ssh).toBe('function');
    });

    test('should have docker method', () => {
      expect(typeof $.docker).toBe('function');
    });

    test('should have k8s method', () => {
      expect(typeof $.k8s).toBe('function');
    });

    test('should have local method', () => {
      expect(typeof $.local).toBe('function');
    });

    test('should return chainable instance from adapter methods', () => {
      const sshEngine = $.ssh({ host: 'example.com', username: 'user' });
      expect(typeof sshEngine).toBe('function');
      expect(typeof sshEngine.cd).toBe('function');
      expect(typeof sshEngine.env).toBe('function');
    });
  });

  describe('exported types and utilities', () => {
    test('should export essential utilities', async () => {
      const { withTempFile, withTempDir, pipe } = await import('../../../src/index.js');
      
      expect(typeof withTempFile).toBe('function');
      expect(typeof withTempDir).toBe('function');
      expect(typeof pipe).toBe('function');
    });

    test('should export core errors', async () => {
      const { CommandError, TimeoutError, ConnectionError } = await import('../../../src/index.js');
      
      expect(CommandError).toBeDefined();
      expect(TimeoutError).toBeDefined();
      expect(ConnectionError).toBeDefined();
    });

    test('should export adapters for advanced users', async () => {
      const { 
        ExecutionEngine,
        LocalAdapter,
        SSHAdapter,
        DockerAdapter,
        KubernetesAdapter,
        RemoteDockerAdapter
      } = await import('../../../src/index.js');
      
      expect(ExecutionEngine).toBeDefined();
      expect(LocalAdapter).toBeDefined();
      expect(SSHAdapter).toBeDefined();
      expect(DockerAdapter).toBeDefined();
      expect(KubernetesAdapter).toBeDefined();
      expect(RemoteDockerAdapter).toBeDefined();
    });
  });

  describe('proxy behavior', () => {
    test('should lazily initialize engine', async () => {
      // Import fresh $ to test lazy initialization
      jest.resetModules();
      const { $ } = await import('../../../src/index.js');
      
      // First access should initialize
      const result = await $`echo "initialized"`;
      expect(result.stdout.trim()).toBe('initialized');
    });

    test('should handle unknown properties gracefully', () => {
      const unknownProp = ($ as any).nonExistentMethod;
      expect(unknownProp).toBeUndefined();
    });

    test('should bind methods correctly', async () => {
      const { execute } = $;
      const result = await execute({ command: 'echo', args: ['bound method'] });
      expect(result.stdout.trim()).toBe('bound method');
    });
  });
});