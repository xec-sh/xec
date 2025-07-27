import { $ } from '../../src/index.js';

describe('No hanging on script completion', () => {
  it('should not hang after command execution', async () => {
    const result = await $`echo test`;
    expect(result.stdout.trim()).toBe('test');
    expect(result.exitCode).toBe(0);
  });

  it('should handle multiple sequential commands without hanging', async () => {
    const result1 = await $`echo first`;
    const result2 = await $`echo second`;
    
    expect(result1.stdout.trim()).toBe('first');
    expect(result2.stdout.trim()).toBe('second');
  });

  it('should handle commands with promise interpolation without hanging', async () => {
    const a1 = $`echo foo`;
    const a2 = new Promise((resolve) => setTimeout(resolve, 20, ['bar', 'baz']));
    
    const result = await $`echo ${a1} ${a2}`;
    expect(result.stdout.trim()).toBe('foo bar baz');
  });

  it('should handle delayed promise resolution without hanging', async () => {
    const delayed = new Promise((resolve) => setTimeout(resolve, 50, 'delayed'));
    const result = await $`echo ${delayed}`;
    expect(result.stdout.trim()).toBe('delayed');
  });
});