import * as os from 'os';
import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SecretManager } from '../../src/secrets/index.js';
import { VariableInterpolator } from '../../src/config/variable-interpolator.js';
import { ConfigurationManager } from '../../src/config/configuration-manager.js';

describe('Secret Interpolation Integration', () => {
  let interpolator: VariableInterpolator;
  let secretManager: SecretManager;
  let configManager: ConfigurationManager;
  let testDir: string;
  let configFile: string;

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `xec-test-interpolation-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Create secret storage directory
    const secretsDir = path.join(testDir, '.xec', 'secrets');
    await fs.mkdir(secretsDir, { recursive: true });
    
    // Create configuration file with secrets config
    configFile = path.join(testDir, '.xec', 'config.yaml');
    const config = {
      version: '2.0',
      vars: {
        appName: 'test-app',
        environment: 'test'
      },
      secrets: {
        provider: 'local',
        config: {
          storageDir: secretsDir
        }
      },
      targets: {
        hosts: {
          prod: {
            host: '${secret:prod-host}',
            user: '${secret:prod-user}',
            privateKey: '${secret:prod-key}'
          }
        }
      }
    };
    
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));
    
    // Initialize configuration manager
    configManager = new ConfigurationManager({
      projectRoot: testDir,
      secretProvider: {
        type: 'local',
        config: {
          storageDir: secretsDir
        }
      }
    });
    
    // Load configuration
    await configManager.load();
    
    // Get secret manager and interpolator
    secretManager = configManager.getSecretManager();
    interpolator = new VariableInterpolator(secretManager);
  });

  afterEach(async () => {
    // Clean up
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('basic secret interpolation', () => {
    it('should interpolate secrets in strings', async () => {
      await secretManager.set('api-key', 'sk-12345678');
      
      const template = 'API Key: ${secret:api-key}';
      const result = await interpolator.interpolateAsync(template, {});
      
      expect(result).toBe('API Key: sk-12345678');
    });

    it('should handle missing secrets', async () => {
      const template = 'Missing: ${secret:non-existent}';
      const result = await interpolator.interpolateAsync(template, {});
      
      // Should log warning and return empty string
      expect(result).toBe('Missing: ');
    });

    it('should interpolate multiple secrets', async () => {
      await secretManager.set('username', 'admin');
      await secretManager.set('password', 'secret123');
      
      const template = 'Login: ${secret:username}/${secret:password}';
      const result = await interpolator.interpolateAsync(template, {});
      
      expect(result).toBe('Login: admin/secret123');
    });

    it('should cache secret values', async () => {
      await secretManager.set('cached-secret', 'cached-value');
      
      // First call
      const result1 = await interpolator.interpolateAsync('${secret:cached-secret}', {});
      expect(result1).toBe('cached-value');
      
      // Update secret (cache should still return old value)
      await secretManager.set('cached-secret', 'new-value');
      
      const result2 = await interpolator.interpolateAsync('${secret:cached-secret}', {});
      expect(result2).toBe('cached-value'); // Still cached
      
      // Clear cache
      interpolator.clearSecretsCache();
      
      const result3 = await interpolator.interpolateAsync('${secret:cached-secret}', {});
      expect(result3).toBe('new-value'); // Fresh value
    });
  });

  describe('mixed interpolation', () => {
    it('should interpolate secrets with variables', async () => {
      await secretManager.set('db-pass', 'db-secret-123');
      
      const template = 'postgres://${vars.appName}:${secret:db-pass}@localhost/${vars.environment}';
      const result = await interpolator.interpolateAsync(template, {
        vars: { appName: 'myapp', environment: 'staging' }
      });
      
      expect(result).toBe('postgres://myapp:db-secret-123@localhost/staging');
    });

    it('should interpolate secrets with environment variables', async () => {
      process.env.DB_HOST = 'localhost';
      await secretManager.set('db-password', 'secret456');
      
      const template = 'postgres://user:${secret:db-password}@${env.DB_HOST}/db';
      const result = await interpolator.interpolateAsync(template, {
        env: { DB_HOST: 'localhost' }
      });
      
      expect(result).toBe('postgres://user:secret456@localhost/db');
      
      delete process.env.DB_HOST;
    });

    it('should handle nested interpolation', async () => {
      await secretManager.set('env-prod', 'production');
      await secretManager.set('key-production', 'prod-secret');
      
      // First resolve the inner variable
      const envTemplate = '${secret:env-prod}';
      const env = await interpolator.interpolateAsync(envTemplate, {});
      expect(env).toBe('production');
      
      // Then use it to build the key
      const keyTemplate = `$\{secret:key-${env}}`;
      const result = await interpolator.interpolateAsync(keyTemplate, {});
      
      // Two-step interpolation should work
      expect(result).toBe('prod-secret');
    });
  });

  describe('configuration integration', () => {
    it('should resolve secrets in configuration', async () => {
      // Set secrets
      await secretManager.set('prod-host', 'prod.example.com');
      await secretManager.set('prod-user', 'deploy');
      await secretManager.set('prod-key', '/path/to/key');
      
      // Reload configuration to apply interpolation
      const config = await configManager.load();
      
      // Get target resolver
      const targetResolver = configManager.getTargetResolver();
      const prodTarget = await targetResolver.resolve('hosts.prod');
      
      expect(prodTarget.config).toEqual({
        type: 'ssh',
        host: 'prod.example.com',
        user: 'deploy',
        privateKey: '/path/to/key'
      });
    });

    it('should handle secrets in task definitions', async () => {
      // Create config with tasks using secrets
      const taskConfig = {
        version: '2.0',
        secrets: {
          provider: 'local',
          config: {
            storageDir: path.join(testDir, '.xec', 'secrets')
          }
        },
        tasks: {
          deploy: {
            description: 'Deploy to production',
            targets: ['prod'],
            env: {
              API_KEY: '${secret:api-key}',
              DB_PASSWORD: '${secret:db-password}'
            },
            run: 'echo "Deploying with API key: $API_KEY"'
          }
        }
      };
      
      await fs.writeFile(configFile, JSON.stringify(taskConfig, null, 2));
      
      // Set secrets
      await secretManager.set('api-key', 'sk-prod-12345');
      await secretManager.set('db-password', 'prod-db-pass');
      
      // This would be used at task execution time
      const taskEnv = {
        API_KEY: '${secret:api-key}',
        DB_PASSWORD: '${secret:db-password}'
      };
      
      const resolvedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(taskEnv)) {
        resolvedEnv[key] = await interpolator.interpolateAsync(value, {});
      }
      
      expect(resolvedEnv).toEqual({
        API_KEY: 'sk-prod-12345',
        DB_PASSWORD: 'prod-db-pass'
      });
    });
  });

  describe('sync vs async interpolation', () => {
    it('should handle secrets differently in sync mode', async () => {
      await secretManager.set('sync-secret', 'sync-value');
      
      // Sync interpolation should warn and return placeholder
      const syncResult = interpolator.interpolate('${secret:sync-secret}', {});
      expect(syncResult).toBe('[secret:sync-secret]');
      
      // Async interpolation should work
      const asyncResult = await interpolator.interpolateAsync('${secret:sync-secret}', {});
      expect(asyncResult).toBe('sync-value');
    });

    it('should fall back to env variables in sync mode', async () => {
      process.env.SECRET_FALLBACK_KEY = 'env-fallback-value';
      
      // Sync should use env fallback
      const syncResult = interpolator.interpolate('${secret:fallback-key}', {});
      expect(syncResult).toBe('env-fallback-value');
      
      // Async should also work
      const asyncResult = await interpolator.interpolateAsync('${secret:fallback-key}', {});
      expect(asyncResult).toBe('env-fallback-value');
      
      delete process.env.SECRET_FALLBACK_KEY;
    });
  });

  describe('error handling', () => {
    it('should handle secret provider errors gracefully', async () => {
      // Create a failing secret manager
      const failingManager = new SecretManager();
      (failingManager as any).provider = {
        get: async () => { throw new Error('Provider error'); },
        initialize: async () => {}
      };
      
      const errorInterpolator = new VariableInterpolator(failingManager);
      
      const result = await errorInterpolator.interpolateAsync('${secret:fail}', {});
      expect(result).toBe(''); // Should return empty string on error
    });

    it('should handle circular references in secrets', async () => {
      await secretManager.set('circular1', '${secret:circular2}');
      await secretManager.set('circular2', '${secret:circular1}');
      
      await expect(
        interpolator.interpolateAsync('${secret:circular1}', {})
      ).rejects.toThrow('Circular variable reference detected');
    });
  });

  describe('special characters', () => {
    it('should handle secrets with special characters', async () => {
      const specialValue = 'p@ssw0rd!#$%^&*()_+-={}[]|\\:";\'<>?,./';
      await secretManager.set('special-chars', specialValue);
      
      const result = await interpolator.interpolateAsync('${secret:special-chars}', {});
      expect(result).toBe(specialValue);
    });

    it('should handle secrets with newlines', async () => {
      const multilineSecret = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...
-----END RSA PRIVATE KEY-----`;
      
      await secretManager.set('private-key', multilineSecret);
      
      const result = await interpolator.interpolateAsync('${secret:private-key}', {});
      expect(result).toBe(multilineSecret);
    });
  });

  describe('performance', () => {
    it('should handle many secrets efficiently', async () => {
      // Set many secrets
      const secretCount = 100;
      for (let i = 0; i < secretCount; i++) {
        await secretManager.set(`secret-${i}`, `value-${i}`);
      }
      
      // Build template with all secrets
      const parts = [];
      for (let i = 0; i < secretCount; i++) {
        parts.push(`\${secret:secret-${i}}`);
      }
      const template = parts.join(',');
      
      const start = Date.now();
      const result = await interpolator.interpolateAsync(template, {});
      const duration = Date.now() - start;
      
      // Should complete reasonably fast (under 3 seconds for 100 file operations)
      expect(duration).toBeLessThan(3000);
      
      // Verify result
      const expected = Array.from({ length: secretCount }, (_, i) => `value-${i}`).join(',');
      expect(result).toBe(expected);
    });
  });
});