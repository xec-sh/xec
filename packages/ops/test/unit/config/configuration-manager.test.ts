import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { ConfigurationManager, ConfigValidationError } from '../../../src/config/configuration-manager.js';

describe('ConfigurationManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-config-test-'));
    await fs.mkdir(path.join(tmpDir, '.xec'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    delete process.env['SECRET_CM_TEST_SECRET'];
    delete process.env['CM_TEST_USER'];
  });

  function createManager(options: { strict?: boolean } = {}) {
    return new ConfigurationManager({
      projectRoot: tmpDir,
      globalHomeDir: path.join(tmpDir, 'no-global-config'),
      envPrefix: 'XEC_CM_TEST_UNUSED_',
      ...options,
    });
  }

  async function writeConfig(yaml: string): Promise<string> {
    const configPath = path.join(tmpDir, '.xec', 'config.yaml');
    await fs.writeFile(configPath, yaml, 'utf-8');
    return configPath;
  }

  describe('save() never persists resolved values (defect #7)', () => {
    it('resolves secrets/cmd/env for runtime use but saves the raw templates', async () => {
      process.env['SECRET_CM_TEST_SECRET'] = 'sup3r-s3cret';
      process.env['CM_TEST_USER'] = 'alice';

      const configPath = await writeConfig([
        'version: "1.0"',
        'vars:',
        '  pw: "${secrets.cm_test_secret}"',
        // The command's OUTPUT (uppercase) differs from its literal text, so we
        // can assert the output never reaches the file.
        '  host: "${cmd:echo resolved-host | tr a-z A-Z}"',
        '  greeting: "Hello ${env.CM_TEST_USER}"',
        '',
      ].join('\n'));

      const manager = createManager();
      const config = await manager.load();

      // Runtime view is resolved
      expect(config.vars?.['pw']).toBe('sup3r-s3cret');
      expect(config.vars?.['host']).toBe('RESOLVED-HOST');
      expect(config.vars?.['greeting']).toBe('Hello alice');

      await manager.save();

      const saved = await fs.readFile(configPath, 'utf-8');
      expect(saved).toContain('${secrets.cm_test_secret}');
      expect(saved).toContain('${cmd:echo resolved-host | tr a-z A-Z}');
      expect(saved).toContain('Hello ${env.CM_TEST_USER}');
      expect(saved).not.toContain('sup3r-s3cret');
      expect(saved).not.toContain('RESOLVED-HOST');
      expect(saved).not.toContain('Hello alice');
    });

    it('update() mutations survive save() without leaking resolved values', async () => {
      process.env['SECRET_CM_TEST_SECRET'] = 'sup3r-s3cret';

      const configPath = await writeConfig([
        'version: "1.0"',
        'vars:',
        '  pw: "${secrets.cm_test_secret}"',
        '',
      ].join('\n'));

      const manager = createManager();
      await manager.load();

      manager.update(cfg => {
        cfg.tasks = { ...cfg.tasks, hello: 'echo hi' };
      });
      await manager.save();

      const saved = await fs.readFile(configPath, 'utf-8');
      expect(saved).toContain('hello: echo hi');
      expect(saved).toContain('${secrets.cm_test_secret}');
      expect(saved).not.toContain('sup3r-s3cret');
    });

    it('set() applies to both runtime and persisted config', async () => {
      const configPath = await writeConfig('version: "1.0"\n');

      const manager = createManager();
      await manager.load();

      manager.set('vars.newkey', 'newvalue');
      expect(manager.get('vars.newkey')).toBe('newvalue');

      await manager.save();
      const saved = await fs.readFile(configPath, 'utf-8');
      expect(saved).toContain('newkey: newvalue');
    });
  });

  describe('load-time interpolation is strict (defect #1)', () => {
    it('throws a clear error for an unresolvable variable instead of keeping the literal', async () => {
      await writeConfig([
        'version: "1.0"',
        'vars:',
        '  broken: "${vars.does_not_exist}"',
        '',
      ].join('\n'));

      const manager = createManager();
      await expect(manager.load()).rejects.toThrow(/does_not_exist/);
    });

    it('throws when a target references a missing secret (no literal password to SSH)', async () => {
      await writeConfig([
        'version: "1.0"',
        'targets:',
        '  hosts:',
        '    web:',
        '      host: web.example.com',
        '      password: "${secrets.missing_db_password}"',
        '',
      ].join('\n'));

      const manager = createManager();
      await expect(manager.load()).rejects.toThrow(/missing_db_password/);
    });

    it('leaves ${params.*} references untouched at load time (resolved at task runtime)', async () => {
      await writeConfig([
        'version: "1.0"',
        'vars:',
        '  template: "run with ${params.count}"',
        '',
      ].join('\n'));

      const manager = createManager();
      const config = await manager.load();
      expect(config.vars?.['template']).toBe('run with ${params.count}');
    });

    it('does not resolve task definitions or inactive profiles at load time', async () => {
      await writeConfig([
        'version: "1.0"',
        'tasks:',
        '  deploy:',
        '    command: "echo ${params.version}"',
        'profiles:',
        '  prod:',
        '    vars:',
        '      secret_url: "${secrets.only_in_prod}"',
        '',
      ].join('\n'));

      const manager = createManager();
      const config = await manager.load();

      expect((config.tasks?.['deploy'] as { command: string }).command).toBe('echo ${params.version}');
      expect(config.profiles?.['prod']?.vars?.['secret_url']).toBe('${secrets.only_in_prod}');
    });
  });

  describe('secret provider validation at load (defect #8)', () => {
    it('throws ConfigValidationError in strict mode for an unimplemented provider', async () => {
      await writeConfig([
        'version: "1.0"',
        'secrets:',
        '  provider: vault',
        '',
      ].join('\n'));

      const manager = createManager({ strict: true });
      try {
        await manager.load();
        expect.unreachable('load() should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigValidationError);
        const validationError = error as ConfigValidationError;
        expect(validationError.errors[0]?.path).toBe('secrets.provider');
        expect(validationError.errors[0]?.message).toMatch(/vault/);
        expect(validationError.errors[0]?.message).toMatch(/local, env, git/);
      }
    });

    it('warns but still loads in non-strict mode', async () => {
      await writeConfig([
        'version: "1.0"',
        'secrets:',
        '  provider: vault',
        '',
      ].join('\n'));

      const manager = createManager();
      const config = await manager.load();
      expect(config.version).toBe('1.0');
    });

    it('accepts the git provider in validation', async () => {
      await writeConfig('version: "1.0"\n');
      const manager = createManager();
      await manager.load();

      const errors = await manager.validateFile(await writeConfig([
        'version: "1.0"',
        'secrets:',
        '  provider: git',
        '',
      ].join('\n')));

      expect(errors.filter(e => e.path === 'secrets.provider')).toHaveLength(0);
    });
  });
});

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
      globalHomeDir: path.join(tempDir, 'global'),
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
      // Interpolation at load is strict, so reference an env var we control
      process.env['XEC_TEST_CM_USER'] = 'test-user';
      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        `version: "2.0"
vars:
  appName: myapp
  version: "1.0.0"
  fullName: \${vars.appName}-\${vars.version}
  envVar: \${env.XEC_TEST_CM_USER}
  withDefault: \${vars.missing:defaultValue}`
      );

      await manager.load();
    });

    afterEach(() => {
      delete process.env['XEC_TEST_CM_USER'];
    });

    it('should interpolate variables', () => {
      expect(manager.interpolate('${vars.appName}')).toBe('myapp');
      expect(manager.interpolate('app: ${vars.appName} v${vars.version}')).toBe('app: myapp v1.0.0');
    });

    it('should handle nested interpolation', () => {
      expect(manager.get('vars.fullName')).toBe('myapp-1.0.0');
    });

    it('should interpolate environment variables', () => {
      expect(manager.get('vars.envVar')).toBe('test-user');
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

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

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
        globalHomeDir: path.join(tempDir, 'global'),
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
        globalHomeDir: path.join(tempDir, 'global'),
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
        globalHomeDir: path.join(tempDir, 'global'),
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
        globalHomeDir: path.join(tempDir, 'global'),
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
        globalHomeDir: path.join(tempDir, 'global'),
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
        globalHomeDir: path.join(tempDir, 'global'),
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
        globalHomeDir: path.join(tempDir, 'global'),
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
describe('ConfigurationManager option wiring', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-config-wire-'));
    await fs.mkdir(path.join(tmpDir, '.xec'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function writeProjectConfig(content: string): Promise<void> {
    return fs.writeFile(path.join(tmpDir, '.xec', 'config.yaml'), content);
  }

  function makeManager(extra: Record<string, unknown> = {}) {
    return new ConfigurationManager({
      projectRoot: tmpDir,
      globalHomeDir: path.join(tmpDir, 'no-global-config'),
      ...extra,
    });
  }

  it('cache: true makes load() return the merged result without re-reading', async () => {
    // Re-loading also re-runs ${cmd:...} interpolation, which executes
    // commands, so an enabled cache must actually short-circuit.
    await writeProjectConfig('vars:\n  probe: first\n');
    const manager = makeManager({ cache: true });

    expect((await manager.load()).vars?.['probe']).toBe('first');

    await writeProjectConfig('vars:\n  probe: second\n');
    expect((await manager.load()).vars?.['probe']).toBe('first');
  });

  it('load() re-reads by default', async () => {
    await writeProjectConfig('vars:\n  probe: first\n');
    const manager = makeManager();

    expect((await manager.load()).vars?.['probe']).toBe('first');

    await writeProjectConfig('vars:\n  probe: second\n');
    expect((await manager.load()).vars?.['probe']).toBe('second');
  });

  it('useProfile() bypasses the cache', async () => {
    await writeProjectConfig('vars:\n  probe: base\n');
    await fs.mkdir(path.join(tmpDir, '.xec', 'profiles'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.xec', 'profiles', 'qa.yaml'),
      'vars:\n  probe: from-qa\n'
    );

    const manager = makeManager({ cache: true });
    await manager.load();

    await manager.useProfile('qa');
    expect(manager.get('vars.probe')).toBe('from-qa');
  });

  it('configFilePath replaces project-config discovery', async () => {
    // The conventional file exists and must lose to the named one.
    await writeProjectConfig('vars:\n  probe: from-discovery\n');
    const explicit = path.join(tmpDir, 'elsewhere.yaml');
    await fs.writeFile(explicit, 'vars:\n  probe: from-explicit\n');

    const manager = makeManager({ configFilePath: explicit });
    const config = await manager.load();

    expect(config.vars?.['probe']).toBe('from-explicit');
  });

  it('a missing configFilePath fails loudly in strict mode', async () => {
    const manager = makeManager({
      configFilePath: path.join(tmpDir, 'absent.yaml'),
      strict: true,
    });

    await expect(manager.load()).rejects.toThrow('absent.yaml');
  });

  it('does not mutate the options object it was given', () => {
    const options = { projectRoot: tmpDir };
    void new ConfigurationManager(options);
    expect(Object.keys(options)).toEqual(['projectRoot']);
  });

  it('reports missing load() without naming internals', () => {
    const manager = makeManager();
    try {
      manager.get('vars.probe');
      expect.unreachable('get() before load() must throw');
    } catch (error) {
      expect((error as Error).message).toContain('Call load() first');
      expect((error as Error).message).not.toContain('jsYaml');
    }
  });
});
