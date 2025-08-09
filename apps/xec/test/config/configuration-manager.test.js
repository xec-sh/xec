import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { ConfigurationManager } from '../../src/config/configuration-manager';
describe('ConfigurationManager', () => {
    let tempDir;
    let manager;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-config-test-'));
        await fs.mkdir(path.join(tempDir, '.xec'), { recursive: true });
        manager = new ConfigurationManager({
            projectRoot: tempDir,
            globalConfigDir: path.join(tempDir, 'global'),
            cache: false
        });
    });
    afterEach(async () => {
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
            const projectConfig = {
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
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "1.0"
name: test-project
vars:
  appName: myapp
  version: "1.0.0"
tasks:
  test: npm test
  build:
    command: npm run build
    description: Build the project`);
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
            await fs.mkdir(path.join(tempDir, 'global'), { recursive: true });
            await fs.writeFile(path.join(tempDir, 'global', 'config.yaml'), `version: "1.0"
vars:
  globalVar: fromGlobal
  sharedVar: globalValue
commands:
  in:
    defaultTimeout: 60s`);
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "2.0"
vars:
  projectVar: fromProject
  sharedVar: projectValue
tasks:
  test: npm test`);
            const config = await manager.load();
            expect(config.vars?.globalVar).toBe('fromGlobal');
            expect(config.vars?.projectVar).toBe('fromProject');
            expect(config.vars?.sharedVar).toBe('projectValue');
            expect(config.commands?.in?.defaultTimeout).toBe('60s');
            expect(config.tasks?.test).toBe('npm test');
        });
        it('should apply profiles', async () => {
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "1.0"
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
      apiUrl: https://staging.api.example.com`);
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
            }
            finally {
                delete process.env.XEC_VARS_ENV_VAR;
                delete process.env.XEC_COMMANDS_IN_DEFAULTTIMEOUT;
            }
        });
    });
    describe('get() and set()', () => {
        beforeEach(async () => {
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "1.0"
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
      user: deploy`);
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
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "2.0"
vars:
  appName: myapp
  version: "1.0.0"
  fullName: \${vars.appName}-\${vars.version}
  envVar: \${env.USER}
  withDefault: \${vars.missing:defaultValue}`);
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
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "2.0"
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
      env: staging`);
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
            expect(manager.get('vars.debug')).toBe(false);
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
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "1.0"
vars:
  vars: invalid`);
            manager = new ConfigurationManager({
                projectRoot: tempDir,
                strict: true
            });
            await expect(manager.load()).rejects.toThrow('Configuration validation failed');
        });
        it('should warn in non-strict mode', async () => {
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "2.0"
vars:
  env: test  # This conflicts with reserved name`);
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
            await manager.load();
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });
    describe('special keys', () => {
        it('should handle $unset marker', async () => {
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "2.0"
vars:
  keep: value
  remove: toBeRemoved
profiles:
  clean:
    vars:
      remove: $unset`);
            manager = new ConfigurationManager({
                projectRoot: tempDir,
                profile: 'clean'
            });
            await manager.load();
            expect(manager.get('vars.keep')).toBe('value');
            expect(manager.get('vars.remove')).toBeUndefined();
        });
        it('should handle $merge marker for arrays', async () => {
            await fs.writeFile(path.join(tempDir, '.xec', 'config.yaml'), `version: "2.0"
vars:
  list: [a, b]
profiles:
  extended:
    vars:
      list: [$merge, c, d]`);
            manager = new ConfigurationManager({
                projectRoot: tempDir,
                profile: 'extended'
            });
            await manager.load();
            expect(manager.get('vars.list')).toEqual(['a', 'b', 'c', 'd']);
        });
    });
});
//# sourceMappingURL=configuration-manager.test.js.map