import { it, expect, describe } from 'vitest';

import { shellEscape, validateShellName } from '../../src/utils/shell-escape.js';

/**
 * The fixtures build shell commands from container and cluster names, so
 * these two are what stands between a test name and an injection into the
 * developer's own machine. They had no tests of their own.
 */
describe('validating a name for a shell command', () => {
  it('accepts what a container or cluster is actually called', () => {
    for (const name of ['ubuntu-apt', 'xec_test.1', 'kind-cluster-2']) {
      expect(() => validateShellName(name, 'container')).not.toThrow();
    }
  });

  it('refuses every character that could end the word', () => {
    for (const name of ['a b', 'a;b', 'a|b', 'a&b', 'a$b', 'a`b', 'a>b', 'a\nb', "a'b", 'a"b']) {
      expect(() => validateShellName(name, 'container')).toThrow(/Invalid container/);
    }
  });

  it('refuses an empty name', () => {
    // `+` in the pattern, not `*`: an empty name would otherwise pass and
    // produce a command with a missing argument.
    expect(() => validateShellName('', 'container')).toThrow(/Invalid container/);
  });

  it('names the thing that was wrong', () => {
    // The message is read by whoever wrote the fixture, and "Invalid name"
    // does not say which one.
    expect(() => validateShellName('bad name', 'cluster')).toThrow(/Invalid cluster: "bad name"/);
  });
});

describe('escaping a shell argument', () => {
  it('wraps in single quotes', () => {
    expect(shellEscape('plain')).toBe("'plain'");
  });

  it('closes, escapes and reopens around a single quote', () => {
    // The POSIX idiom. Anything else lets the value end its own quoting.
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it('leaves the shell nothing to interpret', () => {
    for (const value of ['a;b', 'a|b', '$(id)', '`id`', 'a b', '*']) {
      const escaped = shellEscape(value);

      expect(escaped.startsWith("'")).toBe(true);
      expect(escaped.endsWith("'")).toBe(true);
      // Every interior quote is escaped, so the value cannot terminate early.
      expect(escaped.slice(1, -1).includes("'")).toBe(value.includes("'"));
    }
  });

  it('survives an empty value as an explicit empty argument', () => {
    expect(shellEscape('')).toBe("''");
  });
});
