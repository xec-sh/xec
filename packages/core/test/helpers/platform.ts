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

/**
 * A body for `node -e` that keeps the process alive for roughly `ms`.
 *
 * Written as `` $`node -e ${sleepFor(500)}` `` — interpolated, so it is
 * quoted for whichever shell is in play. `sleep` is not an option: it
 * exists on Windows only when Git Bash happens to be installed, and a
 * suite that depends on that looks like it proved more than it did.
 */
export const sleepFor = (ms: number): string => `setTimeout(()=>{},${Math.round(ms)})`;

/**
 * A body for `node -e` that writes `text` to stdout, byte for byte.
 *
 * `printf 'a\nb\n'` is not portable: cmd treats the single quotes as
 * literal characters, so printf receives `'a` as its format string.
 */
export const emit = (text: string): string =>
  `process.stdout.write(${JSON.stringify(text)})`;

/** A body for `node -e` that writes `text` to stderr. */
export const emitErr = (text: string): string =>
  `process.stderr.write(${JSON.stringify(text)})`;

/**
 * A body for `node -e` that passes stdin through, keeping only lines that
 * contain `needle` — and exiting 1 when none did, as grep does.
 *
 * Standing in for `grep`, which on Windows exists only when Git Bash
 * happens to be installed.
 */
export const keepLines = (needle: string, invert = false): string =>
  `let b='';process.stdin.on('data',c=>b+=c).on('end',()=>{` +
  `const m=b.split('\\n').filter(l=>l.length&&(l.includes(${JSON.stringify(needle)})!==${invert}));` +
  `process.stdout.write(m.map(l=>l+'\\n').join(''));process.exit(m.length?0:1)})`;

/** A body for `node -e` that upper-cases stdin. Standing in for `tr a-z A-Z`. */
export const upperCase = (): string =>
  `let b='';process.stdin.on('data',c=>b+=c).on('end',()=>process.stdout.write(b.toUpperCase()))`;

/**
 * A body for `node -e` that exits at once, leaving a detached child to
 * write `text` to the inherited stream `ms` later.
 *
 * The portable spelling of `( sleep 0.2; echo late ) & exit 0` — a shell
 * exiting before output written on its behalf arrives. cmd has no subshell
 * or `&` background operator, and the scenario is not POSIX's: it is what
 * any runtime's scheduling can do to two concurrent commands.
 */
export const outlivingWriter = (
  text: string,
  ms: number,
  stream: 'stdout' | 'stderr' = 'stdout'
): string => {
  // The inner script travels as base64. Written literally it would need
  // quotes inside quotes inside a shell argument, and the escaping is the
  // very thing the suite around this is trying to test.
  const inner = Buffer.from(
    `setTimeout(()=>process.${stream}.write(${JSON.stringify(text)}),${ms})`
  ).toString('base64');

  return (
    `const c=require("node:child_process").spawn(process.execPath,` +
    `["-e",Buffer.from("${inner}","base64").toString()],` +
    `{stdio:"inherit",detached:true});c.unref();process.exit(0)`
  );
};

/** A body for `node -e` that copies stdin to stdout unchanged. `cat`. */
export const passThrough = (): string => 'process.stdin.pipe(process.stdout)';

/**
 * A body for `node -e` that writes the value of an environment variable.
 *
 * The reference is spelled `$NAME` in POSIX and `%NAME%` in cmd. A test
 * about whether a variable *arrives* should not also be a test of how a
 * particular shell spells reading it.
 */
export const readEnv = (name: string): string =>
  `process.stdout.write(process.env[${JSON.stringify(name)}] ?? "")`;

/** A body for `node -e` that exits with `code`. */
export const exitWith = (code: number): string => `process.exit(${code})`;

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
