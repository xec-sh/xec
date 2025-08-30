/**
 * Tests for Configuration API
 * Using real file operations and no mocks
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { ConfigAPI } from '../../src/api/config-api.js';

describe('Configuration API', () => {
  let tempDir: string;
  let projectDir: string;
  let configPath: string;
  let api: ConfigAPI;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-config-api-test-'));
    projectDir = path.join(tempDir, 'project');

    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });

    configPath = path.join(projectDir, '.xec', 'config.yaml');

    // Change to project directory
    process.chdir(projectDir);

    // Create fresh API instance for each test
    api = new ConfigAPI({ path: configPath });
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('load()', () => {
    it('should load configuration from file', async () => {
      // Create test configuration
      const testConfig = {
        version: '2.0',
        vars: {
          app_name: 'test-app',
          port: 3000
        },
        targets: {
          hosts: {
            dev: {
              host: 'dev.example.com',
              user: 'developer'
            }
          }
        }
      };

      await fs.writeFile(configPath, yaml.dump(testConfig));

      // Load configuration
      await api.load();

      // Verify loaded data
      expect(api.getVersion()).toBe('2.0');
      expect(api.get('vars.app_name')).toBe('test-app');
      expect(api.get('vars.port')).toBe(3000);
      expect(api.get('targets.hosts.dev.host')).toBe('dev.example.com');
    });

    it('should apply overrides after loading', async () => {
      const testConfig = {
        version: '1.0',
        vars: {
          env: 'development'
        }
      };

      await fs.writeFile(configPath, yaml.dump(testConfig));

      // Create API with overrides
      const apiWithOverrides = new ConfigAPI({
        path: configPath,
        overrides: {
          'vars.env': 'production',
          'vars.debug': true
        }
      });

      await apiWithOverrides.load();

      expect(apiWithOverrides.get('vars.env')).toBe('production');
      expect(apiWithOverrides.get('vars.debug')).toBe(true);
    });

    it('should handle empty configuration file', async () => {
      await fs.writeFile(configPath, '');

      await api.load();

      // Should load default configuration when file is empty
      const config = api.getAll();
      expect(config.version).toBe('1.0');
      expect(config.targets).toBeDefined();
      expect(config.targets.local).toEqual({ type: 'local' });
      expect(config.commands).toBeDefined();
    });
  });

  describe('get() and set()', () => {
    beforeEach(async () => {
      const config = {
        version: '2.0',
        vars: {
          app: {
            name: 'myapp',
            version: '1.0.0'
          },
          ports: [3000, 3001]
        }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();
    });

    it('should get nested values', () => {
      expect(api.get('vars.app.name')).toBe('myapp');
      expect(api.get('vars.app.version')).toBe('1.0.0');
      expect(api.get('vars.ports')).toEqual([3000, 3001]);
    });

    it('should return undefined for non-existent paths', () => {
      expect(api.get('vars.nonexistent')).toBeUndefined();
      expect(api.get('deeply.nested.nonexistent')).toBeUndefined();
    });

    it('should set new values', () => {
      api.set('vars.new_value', 'test');
      expect(api.get('vars.new_value')).toBe('test');

      api.set('vars.app.updated', true);
      expect(api.get('vars.app.updated')).toBe(true);
    });

    it('should create nested paths when setting', () => {
      api.set('new.deeply.nested.value', 42);
      expect(api.get('new.deeply.nested.value')).toBe(42);
    });
  });

  describe('unset()', () => {
    beforeEach(async () => {
      const config = {
        vars: {
          keep: 'this',
          remove: 'that',
          nested: {
            keep: 'this too',
            remove: 'that too'
          }
        }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();
    });

    it('should remove values', () => {
      expect(api.get('vars.remove')).toBe('that');
      api.unset('vars.remove');
      expect(api.get('vars.remove')).toBeUndefined();
      expect(api.get('vars.keep')).toBe('this');
    });

    it('should remove nested values', () => {
      api.unset('vars.nested.remove');
      expect(api.get('vars.nested.remove')).toBeUndefined();
      expect(api.get('vars.nested.keep')).toBe('this too');
    });

    it('should handle non-existent paths gracefully', () => {
      expect(() => api.unset('does.not.exist')).not.toThrow();
    });
  });

  describe('save()', () => {
    it('should save configuration to file', async () => {
      const config = {
        version: '2.0',
        vars: { original: true }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();

      // Modify configuration
      api.set('vars.modified', true);
      api.set('vars.number', 42);
      api.unset('vars.original');

      // Save changes
      await api.save();

      // Read file directly to verify
      const savedContent = await fs.readFile(configPath, 'utf-8');
      const savedConfig = yaml.load(savedContent) as any;

      expect(savedConfig.vars.modified).toBe(true);
      expect(savedConfig.vars.number).toBe(42);
      expect(savedConfig.vars.original).toBeUndefined();
    });

    it('should save to custom path', async () => {
      await fs.writeFile(configPath, yaml.dump({ version: '1.0' }));
      await api.load();

      api.set('custom', true);

      const customPath = path.join(tempDir, 'custom-config.yaml');
      await api.save(customPath);

      const customContent = await fs.readFile(customPath, 'utf-8');
      const customConfig = yaml.load(customContent) as any;

      expect(customConfig.custom).toBe(true);
    });
  });

  describe('profiles', () => {
    beforeEach(async () => {
      const config = {
        version: '2.0',
        vars: {
          env: 'development',
          debug: true
        },
        profiles: {
          production: {
            vars: {
              env: 'production',
              debug: false,
              optimize: true
            }
          },
          staging: {
            vars: {
              env: 'staging'
            }
          }
        }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();
    });

    it('should list available profiles', () => {
      const profiles = api.listProfiles();
      expect(profiles).toContain('production');
      expect(profiles).toContain('staging');
      expect(profiles).toHaveLength(2);
    });

    it('should apply profile overrides', async () => {
      // Initial values
      expect(api.get('vars.env')).toBe('development');
      expect(api.get('vars.debug')).toBe(true);
      expect(api.get('vars.optimize')).toBeUndefined();

      // Apply production profile
      await api.useProfile('production');

      expect(api.get('vars.env')).toBe('production');
      expect(api.get('vars.debug')).toBe(false);
      expect(api.get('vars.optimize')).toBe(true);
    });

    it('should return current profile', async () => {
      expect(api.getProfile()).toBeUndefined();

      await api.useProfile('staging');
      expect(api.getProfile()).toBe('staging');
    });
  });

  describe('interpolation', () => {
    beforeEach(async () => {
      const config = {
        vars: {
          app_name: 'myapp',
          version: '1.2.3',
          full_name: '${vars.app_name}-${vars.version}'
        }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();
    });

    it('should interpolate variable references', () => {
      const result = api.interpolate('${vars.app_name}:${vars.version}');
      expect(result).toBe('myapp:1.2.3');
    });

    it('should interpolate with custom context', () => {
      const result = api.interpolate('${params.env}-${vars.app_name}', {
        params: { env: 'prod' }
      });
      expect(result).toBe('prod-myapp');
    });

    it('should handle environment variables', () => {
      process.env.TEST_VAR = 'test-value';
      const result = api.interpolate('${env.TEST_VAR}');
      expect(result).toBe('test-value');
      delete process.env.TEST_VAR;
    });

    it('should return template unchanged if variable not found', () => {
      const result = api.interpolate('${vars.nonexistent}');
      expect(result).toBe('${vars.nonexistent}');
    });
  });

  describe('validation', () => {
    it('should validate valid configuration', async () => {
      const config = {
        version: '2.0',
        vars: { test: true },
        targets: {
          hosts: {
            server: {
              host: 'example.com',
              user: 'admin'
            }
          }
        }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();

      const errors = await api.validate();
      expect(errors).toHaveLength(0);
    });

    it('should detect validation errors', async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            invalid: {
              // Missing required fields
              port: 'not-a-number'
            }
          }
        }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();

      const errors = await api.validate();
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('reload()', () => {
    it('should reload configuration from disk', async () => {
      // Initial config
      await fs.writeFile(configPath, yaml.dump({ vars: { value: 'initial' } }));
      await api.load();

      expect(api.get('vars.value')).toBe('initial');

      // Modify file on disk
      await fs.writeFile(configPath, yaml.dump({ vars: { value: 'updated' } }));

      // Reload
      await api.reload();

      expect(api.get('vars.value')).toBe('updated');
    });
  });

  describe('resolveTarget()', () => {
    beforeEach(async () => {
      const config = {
        version: '2.0',
        targets: {
          hosts: {
            web: {
              host: 'web.example.com',
              user: 'deploy',
              port: 2222
            }
          },
          containers: {
            app: {
              image: 'node:20',
              workdir: '/app'
            }
          }
        }
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();
    });

    it('should resolve configured targets', async () => {
      const sshTarget = await api.resolveTarget('hosts.web');
      expect(sshTarget.type).toBe('ssh');
      expect(sshTarget.name).toBe('web');
      expect(sshTarget.config.host).toBe('web.example.com');
      expect(sshTarget.config.port).toBe(2222);

      const dockerTarget = await api.resolveTarget('containers.app');
      expect(dockerTarget.type).toBe('docker');
      expect(dockerTarget.name).toBe('app');
      expect(dockerTarget.config.image).toBe('node:20');
    });
  });

  describe('feature detection', () => {
    it('should check for features', async () => {
      const config = {
        features: ['parallel-tasks', 'experimental-api']
      };

      await fs.writeFile(configPath, yaml.dump(config));
      await api.load();

      expect(api.hasFeature('parallel-tasks')).toBe(true);
      expect(api.hasFeature('experimental-api')).toBe(true);
      expect(api.hasFeature('non-existent')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw if used before loading', () => {
      const newApi = new ConfigAPI();

      expect(() => newApi.get('test')).toThrow('Configuration not loaded');
      expect(() => newApi.set('test', 'value')).toThrow('Configuration not loaded');
      expect(() => newApi.getAll()).toThrow('Configuration not loaded');
    });
  });
});