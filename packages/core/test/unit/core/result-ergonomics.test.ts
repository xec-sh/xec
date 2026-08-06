import { $ } from '../../../src/index.js';
import { emit, emitErr, exitWith } from '../../helpers/platform.js';

/**
 * A captured result is most often used as a string. The reference point is
 * shell command substitution: `$(git branch --show-current)` gives the text
 * with the trailing newline gone. Before these methods existed,
 * `` `Branch: ${result}` `` interpolated as `[object Object]`.
 */
describe('result behaves like a string where a string is expected', () => {
  it('interpolates as stdout with one trailing newline removed', async () => {
    const result = await $`node -e ${emit('main\n')}`;

    expect(`Branch: ${result}`).toBe('Branch: main');
  });

  it('keeps interior newlines when interpolated', async () => {
    const result = await $`node -e ${emit('a\nb\n')}`;

    expect(String(result)).toBe('a\nb');
  });

  it('compares loosely against its trimmed stdout', async () => {
    const result = await $`node -e ${emit('  spaced  \n')}`;

    expect(result.valueOf()).toBe('spaced');
  });

  it('leaves the structured fields untouched', async () => {
    const result = await $`node -e ${emit('x\n')}`;

    // toString is a view, not a mutation: raw stdout keeps its newline.
    expect(result.stdout).toBe('x\n');
    expect(result.ok).toBe(true);
  });
});

describe('a failure explains itself', () => {
  it('carries the head of stderr in the error message', async () => {
    // Without this, the message names the command and the exit code but not
    // the reason, and every caller reprints error.stderr by hand.
    await expect(
      $`node -e ${emitErr('no such table: users\n') + ';process.exitCode=1'}`
    ).rejects.toThrow('no such table: users');
  });

  it('still names the exit code', async () => {
    await expect($`node -e ${exitWith(7)}`).rejects.toThrow('exit code 7');
  });
});
