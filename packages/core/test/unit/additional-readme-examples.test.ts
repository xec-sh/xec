
import { $ } from '../../src/index.js';
import { argEcho, readEnv, joinArgs, tempRoot } from '../helpers/platform.js';

const emit_cwd = 'process.stdout.write(process.cwd())';

describe('Additional README Examples', () => {
  it('should work with cwd() method', async () => {
    const result = await $`node -e ${emit_cwd}`.cwd(tempRoot());
    expect(result.stdout.trim()).toBe(tempRoot());
  });

  it('should work with env() method', async () => {
    const result = await $`node -e ${readEnv('TEST_VAR')}`.env({ TEST_VAR: 'hello' });
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should work with method chaining cwd and env', async () => {
    const result = await $`node -e ${readEnv('TEST_VAR')}`.cwd(tempRoot()).env({ TEST_VAR: 'world' });
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
    const result = await $bash`echo test`;
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
    // Read back as an argument: cmd's echo prints the quotes the escaping
    // had to add, so echo cannot show what arrived.
    const filename = "test file.txt";

    expect(await argEcho($, filename)).toBe(filename);
  });

  it('should work with array interpolation', async () => {
    const files = ['file1.txt', 'file2.txt', 'file3.txt'];
    const result = await $`echo ${files}`;
    expect(result.stdout.trim()).toBe('file1.txt file2.txt file3.txt');
  });

  it('should work with object interpolation', async () => {
    const config = { name: 'app', port: 3000 };
    const result = await $`node -e ${joinArgs()} ${config}`;

    expect(result.stdout.trim()).toBe('{"name":"app","port":3000}');
  });

  it('should work with command chaining on $ object', async () => {
    const $tmp = $.cd(tempRoot());
    const result = await $tmp`node -e ${emit_cwd}`;
    expect(result.stdout.trim()).toBe(tempRoot());
  });

  it('should work with environment variable chaining on $ object', async () => {
    const $prod = $.env({ NODE_ENV: 'production' });
    const result = await $prod`node -e ${readEnv('NODE_ENV')}`;
    expect(result.stdout.trim()).toBe('production');
  });

  it('should work with timeout chaining on $ object', async () => {
    const $quick = $.timeout(3000);
    const result = await $quick`echo fast`;
    expect(result.stdout.trim()).toBe('fast');
  });

  it('should work with complex chaining', async () => {
    const result = await $.cd(tempRoot()).env({ TEST: 'value' }).timeout(1000)`node -e ${readEnv('TEST')}`;
    expect(result.stdout.trim()).toBe('value');
  });

  it('should work with complex ProcessPromise chaining', async () => {
    const result = await $`echo test`.timeout(1000).nothrow().quiet();
    expect(result.stdout.trim()).toBe('test');
    expect(result.exitCode).toBe(0);
  });
});