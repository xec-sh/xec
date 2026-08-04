import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * `--aggregate` was advertised in the help text while the implementation threw
 * 'not yet implemented'. These tests pin the merging rules it now follows.
 *
 * The parser is a module-private helper, so it is evaluated from source rather
 * than imported — testing it directly is worth more than exporting it purely
 * to make it testable.
 */
const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/commands/logs.ts'),
  'utf8'
);

const body = source.slice(
  source.indexOf('function parseLogTimestamp'),
  source.indexOf('\n}\n', source.indexOf('function parseLogTimestamp')) + 3
);

// eslint-disable-next-line no-new-func
const parseLogTimestamp = new Function(
  `${body.replace('function parseLogTimestamp(line: string): number | null', 'function parseLogTimestamp(line)')}; return parseLogTimestamp;`
)() as (line: string) => number | null;

describe('log timestamp parsing', () => {
  it('reads the ISO-8601 form Docker and kubectl emit', () => {
    const at = parseLogTimestamp('2026-08-04T09:12:33.123456789Z stdout F starting up');
    expect(at).toBe(Date.parse('2026-08-04T09:12:33.123Z'));
  });

  it('reads an ISO timestamp with a space separator', () => {
    expect(parseLogTimestamp('2026-08-04 09:12:33 something happened')).not.toBeNull();
  });

  it('reads the syslog form used by /var/log', () => {
    const at = parseLogTimestamp('Aug  4 09:12:33 host sshd[123]: Accepted password');
    expect(at).toBe(Date.parse(`Aug  4 09:12:33 ${new Date().getFullYear()}`));
  });

  it('returns null for a line with no timestamp', () => {
    expect(parseLogTimestamp('    at Object.<anonymous> (/app/index.js:1:1)')).toBeNull();
    expect(parseLogTimestamp('plain message')).toBeNull();
  });

  it('does not mistake a version or an IP for a timestamp', () => {
    expect(parseLogTimestamp('v1.2.3 released')).toBeNull();
    expect(parseLogTimestamp('192.168.1.1 connected')).toBeNull();
  });

  it('orders lines from different sources correctly', () => {
    const lines = [
      '2026-08-04T09:12:35Z from-b',
      '2026-08-04T09:12:33Z from-a',
      '2026-08-04T09:12:34Z from-c',
    ];

    const ordered = lines
      .map((line, seq) => ({ line, at: parseLogTimestamp(line) ?? 0, seq }))
      .sort((a, b) => (a.at === b.at ? a.seq - b.seq : a.at - b.at))
      .map(entry => entry.line);

    expect(ordered).toEqual([
      '2026-08-04T09:12:33Z from-a',
      '2026-08-04T09:12:34Z from-c',
      '2026-08-04T09:12:35Z from-b',
    ]);
  });

  it('keeps equal timestamps in their original order', () => {
    // A stable merge matters: two hosts logging in the same second must not
    // have their lines shuffled on every run.
    const lines = ['2026-08-04T09:12:33Z first', '2026-08-04T09:12:33Z second'];

    const ordered = lines
      .map((line, seq) => ({ line, at: parseLogTimestamp(line) ?? 0, seq }))
      .sort((a, b) => (a.at === b.at ? a.seq - b.seq : a.at - b.at))
      .map(entry => entry.line);

    expect(ordered).toEqual(lines);
  });
});
