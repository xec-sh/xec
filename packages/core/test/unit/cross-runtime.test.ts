import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

// A `file://` URL for the import: on Windows an absolute path is
// rejected with ERR_UNSUPPORTED_ESM_URL_SCHEME, since `d:` reads as a
// protocol.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/index.js');

/**
 * The same probe, byte-identical on every runtime.
 *
 * The claim of Node/Bun/Deno parity rotted silently once already: every
 * builtin was imported bare, Node and Bun accept both spellings, and Deno
 * rejected the first one — so `import '@xec-sh/core'` failed there while the
 * suite stayed green. A claim nothing enforces is a claim about the past.
 *
 * The probe exercises the seams that actually differed between runtimes:
 * spawn behaviour, timers, concurrency, stream decoding.
 */
const PROBE = `
import { $, parallel, within } from ${JSON.stringify(pathToFileURL(DIST).href)};
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';

// Everything here goes through the runtime rather than through a shell's
// vocabulary. \`sh\`, \`sleep\`, \`printf\` and \`/tmp\` do not exist on Windows,
// and \`echo "x"\` answers differently there — none of which is what this
// file asks about. The seams it does ask about — spawn, timers, concurrency,
// stream decoding — are the same everywhere.
//
// The body is interpolated so the library quotes it for the shell in play.
// \`JSON.stringify\` only looks like the same thing: POSIX collapses the
// doubled backslashes it produces and cmd does not, so \`"a\\\\nb"\` is a
// newline on one and two literal characters on the other.
const node = (body) => $\`node -e \${body}\`;

const out = [];
out.push('exec=' + (await node('process.stdout.write("hello")')).stdout.trim());
out.push('interp=' + (await $\`node -e \${'process.stdout.write(process.argv[1])'} \${'a b;x'}\`).stdout.trim());
out.push('nothrow=' + (await node('process.exit(3)').nothrow()).exitCode);
out.push('timeout=' + await node('setTimeout(()=>{},5000)').timeout('150ms').then(() => 'no', () => 'threw'));
out.push('within=' + await within(realpathSync(tmpdir()), async () =>
  (await node('process.stdout.write(process.cwd())')).stdout.trim() !== ''));
const lines = []; for await (const l of node('process.stdout.write("x\\\\ny\\\\n")')) lines.push(l.trim());
out.push('stream=' + lines.join(','));
out.push('buffer=' + (await node('process.stdout.write("ab")')).buffer().length);
const p = await parallel([node('process.exit(0)').nothrow(), node('process.exit(1)').nothrow()], { maxConcurrent: 2 });
out.push('parallel=' + p.succeeded.length + '/' + p.failed.length);
console.log(out.join('|'));
`;

/** Where each runtime lives, or null when it is not installed here. */
function find(binary: string): string | null {
  try {
    // `where` on Windows, and only the first line of it: `which` there is
    // Git Bash's, and answers `/c/Users/...` — a path no native spawn can
    // use.
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const found = execFileSync(finder, [binary], { encoding: 'utf8' }).split(/\r?\n/)[0]?.trim();
    return found || null;
  } catch {
    return null;
  }
}

function runProbe(argv: string[]): string {
  const file = path.join(os.tmpdir(), `xec-runtime-probe-${process.pid}.mjs`);
  fs.writeFileSync(file, PROBE);

  try {
    const raw = execFileSync(argv[0]!, [...argv.slice(1), file], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    // The probe's own line is the last one; runtimes may print warnings first.
    return raw.trim().split('\n').at(-1) ?? '';
  } finally {
    fs.rmSync(file, { force: true });
  }
}

describe('the probe behaves identically on every installed runtime', () => {
  const EXPECTED = 'exec=hello|interp=a b;x|nothrow=3|timeout=threw|within=true|stream=x,y|buffer=2|parallel=1/1';

  it('node agrees with the contract', () => {
    expect(runProbe([process.execPath])).toBe(EXPECTED);
  }, 90_000);

  const bun = find('bun');
  it.runIf(bun !== null)('bun agrees with node', () => {
    expect(runProbe([bun!])).toBe(EXPECTED);
  }, 90_000);

  const deno = find('deno');
  it.runIf(deno !== null)('deno agrees with node', () => {
    expect(runProbe([deno!, 'run', '-A'])).toBe(EXPECTED);
  }, 90_000);
});
