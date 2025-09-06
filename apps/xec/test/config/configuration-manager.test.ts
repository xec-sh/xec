/**
 * Configuration Manager tests
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { ConfigurationManager } from '../../src/config/configuration-manager.js';

import type { Configuration } from '../../src/config/types.js';

describe('ConfigurationManager', () => {
  let tempDir: string;
  let manager: ConfigurationManager;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-config-test-'));

    // Create test config structure
    await fs.mkdir(path.join(tempDir, '.xec'), { recursive: true });

    // Initialize manager with test directory
    manager = new ConfigurationManager({
      projectRoot: tempDir,
      globalConfigDir: path.join(tempDir, 'global'),
      cache: false
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('should load default configuration when no config files exist', async () => {
      const config = await manager.load();

      expect(config.version).toBe('1.0');
      expect(config.targets?.local?.type).toBe('local');
      expect(config.commands?.in?.defaultTimeout).toBe('30s');
    });

    it('should load project configuration', async () => {
      const projectConfig: Configuration = {
        version: 'q.0',
        name: 'test-project',
        vars: {
          appName: 'myapp',
          version: '1.0.0'
        },
        tasks: {
          test: 'npm test',
          build: {
            command: 'npm run build',
            description: 'Build the project'
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "1.0"
name: test-project
vars:
  appName: myapp
  version: "1.0.0"
tasks:
  test: npm test
  build:
    command: npm run build
    description: Build the project`
      );

      const config = await manager.load();

      expect(config.name).toBe('test-project');
      expect(config.vars?.appName).toBe('myapp');
      expect(config.tasks?.test).toBe('npm test');
      expect(config.tasks?.build).toEqual({
        command: 'npm run build',
        description: 'Build the project'
      });
    });

    it('should merge multiple configuration sources', async () => {
      // Global config
      await fs.mkdir(path.join(tempDir, 'global'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'global', 'config.yaml'),
        `version: "1.0"
vars:
  globalVar: fromGlobal
  sharedVar: globalValue
commands:
  in:
    defaultTimeout: 60s`
      );

      // Project config
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "2.0"
vars:
  projectVar: fromProject
  sharedVar: projectValue
tasks:
  test: npm test`
      );

      const config = await manager.load();

      // Project should override global
      expect(config.vars?.globalVar).toBe('fromGlobal');
      expect(config.vars?.projectVar).toBe('fromProject');
      expect(config.vars?.sharedVar).toBe('projectValue');

      // Commands should be merged
      expect(config.commands?.in?.defaultTimeout).toBe('60s');

      // Tasks from project
      expect(config.tasks?.test).toBe('npm test');
    });

    it('should apply profiles', async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "1.0"
vars:
  env: development
  apiUrl: http://localhost:3000
profiles:
  production:
    vars:
      env: production
      apiUrl: https://api.example.com
  staging:
    vars:
      env: staging
      apiUrl: https://staging.api.example.com`
      );

      // Load with production profile
      manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'production'
      });

      const config = await manager.load();

      expect(config.vars?.env).toBe('production');
      expect(config.vars?.apiUrl).toBe('https://api.example.com');
    });

    it('should load environment variables', async () => {
      process.env.XEC_VARS_ENV_VAR = 'fromEnv';
      process.env.XEC_COMMANDS_IN_DEFAULTTIMEOUT = '120s';

      try {
        const config = await manager.load();

        expect(config.vars?.env?.var).toBe('fromEnv');
        expect(config.commands?.in?.defaulttimeout).toBe('120s');
      } finally {
        delete process.env.XEC_VARS_ENV_VAR;
        delete process.env.XEC_COMMANDS_IN_DEFAULTTIMEOUT;
      }
    });
  });

  describe('get() and set()', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "1.0"
vars:
  app:
    name: myapp
    version: "1.0.0"
    features:
      - auth
      - api
targets:
  hosts:
    web-1:
      host: web1.example.com
      user: deploy`
      );

      await manager.load();
    });

    it('should get values by path', () => {
      expect(manager.get('vars.app.name')).toBe('myapp');
      expect(manager.get('vars.app.features')).toEqual(['auth', 'api']);
      expect(manager.get('targets.hosts.web-1.host')).toBe('web1.example.com');
      expect(manager.get('nonexistent.path')).toBeUndefined();
    });

    it('should set values by path', () => {
      manager.set('vars.app.version', '2.0.0');
      expect(manager.get('vars.app.version')).toBe('2.0.0');

      manager.set('vars.newVar', 'newValue');
      expect(manager.get('vars.newVar')).toBe('newValue');

      manager.set('deeply.nested.value', 42);
      expect(manager.get('deeply.nested.value')).toBe(42);
    });
  });

  describe('interpolate()', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "2.0"
vars:
  appName: myapp
  version: "1.0.0"
  fullName: \${vars.appName}-\${vars.version}
  envVar: \${env.USER}
  withDefault: \${vars.missing:defaultValue}`
      );

      await manager.load();
    });

    it('should interpolate variables', () => {
      expect(manager.interpolate('${vars.appName}')).toBe('myapp');
      expect(manager.interpolate('app: ${vars.appName} v${vars.version}')).toBe('app: myapp v1.0.0');
    });

    it('should handle nested interpolation', () => {
      expect(manager.get('vars.fullName')).toBe('myapp-1.0.0');
    });

    it('should interpolate environment variables', () => {
      const user = process.env.USER || process.env.USERNAME;
      if (user) {
        expect(manager.get('vars.envVar')).toBe(user);
      }
    });

    it('should handle default values', () => {
      expect(manager.get('vars.withDefault')).toBe('defaultValue');
    });

    it('should interpolate with custom context', () => {
      const result = manager.interpolate('Hello ${params.name}!', {
        params: { name: 'World' }
      });
      expect(result).toBe('Hello World!');
    });
  });

  describe('profiles', () => {
    beforeEach(async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "2.0"
vars:
  env: dev
  debug: true
profiles:
  prod:
    vars:
      env: production
      debug: false
  staging:
    extends: prod
    vars:
      env: staging`
      );
    });

    it('should list available profiles', async () => {
      await manager.load();
      const profiles = manager.getProfiles();

      expect(profiles).toContain('prod');
      expect(profiles).toContain('staging');
    });

    it('should switch profiles', async () => {
      await manager.load();

      expect(manager.get('vars.env')).toBe('dev');
      expect(manager.get('vars.debug')).toBe(true);

      await manager.useProfile('prod');

      expect(manager.get('vars.env')).toBe('production');
      expect(manager.get('vars.debug')).toBe(false);
    });

    it('should handle profile inheritance', async () => {
      manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'staging'
      });

      await manager.load();

      expect(manager.get('vars.env')).toBe('staging');
      expect(manager.get('vars.debug')).toBe(false); // Inherited from prod
    });
  });

  describe('save()', () => {
    it('should save configuration to file', async () => {
      await manager.load();

      manager.set('vars.newVar', 'savedValue');
      manager.set('tasks.newTask', 'echo saved');

      const savePath = path.join(tempDir, 'saved-config.yaml');
      await manager.save(savePath);

      const savedContent = await fs.readFile(savePath, 'utf-8');

      expect(savedContent).toContain('newVar: savedValue');
      expect(savedContent).toContain('newTask: echo saved');
    });
  });

  describe('validation', () => {
    it('should validate configuration on load', async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "0.9"
vars:
  env: invalid`  // Reserved name
      );

      // In strict mode, should throw
      manager = new ConfigurationManager({
        projectRoot: tempDir,
        strict: true
      });

      await expect(manager.load()).rejects.toThrow('Configuration validation failed');
    });

    it('should warn in non-strict mode', async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "2.0"
vars:
  env: test  # This conflicts with reserved name`
      );

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      await manager.load();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('special keys', () => {
    it('should handle $unset marker', async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "2.0"
vars:
  keep: value
  remove: toBeRemoved
profiles:
  clean:
    vars:
      remove: $unset`
      );

      manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'clean'
      });

      await manager.load();

      expect(manager.get('vars.keep')).toBe('value');
      expect(manager.get('vars.remove')).toBeUndefined();
    });

    it('should handle $merge marker for arrays', async () => {
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "2.0"
vars:
  list: [a, b]
profiles:
  extended:
    vars:
      list: [$merge, c, d]`
      );

      manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'extended'
      });

      await manager.load();

      expect(manager.get('vars.list')).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('monorepo support', () => {
    it('should find .xec config in monorepo root when working in subdirectory', async () => {
      // Create monorepo structure
      const monorepoRoot = tempDir;
      const workspaceDir = path.join(monorepoRoot, 'packages', 'my-package');
      await fs.mkdir(workspaceDir, { recursive: true });

      // Create .git directory to mark repo root
      await fs.mkdir(path.join(monorepoRoot, '.git'), { recursive: true });

      // Create config in monorepo root
      await fs.writeFile(
        path.join(monorepoRoot, '.xec', 'config.yaml'),
        `version: "1.0"
name: monorepo-project
vars:
  environment: monorepo`
      );

      // Initialize manager from workspace directory
      const workspaceManager = new ConfigurationManager({
        projectRoot: workspaceDir,
        globalConfigDir: path.join(tempDir, 'global'),
        cache: false
      });

      const config = await workspaceManager.load();

      expect(config.name).toBe('monorepo-project');
      expect(config.vars?.environment).toBe('monorepo');
    });

    it('should prioritize .xec directory over .git when searching for root', async () => {
      // Create nested structure
      const gitRoot = tempDir;
      const xecRoot = path.join(gitRoot, 'subproject');
      const workDir = path.join(xecRoot, 'src', 'components');
      
      await fs.mkdir(workDir, { recursive: true });
      await fs.mkdir(path.join(gitRoot, '.git'), { recursive: true });
      await fs.mkdir(path.join(xecRoot, '.xec'), { recursive: true });

      // Create config in xec root (not git root)
      await fs.writeFile(
        path.join(xecRoot, '.xec', 'config.yaml'),
        `version: "1.0"
name: subproject
vars:
  location: xec-root`
      );

      // Create different config in git root (should be ignored)
      await fs.mkdir(path.join(gitRoot, '.xec'), { recursive: true });
      await fs.writeFile(
        path.join(gitRoot, '.xec', 'config.yaml'),
        `version: "1.0"
name: git-root-project
vars:
  location: git-root`
      );

      // Initialize manager from deep workspace directory
      const manager = new ConfigurationManager({
        projectRoot: workDir,
        globalConfigDir: path.join(tempDir, 'global'),
        cache: false
      });

      const config = await manager.load();

      // Should use the closer .xec directory, not the git root one
      expect(config.name).toBe('subproject');
      expect(config.vars?.location).toBe('xec-root');
    });

    it('should detect monorepo by package.json with workspaces', async () => {
      const monorepoRoot = tempDir;
      const workspaceDir = path.join(monorepoRoot, 'apps', 'web');
      await fs.mkdir(workspaceDir, { recursive: true });

      // Create package.json with workspaces (monorepo indicator)
      await fs.writeFile(
        path.join(monorepoRoot, 'package.json'),
        JSON.stringify({
          name: 'my-monorepo',
          workspaces: ['apps/*', 'packages/*']
        })
      );

      // Create config in monorepo root
      await fs.writeFile(
        path.join(monorepoRoot, '.xec', 'config.yaml'),
        `version: "1.0"
name: monorepo-with-workspaces
vars:
  type: npm-workspaces`
      );

      // Initialize manager from workspace directory
      const manager = new ConfigurationManager({
        projectRoot: workspaceDir,
        globalConfigDir: path.join(tempDir, 'global'),
        cache: false
      });

      const config = await manager.load();

      expect(config.name).toBe('monorepo-with-workspaces');
      expect(config.vars?.type).toBe('npm-workspaces');
    });

    it('should fall back to current directory if no monorepo root found', async () => {
      const isolatedDir = path.join(tempDir, 'isolated');
      await fs.mkdir(isolatedDir, { recursive: true });

      // Create config in isolated directory (no git or monorepo markers)
      await fs.mkdir(path.join(isolatedDir, '.xec'), { recursive: true });
      await fs.writeFile(
        path.join(isolatedDir, '.xec', 'config.yaml'),
        `version: "1.0"
name: isolated-project
vars:
  standalone: true`
      );

      // Initialize manager from isolated directory
      const manager = new ConfigurationManager({
        projectRoot: isolatedDir,
        globalConfigDir: path.join(tempDir, 'global'),
        cache: false
      });

      const config = await manager.load();

      expect(config.name).toBe('isolated-project');
      expect(config.vars?.standalone).toBe(true);
    });

    it('should load profiles from monorepo root', async () => {
      const monorepoRoot = tempDir;
      const workspaceDir = path.join(monorepoRoot, 'services', 'api');
      await fs.mkdir(workspaceDir, { recursive: true });
      await fs.mkdir(path.join(monorepoRoot, '.git'), { recursive: true });
      await fs.mkdir(path.join(monorepoRoot, '.xec', 'profiles'), { recursive: true });

      // Create base config
      await fs.writeFile(
        path.join(monorepoRoot, '.xec', 'config.yaml'),
        `version: "1.0"
name: monorepo
vars:
  env: base`
      );

      // Create profile in monorepo root
      await fs.writeFile(
        path.join(monorepoRoot, '.xec', 'profiles', 'production.yaml'),
        `vars:
  env: production
  apiUrl: https://api.example.com`
      );

      // Initialize manager with profile from workspace directory
      const manager = new ConfigurationManager({
        projectRoot: workspaceDir,
        profile: 'production',
        globalConfigDir: path.join(tempDir, 'global'),
        cache: false
      });

      const config = await manager.load();

      expect(config.vars?.env).toBe('production');
      expect(config.vars?.apiUrl).toBe('https://api.example.com');
    });

    it('should provide getProjectRoot() method for debugging', async () => {
      const monorepoRoot = tempDir;
      const workspaceDir = path.join(monorepoRoot, 'packages', 'lib');
      await fs.mkdir(workspaceDir, { recursive: true });
      await fs.mkdir(path.join(monorepoRoot, '.git'), { recursive: true });
      await fs.mkdir(path.join(monorepoRoot, '.xec'), { recursive: true });

      const manager = new ConfigurationManager({
        projectRoot: workspaceDir,
        globalConfigDir: path.join(tempDir, 'global'),
        cache: false
      });

      const projectRoot = await manager.getProjectRoot();
      
      expect(projectRoot).toBe(monorepoRoot);
    });

    it('should save config to monorepo root when called from subdirectory', async () => {
      const monorepoRoot = tempDir;
      const workspaceDir = path.join(monorepoRoot, 'apps', 'backend');
      await fs.mkdir(workspaceDir, { recursive: true });
      await fs.mkdir(path.join(monorepoRoot, '.git'), { recursive: true });
      
      // Initialize manager from workspace
      const manager = new ConfigurationManager({
        projectRoot: workspaceDir,
        globalConfigDir: path.join(tempDir, 'global'),
        cache: false
      });

      // Load default config
      await manager.load();
      
      // Modify config
      manager.set('name', 'saved-to-root');
      
      // Save without specifying path
      await manager.save();

      // Check that config was saved to monorepo root
      const savedContent = await fs.readFile(
        path.join(monorepoRoot, '.xec', 'config.yaml'),
        'utf-8'
      );

      expect(savedContent).toContain('name: saved-to-root');
    });
  });
});