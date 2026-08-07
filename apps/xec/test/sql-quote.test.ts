import {
  jsLiteral,
  pgLiteral,
  pgIdentifier,
  mysqlLiteral,
  mysqlIdentifier,
} from '../src/docker-services/sql-quote.js';

/**
 * Values going into SQL.
 *
 * The service helpers composed their statements by concatenation —
 * `CREATE USER ${username} WITH PASSWORD '${password}'` — so a name
 * carrying a quote or a semicolon ended the statement and started another.
 * That is the same class the shell escaping in core exists to prevent, one
 * parser further in.
 */
describe('PostgreSQL', () => {
  it('delimits an identifier and doubles an embedded quote', () => {
    expect(pgIdentifier('users')).toBe('"users"');
    expect(pgIdentifier('a"b')).toBe('"a""b"');
  });

  it('leaves a statement-ending payload inside the identifier', () => {
    const quoted = pgIdentifier('x; DROP DATABASE postgres; --');

    expect(quoted).toBe('"x; DROP DATABASE postgres; --"');
    // One pair of delimiters, so nothing after the name is read as SQL.
    expect(quoted.slice(1, -1)).not.toContain('"');
  });

  it('doubles a quote in a literal', () => {
    expect(pgLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it('leaves a backslash alone', () => {
    // standard_conforming_strings has been on by default since 9.1, so a
    // backslash is an ordinary character. Escaping it would corrupt the value.
    expect(pgLiteral('a\\b')).toBe("'a\\b'");
  });

  it('cannot be closed by any arrangement of quotes', () => {
    for (const value of ["'", "''", "'''", "\\'", "a'; --"]) {
      const quoted = pgLiteral(value);
      // Strip the delimiters, then every remaining quote must be doubled.
      const inner = quoted.slice(1, -1);
      expect(inner.replace(/''/g, '')).not.toContain("'");
    }
  });
});

describe('MySQL', () => {
  it('delimits an identifier with backticks', () => {
    expect(mysqlIdentifier('users')).toBe('`users`');
    expect(mysqlIdentifier('a`b')).toBe('`a``b`');
  });

  it('escapes the backslash as well as the quote', () => {
    // MySQL reads a backslash as an escape unless NO_BACKSLASH_ESCAPES is
    // set, so doubling the quote alone leaves `\'` as a way out.
    expect(mysqlLiteral("a'b")).toBe("'a\\'b'");
    expect(mysqlLiteral('a\\b')).toBe("'a\\\\b'");
    expect(mysqlLiteral("a\\'b")).toBe("'a\\\\\\'b'");
  });

  it('cannot be closed by a trailing backslash', () => {
    // `'a\'` would otherwise escape the closing delimiter.
    expect(mysqlLiteral('a\\')).toBe("'a\\\\'");
  });
});

describe('MongoDB', () => {
  it('renders a value as JavaScript', () => {
    expect(jsLiteral('users')).toBe('"users"');
    expect(jsLiteral({ a: 1 })).toBe('{"a":1}');
  });

  it('cannot end the string it sits in', () => {
    const quoted = jsLiteral("'); db.dropDatabase(); //");

    expect(quoted).toBe('"\'); db.dropDatabase(); //"');
    expect(JSON.parse(quoted)).toBe("'); db.dropDatabase(); //");
  });

  it('escapes a double quote and a backslash', () => {
    expect(JSON.parse(jsLiteral('a"b\\c'))).toBe('a"b\\c');
  });

  it('renders nullish as null rather than undefined', () => {
    // `undefined` is not JSON and would reach the script as the literal
    // text `undefined`, which parses but means something else.
    expect(jsLiteral(undefined)).toBe('null');
  });
});

describe('what is refused outright', () => {
  it('refuses a NUL, which truncates the statement in the client', () => {
    for (const quote of [pgIdentifier, pgLiteral, mysqlIdentifier, mysqlLiteral]) {
      expect(() => quote('a\0b')).toThrow(/null bytes/);
    }
  });

  it('refuses a newline, which splits one logged statement into two', () => {
    for (const quote of [pgIdentifier, pgLiteral, mysqlIdentifier, mysqlLiteral]) {
      expect(() => quote('a\nb')).toThrow(/newlines/);
      expect(() => quote('a\rb')).toThrow(/newlines/);
    }
  });
});
