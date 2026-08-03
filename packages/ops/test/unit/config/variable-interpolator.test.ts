import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { SecretManager } from '../../../src/secrets/manager.js';
import { VariableInterpolator } from '../../../src/config/variable-interpolator.js';

import type { Configuration, VariableContext } from '../../../src/config/types.js';

describe('VariableInterpolator', () => {
  let interpolator: VariableInterpolator;

  beforeEach(() => {
    interpolator = new VariableInterpolator();
  });

  afterEach(() => {
    delete process.env['SECRET_VI_TEST_SECRET'];
  });

  describe('secrets namespace (defect #1)', () => {
    beforeEach(() => {
      process.env['SECRET_VI_TEST_SECRET'] = 's3cret-value';
    });

    it('resolves ${secrets.name} (dotted plural form) synchronously', () => {
      const result = interpolator.interpolate('pw=${secrets.vi_test_secret}', {});
      expect(result).toBe('pw=s3cret-value');
    });

    it('resolves ${secret.name} (dotted singular form)', () => {
      const result = interpolator.interpolate('pw=${secret.vi_test_secret}', {});
      expect(result).toBe('pw=s3cret-value');
    });

    it('resolves ${secret:name} (colon form)', () => {
      const result = interpolator.interpolate('pw=${secret:vi_test_secret}', {});
      expect(result).toBe('pw=s3cret-value');
    });

    it('resolves ${secrets.name} asynchronously through a SecretManager', async () => {
      const manager = new SecretManager({ type: 'env' });
      const withManager = new VariableInterpolator(manager);

      const result = await withManager.interpolateAsync('pw=${secrets.vi_test_secret}', {});
      expect(result).toBe('pw=s3cret-value');
    });

    it('prefers explicitly provided context.secrets', () => {
      const context: VariableContext = { secrets: { vi_test_secret: 'from-context' } };
      expect(interpolator.interpolate('${secrets.vi_test_secret}', context)).toBe('from-context');
    });

    it('never returns the literal template for a missing secret — it throws', async () => {
      await expect(interpolator.interpolateAsync('pw=${secrets.does_not_exist}', {}))
        .rejects.toThrow(/secret 'does_not_exist' not found/);
    });

    it('throws for a missing secret in sync mode with an actionable message', () => {
      expect(() => interpolator.interpolate('pw=${secrets.does_not_exist}', {}))
        .toThrow(/secret 'does_not_exist'/);
    });
  });

  describe('unresolvable references throw by default (defect #1)', () => {
    it('throws for an undefined variable instead of returning the literal', () => {
      expect(() => interpolator.interpolate('host=${vars.missing}', { vars: {} }))
        .toThrow(/variable 'missing' is not defined/);
    });

    it('throws for an undefined variable in async mode', async () => {
      await expect(interpolator.interpolateAsync('host=${vars.missing}', { vars: {} }))
        .rejects.toThrow(/variable 'missing' is not defined/);
    });

    it('throws for an unset environment variable', () => {
      expect(() => interpolator.interpolate('${env.VI_TEST_DEFINITELY_UNSET_VAR}', { env: {} }))
        .toThrow(/environment variable 'VI_TEST_DEFINITELY_UNSET_VAR' is not set/);
    });

    it('throws for a missing parameter', () => {
      expect(() => interpolator.interpolate('${params.count}', { params: {} }))
        .toThrow(/parameter 'count' was not provided/);
    });

    it('still applies default values before throwing', () => {
      expect(interpolator.interpolate('${vars.missing:fallback}', { vars: {} })).toBe('fallback');
    });

    it("keeps the literal text when onUndefined is 'keep'", () => {
      const result = interpolator.interpolate('host=${vars.missing}', { vars: {} }, { onUndefined: 'keep' });
      expect(result).toBe('host=${vars.missing}');
    });

    it('keeps only lenient types literal while other unresolved types still throw', async () => {
      const options = { lenientTypes: ['params' as const] };

      const kept = await interpolator.interpolateAsync('run ${params.later}', {}, options);
      expect(kept).toBe('run ${params.later}');

      await expect(interpolator.interpolateAsync('run ${vars.missing}', { vars: {} }, options))
        .rejects.toThrow(/variable 'missing'/);
    });

    it('resolves defined values normally', () => {
      const context: VariableContext = { vars: { app: 'xec' }, params: { n: 3 }, env: { HOME_X: '/tmp' } };
      expect(interpolator.interpolate('${vars.app}-${params.n}-${env.HOME_X}', context)).toBe('xec-3-/tmp');
    });
  });

  describe('command substitution', () => {
    it('executes ${cmd:...} in async mode', async () => {
      const result = await interpolator.interpolateAsync('v=${cmd:echo hello}', {});
      expect(result).toBe('v=hello');
    });

    it('throws when a substituted command fails (strict mode)', async () => {
      await expect(interpolator.interpolateAsync('${cmd:exit 3}', {}))
        .rejects.toThrow(/failed/);
    });

    it('throws in sync mode instead of injecting a placeholder', () => {
      expect(() => interpolator.interpolate('${cmd:echo hi}', {}))
        .toThrow(/interpolateAsync/);
    });

    it("keeps the literal in sync mode with onUndefined 'keep'", () => {
      const result = interpolator.interpolate('${cmd:echo hi}', {}, { onUndefined: 'keep' });
      expect(result).toBe('${cmd:echo hi}');
    });
  });

  describe('replacement safety (defect #4)', () => {
    it('does not expand $-patterns from resolved values in async mode', async () => {
      const context: VariableContext = { vars: { weird: "a$&b$'c$`d$1e" } };
      const result = await interpolator.interpolateAsync('[${vars.weird}]', context);
      expect(result).toBe("[a$&b$'c$`d$1e]");
    });

    it('does not expand $-patterns from resolved values in sync mode', () => {
      const context: VariableContext = { vars: { weird: 'x$&y' } };
      expect(interpolator.interpolate('<${vars.weird}>', context)).toBe('<x$&y>');
    });

    it('replaces repeated occurrences of the same reference correctly', async () => {
      const context: VariableContext = { vars: { a: '$&' } };
      const result = await interpolator.interpolateAsync('${vars.a} and ${vars.a}', context);
      expect(result).toBe('$& and $&');
    });

    it('preserves surrounding text around multiple different references', async () => {
      const context: VariableContext = { vars: { a: 'A', b: 'B' } };
      const result = await interpolator.interpolateAsync('pre ${vars.a} mid ${vars.b} post', context);
      expect(result).toBe('pre A mid B post');
    });
  });

  describe('escape handling (defect #5)', () => {
    it('renders \\${...} as literal ${...} with the backslash stripped (sync)', () => {
      const result = interpolator.interpolate('use \\${vars.x} syntax', { vars: {} });
      expect(result).toBe('use ${vars.x} syntax');
    });

    it('renders \\${...} as literal ${...} with the backslash stripped (async)', async () => {
      const result = await interpolator.interpolateAsync('use \\${vars.x} syntax', { vars: {} });
      expect(result).toBe('use ${vars.x} syntax');
    });

    it('interpolates unescaped references while keeping escaped ones literal', () => {
      const context: VariableContext = { vars: { a: 'VAL' } };
      const result = interpolator.interpolate('${vars.a} \\${vars.a}', context);
      expect(result).toBe('VAL ${vars.a}');
    });
  });

  describe('resolveValue', () => {
    it('returns raw values preserving their type', () => {
      const context: VariableContext = { vars: { count: 5, flag: true, name: 'xec' } };
      expect(interpolator.resolveValue('vars.count', context)).toBe(5);
      expect(interpolator.resolveValue('vars.flag', context)).toBe(true);
      expect(interpolator.resolveValue('vars.name', context)).toBe('xec');
    });

    it('throws for unresolvable references', () => {
      expect(() => interpolator.resolveValue('vars.missing', { vars: {} }))
        .toThrow(/variable 'missing'/);
    });

    it('interpolates nested templates inside resolved values', () => {
      const context: VariableContext = { vars: { a: 'x-${vars.b}', b: 'y' } };
      expect(interpolator.resolveValue('vars.a', context)).toBe('x-y');
    });
  });

  describe('circular references', () => {
    it('detects circular variable references', () => {
      const context: VariableContext = { vars: { a: '${vars.b}', b: '${vars.a}' } };
      expect(() => interpolator.interpolate('${vars.a}', context)).toThrow(/Circular variable reference/);
    });
  });
});

describe('VariableInterpolator comprehensive suite', () => {
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

      // Non-existent variable without prefix throws in strict mode…
      expect(() => interpolator.interpolate('${nonExistent}', context))
        .toThrow(/'nonExistent' is not defined/);

      // …and stays literal with onUndefined: 'keep'
      const kept = interpolator.interpolate('${nonExistent}', context, { onUndefined: 'keep' });
      expect(kept).toBe('${nonExistent}');
    });

    it('should handle non-string values in async interpolation', async () => {
      expect(await interpolator.interpolateAsync(123 as any, context)).toBe(123);
      expect(await interpolator.interpolateAsync(true as any, context)).toBe(true);
      expect(await interpolator.interpolateAsync(null as any, context)).toBe(null);
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

    it('should throw for an empty command substitution', async () => {
      await expect(interpolator.interpolateAsync('${cmd:}', context))
        .rejects.toThrow(/Command substitution .* failed/);
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

      // Escaped syntax renders as literal ${...} with the backslash stripped
      expect(interpolator.interpolate('\\${vars.appName}', context)).toBe('${vars.appName}');
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

      // Accessing properties on non-objects is unresolvable — strict mode throws
      expect(() => interpolator.interpolate('${vars.primitive.nonexistent}', context))
        .toThrow(/primitive\.nonexistent/);
      expect(() => interpolator.interpolate('${vars.nullValue.property}', context))
        .toThrow(/nullValue\.property/);

      // …and onUndefined: 'keep' preserves the literal text
      expect(interpolator.interpolate('${vars.primitive.nonexistent}', context, { onUndefined: 'keep' }))
        .toBe('${vars.primitive.nonexistent}');

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
          test: 'plain-value'
        }
      };

      const resolved = await interpolator.resolveConfig(config, context);
      expect(resolved.nullValue).toBe(null);
      expect(resolved.undefinedValue).toBe(undefined);
      expect(resolved.vars?.test).toBe('plain-value');
    });
  });
});