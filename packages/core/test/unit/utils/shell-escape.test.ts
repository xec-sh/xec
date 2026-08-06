
import {
  quote,
  escapeArg,
  dialectFor,
  escapeUnix,
  interpolate,
  escapeCommand,
  quoteForShell,
  interpolateRaw,
  validateEnvName,
  interpolateForShell,
  isTemplateStringsArray,
} from '../../../src/utils/shell-escape.js';

function tpl(strings: string[]): TemplateStringsArray {
  return Object.assign(strings.slice(), { raw: strings.slice() }) as unknown as TemplateStringsArray;
}

describe('shell-escape utilities', () => {
  describe('escapeArg', () => {
    describe('cross-platform behavior', () => {
      it('should handle basic strings', () => {
        const result = escapeArg('hello');
        expect(result).toBe('hello');
      });

      it('should handle numbers', () => {
        const result = escapeArg(42);
        expect(result).toBe('42');
      });

      it('should handle booleans', () => {
        expect(escapeArg(true)).toBe('true');
        expect(escapeArg(false)).toBe('false');
      });
    });
  });

  describe('escapeCommand', () => {
    it('should return command as-is when no args provided', () => {
      const result = escapeCommand('echo');
      expect(result).toBe('echo');
    });

    it('should escape command with arguments', () => {
      const result = escapeCommand('echo', ['hello', 'world']);
      expect(result).toBe('echo hello world');
    });

    it('should handle mixed argument types', () => {
      const result = escapeCommand('test', ['string', 42, true]);
      expect(result).toBe('test string 42 true');
    });
  });

  describe('escapeArg', () => {
    it('quotes for the platform default dialect', () => {
      // The helper exists for call sites with no shell context; its output
      // must be exactly what the explicit API produces for the same value.
      const dialect = dialectFor(undefined);
      for (const value of ['a b', "it's", '$(whoami)', '']) {
        expect(escapeArg(value)).toBe(quoteForShell(value, dialect));
      }
    });
  });
});

describe('dialectFor', () => {
  it('resolves Bourne-compatible shells to posix, by name or full path', () => {
    for (const shell of ['/bin/bash', '/bin/sh', 'zsh', 'dash', 'fish', '/usr/bin/ksh']) {
      expect(dialectFor(shell), shell).toBe('posix');
    }
  });

  it('resolves cmd.exe in any spelling', () => {
    for (const shell of ['cmd', 'command', 'CMD.EXE', 'C:\\Windows\\System32\\cmd.exe']) {
      expect(dialectFor(shell), shell).toBe('cmd');
    }
  });

  it('resolves PowerShell in any spelling, on any platform', () => {
    // `$.shell('pwsh')` on Linux must get PowerShell quoting: the dialect
    // follows the shell that will parse the command, not the host platform.
    for (const shell of ['powershell', 'pwsh', 'pwsh.exe', 'PowerShell.exe', '/usr/local/bin/pwsh']) {
      expect(dialectFor(shell), shell).toBe('powershell');
    }
  });

  it('falls back to the platform default when no shell is named', () => {
    const expected = process.platform === 'win32' ? 'cmd' : 'posix';
    expect(dialectFor(undefined)).toBe(expected);
    expect(dialectFor(true)).toBe(expected);
    expect(dialectFor(false)).toBe(expected);
    expect(dialectFor('')).toBe(expected);
  });
});

describe('quoteForShell', () => {
  describe('posix', () => {
    it('renders the empty string as an empty pair of quotes', () => {
      expect(quoteForShell('', 'posix')).toBe("''");
    });

    it('passes every safe character through unquoted', () => {
      // Quoting a token built only from these would just hurt readability.
      expect(quoteForShell('AZaz09_@%+=:,./-', 'posix')).toBe('AZaz09_@%+=:,./-');
    });

    it('embeds a single quote by closing, escaping and reopening', () => {
      expect(quoteForShell("it's", 'posix')).toBe("'it'\\''s'");
    });

    it('neutralises substitution and metacharacters by single-quoting', () => {
      expect(quoteForShell('$(whoami)', 'posix')).toBe("'$(whoami)'");
      expect(quoteForShell('a b', 'posix')).toBe("'a b'");
      expect(quoteForShell('a;b|c&d', 'posix')).toBe("'a;b|c&d'");
      expect(quoteForShell('`id`', 'posix')).toBe("'`id`'");
    });
  });

  describe('powershell', () => {
    it('renders the empty string as an empty pair of quotes', () => {
      expect(quoteForShell('', 'powershell')).toBe("''");
    });

    it('passes safe tokens through unquoted', () => {
      expect(quoteForShell('abc-123', 'powershell')).toBe('abc-123');
    });

    it('escapes an embedded quote by doubling it', () => {
      expect(quoteForShell("it's", 'powershell')).toBe("'it''s'");
    });

    it('keeps $ expansion inert inside single quotes', () => {
      expect(quoteForShell('$env:PATH', 'powershell')).toBe("'$env:PATH'");
      expect(quoteForShell('a b', 'powershell')).toBe("'a b'");
    });
  });

  describe('cmd', () => {
    it('renders the empty string as caret-escaped empty quotes', () => {
      expect(quoteForShell('', 'cmd')).toBe('^"^"');
    });

    it('passes safe tokens without % through unquoted', () => {
      expect(quoteForShell('abc', 'cmd')).toBe('abc');
    });

    it('always quotes a value containing %, and caret-escapes the %', () => {
      // Caret escaping alone does not reliably stop cmd.exe variable
      // expansion, so % never rides through on the safe-token path.
      expect(quoteForShell('a%b', 'cmd')).toBe('^"a^%b^"');
      expect(quoteForShell('100%', 'cmd')).toBe('^"100^%^"');
    });

    it('caret-escapes every cmd.exe metacharacter, including the quotes it adds', () => {
      expect(quoteForShell('a b', 'cmd')).toBe('^"a^ b^"');
      expect(quoteForShell('x&y|z', 'cmd')).toBe('^"x^&y^|z^"');
      expect(quoteForShell('(1)', 'cmd')).toBe('^"^(1^)^"');
    });

    it('backslash-escapes embedded quotes for the argv parser underneath', () => {
      expect(quoteForShell('say "hi"', 'cmd')).toBe('^"say^ \\^"hi\\^"^"');
    });

    it('doubles trailing backslashes so they cannot eat the closing quote', () => {
      expect(quoteForShell('a\\', 'cmd')).toBe('^"a\\\\^"');
    });

    it('doubles backslash runs before an embedded quote', () => {
      expect(quoteForShell('a\\"b', 'cmd')).toBe('^"a\\\\\\^"b^"');
    });
  });
});

describe('escapeUnix', () => {
  it('quotes each argument for a POSIX shell and joins with single spaces', () => {
    // Remote execution always targets a POSIX shell, whatever the client
    // platform — SSH and container adapters depend on that.
    expect(escapeUnix(['a b', "it's", ''])).toBe("'a b' 'it'\\''s' ''");
    expect(escapeUnix([])).toBe('');
  });
});

describe('validateEnvName', () => {
  it('returns a valid POSIX identifier unchanged', () => {
    for (const name of ['PATH', '_private', 'A1_b', 'x']) {
      expect(validateEnvName(name)).toBe(name);
    }
  });

  it('rejects anything that could break out of an export prefix', () => {
    // The name side is interpolated raw, so `X=1; rm -rf /; A` would inject
    // arbitrary commands if it ever got through.
    for (const name of ['X=1; rm -rf /; A', '1AB', 'A-B', 'A B', '', 'a.b', '$HOME']) {
      expect(() => validateEnvName(name), name).toThrow('Invalid environment variable name');
    }
  });

  it('names the offending value in the error', () => {
    expect(() => validateEnvName('A-B')).toThrow('"A-B"');
  });
});

describe('quote (ANSI-C, zx compatibility)', () => {
  it('renders the empty string as an empty ANSI-C string', () => {
    expect(quote('')).toBe("$''");
  });

  it('passes safe tokens through unquoted', () => {
    expect(quote('abc-123_./@:=')).toBe('abc-123_./@:=');
  });

  it('quotes a comma, which is not in its safe set', () => {
    expect(quote('a,b')).toBe("$'a,b'");
  });

  it('escapes quotes, backslashes and every control character', () => {
    expect(quote("a'b")).toBe("$'a\\'b'");
    expect(quote('a\\b')).toBe("$'a\\\\b'");
    expect(quote('a\nb')).toBe("$'a\\nb'");
    expect(quote('a\tb')).toBe("$'a\\tb'");
    expect(quote('a\rb')).toBe("$'a\\rb'");
    expect(quote('a\fb')).toBe("$'a\\fb'");
    expect(quote('a\vb')).toBe("$'a\\vb'");
    expect(quote('a\0b')).toBe("$'a\\0b'");
  });
});

describe('interpolateForShell', () => {
  it('escapes interpolated values with the named dialect, not the host default', () => {
    expect(interpolateForShell('cmd', tpl(['echo ', '']), 'a b')).toBe('echo ^"a^ b^"');
    expect(interpolateForShell('powershell', tpl(['echo ', '']), "it's")).toBe("echo 'it''s'");
    expect(interpolateForShell('posix', tpl(['echo ', '']), 'a b')).toBe("echo 'a b'");
  });
});

describe('interpolate', () => {
  it('preserves the argument position of a nullish value as an empty token', () => {
    // "null"/"undefined" as text would silently become a real argument;
    // dropping the token entirely would shift the whole argv.
    expect(interpolateForShell('posix', tpl(['cp ', ' ', ' /dst']), null, 'src')).toBe("cp '' src /dst");
    expect(interpolateForShell('posix', tpl(['cp ', ' /dst']), undefined)).toBe("cp '' /dst");
  });

  it('unwraps an execution result to its trimmed output', () => {
    const resultLike = { stdout: 'main\n', text: () => 'main' };
    expect(interpolateForShell('posix', tpl(['git checkout ', '']), resultLike)).toBe('git checkout main');
  });
});

describe('interpolateRaw', () => {
  it('splices values verbatim, letting the shell interpret them', () => {
    expect(interpolateRaw(tpl(['run ', '']), ['a b', '$X'])).toBe('run a b $X');
  });

  it('drops nullish values without leaving a token behind', () => {
    expect(interpolateRaw(tpl(['echo ', ' end']), null)).toBe('echo  end');
    expect(interpolateRaw(tpl(['echo ', ' end']), undefined)).toBe('echo  end');
  });

  it('unwraps an execution result to its trimmed output', () => {
    expect(interpolateRaw(tpl(['x ', '']), { stdout: 'out\n', text: () => 'out' })).toBe('x out');
  });

  it('falls back to default rendering for values JSON cannot serialise', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular['self'] = circular;
    expect(interpolateRaw(tpl(['x ', '']), circular)).toBe('x [object Object]');
    expect(interpolateRaw(tpl(['x ', '']), 42n)).toBe('x 42');
  });
});

describe('isTemplateStringsArray', () => {
  it('accepts only an array carrying a raw companion array', () => {
    expect(isTemplateStringsArray(tpl(['echo ', '']))).toBe(true);
  });

  it('rejects plain strings and arrays without raw', () => {
    // Iterating a string as template segments splices values between its
    // characters and silently corrupts the command.
    expect(isTemplateStringsArray('echo hello')).toBe(false);
    expect(isTemplateStringsArray(['echo hello'])).toBe(false);
    expect(isTemplateStringsArray(Object.assign(['x'], { raw: 'not-an-array' }))).toBe(false);
    expect(isTemplateStringsArray(null)).toBe(false);
  });
});