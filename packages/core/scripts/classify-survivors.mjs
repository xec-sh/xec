/**
 * Which surviving mutants are missing tests, and which cannot be killed.
 *
 * A mutation score alone does not say what to do. Some survivors are gaps
 * — a rule nothing checks, a branch nothing reaches — and some change no
 * behaviour at all: a fast path that returns the same answer, a guard
 * another guard already covers, a Windows branch on a Unix machine. The
 * first kind is work; the second cannot be killed by any test, and
 * chasing it means writing tests that assert on an optimisation.
 *
 * This applies each survivor to the source and runs a probe — a script
 * that exercises the module broadly and prints what it observed. If the
 * output is byte-identical, no input in the probe distinguishes the
 * mutant, which is evidence of equivalence rather than proof: a wider
 * probe may still separate them. If it differs, the probe has found the
 * test that was missing, and it is written by hand from there.
 *
 * A probe must be deterministic. One that prints a temporary directory
 * name reports every mutant as different, because the name changes.
 *
 * Usage:
 *   node scripts/classify-survivors.mjs \
 *     reports/mutation/mutation.json src/utils/helpers.ts helpers probe.mjs
 *
 * @module
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const [reportPath, sourcePath, matcher, probePath] = process.argv.slice(2);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const file = Object.entries(report.files).find(([k]) => k.includes(matcher))[1];
const survivors = file.mutants.filter(m => m.status === 'Survived');
const original = readFileSync(sourcePath, 'utf8');

// tsx rather than node's own stripping: the sources use parameter
// properties, which strip-only mode refuses.
const TSX = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url));
const runProbe = () => execFileSync(TSX, [probePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const lines = original.split('\n');

/** Byte offset of a 1-based line/column pair. */
const offsetOf = (line, column) =>
  lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + column - 1;

const baseline = runProbe();
copyFileSync(sourcePath, sourcePath + '.orig');

const real = [], equivalent = [];
for (const m of survivors) {
  const start = offsetOf(m.location.start.line, m.location.start.column);
  const end = offsetOf(m.location.end.line, m.location.end.column);
  writeFileSync(sourcePath, original.slice(0, start) + m.replacement + original.slice(end));

  let out;
  try {
    out = runProbe();
  } catch (error) {
    out = 'THREW: ' + String(error.message).slice(0, 80);
  }

  const label = `L${m.location.start.line} ${m.mutatorName} -> ${JSON.stringify(m.replacement).slice(0, 40)}`;
  if (out === baseline) { equivalent.push(label); continue; }
  // Say *how* it differed, so a syntax error in the patch is not mistaken
  // for a behavioural difference.
  const a = baseline.split('\n'), b = out.split('\n');
  const at = a.findIndex((line, i) => line !== b[i]);
  real.push(`${label}\n        was: ${(a[at]||'').slice(0,70)}\n        now: ${(b[at]||String(out).slice(0,70)).slice(0,70)}`);
}
copyFileSync(sourcePath + '.orig', sourcePath);

console.log(`equivalent under this probe: ${equivalent.length}`);
console.log(`observably different: ${real.length}`);
for (const r of real) console.log('  REAL', r);
