/**
 * Splitting output into lines, on every platform that produces it.
 *
 * A line ends with `\n` on Unix and `\r\n` on Windows, and a command run
 * over SSH from a Windows host, or a Windows tool invoked from Linux,
 * mixes the two in one stream. Splitting on `\n` alone leaves the carriage
 * return attached to every line — so `lines()` answers `'ok\r'`, a name
 * read from `docker ps` never matches, and a path from `where` fails
 * `existsSync`. Nothing throws; the values are simply wrong.
 *
 * A lone `\r` is left alone. It is what a progress bar writes to return to
 * the start of the line, and treating it as a terminator would turn one
 * download into a thousand lines.
 */

/**
 * Split text into lines, accepting either terminator.
 *
 * The trailing empty string after a final newline is kept, matching
 * `String.prototype.split` — callers that stream rely on it to carry the
 * incomplete remainder.
 *
 * @param text - The text to split.
 * @returns The lines, without their terminators.
 *
 * @example
 * ```typescript
 * splitLines('a\r\nb\n');  // ['a', 'b', '']
 * ```
 */
export function splitLines(text: string): string[] {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.endsWith('\r')) lines[i] = line.slice(0, -1);
  }
  return lines;
}

/**
 * Strip a single trailing carriage return.
 *
 * For the places that already hold one line and only need it cleaned.
 *
 * @param line - A line that may end with `\r`.
 * @returns The line without it.
 */
export function stripCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
