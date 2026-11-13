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
 * Usage: node scripts/check-doc-examples.mjs [--only <substring>] [--file <markdown>] [--report <json-file>]
 */

import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { resolveTypeScriptCompiler } from './typescript-compiler.mjs';

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
      const skipped = /doc-check:\s*skip\s*[—:-]\s+[^<>\s-]/.test(preceding);
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
  const fileIndex = process.argv.indexOf('--file');
  if (fileIndex !== -1) {
    if (!process.argv[fileIndex + 1]) throw new Error('--file requires a Markdown path');
    const file = path.resolve(process.argv[fileIndex + 1]);
    sources.push({ file, blocks: blocksIn(await readFile(file, 'utf8')) });
  } else {
    for (const file of markdownUnder(path.join(ROOT, 'website/docs'))) {
      sources.push({ file, blocks: blocksIn(await readFile(file, 'utf8')) });
    }
    const page = path.join(ROOT, 'website/src/pages/index.tsx');
    sources.push({ file: page, blocks: blocksInPage(await readFile(page, 'utf8')) });
  }

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
  try {
    const cases = path.join(dir, 'cases');
    await mkdir(cases);
    await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');

    // Resolve only declared public type exports, including subpaths. No API stubs.
    const typePaths = {};
    for (const location of ['packages/core', 'packages/ops', 'packages/kit', 'packages/loader', 'packages/testing', 'apps/xec']) {
      const folder = path.join(ROOT, location);
      const manifest = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
      for (const [subpath, entry] of Object.entries(manifest.exports ?? {})) {
        const types = entry?.types ?? entry?.import?.types;
        if (typeof types !== 'string') continue;
        const resolved = manifest.name === '@xec-sh/core' && process.env.XEC_CORE_TYPES && types.startsWith('./dist/')
          ? path.join(process.env.XEC_CORE_TYPES, types.slice('./dist/'.length)) : path.resolve(folder, types);
        typePaths[manifest.name + (subpath === '.' ? '' : subpath.slice(1))] = [resolved];
      }
    }
    // Test examples use the runner declared by the testing package.
    typePaths.vitest = [path.join(ROOT, 'packages/testing/node_modules/vitest/dist/index.d.ts')];

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
            paths: typePaths,
          },
          include: ['cases/**/*.ts', path.join(ROOT, 'apps/xec/dist/globals.d.ts')],
        },
        null,
        2
      )
    );

    const compile = async () => {
      try {
      const result = await run(
        process.execPath,
        [resolveTypeScriptCompiler(ROOT), '-p', dir],
        { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }
      );
        return result.stdout;
    } catch (error) {
        const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        if (!/error TS\d+/.test(output)) throw error;
        return output;
      }
    };
    let output = await compile();
    // tsc stops before semantic analysis if any input contains a syntax error.
    // Preserve those failures and check the remaining programs in a second pass.
    const syntaxCases = new Set([...output.matchAll(/case-(\d+)\.ts\(\d+,\d+\): error TS1\d{3}:/g)].map(match => Number(match[1])));
    if (syntaxCases.size) {
      const configPath = path.join(dir, 'tsconfig.json');
      const config = JSON.parse(await readFile(configPath, 'utf8'));
      config.exclude = [...syntaxCases].map(index => path.join(cases, `case-${index}.ts`));
      await writeFile(configPath, JSON.stringify(config));
      output += '\n' + await compile();
    }

    // An error with no file prefix is tsc failing to start — a missing type
    // package, a bad path. It must not read as "nothing found".
    const setupErrors = output
      .split('\n')
      .filter(l => /^error TS\d+/.test(l.trim()));
    if (setupErrors.length > 0) {
      console.error('The compiler did not run:\n' + setupErrors.slice(0, 5).join('\n'));
      process.exitCode = 2;
      return;
    }

    const findings = new Map();
    for (const line of output.split('\n')) {
      // tsc reports paths relative to cwd, not to the tsconfig, so the
      // prefix varies. Anchor on the case file itself.
      const m = /case-(\d+)\.ts\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
      if (!m) {
        if (/error TS\d+:/.test(line)) throw new Error('Unattributed compiler failure: ' + line);
        continue;
      }
      const block = work[Number(m[1])];
      const key = `${block.file}:${block.line}`;
      if (!findings.has(key)) findings.set(key, { block, errors: [] });
      findings.get(key).errors.push({ line: Number(m[2]), code: m[4], message: m[5] });
    }

    // Every unmarked failure is real. Deliberate fragments must opt out next to
    // their fence with doc-check: skip and an explanation; syntax is not an opt-out.
    const broken = [...findings.values()];

    for (const { block, errors } of broken) {
      console.log(`\n${path.relative(ROOT, block.file)}:${block.line}`);
      for (const e of errors.slice(0, 6)) {
        console.log(`   ${e.code}  ${e.message}`);
      }
      if (errors.length > 6) console.log(`   … ${errors.length - 6} more`);
    }

    console.log(
      `\n${work.length} examples checked. ` +
        `${broken.length} failing blocks; ${syntaxCases.size} contain syntax diagnostics.`
    );

    const reportIndex = process.argv.indexOf('--report');
    if (reportIndex !== -1) {
      if (!process.argv[reportIndex + 1]) throw new Error('--report requires a JSON path');
      await writeFile(path.resolve(process.argv[reportIndex + 1]), JSON.stringify({
        checkedBlocks: work.length,
        syntaxBlocks: syntaxCases.size,
        failures: broken.map(({ block, errors }) => ({
          file: block.file, line: block.line, language: block.lang, errors,
        })),
      }, null, 2) + '\n');
    }
    process.exitCode = broken.length === 0 ? 0 : 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await main();
