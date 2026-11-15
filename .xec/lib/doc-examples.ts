import type { ExecFileException } from 'node:child_process';

import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { rm, mkdir, mkdtemp, symlink, readFile, writeFile } from 'node:fs/promises';

import { resolveTypeScriptCompiler } from './typescript-compiler.js';

const run = promisify(execFile);
const compiledLanguages = new Set(['ts', 'typescript', 'js', 'javascript', 'tsx', 'jsx']);

interface Block { language: string; line: number; code: string }
interface SourceBlock extends Block { file: string }
interface Diagnostic { line: number; code: string; message: string }
export interface DocExamplesReport {
  checkedBlocks: number;
  syntaxBlocks: number;
  failures: { file: string; line: number; language: string; errors: Diagnostic[] }[];
}
export interface DocExamplesOptions {
  root: string;
  cwd?: string;
  file?: string;
  only?: string;
  strict?: boolean;
  signal?: AbortSignal;
}

type ExportEntry = string | { types?: ExportEntry; import?: ExportEntry; default?: ExportEntry };
interface PackageManifest {
  name: string;
  types?: string;
  exports?: Record<string, ExportEntry>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function* markdownUnder(directory: string): Generator<string> {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'build', '.lumen'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* markdownUnder(file);
    else if (/\.mdx?$/.test(entry.name)) yield file;
  }
}

function blocksIn(source: string): Block[] {
  const lines = source.split('\n');
  const blocks: Block[] = [];
  for (let index = 0; index < lines.length; index++) {
    const fence = /^\s*```(\w*)/.exec(lines[index]!);
    if (!fence) continue;
    const language = fence[1]!.toLowerCase();
    const preceding = lines.slice(Math.max(0, index - 3), index).join('\n');
    const skipped = /doc-check:\s*skip\s*[—:-]\s+[^<>\s-]/.test(preceding);
    const close = lines.findIndex((line, position) => position > index && /^\s*```\s*$/.test(line));
    if (close === -1) throw new Error(`Unclosed code fence at line ${index + 1}`);
    if (compiledLanguages.has(language) && !skipped) {
      blocks.push({ language, line: index + 1, code: lines.slice(index + 1, close).join('\n') });
    }
    index = close;
  }
  return blocks;
}

function typeEntry(entry: ExportEntry | undefined): string | undefined {
  if (typeof entry === 'string') return entry;
  return entry && (typeEntry(entry.types) ?? typeEntry(entry.import) ?? typeEntry(entry.default));
}

/** Compile documented programs against actual workspace declarations; never execute examples. */
export async function checkDocExamples(options: DocExamplesOptions): Promise<DocExamplesReport> {
  const { root, signal } = options;
  signal?.throwIfAborted();
  const sources: { file: string; blocks: Block[] }[] = [];
  if (options.file !== undefined) {
    const file = path.resolve(options.cwd ?? process.cwd(), options.file);
    sources.push({ file, blocks: blocksIn(await readFile(file, 'utf8')) });
  } else {
    for (const file of markdownUnder(path.join(root, 'website/docs'))) {
      sources.push({ file, blocks: blocksIn(await readFile(file, 'utf8')) });
    }
    const file = path.join(root, 'website/src/data/examples.json');
    const examples: { code: string }[] = JSON.parse(await readFile(file, 'utf8'));
    sources.push({ file, blocks: examples.map((example, index) => ({ language: 'ts', line: index + 1, code: example.code })) });
  }
  const work: SourceBlock[] = sources
    .filter(source => options.only === undefined || source.file.includes(options.only))
    .flatMap(source => source.blocks.map(block => ({ ...block, file: source.file })));
  if (!work.length) return { checkedBlocks: 0, syntaxBlocks: 0, failures: [] };

  // A disposable consumer follows TMPDIR. Explicit public type paths and a
  // scoped CLI link make resolution independent of the checkout's filesystem.
  const directory = await mkdtemp(path.join(tmpdir(), 'xec-doc-examples-'));
  try {
    signal?.throwIfAborted();
    const cases = path.join(directory, 'cases');
    await mkdir(cases);
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
    const packageScope = path.join(directory, 'node_modules', '@xec-sh');
    await mkdir(packageScope, { recursive: true });
    await symlink(path.join(root, 'apps/xec'), path.join(packageScope, 'cli'), process.platform === 'win32' ? 'junction' : 'dir');

    const typePaths: Record<string, string[]> = {};
    const addTypeExports = async (folder: string, name?: string): Promise<void> => {
      const manifest: PackageManifest = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
      for (const [subpath, entry] of Object.entries(manifest.exports ?? { '.': { types: manifest.types } })) {
        const types = typeof entry === 'object'
          ? typeEntry(entry.types) ?? (typeof entry.import === 'object' ? typeEntry(entry.import.types) : undefined)
          : undefined;
        if (types === undefined) continue;
        typePaths[(name ?? manifest.name) + (subpath === '.' ? '' : subpath.slice(1))] = [path.resolve(folder, types)];
      }
    };
    for (const location of ['packages/core', 'packages/ops', 'packages/kit', 'packages/loader', 'packages/testing', 'apps/xec']) {
      await addTypeExports(path.join(root, location));
    }
    const dependencyTypes: [string, string, string?][] = [
      ['packages/testing', 'vitest'], ['packages/kit', 'zod'], ['website', '@types/react', 'react'],
    ];
    for (const [owner, dependency, name] of dependencyTypes) {
      const folder = path.join(root, owner);
      const manifest: PackageManifest = JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'));
      if (![manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]
        .some(dependencies => dependencies?.[dependency])) throw new Error(`${owner} must declare ${dependency}`);
      await addTypeExports(path.join(folder, 'node_modules', dependency), name);
    }

    const filenames = work.map((block, index) => {
      const extension = ['js', 'javascript'].includes(block.language) ? 'js'
        : ['tsx', 'jsx'].includes(block.language) ? block.language : 'ts';
      return path.join(cases, `case-${index}.${extension}`);
    });
    await Promise.all(work.map((block, index) => writeFile(filenames[index]!, `${block.code}\nexport {};\n`)));
    const configPath = path.join(directory, 'tsconfig.json');
    const config = {
      compilerOptions: {
        target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2023'],
        types: ['node'], typeRoots: [path.join(root, 'node_modules/@types')],
        strict: options.strict ?? false, noEmit: true, skipLibCheck: true,
        allowJs: true, checkJs: true, jsx: 'react-jsx', paths: typePaths,
      },
      include: ['cases/**/*', path.join(root, 'apps/xec/dist/globals.d.ts')],
      exclude: [] as string[],
    };
    await writeFile(configPath, JSON.stringify(config));

    const compile = async (flags: string[] = []): Promise<string> => {
      signal?.throwIfAborted();
      try {
        const result = await run(process.execPath, [resolveTypeScriptCompiler(root), '-p', directory, ...flags], {
          cwd: root, maxBuffer: 64 * 1024 * 1024, signal,
        });
        return result.stdout;
      } catch (error) {
        signal?.throwIfAborted();
        const failure = error as ExecFileException & { stdout?: string; stderr?: string };
        const output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
        if (!/error TS\d+/.test(output)) throw error;
        return output;
      }
    };
    let output = await compile(['--noCheck']);
    const syntaxCases = new Set([...output.matchAll(/case-(\d+)\.(?:[jt]sx?)\(\d+,\d+\): error TS\d+:/g)]
      .map(match => Number(match[1])));
    if (syntaxCases.size) {
      config.exclude = [...syntaxCases].map(index => filenames[index]!);
      await writeFile(configPath, JSON.stringify(config));
    }
    output += '\n' + await compile();
    const setupErrors = output.split('\n').filter(line => /^error TS\d+/.test(line.trim()));
    if (setupErrors.length) throw new Error('The compiler did not run:\n' + setupErrors.slice(0, 5).join('\n'));

    const findings = new Map<string, DocExamplesReport['failures'][number]>();
    for (const line of output.split('\n')) {
      const match = /case-(\d+)\.(?:[jt]sx?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
      if (!match) {
        if (/error TS\d+:/.test(line)) throw new Error('Unattributed compiler failure: ' + line);
        continue;
      }
      const block = work[Number(match[1])];
      if (!block) throw new Error('Unknown example in compiler diagnostic: ' + line);
      const key = `${block.file}:${block.line}`;
      let finding = findings.get(key);
      if (!finding) {
        finding = { file: block.file, line: block.line, language: block.language, errors: [] };
        findings.set(key, finding);
      }
      finding.errors.push({ line: Number(match[2]), code: match[4]!, message: match[5]! });
    }
    return { checkedBlocks: work.length, syntaxBlocks: syntaxCases.size, failures: [...findings.values()] };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function formatDocExamplesReport(report: DocExamplesReport, root: string): string {
  const lines: string[] = [];
  for (const failure of report.failures) {
    lines.push(`\n${path.relative(root, failure.file)}:${failure.line}`);
    for (const error of failure.errors.slice(0, 6)) lines.push(`   ${error.code}  ${error.message}`);
    if (failure.errors.length > 6) lines.push(`   … ${failure.errors.length - 6} more`);
  }
  if (!report.checkedBlocks) lines.push('No examples matched.');
  lines.push(`\n${report.checkedBlocks} examples checked. ${report.failures.length} failing blocks; ${report.syntaxBlocks} contain syntax diagnostics.`);
  return lines.join('\n') + '\n';
}
