/**
 * Compile every code example in the documentation.
 *
 * A doc example is code a reader will paste. If it names something that does
 * not exist — an undeclared variable, a method the API never had, a browser
 * global — they hit the error, not us, and the page keeps saying it works.
 * The landing page had three at once: `$.ssh(host)` with no `host`, no
 * import for `$`, and `alert()`, which Node does not have.
 *
 * Each block is compiled against the real published types plus the globals a
 * script actually receives, so a scripting example that uses bare `$` is
 * correct and a library example that does the same is not.
 *
 * Blocks that are deliberately incomplete are opted out with an HTML comment
 * on the line before the fence:
 *
 *     <!-- doc-check: skip — fragment, shown for shape -->
 *
 * Usage: node scripts/check-doc-examples.mjs [--only <substring>]
 */

import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Languages worth compiling. Anything else is shell, yaml, json, output. */
const COMPILED = new Set(['ts', 'typescript', 'js', 'javascript', 'tsx']);

/** Walk for markdown, skipping build output. */
function* markdownUnder(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === '.docusaurus') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* markdownUnder(full);
    else if (/\.mdx?$/.test(entry.name)) yield full;
  }
}

/**
 * Fenced code blocks, with the line each starts on so a failure can be
 * pointed at.
 */
function blocksIn(source) {
  const lines = source.split('\n');
  const blocks = [];
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```(\w*)/.exec(line);

    if (open) {
      if (/^\s*```\s*$/.test(line)) {
        blocks.push({ ...open, code: lines.slice(open.start, i).join('\n') });
        open = null;
      }
      continue;
    }

    if (fence) {
      const lang = fence[1].toLowerCase();
      // An opt-out marker on any of the three lines above the fence.
      const preceding = lines.slice(Math.max(0, i - 3), i).join('\n');
      const skipped = /doc-check:\s*skip/.test(preceding);
      open = { lang, line: i + 1, start: i + 1, skipped };
      if (!COMPILED.has(lang) || skipped) {
        // Still needs its closing fence found, but is not collected.
        const close = lines.findIndex((l, j) => j > i && /^\s*```\s*$/.test(l));
        i = close === -1 ? lines.length : close;
        open = null;
      }
    }
  }

  return blocks;
}

/** Code blocks inside a .tsx page, which holds them as template literals. */
function blocksInPage(source) {
  const blocks = [];
  const pattern = /<code>\{`([\s\S]*?)`\}<\/code>/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const code = match[1].replace(/\\`/g, '`').replace(/\\\\/g, '\\');
    // Shell and install lines are not TypeScript.
    if (/^\s*(npm|pnpm|yarn|xec|curl|docker|kubectl)\b/m.test(code) && !/\b(const|await|import)\b/.test(code)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    blocks.push({ lang: 'ts', line, code });
  }
  return blocks;
}

async function main() {
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];

  const sources = [];
  for (const file of markdownUnder(path.join(ROOT, 'website/docs'))) {
    sources.push({ file, blocks: blocksIn(await readFile(file, 'utf8')) });
  }
  const page = path.join(ROOT, 'website/src/pages/index.tsx');
  sources.push({ file: page, blocks: blocksInPage(await readFile(page, 'utf8')) });

  const work = sources
    .filter(s => (only ? s.file.includes(only) : true))
    .flatMap(s => s.blocks.map(b => ({ ...b, file: s.file })));

  if (work.length === 0) {
    console.log('No examples matched.');
    return;
  }

  // Inside the repository, not in the system temp directory: module
  // resolution walks up to `node_modules` from here, so `@types/node` and
  // the workspace packages resolve. From /tmp they did not, tsc failed
  // before analysing anything, and the run reported zero errors — the
  // check silently checking nothing.
  const dir = await mkdtemp(path.join(ROOT, 'node_modules', '.doc-check-'));
  const cases = path.join(dir, 'cases');
  await mkdir(cases);

  // Each block becomes a module. Top-level await is legal, and the script
  // globals are declared, so a scripting example needs no preamble.
  await Promise.all(
    work.map((block, index) =>
      writeFile(path.join(cases, `case-${index}.ts`), `${block.code}\nexport {};\n`)
    )
  );

  await writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          lib: ['ES2023'],
          types: ['node'],
          strict: process.argv.includes('--strict'),
          noEmit: true,
          skipLibCheck: true,
          allowJs: true,
          baseUrl: '.',
          paths: {
            '@xec-sh/core': [path.join(ROOT, 'packages/core/dist/index.d.ts')],
            '@xec-sh/ops': [path.join(ROOT, 'packages/ops/dist/index.d.ts')],
            '@xec-sh/kit': [path.join(ROOT, 'packages/kit/dist/index.d.ts')],
            '@xec-sh/loader': [path.join(ROOT, 'packages/loader/dist/index.d.ts')],
            '@xec-sh/cli': [path.join(ROOT, 'apps/xec/dist/index.d.ts')],
          },
        },
        include: ['cases/**/*.ts', path.join(ROOT, 'apps/xec/dist/globals.d.ts')],
      },
      null,
      2
    )
  );

  let output = '';
  try {
    const result = await run(
      process.execPath,
      [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', dir],
      { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }
    );
    output = result.stdout;
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  // An error with no file prefix is tsc failing to start — a missing type
  // package, a bad path. It must not read as "nothing found".
  const setupErrors = output
    .split('\n')
    .filter(l => /^error TS\d+/.test(l.trim()));
  if (setupErrors.length > 0) {
    console.error('The compiler did not run:\n' + setupErrors.slice(0, 5).join('\n'));
    await rm(dir, { recursive: true, force: true });
    process.exitCode = 2;
    return;
  }

  const findings = new Map();
  for (const line of output.split('\n')) {
    // tsc reports paths relative to cwd, not to the tsconfig, so the
    // prefix varies. Anchor on the case file itself.
    const m = /case-(\d+)\.ts\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
    if (!m) continue;
    const block = work[Number(m[1])];
    const key = `${block.file}:${block.line}`;
    if (!findings.has(key)) findings.set(key, { block, errors: [] });
    findings.get(key).errors.push({ line: Number(m[2]), code: m[4], message: m[5] });
  }

  // TS1xxx is "this text is not a program" — a method signature, a class
  // member, an object literal, a REPL transcript. Documentation shows those
  // deliberately. TS2xxx and above is "this program is wrong": a name that
  // does not exist, a method the API never had. Only the second kind is a
  // defect, and mixing them buries it.
  const parses = f => !f.errors.some(e => /^TS1\d{3}$/.test(e.code));
  const broken = [...findings.values()].filter(parses);
  const fragments = [...findings.values()].filter(f => !parses(f));

  for (const { block, errors } of broken) {
    console.log(`\n${path.relative(ROOT, block.file)}:${block.line}`);
    for (const e of errors.slice(0, 6)) {
      console.log(`   ${e.code}  ${e.message}`);
    }
    if (errors.length > 6) console.log(`   … ${errors.length - 6} more`);
  }

  console.log(
    `\n${work.length} examples compiled. ` +
      `${broken.length} are wrong; ${fragments.length} are not whole programs.`
  );

  if (process.argv.includes('--fragments')) {
    console.log('\nNot whole programs:');
    for (const { block } of fragments) {
      console.log(`   ${path.relative(ROOT, block.file)}:${block.line}  (${block.lang})`);
    }
  }

  await rm(dir, { recursive: true, force: true });
  process.exitCode = broken.length === 0 ? 0 : 1;
}

await main();
