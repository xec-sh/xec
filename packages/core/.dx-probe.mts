import { appendFileSync } from 'node:fs';
import { $ } from './src/index.js';

const LOG = '.dx-probe.log';
const say = (m: string) => appendFileSync(LOG, m + '\n');

// --- 1. The absolute basics: what does a beginner see?
const r1 = await $`echo hello`;
say(`1  await $\`echo hello\` -> typeof=${typeof r1} stdout=${JSON.stringify(r1.stdout)} ok=${r1.ok}`);

// zx: (await $`echo hello`).stdout === 'hello\n' ; toString() trims? Check ours:
say(`1b String(result)=${JSON.stringify(String(r1))} .text()=${JSON.stringify(r1.text())}`);

// --- 2. Interpolation safety
const file = "my file; rm -rf /"; 
const r2 = await $`echo ${file}`;
say(`2  interpolation: ${JSON.stringify(r2.stdout)}`);

// --- 3. Arrays (zx flattens and escapes each)
const flags = ['-l', '-a'];
try {
  const r3 = await $`ls ${flags} package.json`.nothrow();
  say(`3  array interp: exit=${r3.exitCode} err=${JSON.stringify(r3.stderr.slice(0,60))}`);
} catch (e) { say(`3  array interp THREW: ${String(e).slice(0,80)}`); }

// --- 4. Error handling shapes
try {
  await $`exit 2`;
  say('4  no throw');
} catch (e: any) {
  say(`4  throws: name=${e?.name} keys=${Object.keys(e).slice(0,8).join(',')}`);
  say(`4b message=${JSON.stringify(String(e?.message).slice(0, 120))}`);
}

// --- 5. nothrow + ok pattern
const r5 = await $`exit 3`.nothrow();
say(`5  nothrow: ok=${r5.ok} exitCode=${r5.exitCode} cause=${r5.cause}`);

// --- 6. json/text/lines on the promise (no await first)
const j = await $`echo '{"a":1}'`.json();
say(`6  $.json() -> ${JSON.stringify(j)}`);

// --- 7. quiet / verbosity: what prints by default?
say(`7  (check console: did anything print for the commands above?)`);

// --- 8. cd/env chaining shape
const r8 = await $.cd('/tmp').env({ FOO: 'bar' })`pwd && echo $FOO`;
say(`8  chain cd+env: ${JSON.stringify(r8.stdout.trim())}`);

// --- 9. pipe
const r9 = await $`printf "b\na\nc"`.pipe`sort`;
say(`9  pipe: ${JSON.stringify(r9.stdout)}`);

// --- 10. exitCode direct property
const code = await $`exit 5`.nothrow().exitCode;
say(`10 .exitCode -> ${code}`);

// --- 11. async iteration
const lines: string[] = [];
for await (const line of $`printf "x\ny"`) lines.push(line);
say(`11 async iter -> ${JSON.stringify(lines)}`);

// --- 12. which/temp helpers
say(`12 pwd() -> ${$.pwd()}`);

say('DONE');
