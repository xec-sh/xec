
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine, createCallableEngine } from '../../../src/index.js';

/** Escaping is the shell's rule, so these pin one rather than the host's. */
const POSIX = { shell: 'sh' } as const;

describe('Templates', () => {
  const engine = new ExecutionEngine();
  const $ = createCallableEngine(engine);
  const mock = new MockAdapter();
  engine.registerAdapter('mock', mock);
  const $mock = $.with({ adapter: 'mock' as any });

  beforeEach(() => {
    mock.clearMocks();
  });

  describe('template method', () => {
    it('should create a template', () => {
      const template = $.template('echo {{message}}');
      expect(template).toBeDefined();
      expect(template.getRequiredParams()).toEqual(['message']);
    });
  });

  describe('templates.create', () => {
    it('should create a command template', async () => {
      const template = $.templates.create('echo {{message}}', POSIX);
      mock.mockSuccess(`sh -c "echo 'Hello World'"`, 'Hello World');

      const result = await template.execute($mock, { message: 'Hello World' });
      expect(result.stdout).toBe('Hello World');
    });

    it('should use default values', async () => {
      const template = $.templates.create('echo {{greeting}} {{name}}', {
        ...POSIX,
        defaults: { greeting: 'Hello' }
      });
      mock.mockSuccess('sh -c "echo Hello World"', 'Hello World');

      const result = await template.execute($mock, { name: 'World' });
      expect(result.stdout).toBe('Hello World');
    });

    it('should validate parameters', async () => {
      const template = $.templates.create('rm {{file}}', {
        ...POSIX,
        validate: (params) => {
          if (!params['file'].endsWith('.tmp')) {
            throw new Error('Only .tmp files can be deleted');
          }
        }
      });

      await expect(
        template.execute($mock, { file: 'important.txt' })
      ).rejects.toThrow('Only .tmp files can be deleted');
    });

    it('should transform results', async () => {
      const template = $.templates.create('cat {{file}}', {
        ...POSIX,
        transform: (result) => JSON.parse(result.stdout)
      });
      mock.mockSuccess('sh -c "cat data.json"', '{"value": 42}');

      const result = await template.execute($mock, { file: 'data.json' });
      expect(result).toEqual({ value: 42 });
    });
  });

  describe('templates.register and templates.get', () => {
    it('should register and retrieve templates', async () => {
      $.templates.register('deploy', 'echo "Deploying {{app}} to {{env}}"', {
        defaults: { env: 'staging' }
      });

      const template = $.templates.get('deploy');
      expect(template).toBeDefined();

      mock.mockSuccess('sh -c "echo "Deploying myapp to production""', 'Deploying myapp to production');
      const result = await template.execute($mock, { app: 'myapp', env: 'production' });
      expect(result.stdout).toBe('Deploying myapp to production');
    });

    it('should throw for non-existent template', () => {
      expect(() => $.templates.get('non-existent')).toThrow("Template 'non-existent' not found");
    });
  });

  describe('templates.render', () => {
    it('quotes for the shell it was given, not the engine default', () => {
      // The options object was read for `defaults` and dropped for
      // everything else, so a template rendered for cmd from a POSIX host
      // came back POSIX-quoted — which is not quoting at all once it gets
      // to cmd.
      const value = { m: 'a b' };

      expect($.templates.render('echo {{m}}', value, { shell: 'sh' })).toBe("echo 'a b'");
      expect($.templates.render('echo {{m}}', value, { shell: 'cmd.exe' })).toBe('echo ^"a^ b^"');
    });

    it('should render template string with data', () => {
      const rendered = $.templates.render('echo {{message}}', { message: 'Hello' }, POSIX);
      expect(rendered).toBe('echo Hello');
    });

    it('should escape values with spaces', () => {
      const rendered = $.templates.render('echo {{message}}', { message: 'Hello World' }, POSIX);
      expect(rendered).toBe("echo 'Hello World'");
    });

    it('should escape quotes in values', () => {
      const rendered = $.templates.render('echo {{message}}', { message: 'Hello "World"' }, POSIX);
      expect(rendered).toBe(`echo 'Hello "World"'`);
    });

    it('should neutralise command substitution in values', () => {
      // Double-quote wrapping used to leave `$(…)`, backticks and `$VAR`
      // expandable, turning every templated parameter into an injection point.
      expect($.templates.render('echo {{m}}', { m: '$(id)' }, POSIX)).toBe(`echo '$(id)'`);
      expect($.templates.render('echo {{m}}', { m: '`id`' }, POSIX)).toBe("echo '`id`'");
      expect($.templates.render('echo {{m}}', { m: '$HOME' }, POSIX)).toBe(`echo '$HOME'`);
      expect($.templates.render('echo {{m}}', { m: 'a; rm -rf /' }, POSIX)).toBe(`echo 'a; rm -rf /'`);
    });

    it('should not let a quote in a value break out of quoting', () => {
      const rendered = $.templates.render('echo {{m}}', { m: `'; id; '` }, POSIX);
      expect(rendered).toBe(`echo ''\\''; id; '\\'''`);
    });
  });

  describe('templates.parse', () => {
    it('should parse template and extract parameters', () => {
      const parsed = $.templates.parse('kubectl apply -f {{file}} -n {{namespace}}');
      expect(parsed.template).toBe('kubectl apply -f {{file}} -n {{namespace}}');
      expect(parsed.params).toEqual(['file', 'namespace']);
    });

    it('should handle templates with no parameters', () => {
      const parsed = $.templates.parse('echo "Hello World"');
      expect(parsed.params).toEqual([]);
    });
  });

  describe('complex template scenarios', () => {
    it('should handle multiple parameters', async () => {
      const template = $.templates.create(
        'docker build -t {{registry}}/{{image}}:{{tag}} {{context}}',
        {
          defaults: {
            registry: 'docker.io',
            tag: 'latest',
            context: '.'
          }
        }
      );

      mock.mockSuccess(
        'sh -c "docker build -t myregistry/myapp:v1.0 ./app"',
        'Successfully built'
      );

      const result = await template.execute($mock, {
        registry: 'myregistry',
        image: 'myapp',
        tag: 'v1.0',
        context: './app'
      });

      expect(result.stdout).toBe('Successfully built');
    });

    it('should work with different execution engines', async () => {
      const template = $.templates.create('echo {{message}}', POSIX);

      // Test with different configurations
      const $custom = $mock.env({ CUSTOM: 'true' });
      mock.mockSuccess('sh -c "echo Test"', 'Test');

      const result = await template.execute($custom, { message: 'Test' });
      expect(result.stdout).toBe('Test');
    });
  });
});