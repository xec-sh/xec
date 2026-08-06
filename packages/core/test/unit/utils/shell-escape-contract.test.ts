import {
  quote,
  dialectFor,
  quoteForShell,
  interpolateRaw,
  interpolateForShell,
} from '../../../src/utils/shell-escape.js';

/**
 * Quoting, per dialect and per value.
 *
 * This is the layer that decides whether a value the caller supplied stays
 * one argument or becomes a second command. A mutation survey left forty
 * ways to change it unnoticed, most of them in the branches that decide
 * *which* dialect is in use and what an empty or absent value becomes —
 * which are precisely the cases nobody writes an example for, and where a
 * mistake is a command someone else's data gets to run.
 */
describe('choosing a dialect', () => {
  it('reads the executable name out of a path', () => {
    expect(dialectFor('/bin/bash')).toBe('posix');
    expect(dialectFor('/usr/local/bin/zsh')).toBe('posix');
    expect(dialectFor('C:\\Windows\\System32\\cmd.exe')).toBe('cmd');
    expect(dialectFor('C:/Program Files/PowerShell/pwsh.exe')).toBe('powershell');
  });

  it('accepts a bare name as readily as a path', () => {
    expect(dialectFor('cmd')).toBe('cmd');
    expect(dialectFor('command')).toBe('cmd');
    expect(dialectFor('powershell')).toBe('powershell');
    expect(dialectFor('pwsh')).toBe('powershell');
    expect(dialectFor('sh')).toBe('posix');
  });

  it('ignores case and the .exe suffix', () => {
    expect(dialectFor('CMD.EXE')).toBe('cmd');
    expect(dialectFor('PowerShell.exe')).toBe('powershell');
  });

  it('treats an unrecognised shell as posix', () => {
    // The wrong guess in this direction quotes with single quotes on a
    // shell that understands them; the other direction leaves a Windows
    // metacharacter live.
    expect(dialectFor('fish')).toBe('posix');
    expect(dialectFor('/opt/homebrew/bin/nu')).toBe('posix');
  });

  it('falls back to the platform when told only true or nothing', () => {
    const expected = process.platform === 'win32' ? 'cmd' : 'posix';

    expect(dialectFor(true)).toBe(expected);
    expect(dialectFor(undefined)).toBe(expected);
    expect(dialectFor(false)).toBe(expected);
    expect(dialectFor('')).toBe(expected);
  });
});

describe('quoting a value', () => {
  describe('posix', () => {
    const q = (value: string): string => quoteForShell(value, 'posix');

    it('leaves a safe token alone', () => {
      // Quoting everything is correct and unreadable; a command echoed to
      // a terminal should look like the command that was run.
      expect(q('ls')).toBe('ls');
      expect(q('/usr/bin/env')).toBe('/usr/bin/env');
      expect(q('--flag=value')).toBe('--flag=value');
    });

    it('quotes an empty string so the argument still exists', () => {
      // Without this the argument vanishes and every later argument moves
      // up one position.
      expect(q('')).toBe("''");
    });

    it('neutralises everything a shell would act on', () => {
      for (const dangerous of ['a b', 'a;b', 'a|b', 'a&b', 'a$(id)', 'a`id`', 'a$HOME', 'a\nb', 'a*b', 'a>b']) {
        const quoted = q(dangerous);

        expect(quoted.startsWith("'"), dangerous).toBe(true);
        expect(quoted.endsWith("'"), dangerous).toBe(true);
      }
    });

    it('closes and reopens around a single quote', () => {
      // Inside single quotes nothing escapes, so the quote is emitted by
      // closing, writing an escaped quote, and reopening.
      expect(q("it's")).toBe("'it'\\''s'");
    });
  });

  describe('powershell', () => {
    const q = (value: string): string => quoteForShell(value, 'powershell');

    it('quotes an empty string', () => {
      expect(q('')).toBe("''");
    });

    it('leaves a safe token alone', () => {
      expect(q('Get-Item')).toBe('Get-Item');
    });

    it('doubles an embedded quote rather than escaping it', () => {
      // PowerShell has no backslash escape inside single quotes; a
      // backslash there is a literal backslash.
      expect(q("it's")).toBe("'it''s'");
    });

    it('quotes a value containing a dollar sign', () => {
      expect(q('$env:PATH')).toBe("'$env:PATH'");
    });
  });

  describe('cmd', () => {
    const q = (value: string): string => quoteForShell(value, 'cmd');

    it('emits a quoted empty argument in the form cmd needs', () => {
      expect(q('')).toBe('^"^"');
    });

    it('quotes a percent even in an otherwise safe token', () => {
      // `%PATH%` expands. A token that is safe by every other measure is
      // not safe if it contains one.
      expect(q('100%')).toBe('^"100^%^"');
    });

    it('leaves a token with nothing to interpret alone', () => {
      expect(q('dir')).toBe('dir');
    });

    it('doubles the backslashes that precede a quote', () => {
      // MSVCRT argv parsing: a backslash run is literal unless it precedes
      // a quote, when each pair collapses to one.
      expect(q('a\\"b')).toBe('^"a\\\\\\^"b^"');
    });

    it('doubles trailing backslashes before the closing quote', () => {
      // A single trailing backslash would escape the closing quote and
      // swallow the next argument into this one.
      expect(q('C:\\dir\\')).toBe('^"C:\\dir\\\\^"');
    });
  });

  it('refuses a dialect it does not have', () => {
    expect(() => quoteForShell('x', 'fish' as never)).toThrow(/dialect/i);
  });
});

describe('interpolating into a command', () => {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): string =>
    interpolateForShell('posix', strings, ...values);

  it('quotes each value', () => {
    expect(tag`echo ${'a b'}`).toBe(`echo 'a b'`);
  });

  it('quotes each element of an array separately', () => {
    // Joining first and quoting after would make one argument out of what
    // the caller wrote as several.
    expect(tag`run ${['a b', 'c;d']}`).toBe(`run 'a b' 'c;d'`);
  });

  it('keeps the position of a null or undefined value', () => {
    // Stringifying them produced the literal words "null" and "undefined"
    // as real arguments; dropping them shifted every later argument up.
    expect(tag`cmd ${null} after`).toBe(`cmd '' after`);
    expect(tag`cmd ${undefined} after`).toBe(`cmd '' after`);
  });

  it('renders a number, a boolean and a date', () => {
    expect(tag`n ${42}`).toBe('n 42');
    expect(tag`b ${true}`).toBe('b true');
    expect(tag`d ${new Date('2026-01-02T03:04:05Z')}`).toContain('2026-01-02T03:04:05');
  });

  it('unwraps an execution result to its output', () => {
    // `` $`echo ${await $`hostname`}` `` is the reason this exists.
    const result = { stdout: 'web-1\n', text: () => 'web-1' };

    expect(tag`echo ${result}`).toBe('echo web-1');
  });

  it('serialises a plain object as json', () => {
    expect(tag`send ${{ a: 1 }}`).toBe(`send '{"a":1}'`);
  });

  it('falls back rather than throwing on a circular structure', () => {
    const circular: Record<string, unknown> = { name: 'x' };
    circular['self'] = circular;

    expect(() => tag`send ${circular}`).not.toThrow();
  });

  it('renders a symbol without throwing', () => {
    expect(() => tag`x ${Symbol('s')}`).not.toThrow();
  });
});

describe('interpolating without quoting', () => {
  const raw = (strings: TemplateStringsArray, ...values: unknown[]): string =>
    interpolateRaw(strings, ...values);

  it('inserts a value as written', () => {
    expect(raw`echo ${'a b'}`).toBe('echo a b');
  });

  it('drops a null or undefined rather than writing the word', () => {
    expect(raw`echo ${null}x`).toBe('echo x');
    expect(raw`echo ${undefined}x`).toBe('echo x');
  });

  it('joins an array with spaces', () => {
    expect(raw`run ${['a', 'b']}`).toBe('run a b');
  });
});

describe('ansi-c quoting', () => {
  it('quotes an empty string', () => {
    expect(quote('')).toBe(`$''`);
  });

  it('leaves a safe token alone', () => {
    expect(quote('user@host:/path-1.txt')).toBe('user@host:/path-1.txt');
  });

  it('escapes a backslash before escaping a quote', () => {
    // Order matters: escaping the quote first would then escape the
    // backslash the first pass had just added.
    expect(quote("a\\'b")).toBe(`$'a\\\\\\'b'`);
  });
});
