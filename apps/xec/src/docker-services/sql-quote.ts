/**
 * Quoting values into SQL, per dialect.
 *
 * The service helpers built their statements by concatenation —
 * `CREATE USER ${username} WITH PASSWORD '${password}'` — so a name
 * carrying a quote or a semicolon ended the statement and began another.
 * That is the same failure the shell escaping in `@xec-sh/core` exists to
 * prevent, one layer further in, and it needs the same treatment: the
 * value is quoted for the parser that will read it.
 *
 * Two kinds, because SQL has two:
 *
 * - An **identifier** names a thing — a database, a user, a table. It is
 *   delimited differently in each dialect and cannot be parameterised.
 * - A **literal** is data.
 *
 * These cover the fixed set of administrative statements the service
 * helpers issue. They are not a substitute for a driver's bound
 * parameters, which is what application queries should use.
 */

/**
 * Characters no identifier or literal may carry.
 *
 * A NUL terminates the string for the client library before the server
 * ever parses it, and a newline is what turns one logged statement into
 * two. Neither belongs in a database or user name, so refusing is better
 * than encoding.
 */
const FORBIDDEN = /[\0\r\n]/;

function checkedValue(value: string, kind: string): string {
  if (FORBIDDEN.test(value)) {
    throw new Error(`Invalid ${kind}: null bytes and newlines are not allowed`);
  }
  return value;
}

/**
 * Quote an identifier for PostgreSQL.
 *
 * Double quotes delimit; an embedded double quote is doubled. Quoting also
 * makes the name case-sensitive, which is the correct reading of a name
 * the caller supplied exactly.
 *
 * @param name - The identifier.
 * @returns The quoted identifier.
 *
 * @example
 * ```typescript
 * pgIdentifier('my db');   // "my db"
 * pgIdentifier('a"b');     // "a""b"
 * ```
 */
export function pgIdentifier(name: string): string {
  return `"${checkedValue(name, 'identifier').replace(/"/g, '""')}"`;
}

/**
 * Quote a literal for PostgreSQL.
 *
 * Single quotes delimit; an embedded single quote is doubled. Backslashes
 * are left alone: `standard_conforming_strings` has been on by default
 * since 9.1, so a backslash is an ordinary character.
 *
 * @param value - The literal value.
 * @returns The quoted literal.
 */
export function pgLiteral(value: string): string {
  return `'${checkedValue(value, 'value').replace(/'/g, "''")}'`;
}

/**
 * Quote an identifier for MySQL.
 *
 * Backticks delimit; an embedded backtick is doubled.
 *
 * @param name - The identifier.
 * @returns The quoted identifier.
 */
export function mysqlIdentifier(name: string): string {
  return `\`${checkedValue(name, 'identifier').replace(/`/g, '``')}\``;
}

/**
 * Quote a literal for MySQL.
 *
 * MySQL reads a backslash as an escape inside string literals unless
 * `NO_BACKSLASH_ESCAPES` is set, so the backslash must be escaped as well
 * as the quote — doubling the quote alone leaves `\'` as a way out.
 *
 * @param value - The literal value.
 * @returns The quoted literal.
 */
export function mysqlLiteral(value: string): string {
  const escaped = checkedValue(value, 'value')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    // Ctrl-Z ends a statement when a client is fed from a file on Windows.
    // eslint-disable-next-line no-control-regex -- escaping it is the point
    .replace(/\x1a/g, '\\Z');
  return `'${escaped}'`;
}

/**
 * Render a value for a `mongosh --eval` script.
 *
 * The script is JavaScript, so JSON is the correct quoting: it escapes
 * quotes, backslashes and control characters, and cannot introduce a
 * statement boundary.
 *
 * @param value - Any JSON-serialisable value.
 * @returns A JavaScript literal.
 */
export function jsLiteral(value: unknown): string {
  return JSON.stringify(value ?? null);
}
