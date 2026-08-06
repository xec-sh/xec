import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';

/**
 * What differs between platforms, in the places tests actually touch it.
 *
 * Most of this suite is about the library, and reaches for a shell only
 * because it needs *something* to run. Those tests should say what they
 * mean once and work everywhere. The ones that are genuinely about POSIX
 * semantics — expansion, `$(…)`, a `;` separator — should say so and skip
 * where that is not the shell.
 */

export const isWindows = process.platform === 'win32';

/**
 * A directory that exists on this platform, resolved through symlinks.
 *
 * `/tmp` is `/private/tmp` on macOS and does not exist on Windows, so a
 * test that hardcodes it asserts against the wrong string on two of the
 * three platforms it runs on.
 */
export const tempRoot = (): string => realpathSync(tmpdir());

/**
 * Anything that runs a template, which is every engine shape in this suite.
 */
type Tagged = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => PromiseLike<{ stdout: string }>;

/**
 * Run a Node one-liner and answer its stdout, trimmed.
 *
 * The body is interpolated, so it arrives as a single argument quoted for
 * whichever shell is in play — which is the point. `echo "x"` is not
 * portable: cmd.exe prints the quotes, because its echo does not strip
 * them. Anything that compares output exactly goes through the runtime
 * rather than through the shell's opinion of a word.
 */
export const runNode = async (engine: Tagged, body: string): Promise<string> =>
  (await engine`node -e ${body}`).stdout.trim();

/** Print `text` and nothing else. */
export const printExactly = (engine: Tagged, text: string): Promise<string> =>
  runNode(engine, `process.stdout.write(${JSON.stringify(text)})`);

/**
 * The directory a command ran in, natively spelled.
 *
 * `pwd` is not the answer: it does not exist in cmd, and Git Bash answers
 * `/d/tmp` for `D:\tmp` — a third spelling matching neither what was asked
 * for nor what the platform calls it.
 */
export const cwdOf = (engine: Tagged): Promise<string> =>
  runNode(engine, 'process.stdout.write(process.cwd())');

/**
 * Send `value` through the shell as an argument and get back what arrived.
 *
 * The sharpest test of escaping there is: the value is interpolated, so
 * the library quotes it for whichever shell is in play, and the runtime
 * prints the argument back byte for byte. If the quoting leaked, the
 * shell would have expanded, split or executed it and the answer would
 * differ — on cmd as surely as on sh.
 *
 * `echo` cannot do this job. Its output carries the shell's own
 * conventions: cmd prints the quotes, POSIX strips them, and neither is
 * evidence about the escaping.
 */
export const argEcho = async (engine: Tagged, value: string): Promise<string> =>
  (await engine`node -e ${'process.stdout.write(process.argv[1] ?? "")'} ${value}`).stdout;

/** A command that exits after roughly `ms`, without needing `sleep`. */
export const sleepFor = (ms: number): string =>
  `node -e "setTimeout(()=>{},${Math.round(ms)})"`;

/** A command that exits with `code`, on any shell. */
export const exitWith = (code: number): string =>
  `node -e "process.exit(${code})"`;

/**
 * The environment variable reference this platform's default shell expands.
 *
 * `$NAME` in POSIX, `%NAME%` in cmd. A test that writes only the first
 * asserts against a literal on Windows.
 */
export const envRef = (name: string): string => (isWindows ? `%${name}%` : `$${name}`);

/**
 * Whether the default shell here speaks POSIX.
 *
 * Not "is this Unix": a test may set `.shell('bash')` on Windows, and then
 * POSIX is exactly what it gets.
 */
export const posixShellIsDefault = !isWindows;

/**
 * Skip a suite whose subject is POSIX shell syntax itself.
 *
 * Expansion, `$(…)`, `&&` and `;` chaining, quoting removal — behaviour
 * cmd.exe does not have and no amount of escaping can give it. Marking
 * them is honest; asserting them everywhere is not.
 */
export const describePosixShell: typeof describe =
  posixShellIsDefault ? describe : describe.skip;

/** The same, for one test rather than a suite. */
export const itPosixShell: typeof it = posixShellIsDefault ? it : it.skip;
