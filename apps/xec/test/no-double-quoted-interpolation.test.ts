import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

/**
 * `"${value}"` inside a command template quotes the value twice.
 *
 * The tag already escapes every interpolation for the shell that will
 * parse the command. Literal quotes written around one therefore become
 * part of the argument: `$`sh -c "${cmd}"`` produces `sh -c "'echo hi'"`,
 * and the shell reports `command not found` for any command with a space
 * in it. Sixteen sites had it — every `xec watch` on a container or pod,
 * the `xec copy` tar path, and all of the database service helpers.
 *
 * It reads as defensive, which is what makes it worth a test rather than a
 * review note. A value that genuinely belongs inside a larger quoted
 * string — a SQL statement, a shell line with a redirect — is built in
 * TypeScript with the right quoting and interpolated whole.
 */
describe('no interpolation is quoted twice', () => {
  /** Every .ts under a directory. */
  function sources(dir: string): string[] {
    const found: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) found.push(...sources(full));
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) found.push(full);
    }
    return found;
  }

  /**
   * Templates tagged with something that executes: `$`, `$.local()`,
   * `this.exec`, an engine. Ordinary template literals are not commands and
   * quote nothing.
   */
  const COMMAND_TEMPLATE =
    /(?:\$(?:\.\w+\([^)]*\))*|\bthis\.exec|\bthis\.engine\.run|\blocalEngine|\bengine)\s*`((?:[^`\\]|\\.)*)`/g;

  const QUOTED_INTERPOLATION = /(["'])\$\{[^}]*\}\1/;

  it('holds across the CLI sources', () => {
    const offenders: string[] = [];

    for (const file of sources(SRC)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(COMMAND_TEMPLATE)) {
        const found = QUOTED_INTERPOLATION.exec(match[1] ?? '');
        if (!found) continue;
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(SRC, file)}:${line}  ${found[0]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
