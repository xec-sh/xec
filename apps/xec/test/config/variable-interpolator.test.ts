/**
 * Variable Interpolator tests
 */

import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { VariableInterpolator } from '../../src/config/variable-interpolator.js';

import type { Configuration, VariableContext } from '../../src/config/types.js';

describe('VariableInterpolator', () => {
  let interpolator: VariableInterpolator;
  let context: VariableContext;

  beforeEach(() => {
    interpolator = new VariableInterpolator();
    context = {
      vars: {
        appName: 'myapp',
        version: '1.0.0',
        nested: {
          key: 'value',
          deep: {
            item: 'deepValue'
          }
        },
        port: 3000,
        isEnabled: true
      },
      env: {
        USER: 'testuser',
        HOME: '/home/testuser'
      },
      params: {
        environment: 'production',
        count: 5
      },
      profile: 'test'
    };
  });

  afterEach(() => {
    interpolator.clearSecretsCache();
  });

  describe('interpolate()', () => {
    it('should handle non-string values', () => {
      expect(interpolator.interpolate(123 as any, context)).toBe(123);
      expect(interpolator.interpolate(true as any, context)).toBe(true);
      expect(interpolator.interpolate(null as any, context)).toBe(null);
      expect(interpolator.interpolate(undefined as any, context)).toBe(undefined);
    });

    it('should interpolate simple variables', () => {
      expect(interpolator.interpolate('${vars.appName}', context)).toBe('myapp');
      expect(interpolator.interpolate('${vars.version}', context)).toBe('1.0.0');
      expect(interpolator.interpolate('${vars.port}', context)).toBe('3000');
      expect(interpolator.interpolate('${vars.isEnabled}', context)).toBe('true');
    });

    it('should interpolate nested variables', () => {
      expect(interpolator.interpolate('${vars.nested.key}', context)).toBe('value');
      expect(interpolator.interpolate('${vars.nested.deep.item}', context)).toBe('deepValue');
    });

    it('should interpolate environment variables', () => {
      expect(interpolator.interpolate('${env.USER}', context)).toBe('testuser');
      expect(interpolator.interpolate('${env.HOME}', context)).toBe('/home/testuser');
    });

    it('should interpolate parameters', () => {
      expect(interpolator.interpolate('${params.environment}', context)).toBe('production');
      expect(interpolator.interpolate('${params.count}', context)).toBe('5');
    });

    it('should handle multiple variables in one string', () => {
      const result = interpolator.interpolate(
        'App: ${vars.appName} v${vars.version} on ${params.environment}',
        context
      );
      expect(result).toBe('App: myapp v1.0.0 on production');
    });

    it('should handle default values', () => {
      expect(interpolator.interpolate('${vars.missing:defaultValue}', context)).toBe('defaultValue');
      expect(interpolator.interpolate('${env.MISSING:fallback}', context)).toBe('fallback');

      // Should not use default if value exists
      expect(interpolator.interpolate('${vars.appName:ignored}', context)).toBe('myapp');
    });

    it('should handle variables without type prefix', () => {
      // Variables without prefix should default to 'vars'
      const result = interpolator.interpolate('${appName}', context);
      expect(result).toBe('myapp');

      // Non-existent variable without prefix - should return original placeholder
      const result2 = interpolator.interpolate('${nonExistent}', context);
      expect(result2).toBe('${nonExistent}');
    });

    it('should handle undefined variables without defaults', () => {
      // Should return original placeholder when variable is undefined
      expect(interpolator.interpolate('${vars.nonexistent}', context)).toBe('${vars.nonexistent}');
    });

    it('should handle non-string values in async interpolation', async () => {
      expect(await interpolator.interpolateAsync(123 as any, context)).toBe(123);
      expect(await interpolator.interpolateAsync(true as any, context)).toBe(true);
      expect(await interpolator.interpolateAsync(null as any, context)).toBe(null);
    });

    it('should warn about command substitution in synchronous context', () => {
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnMessages.push(msg);

      try {
        const result = interpolator.interpolate('${cmd:echo test}', context);
        expect(result).toBe('[cmd:echo test]');
        expect(warnMessages.length).toBeGreaterThan(0);
        expect(warnMessages[0]).toContain('not supported in synchronous context');
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should handle command substitution', async () => {
      const result = await interpolator.interpolateAsync('${cmd:echo hello}', context);
      expect(result.trim()).toBe('hello');
    });

    it('should handle complex commands with file operations', async () => {
      // Create a temp file path
      const tempFile = path.join(tmpdir(), `test-${Date.now()}.txt`);

      try {
        // Write to file using command substitution
        const writeResult = await interpolator.interpolateAsync(
          `\${cmd:echo "test content from interpolator" > ${tempFile} && echo "success"}`,
          context
        );
        expect(writeResult.trim()).toBe('success');

        // Read the file to verify content was written
        const fileContent = await fs.readFile(tempFile, 'utf-8');
        expect(fileContent.trim()).toBe('test content from interpolator');

        // Use command substitution to read the file
        const readResult = await interpolator.interpolateAsync(
          `\${cmd:cat ${tempFile}}`,
          context
        );
        expect(readResult.trim()).toBe('test content from interpolator');
      } finally {
        // Clean up
        try {
          await fs.unlink(tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should handle commands with pipes and redirects', async () => {
      const result = await interpolator.interpolateAsync(
        '${cmd:echo "line1\\nline2\\nline3" | grep line2}',
        context
      );
      expect(result.trim()).toBe('line2');
    });

    it('should handle failed command substitution', async () => {
      // Capture console.warn messages
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnMessages.push(msg);

      try {
        const result = await interpolator.interpolateAsync('${cmd:nonexistentcommand}', context);
        expect(result).toBe('');
        expect(warnMessages.length).toBeGreaterThan(0);
        expect(warnMessages[0]).toContain('Command substitution failed');
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should handle command execution exceptions', async () => {
      // Test with a command that might throw an exception
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnMessages.push(msg);

      try {
        // Use an invalid command that will throw
        const result = await interpolator.interpolateAsync('${cmd:}', context);
        expect(result).toBe('');
        expect(warnMessages.length).toBeGreaterThan(0);
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should handle recursive interpolation', () => {
      context.vars!.ref = '${vars.appName}';
      context.vars!.doubleRef = '${vars.ref}-${vars.version}';

      expect(interpolator.interpolate('${vars.ref}', context)).toBe('myapp');
      expect(interpolator.interpolate('${vars.doubleRef}', context)).toBe('myapp-1.0.0');
    });

    it('should detect circular references', () => {
      context.vars!.a = '${vars.b}';
      context.vars!.b = '${vars.a}';

      expect(() => interpolator.interpolate('${vars.a}', context)).toThrow('Circular variable reference');
    });

    it('should handle maximum depth', () => {
      // Create deep chain
      let current = 'final';
      for (let i = 0; i < 15; i++) {
        const key = `var${i}`;
        context.vars![key] = current;
        current = `\${vars.${key}}`;
      }
      context.vars!.start = current;

      expect(() => interpolator.interpolate('${vars.start}', context)).toThrow('Maximum variable interpolation depth');
    });

    it('should handle maximum depth in async interpolation', async () => {
      // Create deep chain for async
      let current = 'final';
      for (let i = 0; i < 15; i++) {
        const key = `async${i}`;
        context.vars![key] = current;
        current = `\${vars.${key}}`;
      }
      context.vars!.asyncStart = current;

      await expect(interpolator.interpolateAsync('${vars.asyncStart}', context))
        .rejects.toThrow('Maximum variable interpolation depth');
    });

    it('should handle secrets', () => {
      process.env.SECRET_API_KEY = 'secret123';

      try {
        const result = interpolator.interpolate('${secret:api_key}', context);
        expect(result).toBe('secret123');
      } finally {
        delete process.env.SECRET_API_KEY;
      }
    });

    it('should handle missing secrets', () => {
      const warnMessages: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnMessages.push(msg);

      try {
        // In sync mode, missing secrets return [secret:key] placeholder
        const result = interpolator.interpolate('${secret:missing_secret}', context);
        expect(result).toBe('[secret:missing_secret]');
        expect(warnMessages.length).toBeGreaterThan(0);
        expect(warnMessages[0]).toContain('Secret \'missing_secret\' not available in synchronous context');
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should cache secrets', () => {
      process.env.SECRET_CACHED_KEY = 'cachedSecret';

      try {
        // First call
        expect(interpolator.interpolate('${secret:cached_key}', context)).toBe('cachedSecret');

        // Change env var
        process.env.SECRET_CACHED_KEY = 'changed';

        // Should still return cached value
        expect(interpolator.interpolate('${secret:cached_key}', context)).toBe('cachedSecret');

        // Clear cache
        interpolator.clearSecretsCache();

        // Now should return new value
        expect(interpolator.interpolate('${secret:cached_key}', context)).toBe('changed');
      } finally {
        delete process.env.SECRET_CACHED_KEY;
      }
    });

    it('should handle different default value syntaxes', () => {
      // With spaces
      expect(interpolator.interpolate('${vars.missing : default with spaces}', context))
        .toBe(' default with spaces');

      // With special characters
      expect(interpolator.interpolate('${vars.missing:default-value_123}', context))
        .toBe('default-value_123');

      // Empty default
      expect(interpolator.interpolate('${vars.missing:}', context)).toBe('');
    });

    it('should handle special cases', () => {
      // Empty variable name
      expect(interpolator.interpolate('${}', context)).toBe('${}');

      // No closing brace
      expect(interpolator.interpolate('${vars.appName', context)).toBe('${vars.appName');

      // Escaped syntax (not variables)
      expect(interpolator.interpolate('\\${vars.appName}', context)).toBe('\\${vars.appName}');
    });
  });

  describe('hasVariables()', () => {
    it('should detect variables in strings', () => {
      expect(interpolator.hasVariables('${vars.test}')).toBe(true);
      expect(interpolator.hasVariables('Hello ${world}')).toBe(true);
      expect(interpolator.hasVariables('Multiple ${var1} and ${var2}')).toBe(true);

      expect(interpolator.hasVariables('No variables here')).toBe(false);
      expect(interpolator.hasVariables('$notVariable')).toBe(false);
      expect(interpolator.hasVariables('{not.variable}')).toBe(false);
    });

    it('should handle non-string values', () => {
      expect(interpolator.hasVariables(123)).toBe(false);
      expect(interpolator.hasVariables(true)).toBe(false);
      expect(interpolator.hasVariables(null)).toBe(false);
      expect(interpolator.hasVariables(undefined)).toBe(false);
      expect(interpolator.hasVariables({})).toBe(false);
      expect(interpolator.hasVariables([])).toBe(false);
    });
  });

  describe('parseVariables()', () => {
    it('should handle edge cases in parsing', () => {
      // Test with invalid reference that returns null
      const emptyResult = interpolator.parseVariables('${cmd} ${secret}');
      expect(emptyResult).toHaveLength(0);

      // Test with params type
      const paramsResult = interpolator.parseVariables('${params.test}');
      expect(paramsResult).toHaveLength(1);
      expect(paramsResult[0].type).toBe('params');
      expect(paramsResult[0].path).toBe('test');
    });

    it('should parse all variables from string', () => {
      const variables = interpolator.parseVariables(
        'App ${vars.name} v${vars.version} env: ${env.NODE_ENV:development}'
      );

      expect(variables).toHaveLength(3);

      expect(variables[0]).toEqual({
        type: 'vars',
        path: 'name',
        raw: '${vars.name}'
      });

      expect(variables[1]).toEqual({
        type: 'vars',
        path: 'version',
        raw: '${vars.version}'
      });

      expect(variables[2]).toEqual({
        type: 'env',
        path: 'NODE_ENV',
        defaultValue: 'development',
        raw: '${env.NODE_ENV:development}'
      });
    });

    it('should parse command and secret references', () => {
      const variables = interpolator.parseVariables(
        'Hash: ${cmd:git rev-parse HEAD} Key: ${secret:api_key}'
      );

      expect(variables).toHaveLength(2);

      expect(variables[0]).toEqual({
        type: 'cmd',
        path: 'git rev-parse HEAD',
        raw: '${cmd:git rev-parse HEAD}'
      });

      expect(variables[1]).toEqual({
        type: 'secret',
        path: 'api_key',
        raw: '${secret:api_key}'
      });
    });
  });

  describe('resolveConfig()', () => {
    it('should resolve variables in entire configuration', async () => {
      const config: Configuration = {
        version: '2.0',
        vars: {
          appName: 'myapp',
          version: '1.0.0',
          fullName: '${vars.appName}-${vars.version}',
          user: '${env.USER}'
        },
        tasks: {
          build: 'docker build -t ${vars.fullName} .',
          deploy: {
            command: 'kubectl apply -f ${vars.appName}.yaml',
            description: 'Deploy ${vars.appName} to cluster'
          }
        },
        targets: {
          hosts: {
            'app-server': {
              host: '${vars.appName}.example.com',
              user: '${env.USER:deploy}'
            }
          }
        }
      };

      const resolved = await interpolator.resolveConfig(config, context);

      expect(resolved.vars?.fullName).toBe('myapp-1.0.0');
      expect(resolved.vars?.user).toBe('testuser');

      expect(resolved.tasks?.build).toBe('docker build -t myapp-1.0.0 .');
      expect((resolved.tasks?.deploy as any).command).toBe('kubectl apply -f myapp.yaml');
      expect((resolved.tasks?.deploy as any).description).toBe('Deploy myapp to cluster');

      expect(resolved.targets?.hosts?.['app-server'].host).toBe('myapp.example.com');
      expect(resolved.targets?.hosts?.['app-server'].user).toBe('testuser');
    });

    it('should handle $unset marker', async () => {
      const config: Configuration = {
        version: '2.0',
        vars: {
          keep: 'value',
          remove: '$unset',
          nested: {
            keep: 'nested',
            remove: '$unset'
          }
        }
      };

      const resolved = await interpolator.resolveConfig(config, context);

      expect(resolved.vars?.keep).toBe('value');
      expect(resolved.vars?.remove).toBeUndefined();
      expect(resolved.vars?.nested?.keep).toBe('nested');
      expect(resolved.vars?.nested?.remove).toBeUndefined();
    });

    it('should resolve vars section with self-references', async () => {
      const config: Configuration = {
        version: '2.0',
        vars: {
          base: 'myapp',
          version: '1.0.0',
          tag: '${vars.base}:${vars.version}',
          image: 'registry.io/${vars.tag}'
        }
      };

      const resolved = await interpolator.resolveConfig(config, context);

      expect(resolved.vars?.tag).toBe('myapp:1.0.0');
      expect(resolved.vars?.image).toBe('registry.io/myapp:1.0.0');
    });

    it('should handle arrays in configuration', async () => {
      const config: Configuration = {
        version: '2.0',
        vars: {
          env: 'prod'
        },
        tasks: {
          test: {
            command: 'npm test',
            env: {
              NODE_ENV: '${vars.env}',
              FLAGS: ['--verbose', '--env=${vars.env}']
            }
          }
        }
      };

      const resolved = await interpolator.resolveConfig(config, context) as any;

      expect(resolved.tasks.test.env.NODE_ENV).toBe('prod');
      expect(resolved.tasks.test.env.FLAGS).toEqual(['--verbose', '--env=prod']);
    });

    it('should handle accessing properties on non-objects', async () => {
      // Test accessing nested path on primitive values
      context.vars!.primitive = 'string';
      context.vars!.nullValue = null;

      // When accessing properties on non-objects, should return original placeholder
      const result1 = interpolator.interpolate('${vars.primitive.nonexistent}', context);
      expect(result1).toBe('${vars.primitive.nonexistent}');

      const result2 = interpolator.interpolate('${vars.nullValue.property}', context);
      expect(result2).toBe('${vars.nullValue.property}');

      // Test with empty path
      const result3 = interpolator.interpolate('${vars}', context);
      expect(result3).toContain('[object Object]');
    });

    it('should handle null and undefined in resolveObject', async () => {
      const config: any = {
        version: '2.0',
        nullValue: null,
        undefinedValue: undefined,
        vars: {
          test: '${vars.value}'
        }
      };

      const resolved = await interpolator.resolveConfig(config, context);
      expect(resolved.nullValue).toBe(null);
      expect(resolved.undefinedValue).toBe(undefined);
    });
  });
});