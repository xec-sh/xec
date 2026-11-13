import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const checker = path.join(root, 'scripts/check-doc-examples.mjs');

async function check(markdown) {
  const directory = await mkdtemp(path.join(tmpdir(), 'xec-doc-check-test-'));
  try {
    const file = path.join(directory, 'example.md');
    const report = path.join(directory, 'report.json');
    await writeFile(file, markdown);
    let status = 0;
    let output;
    try {
      const result = await run(process.execPath, [checker, '--file', file, '--report', report], { cwd: root });
      output = result.stdout + result.stderr;
    } catch (error) {
      status = error.code;
      output = error.stdout + error.stderr;
    }
    return { status, output, report: JSON.parse(await readFile(report, 'utf8')) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const block = code => '```typescript\n' + code + '\n```\n';

test('syntax failure cannot conceal a semantic error in another example', async () => {
  const result = await check(block('const invalid = ;') + block('const value: number = "text";'));
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.failures.length, 2, result.output);
  const codes = result.report.failures.flatMap(item => item.errors.map(error => error.code));
  assert.ok(codes.includes('TS1109'), result.output);
  assert.ok(codes.includes('TS2322'), result.output);
});

test('a nonexistent public API is rejected against actual exported declarations', async () => {
  const result = await check(block("import { MissingXecExport } from '@xec-sh/core';"));
  assert.equal(result.status, 1, result.output);
  assert.ok(result.report.failures[0].errors.some(error => error.code === 'TS2305'), result.output);
});

test('a documented fragment needs an explicit reason and leaves real programs checked', async () => {
  const result = await check('<!-- doc-check: skip — method signature, not an executable program -->\n'
    + block('exec(command: string): void;')
    + block("import { FileWatcher } from '@xec-sh/loader/watch'; const watcher = new FileWatcher('src'); watcher.close();"));
  assert.equal(result.status, 0, result.output);
  assert.equal(result.report.checkedBlocks, 1);
  assert.deepEqual(result.report.failures, []);
});

test('an unexplained skip marker does not bypass the checker', async () => {
  const result = await check('<!-- doc-check: skip -->\n' + block('const invalid = ;'));
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.failures.length, 1);
});


test('JavaScript class fields are inferred without weakening API checks', async () => {
  const valid = '```javascript\nclass Example { constructor() { this.value = 1; } }\nconsole.log(new Example().value);\n```\n';
  const invalid = "```js\nimport { $ } from '@xec-sh/core';\nawait $.nonexistentPublicMethod();\n```\n";
  const result = await check(valid + invalid);
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.checkedBlocks, 2);
  assert.equal(result.report.failures.length, 1, result.output);
  assert.equal(result.report.failures[0].language, 'js');
  assert.ok(result.report.failures[0].errors.some(error => error.code === 'TS2339'), result.output);
});

test('JSX retains semantic prop checking against declared React types', async () => {
  const result = await check('```tsx\nfunction Example(props: { count: number }) { return <span>{props.count}</span>; }\nconst valid = <Example count={1} />;\nconst invalid = <Example count="text" />;\n```\n');
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.syntaxBlocks, 0, result.output);
  assert.equal(result.report.failures.length, 1);
  assert.ok(result.report.failures[0].errors.some(error => error.code === 'TS2322'), result.output);
});

test('a declared workspace dependency resolves its actual public types and subpaths', async () => {
  const result = await check(block("import { z } from 'zod/v4'; const count = z.number().parse(1); const text: string = count;"));
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.failures.length, 1);
  assert.deepEqual(result.report.failures[0].errors.map(error => error.code), ['TS2322'], result.output);
});


test('TypeScript-only JavaScript syntax cannot suppress a neighboring semantic failure', async () => {
  const result = await check('```javascript\nclass Example { constructor(private value) {} }\n```\n' + block('const count: number = "text";'));
  assert.equal(result.status, 1, result.output);
  assert.equal(result.report.syntaxBlocks, 1, result.output);
  assert.equal(result.report.failures.length, 2, result.output);
  const codes = result.report.failures.flatMap(item => item.errors.map(error => error.code));
  assert.ok(codes.includes('TS8012'), result.output);
  assert.ok(codes.includes('TS2322'), result.output);
});
