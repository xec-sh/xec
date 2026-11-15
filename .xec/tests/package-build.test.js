import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { test, afterEach } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseCommand, acquireReleaseLock } from '@xec-sh/ops/release';
import { rm, mkdir, access, mkdtemp, readdir, symlink, copyFile, readFile, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(root, 'package.json'));
const cli = join(dirname(require.resolve('@xec-sh/cli/package.json')), 'bin/xec');
const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
const invoke = (cwd, args) => releaseCommand(cwd, process.execPath, [cli, 'package', ...args], { timeoutMs: 30_000 });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'xec-package-build-'));
  directories.push(directory);
  const pkg = join(directory, 'packages/sample');
  for (const name of ['.xec/commands', '.xec/lib', 'packages/sample/src'])
    await mkdir(join(directory, name), { recursive: true });
  for (const name of ['commands/package.ts', 'lib/package-build.ts', 'lib/typescript-compiler.js']) {
    await copyFile(join(root, '.xec', name), join(directory, '.xec', name));
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await writeFile(join(directory, '.xec/config.yaml'), "version: '1.0'\ntasks: {}\n");
  await symlink(
    join(root, 'node_modules'),
    join(directory, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({
      name: '@xec-sh/sample',
      version: '1.0.0',
      type: 'module',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    })
  );
  await writeFile(
    join(pkg, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        rootDir: 'src',
        outDir: 'dist',
        declaration: true,
        sourceMap: true,
        declarationMap: true,
        strict: true,
        skipLibCheck: true,
        types: [],
      },
      include: ['src/**/*.ts'],
    })
  );
  await writeFile(join(pkg, 'src/index.ts'), 'export const answer: number = 42;');
  return { directory, pkg };
}

async function cleanOwnership(pkg) {
  await assert.rejects(access(join(pkg, '.release-artifacts/running')), { code: 'ENOENT' });
  assert.deepEqual(
    (await readdir(pkg)).filter((name) => name.startsWith('.dist-build-')),
    []
  );
}

test('the published driver builds actual TypeScript, retains old dist on failure and cleans only generated output', async () => {
  const { directory, pkg } = await fixture();
  await invoke(directory, ['build', 'packages/sample']);
  assert.equal((await import(pathToFileURL(join(pkg, 'dist/index.js')).href)).answer, 42);
  assert.match(await readFile(join(pkg, 'dist/index.d.ts'), 'utf8'), /answer: number/);
  for (const name of ['index.js.map', 'index.d.ts.map']) {
    const file = join(pkg, 'dist', name);
    const map = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(fileURLToPath(new URL(map.sources[0], pathToFileURL(file))), join(pkg, 'src/index.ts'));
  }
  const before = await readFile(join(pkg, 'dist/index.js'));
  await writeFile(join(pkg, 'src/index.ts'), 'export const answer: number = "invalid";');
  await assert.rejects(invoke(directory, ['build', pkg]), (error) => {
    assert.match(error.stdout, /TS2322/);
    return true;
  });
  assert.deepEqual(await readFile(join(pkg, 'dist/index.js')), before);
  await cleanOwnership(pkg);
  const cache = join(directory, 'foreign-cache');
  await mkdir(cache);
  await writeFile(join(cache, 'tsconfig.tsbuildinfo'), 'owned by another build');
  await mkdir(join(pkg, 'node_modules'));
  await symlink(cache, join(pkg, 'node_modules/.tmp'), process.platform === 'win32' ? 'junction' : 'dir');
  await invoke(directory, ['clean', pkg]);
  assert.equal(await readFile(join(cache, 'tsconfig.tsbuildinfo'), 'utf8'), 'owned by another build');
  await assert.rejects(access(join(pkg, 'dist')), { code: 'ENOENT' });
  assert.match(await readFile(join(pkg, 'src/index.ts'), 'utf8'), /invalid/);
  await cleanOwnership(pkg);
});

test('the same pipeline bundles Kit-style declarations without a second package manifest or copied README', async () => {
  const { directory, pkg } = await fixture();
  await writeFile(
    join(pkg, 'tsconfig.bundle.json'),
    JSON.stringify({ extends: './tsconfig.json', compilerOptions: { emitDeclarationOnly: true } })
  );
  await invoke(directory, ['build', pkg, '--project', 'tsconfig.bundle.json', '--bundle', 'src/index.ts']);
  assert.equal((await import(pathToFileURL(join(pkg, 'dist/index.js')).href)).answer, 42);
  assert.match(await readFile(join(pkg, 'dist/index.d.ts'), 'utf8'), /answer/);
  const mapPath = join(pkg, 'dist/index.js.map');
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  for (const source of map.sources) await access(fileURLToPath(new URL(source, pathToFileURL(mapPath))));
  await assert.rejects(access(join(pkg, 'dist/package.json')), { code: 'ENOENT' });
  await cleanOwnership(pkg);
});

test('refuses concurrent artifact mutation, unknown arguments and output symlinks', async () => {
  const { directory, pkg } = await fixture();
  await invoke(directory, ['build', pkg]);
  const before = await readFile(join(pkg, 'dist/index.js'));
  const unlock = await acquireReleaseLock(pkg);
  try {
    await assert.rejects(invoke(directory, ['clean', pkg]), /Release is locked/);
  } finally {
    await unlock();
  }
  assert.deepEqual(await readFile(join(pkg, 'dist/index.js')), before);
  await assert.rejects(invoke(directory, ['build', pkg, '--typo']), /unknown option/);
  await assert.rejects(invoke(directory, ['build', pkg, '--project', '../outside.json']), /inside its package/);
  await assert.rejects(invoke(directory, ['clean', directory]), /Not a declared public/);
  await rm(join(pkg, 'dist'), { recursive: true });
  const foreign = join(directory, 'foreign');
  await mkdir(foreign);
  await writeFile(join(foreign, 'keep'), 'unrelated');
  await symlink(foreign, join(pkg, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(invoke(directory, ['clean', pkg]), /ordinary directory/);
  assert.equal(await readFile(join(foreign, 'keep'), 'utf8'), 'unrelated');
  await cleanOwnership(pkg);
});

test('rejects compiler outputs that escape staging before changing the prior artifact', async () => {
  const { directory, pkg } = await fixture();
  await invoke(directory, ['build', pkg]);
  const before = await readFile(join(pkg, 'dist/index.d.ts'));
  for (const options of [{ declarationDir: '../foreign-types' }, { noEmit: true }, { outFile: '../foreign.js' }]) {
    await writeFile(
      join(pkg, 'tsconfig.unsafe.json'),
      JSON.stringify({ extends: './tsconfig.json', compilerOptions: options })
    );
    await assert.rejects(
      invoke(directory, ['build', pkg, '--project', 'tsconfig.unsafe.json']),
      /declarationDir, outFile and noEmit/
    );
    assert.deepEqual(await readFile(join(pkg, 'dist/index.d.ts')), before);
    await assert.rejects(access(join(directory, 'packages/foreign-types')), { code: 'ENOENT' });
    await assert.rejects(access(join(directory, 'packages/foreign.js')), { code: 'ENOENT' });
    await cleanOwnership(pkg);
  }
});
