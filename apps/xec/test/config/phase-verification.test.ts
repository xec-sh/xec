/**
 * Phase 1 and Phase 2 verification tests
 * Verifies that all features from the spec are properly implemented
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { it, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';

import {
  TaskManager,
  TargetResolver,
  ConfigurationManager
} from '../../src/config/index.js';

describe('Phase 1 and Phase 2 Feature Verification', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-phase-test-'));
    await fs.mkdir(path.join(tempDir, '.xec'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Phase 1: Configuration System', () => {
    it('should parse YAML configuration with all supported sections', async () => {
      const configContent = {
        version: '2.0',
        name: 'test-project',
        description: 'Test project description',
        vars: {
          key: 'value',
          nested: { key: 'nested-value' }
        },
        targets: {
          hosts: {
            'test-host': {
              host: 'example.com',
              user: 'deploy'
            }
          }
        },
        profiles: {
          dev: {
            vars: { env: 'development' }
          }
        },
        tasks: {
          simple: 'echo "simple"',
          complex: {
            command: 'echo "complex"',
            description: 'Complex task'
          }
        },
        commands: {
          in: { defaultTimeout: '60s' }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({ projectRoot: tempDir });
      const loaded = await manager.load();

      // Verify all sections loaded
      expect(loaded.version).toBe('2.0');
      expect(loaded.name).toBe('test-project');
      expect(loaded.description).toBe('Test project description');
      expect(loaded.vars?.key).toBe('value');
      expect(loaded.targets?.hosts?.['test-host']).toBeDefined();
      expect(loaded.profiles?.dev).toBeDefined();
      expect(loaded.tasks?.simple).toBe('echo "simple"');
      expect(loaded.commands?.in?.defaultTimeout).toBe('60s');
    });

    it('should execute tasks with parameters and capture output', async () => {
      const configContent = {
        version: '2.0',
        tasks: {
          greet: {
            params: [
              { name: 'name', default: 'World' },
              { name: 'times', type: 'number', default: 1 }
            ],
            command: 'for i in $(seq 1 ${params.times}); do echo "Hello ${params.name}"; done'
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({ projectRoot: tempDir });
      const loaded = await manager.load();

      const taskManager = new TaskManager({ configManager: manager });
      await taskManager.load();

      // Test with defaults
      const result1 = await taskManager.run('greet');
      expect(result1.success).toBe(true);
      expect(result1.output?.trim()).toBe('Hello World');

      // Test with custom params
      const result2 = await taskManager.run('greet', { name: 'Xec', times: 2 });
      expect(result2.success).toBe(true);
      const lines = result2.output?.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines?.[0]).toBe('Hello Xec');
      expect(lines?.[1]).toBe('Hello Xec');
    });

    it('should handle multi-step pipelines with error handling', async () => {
      const configContent = {
        version: '2.0',
        tasks: {
          pipeline: {
            steps: [
              { name: 'Step 1', command: 'echo "Step 1 output"' },
              { name: 'Failing step', command: 'exit 1', onFailure: 'continue' },
              { name: 'Step 3', command: 'echo "Step 3 output"' }
            ]
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({ projectRoot: tempDir });
      const loaded = await manager.load();

      const taskManager = new TaskManager({ configManager: manager });
      await taskManager.load();

      const result = await taskManager.run('pipeline');

      // Pipeline should continue despite failure
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps?.[0].success).toBe(true);
      expect(result.steps?.[1].success).toBe(false);
      expect(result.steps?.[2].success).toBe(true);
      expect(result.steps?.[2].output).toContain('Step 3 output');
    });
  });

  describe('Phase 2: Target System', () => {
    it('should apply target defaults correctly', async () => {
      const configContent = {
        version: '2.0',
        targets: {
          defaults: {
            timeout: 5000,
            shell: '/bin/bash',
            ssh: {
              port: 2222,
              keepAlive: true
            },
            docker: {
              tty: true,
              workdir: '/app'
            }
          },
          hosts: {
            server1: {
              host: 'server1.com',
              user: 'deploy'
            },
            server2: {
              host: 'server2.com',
              user: 'admin',
              port: 22,
              timeout: 10000
            }
          },
          containers: {
            app: {
              image: 'node:18'
            },
            db: {
              image: 'postgres:15',
              tty: false
            }
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({ projectRoot: tempDir });
      const loaded = await manager.load();
      const resolver = new TargetResolver(loaded);

      // Check SSH target with defaults
      const server1 = await resolver.resolve('hosts.server1');
      expect(server1.config.port).toBe(2222); // From SSH defaults
      expect(server1.config.timeout).toBe(5000); // From common defaults
      expect(server1.config.shell).toBe('/bin/bash'); // From common defaults
      expect(server1.config.keepAlive).toBe(true); // From SSH defaults

      // Check SSH target with overrides
      const server2 = await resolver.resolve('hosts.server2');
      expect(server2.config.port).toBe(22); // Override
      expect(server2.config.timeout).toBe(10000); // Override
      expect(server2.config.keepAlive).toBe(true); // Still from defaults

      // Check Docker targets
      const app = await resolver.resolve('containers.app');
      expect(app.config.tty).toBe(true); // From Docker defaults
      expect(app.config.workdir).toBe('/app'); // From Docker defaults

      const db = await resolver.resolve('containers.db');
      expect(db.config.tty).toBe(false); // Override
      expect(db.config.workdir).toBe('/app'); // Still from defaults
    });

    it('should handle wildcard pattern matching', async () => {
      const configContent = {
        version: '2.0',
        targets: {
          hosts: {
            'web-prod-1': { host: 'web1.prod.com', user: 'deploy' },
            'web-prod-2': { host: 'web2.prod.com', user: 'deploy' },
            'web-staging-1': { host: 'web1.staging.com', user: 'deploy' },
            'api-prod-1': { host: 'api1.prod.com', user: 'deploy' },
            'api-prod-2': { host: 'api2.prod.com', user: 'deploy' }
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({ projectRoot: tempDir });
      const loaded = await manager.load();
      const resolver = new TargetResolver(loaded);

      // Test various patterns
      const webServers = await resolver.find('hosts.web-*');
      expect(webServers).toHaveLength(3);

      const prodServers = await resolver.find('hosts.*-prod-*');
      expect(prodServers).toHaveLength(4);

      const firstServers = await resolver.find('hosts.*-1');
      expect(firstServers).toHaveLength(3);

      // Test brace expansion
      const selected = await resolver.find('hosts.{web,api}-prod-*');
      expect(selected).toHaveLength(4);
    });
  });

  describe('Phase 2: Variable Interpolation', () => {
    it('should handle all variable types', async () => {
      // Set test environment variable
      process.env.TEST_ENV_VAR = 'test_value';

      const configContent = {
        version: '2.0',
        vars: {
          simple: 'value',
          reference: '${vars.simple}',
          envVar: '${env.TEST_ENV_VAR}',
          envWithDefault: '${env.MISSING:default}',
          command: '${cmd:echo "command output"}',
          nested: {
            key: '${vars.simple}',
            deep: {
              value: '${vars.nested.key}'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({ projectRoot: tempDir });
      const loaded = await manager.load();

      // Verify all interpolations
      expect(loaded.vars?.simple).toBe('value');
      expect(loaded.vars?.reference).toBe('value');
      expect(loaded.vars?.envVar).toBe('test_value');
      expect(loaded.vars?.envWithDefault).toBe('default');
      expect(loaded.vars?.command).toBe('command output');
      expect(loaded.vars?.nested.key).toBe('value');
      expect(loaded.vars?.nested.deep.value).toBe('value');

      // Cleanup
      delete process.env.TEST_ENV_VAR;
    });

    it('should detect circular references', async () => {
      const configContent = {
        version: '2.0',
        vars: {
          a: '${vars.b}',
          b: '${vars.a}'
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({
        projectRoot: tempDir,
        strict: false
      });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      await manager.load();

      const warnings = warnSpy.mock.calls.map(call => call[0]);
      expect(warnings.some(w => w.includes('Circular variable reference'))).toBe(true);

      warnSpy.mockRestore();
    });
  });

  describe('Phase 2: Profile System', () => {
    it('should handle profile inheritance with extends', async () => {
      const configContent = {
        version: '2.0',
        vars: {
          baseVar: 'base',
          overrideVar: 'base'
        },
        profiles: {
          base: {
            vars: {
              profileVar: 'from base',
              baseOnly: 'base value'
            }
          },
          dev: {
            extends: 'base',
            vars: {
              profileVar: 'from dev',
              devOnly: 'dev value'
            }
          },
          staging: {
            extends: 'dev',
            vars: {
              overrideVar: 'staging',
              stagingOnly: 'staging value'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      // Test base profile
      let manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'base'
      });
      let loaded = await manager.load();

      expect(loaded.vars?.baseVar).toBe('base');
      expect(loaded.vars?.profileVar).toBe('from base');
      expect(loaded.vars?.baseOnly).toBe('base value');
      expect(loaded.vars?.devOnly).toBeUndefined();

      // Test dev profile (extends base)
      manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'dev'
      });
      loaded = await manager.load();

      expect(loaded.vars?.profileVar).toBe('from dev'); // Override
      expect(loaded.vars?.baseOnly).toBe('base value'); // Inherited
      expect(loaded.vars?.devOnly).toBe('dev value');

      // Test staging profile (extends dev, which extends base)
      manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'staging'
      });
      loaded = await manager.load();

      expect(loaded.vars?.overrideVar).toBe('staging'); // Override
      expect(loaded.vars?.profileVar).toBe('from dev'); // From dev
      expect(loaded.vars?.baseOnly).toBe('base value'); // From base
      expect(loaded.vars?.devOnly).toBe('dev value'); // From dev
      expect(loaded.vars?.stagingOnly).toBe('staging value');
    });

    it('should handle $unset marker in profiles', async () => {
      const configContent = {
        version: '2.0',
        vars: {
          debug: true,
          logLevel: 'debug'
        },
        profiles: {
          prod: {
            vars: {
              debug: '$unset',
              logLevel: 'error'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({
        projectRoot: tempDir,
        profile: 'prod'
      });
      const loaded = await manager.load();

      expect(loaded.vars?.debug).toBeUndefined(); // Removed by $unset
      expect(loaded.vars?.logLevel).toBe('error'); // Override
    });
  });

  describe('Phase 2: Configuration Import', () => {
    it('should merge global and project configurations', async () => {
      const globalDir = path.join(tempDir, 'global');
      await fs.mkdir(globalDir, { recursive: true });

      // Global config
      const globalConfig = {
        version: '2.0',
        vars: {
          globalVar: 'global',
          sharedVar: 'from global'
        },
        targets: {
          hosts: {
            'global-host': {
              host: 'global.com',
              user: 'admin'
            }
          }
        }
      };

      // Project config
      const projectConfig = {
        version: '2.0',
        vars: {
          projectVar: 'project',
          sharedVar: 'from project'
        },
        targets: {
          hosts: {
            'project-host': {
              host: 'project.com',
              user: 'deploy'
            }
          }
        }
      };

      await fs.writeFile(
        path.join(globalDir, 'config.yaml'),
        yaml.dump(globalConfig)
      );

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(projectConfig)
      );

      const manager = new ConfigurationManager({
        projectRoot: tempDir,
        globalConfigDir: globalDir
      });
      const loaded = await manager.load();

      // Verify merging
      expect(loaded.vars?.globalVar).toBe('global');
      expect(loaded.vars?.projectVar).toBe('project');
      expect(loaded.vars?.sharedVar).toBe('from project'); // Project overrides

      // Both targets should exist
      expect(loaded.targets?.hosts?.['global-host']).toBeDefined();
      expect(loaded.targets?.hosts?.['project-host']).toBeDefined();
    });
  });

  describe('Real Command Execution', () => {
    it('should execute real commands with proper output capture', async () => {
      const testFile = path.join(tempDir, 'test.txt');

      const configContent = {
        version: '2.0',
        vars: {
          testFile,
          content: 'Hello from Xec'
        },
        tasks: {
          writeFile: {
            command: 'echo "${vars.content}" > "${vars.testFile}"'
          },
          readFile: {
            command: 'cat "${vars.testFile}"'
          },
          listFiles: {
            command: 'ls -la "${vars.testFile}"'
          }
        }
      };

      await fs.writeFile(
        path.join(tempDir, '.xec', 'config.yaml'),
        yaml.dump(configContent)
      );

      const manager = new ConfigurationManager({ projectRoot: tempDir });
      const loaded = await manager.load();

      const taskManager = new TaskManager({ configManager: manager });
      await taskManager.load();

      // Write file
      const writeResult = await taskManager.run('writeFile');
      expect(writeResult.success).toBe(true);

      // Verify file exists
      const exists = await fs.access(testFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Read file
      const readResult = await taskManager.run('readFile');
      expect(readResult.success).toBe(true);
      expect(readResult.output?.trim()).toBe('Hello from Xec');

      // List file
      const listResult = await taskManager.run('listFiles');
      expect(listResult.success).toBe(true);
      expect(listResult.output).toContain('test.txt');
    });
  });
});