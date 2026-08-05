
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import {
  DockerFluentAPI,
  DockerBuildFluentAPI,
  DockerEphemeralFluentAPI,
  DockerPersistentFluentAPI
} from '../../../src/adapters/docker/docker-fluent-api.js';

describe('Docker Fluent API', () => {
  let engine: ExecutionEngine;
  let mockRun: vi.Mock;

  beforeEach(() => {
    engine = new ExecutionEngine();
    // Mock the run method to avoid actual Docker commands
    const mockResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: undefined,
      ok: true,
      command: 'docker',
      duration: 0,
      startedAt: new Date(),
      finishedAt: new Date(),
      adapter: 'local',
      cause: undefined,
      toMetadata: () => ({}),
      throwIfFailed: () => {},
      text: () => '',
      json: () => ({}),
      lines: () => [],
      buffer: () => Buffer.from('')
    };

    mockRun = vi.fn(() => {
      // Return a ProcessPromise-like object
      const promise: any = Promise.resolve(mockResult);
      promise.nothrow = () => promise;
      promise.pipe = () => promise;
      promise.then = (...args: any[]) => Promise.resolve(mockResult).then(...args);
      promise.catch = (...args: any[]) => Promise.resolve(mockResult).catch(...args);
      promise.finally = (...args: any[]) => Promise.resolve(mockResult).finally(...args);
      return promise;
    });

    (engine as any).run = mockRun;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DockerFluentAPI', () => {
    test('should create DockerFluentAPI instance', () => {
      const docker = new DockerFluentAPI(engine);
      expect(docker).toBeDefined();
      expect(docker.ephemeral).toBeDefined();
      expect(docker.container).toBeDefined();
      expect(docker.build).toBeDefined();
    });

    test('should create ephemeral container API', () => {
      const docker = new DockerFluentAPI(engine);
      const ephemeral = docker.ephemeral('nginx:latest');

      expect(ephemeral).toBeInstanceOf(DockerEphemeralFluentAPI);
    });

    test('should create persistent container API', () => {
      const docker = new DockerFluentAPI(engine);
      const persistent = docker.container('my-container');

      expect(persistent).toBeInstanceOf(DockerPersistentFluentAPI);
    });

    test('should create build API', () => {
      const docker = new DockerFluentAPI(engine);
      const build = docker.build('.');

      expect(build).toBeInstanceOf(DockerBuildFluentAPI);
    });
  });

  describe('DockerEphemeralFluentAPI', () => {
    let api: DockerEphemeralFluentAPI;

    beforeEach(() => {
      api = new DockerEphemeralFluentAPI(engine, 'nginx:latest');
    });

    test('should set ports', () => {
      api.ports(['80:80', '443:443']);
      const config = api.build();
      expect(config.ports).toEqual(['80:80', '443:443']);
    });

    test('should set environment variables', () => {
      api.env({ NODE_ENV: 'production' });
      const config = api.build();
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });

    test('should set volumes', () => {
      api.volumes(['/data:/data']);
      const config = api.build();
      expect(config.volumes).toEqual(['/data:/data']);
    });

    test('should set network', () => {
      api.network('my-network');
      const config = api.build();
      expect(config.network).toBe('my-network');
    });

    test('should set working directory', () => {
      api.workdir('/app');
      const config = api.build();
      expect(config.workdir).toBe('/app');
    });

    test('should set user', () => {
      api.user('node');
      const config = api.build();
      expect(config.user).toBe('node');
    });

    test('should set privileged mode', () => {
      api.privileged();
      const config = api.build();
      expect(config.privileged).toBe(true);
    });

    test('should set auto-remove', () => {
      api.autoRemove();
      const config = api.build();
      expect(config.autoRemove).toBe(true);
    });

    test('should set restart policy', () => {
      api.restartPolicy('always');
      const config = api.build();
      expect(config.restart).toBe('always');
    });

    test('should set memory limit', () => {
      api.memory('512m');
      const config = api.build();
      expect(config.memory).toBe('512m');
    });

    test('should set CPU limit', () => {
      api.cpus('0.5');
      const config = api.build();
      expect(config.cpus).toBe('0.5');
    });

    test('should set hostname', () => {
      api.hostname('myhost');
      const config = api.build();
      expect(config.hostname).toBe('myhost');
    });

    test('should set healthcheck', () => {
      api.healthcheck(['CMD', 'curl', '-f', 'http://localhost/health'], {
        interval: '30s',
        timeout: '3s',
        retries: 3
      });
      const config = api.build();
      expect(config.healthcheck).toEqual({
        test: ['CMD', 'curl', '-f', 'http://localhost/health'],
        interval: '30s',
        timeout: '3s',
        retries: 3
      });
    });

    test('should build configuration with all settings', () => {
      api
        .name('test-container')
        .ports(['80:80'])
        .env({ NODE_ENV: 'production' })
        .volumes(['/data:/data']);

      const config = api.build();

      expect(config.name).toBe('test-container');
      expect(config.ports).toContain('80:80');
      expect(config.env).toEqual({ NODE_ENV: 'production' });
      expect(config.volumes).toContain('/data:/data');
      expect(config.image).toBe('nginx:latest');
    });
  });

  describe('DockerPersistentFluentAPI', () => {
    let api: DockerPersistentFluentAPI;

    beforeEach(() => {
      api = new DockerPersistentFluentAPI(engine, 'my-container');
    });

    test('should set working directory', () => {
      api.workdir('/app');
      const config = api.build();
      expect(config.workdir).toBe('/app');
    });

    test('should set user', () => {
      api.user('node');
      const config = api.build();
      expect(config.user).toBe('node');
    });

    test('should set environment variables', () => {
      api.env({ NODE_ENV: 'production' });
      const config = api.build();
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });
  });

  describe('DockerBuildFluentAPI', () => {
    let api: DockerBuildFluentAPI;

    beforeEach(() => {
      api = new DockerBuildFluentAPI(engine, '.');
    });

    test('should set dockerfile', () => {
      api.dockerfile('Dockerfile.prod');
      const config = api.build();
      expect(config.dockerfile).toBe('Dockerfile.prod');
    });

    test('should set tag', () => {
      api.tag('myapp:latest');
      const config = api.build();
      expect(config.tag).toBe('myapp:latest');
    });

    test('should set build arguments', () => {
      api.buildArgs({ VERSION: '1.0.0' });
      const config = api.build();
      expect(config.buildArgs).toEqual({ VERSION: '1.0.0' });
    });

    test('should set target stage', () => {
      api.target('production');
      const config = api.build();
      expect(config.target).toBe('production');
    });

    test('should set platform', () => {
      api.platform('linux/amd64');
      const config = api.build();
      expect(config.platform).toBe('linux/amd64');
    });

    test('should enable no-cache', () => {
      api.noCache();
      const config = api.build();
      expect(config.noCache).toBe(true);
    });

    test('should enable pull', () => {
      api.pull();
      const config = api.build();
      expect(config.pull).toBe(true);
    });

    test('should set labels', () => {
      api.labels({ version: '1.0.0' });
      const config = api.build();
      expect(config.labels).toEqual({ version: '1.0.0' });
    });

    test('should build configuration with all settings', () => {
      api
        .tag('myapp:latest')
        .dockerfile('Dockerfile.prod')
        .buildArgs({ VERSION: '1.0.0' })
        .target('production')
        .noCache()
        .pull();

      const config = api.build();

      expect(config.tag).toBe('myapp:latest');
      expect(config.dockerfile).toBe('Dockerfile.prod');
      expect(config.buildArgs).toEqual({ VERSION: '1.0.0' });
      expect(config.target).toBe('production');
      expect(config.noCache).toBe(true);
      expect(config.pull).toBe(true);
      expect(config.context).toBe('.');
    });
  });

});