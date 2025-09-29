import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('README API Coverage', () => {
  it('should have all basic functions available', () => {
    // Core execution
    expect(typeof $).toBe('function');
    expect(typeof $.raw).toBe('function');

    // Utility functions
    expect(typeof $.which).toBe('function');
    expect(typeof $.isCommandAvailable).toBe('function');

    // Interactive functions
    expect(typeof $.question).toBe('function');
    expect(typeof $.prompt).toBe('function');
    expect(typeof $.password).toBe('function');
    expect(typeof $.confirm).toBe('function');
    expect(typeof $.select).toBe('function');
    expect(typeof $.spinner).toBe('function');

    // Context functions
    expect(typeof $.within).toBe('function');
    expect(typeof $.withinSync).toBe('function');

    // Pipe and stream functions
    // TODO: These methods are not yet implemented in ExecutionEngine
    // expect(typeof $.pipe).toBe('function');
    // expect(typeof $.stream).toBe('function');

    // Parallel execution
    expect(typeof $.parallel).toBe('object');

    // Template functions
    expect(typeof $.template).toBe('function');
    expect(typeof $.templates).toBe('object');
    expect(typeof $.templates.render).toBe('function');
    expect(typeof $.templates.create).toBe('function');
    expect(typeof $.templates.parse).toBe('function');

    // Temp functions
    expect(typeof $.withTempDir).toBe('function');
    expect(typeof $.withTempFile).toBe('function');
    expect(typeof $.tempDir).toBe('function');
    expect(typeof $.tempFile).toBe('function');

    // Transfer functions
    expect(typeof $.transfer).toBe('object');

    // Configuration methods
    expect(typeof $.with).toBe('function');
    expect(typeof $.ssh).toBe('function');
    expect(typeof $.docker).toBe('function');
    expect(typeof $.k8s).toBe('function');
    expect(typeof $.remoteDocker).toBe('function');
    expect(typeof $.local).toBe('function');
    expect(typeof $.cd).toBe('function');
    expect(typeof $.env).toBe('function');
    expect(typeof $.timeout).toBe('function');
    expect(typeof $.shell).toBe('function');
    expect(typeof $.retry).toBe('function');
  });

  it('should create ProcessPromise with all required methods', async () => {
    const promise = $`echo "test"`;

    // Check ProcessPromise methods
    expect(typeof promise.then).toBe('function');
    expect(typeof promise.catch).toBe('function');
    expect(typeof promise.finally).toBe('function');
    expect(typeof promise.pipe).toBe('function');
    expect(typeof promise.signal).toBe('function');
    expect(typeof promise.timeout).toBe('function');
    expect(typeof promise.quiet).toBe('function');
    expect(typeof promise.nothrow).toBe('function');
    expect(typeof promise.interactive).toBe('function');
    expect(typeof promise.cwd).toBe('function');
    expect(typeof promise.env).toBe('function');
    expect(typeof promise.shell).toBe('function');
    expect(typeof promise.text).toBe('function');
    expect(typeof promise.json).toBe('function');
    expect(typeof promise.lines).toBe('function');
    expect(typeof promise.buffer).toBe('function');
    expect(typeof promise.kill).toBe('function');
    expect(typeof promise.exitCode).toBe('object');
  });

  it('should create raw ProcessPromise with all required methods', async () => {
    const promise = $.raw`echo "test"`;

    // Check ProcessPromise methods
    expect(typeof promise.then).toBe('function');
    expect(typeof promise.catch).toBe('function');
    expect(typeof promise.finally).toBe('function');
    expect(typeof promise.pipe).toBe('function');
    expect(typeof promise.signal).toBe('function');
    expect(typeof promise.timeout).toBe('function');
    expect(typeof promise.quiet).toBe('function');
    expect(typeof promise.nothrow).toBe('function');
    expect(typeof promise.interactive).toBe('function');
    expect(typeof promise.cwd).toBe('function');
    expect(typeof promise.env).toBe('function');
    expect(typeof promise.shell).toBe('function');
    expect(typeof promise.text).toBe('function');
    expect(typeof promise.json).toBe('function');
    expect(typeof promise.lines).toBe('function');
    expect(typeof promise.buffer).toBe('function');
    expect(typeof promise.kill).toBe('function');
    expect(typeof promise.exitCode).toBe('object');
  });

  it('should support chaining configuration methods', () => {
    const chained = $.cd('/tmp').env({ NODE_ENV: 'test' }).timeout(5000);

    expect(typeof chained).toBe('function');
    expect(typeof chained.raw).toBe('function');
    expect(typeof chained.with).toBe('function');
    expect(typeof chained.ssh).toBe('function');
    expect(typeof chained.docker).toBe('function');
  });

  it('should support adapter methods', () => {
    const ssh = $.ssh({ host: 'localhost', username: 'testuser' });
    const docker = $.docker({ container: 'test' });
    const k8s = $.k8s({ pod: 'test', namespace: 'default' });
    const remoteDocker = $.remoteDocker({ ssh: { host: 'localhost', username: 'testuser' }, docker: { container: 'test' } });
    const local = $.local();

    expect(typeof ssh).toBe('function');
    expect(typeof docker).toBe('function');
    expect(typeof k8s).toBe('function');
    expect(typeof remoteDocker).toBe('function');
    expect(typeof local).toBe('function');
  });

  it('should support template creation', () => {
    const template = $.template('echo {{message}}');
    expect(typeof template).toBe('object');

    const parsed = $.templates.parse('echo {{message}} {{name}}');
    expect(parsed.params).toEqual(['message', 'name']);

    const rendered = $.templates.render('echo {{message}}', { message: 'hello' });
    expect(rendered).toBe('echo hello');
  });

  it('should support spinner creation', () => {
    const spinner = $.spinner('Loading...');
    expect(typeof spinner).toBe('object');
    expect(typeof spinner.start).toBe('function');
    expect(typeof spinner.stop).toBe('function');
    expect(typeof spinner.succeed).toBe('function');
    expect(typeof spinner.fail).toBe('function');
  });
});