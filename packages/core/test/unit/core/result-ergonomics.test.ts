import { $ } from '../../../src/index.js';

/**
 * A captured result is most often used as a string. The reference point is
 * shell command substitution: `$(git branch --show-current)` gives the text
 * with the trailing newline gone. Before these methods existed,
 * `` `Branch: ${result}` `` interpolated as `[object Object]`.
 */
describe('result behaves like a string where a string is expected', () => {
  it('interpolates as stdout with one trailing newline removed', async () => {
    const result = await $`printf 'main\n'`;

    expect(`Branch: ${result}`).toBe('Branch: main');
  });

  it('keeps interior newlines when interpolated', async () => {
    const result = await $`printf 'a\nb\n'`;

    expect(String(result)).toBe('a\nb');
  });

  it('compares loosely against its trimmed stdout', async () => {
    const result = await $`printf '  spaced  \n'`;

    expect(result.valueOf()).toBe('spaced');
  });

  it('leaves the structured fields untouched', async () => {
    const result = await $`printf 'x\n'`;

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
      $`sh -c 'echo "no such table: users" >&2; exit 1'`
    ).rejects.toThrow('no such table: users');
  });

  it('still names the exit code', async () => {
    await expect($`sh -c 'exit 7'`).rejects.toThrow('exit code 7');
  });
});
