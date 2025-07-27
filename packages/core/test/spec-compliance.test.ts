import { it, expect, describe, beforeEach } from '@jest/globals';

import { MockAdapter } from '../src/adapters/mock-adapter.js';
import { $, CommandError, ExecutionEngine, createCallableEngine } from '../src/index.js';

describe('Unified Execution Engine - Specification', () => {
  describe('Main API - zx style', () => {
    it('should support simple execution', async () => {
      const result = await $`echo "Hello, World!"`;
      expect(result.stdout.trim()).toBe('Hello, World!');
    });

    it('should support interpolation with automatic escaping', async () => {
      const filename = "my file.txt";
      const result = await $`echo ${filename}`;
      expect(result.stdout.trim()).toBe('my file.txt');
    });

    it('should support configuration chaining', async () => {
      const $prod = $.with({
        env: { NODE_ENV: 'production' },
        cwd: process.cwd()
      });

      const result = await $prod`echo $NODE_ENV`;
      expect(result.stdout.trim()).toBe('production');
    });

    it('should support SSH configuration', () => {
      const $remote = $.ssh({
        host: 'server.example.com',
        username: 'deploy'
      });

      expect($remote).toBeDefined();
      expect(typeof $remote).toBe('function');
    });

    it('should support Docker configuration', () => {
      const $docker = $.docker({
        container: 'my-app',
        workdir: '/app'
      });

      expect($docker).toBeDefined();
      expect(typeof $docker).toBe('function');
    });
  });

  describe('Error handling', () => {
    it('should provide detailed error system', async () => {
      try {
        await $`exit 1`;
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        const cmdError = error as CommandError;
        expect(cmdError.exitCode).toBe(1);
        expect(cmdError.command).toContain('exit 1');
      }
    });

    it('should preserve stdout and stderr in error', async () => {
      try {
        await $`sh -c "echo 'stdout message'; echo 'stderr message' >&2; exit 42"`;
      } catch (error) {
        const cmdError = error as CommandError;
        expect(cmdError.exitCode).toBe(42);
        expect(cmdError.stdout).toContain('stdout message');
        expect(cmdError.stderr).toContain('stderr message');
      }
    });
  });

  describe('Testing and mocking', () => {
    let mockAdapter: MockAdapter;
    let $mock: any;

    beforeEach(() => {
      const engine = new ExecutionEngine();
      mockAdapter = new MockAdapter();
      engine.registerAdapter('mock', mockAdapter);
      $mock = createCallableEngine(engine).with({ adapter: 'mock' as any });
    });

    it('should support Mock adapter for tests', async () => {
      mockAdapter.mockCommand('sh -c "git pull"', { stdout: 'Already up to date.' });
      mockAdapter.mockCommand('sh -c "npm install"', { stdout: 'added 150 packages' });
      mockAdapter.mockCommand('sh -c "npm run build"', { stdout: 'Build successful' });

      const pullResult = await $mock`git pull`;
      expect(pullResult.stdout).toBe('Already up to date.');

      const installResult = await $mock`npm install`;
      expect(installResult.stdout).toBe('added 150 packages');

      const buildResult = await $mock`npm run build`;
      expect(buildResult.stdout).toBe('Build successful');

      const commands = mockAdapter.getExecutedCommands();
      expect(commands).toEqual(['sh -c "git pull"', 'sh -c "npm install"', 'sh -c "npm run build"']);
    });

    it('should support regex patterns in mocks', async () => {
      mockAdapter.mockCommand(/^sh -c "docker/, { stdout: 'Docker output', exitCode: 0 });

      const result1 = await $mock`docker ps`;
      const result2 = await $mock`docker images`;

      expect(result1.stdout).toBe('Docker output');
      expect(result2.stdout).toBe('Docker output');
    });
  });

  describe('Specification examples', () => {
    it('should support parallel execution', async () => {
      const start = Date.now();
      const results = await Promise.all([
        $`sleep 0.1 && echo "1"`,
        $`sleep 0.1 && echo "2"`,
        $`sleep 0.1 && echo "3"`
      ]);
      const duration = Date.now() - start;

      expect(results[0].stdout.trim()).toBe('1');
      expect(results[1].stdout.trim()).toBe('2');
      expect(results[2].stdout.trim()).toBe('3');

      // Should execute in parallel, not sequentially
      expect(duration).toBeLessThan(350); // 3 * 100ms + overhead
    });

    it('should support CI/CD pipeline scenario', async () => {
      const engine = new ExecutionEngine();
      const mockAdapter = new MockAdapter();
      engine.registerAdapter('mock', mockAdapter);
      const $ciEngine = createCallableEngine(engine);

      // Setup mocks for CI pipeline
      mockAdapter.mockSuccess('sh -c "npm test -- --json"', JSON.stringify({
        numFailedTests: 0,
        numPassedTests: 10
      }));
      mockAdapter.mockSuccess('sh -c "git describe --tags --always"', 'v1.2.3');
      mockAdapter.mockSuccess(/^sh -c "docker build/, '');
      mockAdapter.mockSuccess(/^sh -c "docker run/, 'container-id');
      mockAdapter.mockSuccess(/^sh -c "docker rm/, '');
      mockAdapter.mockSuccess(/^sh -c "docker push/, '');

      const $ci = $ciEngine.with({
        env: { NODE_ENV: 'test', CI: 'true' },
        adapter: 'mock' as any
      });

      // Tests
      const testResults = await $ci`npm test -- --json`;
      const tests = JSON.parse(testResults.stdout);
      expect(tests.numFailedTests).toBe(0);

      // Version
      const version = await $ci`git describe --tags --always`;
      const tag = `myapp:${version.stdout.trim()}`;
      expect(tag).toBe('myapp:v1.2.3');

      // Docker operations
      await $ci`docker build -t ${tag} .`;
      const containerName = `test-${Date.now()}`;
      await $ci`docker run -d --name ${containerName} ${tag}`;
      await $ci`docker rm -f ${containerName}`;
      await $ci`docker push ${tag}`;

      // Check executed commands
      const executedCommands = mockAdapter.getExecutedCommands();
      expect(executedCommands).toContain('sh -c "npm test -- --json"');
      expect(executedCommands).toContain('sh -c "git describe --tags --always"');
      expect(executedCommands.some(cmd => cmd.includes('docker build'))).toBe(true);
      expect(executedCommands.some(cmd => cmd.includes('docker push'))).toBe(true);
    });
  });

  describe('Integration with various runtimes', () => {
    it('should automatically detect runtime', async () => {
      const engine = new ExecutionEngine({
        runtime: { preferBun: true }
      });
      const $runtimeEngine = createCallableEngine(engine);

      // Should work regardless of runtime
      const result = await $runtimeEngine`echo "Works in any runtime"`;
      expect(result.stdout.trim()).toBe('Works in any runtime');
    });
  });

  describe('Security', () => {
    it('should automatically escape interpolated values', async () => {
      const dangerous = "'; rm -rf /; echo '";
      const result = await $`echo ${dangerous}`;

      // Should output the string as-is, without executing dangerous command
      expect(result.stdout.trim()).toBe(dangerous);
      expect(result.exitCode).toBe(0);
    });

    it('should properly escape special characters', async () => {
      const specialChars = '$`"\\';
      const result = await $`echo ${specialChars}`;

      expect(result.stdout.trim()).toBe(specialChars);
    });
  });
});