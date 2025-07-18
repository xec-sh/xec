import { it, expect, describe } from '@jest/globals';

import { $ } from '../../src/index.js';

describe('Additional README Examples', () => {
  it('should work with cwd() method', async () => {
    const result = await $`pwd`.cwd('/tmp');
    // On macOS, /tmp is a symlink to /private/tmp
    expect(result.stdout.trim()).toMatch(/\/tmp$/);
  });

  it('should work with env() method', async () => {
    const result = await $`echo $TEST_VAR`.env({ TEST_VAR: 'hello' });
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should work with method chaining cwd and env', async () => {
    const result = await $`echo $TEST_VAR`.cwd('/tmp').env({ TEST_VAR: 'world' });
    expect(result.stdout.trim()).toBe('world');
  });

  it('should work with timeout method from README example', async () => {
    // This is the exact example from README: await $`sleep 10`.timeout(5000);
    // We use sleep 0.1 to make it fast but still test the timeout mechanism
    const result = await $`sleep 0.1`.timeout(5000);
    expect(result.exitCode).toBe(0);
  });

  it('should work with nothrow method from README', async () => {
    const result = await $`grep "pattern" /nonexistent/file.txt`.nothrow();
    expect(result.exitCode).not.toBe(0);
  });

  it('should work with shell method', async () => {
    const $bash = $.shell('/bin/bash');
    const result = await $bash`echo "test"`;
    expect(result.stdout.trim()).toBe('test');
  });

  it('should work with which utility method', async () => {
    const path = await $.which('echo');
    expect(path).toBeTruthy();
    expect(path).toMatch(/echo$/);
  });

  it('should work with isCommandAvailable method', async () => {
    const exists = await $.isCommandAvailable('echo');
    expect(exists).toBe(true);
    
    const notExists = await $.isCommandAvailable('nonexistent-command-xyz');
    expect(notExists).toBe(false);
  });

  it('should work with string interpolation', async () => {
    const filename = "test file.txt";
    const result = await $`echo ${filename}`;
    expect(result.stdout.trim()).toBe('test file.txt');
  });

  it('should work with array interpolation', async () => {
    const files = ['file1.txt', 'file2.txt', 'file3.txt'];
    const result = await $`echo ${files}`;
    expect(result.stdout.trim()).toBe('file1.txt file2.txt file3.txt');
  });

  it('should work with object interpolation', async () => {
    const config = { name: 'app', port: 3000 };
    const result = await $`echo ${config}`;
    expect(result.stdout.trim()).toBe('{"name":"app","port":3000}');
  });

  it('should work with command chaining on $ object', async () => {
    const $tmp = $.cd('/tmp');
    const result = await $tmp`pwd`;
    // On macOS, /tmp is a symlink to /private/tmp
    expect(result.stdout.trim()).toMatch(/\/tmp$/);
  });

  it('should work with environment variable chaining on $ object', async () => {
    const $prod = $.env({ NODE_ENV: 'production' });
    const result = await $prod`echo $NODE_ENV`;
    expect(result.stdout.trim()).toBe('production');
  });

  it('should work with timeout chaining on $ object', async () => {
    const $quick = $.timeout(3000);
    const result = await $quick`echo "fast"`;
    expect(result.stdout.trim()).toBe('fast');
  });

  it('should work with complex chaining', async () => {
    const result = await $.cd('/tmp').env({ TEST: 'value' }).timeout(1000)`echo $TEST`;
    expect(result.stdout.trim()).toBe('value');
  });

  it('should work with complex ProcessPromise chaining', async () => {
    const result = await $`echo "test"`.timeout(1000).nothrow().quiet();
    expect(result.stdout.trim()).toBe('test');
    expect(result.exitCode).toBe(0);
  });
});