import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const run = promisify(execFile);

/**
 * Names this suite creates. Anything matching survives only by accident.
 *
 * Kept as prefixes rather than exact names because several are suffixed
 * with an index or a timestamp, and a container nobody can name is a
 * container nobody removes.
 */
const TEST_CONTAINER_PREFIXES = [
  'test-redis-cluster',
  'test-redis-custom',
  'test-cluster',
  'test-ssh',
  'xec-in-test',
  'xec-test-',
  'temp-ush-',
  'ush-temp-',
];

/**
 * Remove whatever the suite left behind.
 *
 * Every leak found in this repository has cost a later run rather than the
 * one that caused it: six containers stuck in `Created` made the whole
 * docker suite fail for reasons unrelated to the code, and a stopped kind
 * cluster made it skip on a machine where kind works. Individual tests
 * clean up after themselves; this is the net under them, because a test
 * that fails halfway does not reach its own `finally`.
 *
 * Never removes anything it was not asked to: the match is on the
 * prefixes above, so a developer's own containers are not touched.
 */
export default async function teardown(): Promise<void> {
  let names: string[];
  try {
    // Not `-aq`: with -q docker prints ids and ignores --format, so the
    // prefixes below matched nothing and the sweep silently did nothing.
    const { stdout } = await run('docker', ['ps', '-a', '--format', '{{.Names}}']);
    names = stdout.split('\n').map(name => name.trim()).filter(Boolean);
  } catch {
    // No docker here, or no daemon: nothing this file can or should do.
    return;
  }

  const leaked = names.filter(name =>
    TEST_CONTAINER_PREFIXES.some(prefix => name.startsWith(prefix))
  );

  if (leaked.length === 0) return;

  console.warn(`[teardown] removing ${leaked.length} container(s) the suite left: ${leaked.join(', ')}`);
  await run('docker', ['rm', '-f', ...leaked]).catch(() => {
    // Already gone, or being removed by something else. Either is fine.
  });
}
