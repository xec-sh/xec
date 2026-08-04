import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
import { $, parallel, within } from ${JSON.stringify(DIST)};

const out = [];
out.push('exec=' + (await $\`echo hello\`).stdout.trim());
out.push('interp=' + (await $\`echo \${'a b;x'}\`).stdout.trim());
out.push('nothrow=' + (await $\`sh -c 'exit 3'\`.nothrow()).exitCode);
out.push('timeout=' + await $\`sleep 5\`.timeout('150ms').then(() => 'no', () => 'threw'));
out.push('within=' + await within('/tmp', async () => (await $\`pwd\`).stdout.trim() !== ''));
const lines = []; for await (const l of $\`printf 'x\\ny\\n'\`) lines.push(l.trim());
out.push('stream=' + lines.join(','));
out.push('buffer=' + (await $\`printf 'ab'\`).buffer().length);
const p = await parallel([$\`echo 1\`.nothrow(), $\`sh -c 'exit 1'\`.nothrow()], { maxConcurrent: 2 });
out.push('parallel=' + p.succeeded.length + '/' + p.failed.length);
console.log(out.join('|'));
`;

/** Where each runtime lives, or null when it is not installed here. */
function find(binary: string): string | null {
  try {
    return execFileSync('which', [binary], { encoding: 'utf8' }).trim() || null;
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
