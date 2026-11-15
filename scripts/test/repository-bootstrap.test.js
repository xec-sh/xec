import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { test, afterEach } from 'node:test';
import { createRequire } from 'node:module';
import { releaseCommand } from '@xec-sh/ops/release';
import { rm, mkdir, access, mkdtemp, readFile, copyFile, realpath, writeFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(join(root, 'package.json'));
const driverManifest = require.resolve('@xec-sh/cli/package.json');
const cli = join(dirname(driverManifest), 'bin/xec');
const directories = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
const invoke = (cwd, args) => releaseCommand(cwd, process.execPath, [cli, ...args], { timeoutMs: 120_000 });

test('repository automation resolves the explicitly pinned published driver and API', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const name of ['cli', 'ops', 'kit']) {
    const specifier = manifest.devDependencies[`@xec-sh/${name}`];
    const installed = require(`@xec-sh/${name}/package.json`);
    assert.equal(specifier, `npm:@xec-sh/${name}@${installed.version}`);
    assert.notEqual(await realpath(dirname(require.resolve(`@xec-sh/${name}/package.json`))),
      await realpath(join(root, name === 'cli' ? 'apps/xec' : `packages/${name}`)));
  }
  assert.equal((await invoke(root, ['--version'])).trim(), require('@xec-sh/cli/package.json').version);
});

test('published Xec discovers the release policy and real project tasks before a candidate build', async () => {
  const packages = JSON.parse(await invoke(root, ['release', '--list-packages']));
  assert.deepEqual(packages.map(pkg => pkg.name), [
    '@xec-sh/core', '@xec-sh/kit', '@xec-sh/testing', '@xec-sh/loader', '@xec-sh/ops', '@xec-sh/cli',
  ]);
  const tasks = await invoke(root, ['inspect', 'tasks']);
  for (const task of ['bootstrap', 'build:full', 'docs:check', 'check:ssh-security']) assert.ok(tasks.includes(task));
  const help = await invoke(root, ['release', '--help']);
  assert.match(help, /release.*\[version\]/);
  assert.match(help, /--notes-from <sha>/);
  assert.match(help, /--no-push/);
  await assert.rejects(invoke(root, ['release', '--preapre']), /unknown option.*--preapre/);
  await assert.rejects(invoke(root, ['release', '1.0.0', 'extra']), /too many arguments/);
  for (const flags of [
    ['--prepare', '--resume'], ['--prepare', '--github-only'], ['--resume', '--github-only'],
    ['--notes-from', '0'.repeat(40), '--skip-github'],
  ]) await assert.rejects(invoke(root, ['release', '1.0.0', ...flags]), /cannot be used with/);
  await assert.rejects(invoke(root, ['release', 'not-a-version', '--dry-run']), /invalid|Invalid|version/);
  await assert.rejects(access(join(root, 'scripts/release.ts')), { code: 'ENOENT' });
});

test('published Xec exposes strict native SSH operations without executing a guard during help', async () => {
  const help = await invoke(root, ['ssh', '--help']);
  for (const command of ['prepare <directory>', 'guard <directory>', 'verify <directory>', 'boundary', 'security']) assert.ok(help.includes(command));
  const security = await invoke(root, ['ssh', 'security', '--help']);
  assert.match(security, /--archive <file>/);
  assert.match(security, /--consumer <manager>/);
  await assert.rejects(invoke(root, ['ssh', 'prepare']), /missing required argument/);
  await assert.rejects(invoke(root, ['ssh', 'prepare', 'unused', 'extra']), /too many arguments/);
  await assert.rejects(invoke(root, ['ssh', 'security', '--consumer', 'other']), /invalid|Allowed choices/);
  await assert.rejects(invoke(root, ['ssh', 'security', '--arhcive', 'unused']), /unknown option/);
  await assert.rejects(invoke(root, ['ssh', 'guard', 'packages/core']), /not prepared/);
  await assert.rejects(releaseCommand(join(root, 'packages/core'), 'pnpm', ['run', 'prepack']), /not prepared/);
});

test('published release API refuses archive rejection through the actual project command', { timeout: 120_000 }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'xec-published-recipe-'));
  directories.push(fixture);
  const version = '1.0.0-ci.0';
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await mkdir(join(fixture, '.xec/commands'), { recursive: true });
  await mkdir(join(fixture, 'packages/core'), { recursive: true });
  await mkdir(join(fixture, '.xec/lib'), { recursive: true });
  await copyFile(join(root, '.xec/commands/release.ts'), join(fixture, '.xec/commands/release.ts'));
  await writeFile(join(fixture, '.xec/config.yaml'), "version: '1.0'\ntasks: {}\n");
  await writeFile(join(fixture, '.gitignore'), 'node_modules/\n.release-artifacts/\n.xec/cache/\n.xec/.tmp/\n');
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    name: 'release-rejection-fixture', private: true, type: 'module', packageManager: manifest.packageManager,
    devDependencies: { semver: require('semver/package.json').version },
  }));
  await writeFile(join(fixture, 'pnpm-workspace.yaml'), "packages:\n  - packages/*\n");
  await writeFile(join(fixture, 'packages/core/package.json'), JSON.stringify({
    name: '@xec-sh/core', version, type: 'module', main: 'dist/index.js', files: ['dist'],
    scripts: { build: 'node build.js' },
  }));
  await writeFile(join(fixture, 'packages/core/build.js'),
    "import { mkdir, writeFile } from 'node:fs/promises'; await mkdir('dist'); await writeFile('dist/index.js', 'export const fixture = true;');");
  await writeFile(join(fixture, '.xec/lib/ssh-transport.js'),
    "import { cp } from 'node:fs/promises'; import { join } from 'node:path'; export async function prepareSSHCorePackage(root, output) { await cp(join(root, 'packages/core'), output, { recursive: true }); }");
  await writeFile(join(fixture, '.xec/lib/ssh-security.js'),
    "import { stat } from 'node:fs/promises'; export async function checkSSHSecurity(_root, { archive }) { if (!(await stat(archive)).isFile()) throw new Error('Archive was not supplied'); throw new Error('SYNTHETIC_ARCHIVE_REJECTED'); }");
  await releaseCommand(fixture, 'pnpm', ['install', '--ignore-scripts', '--offline'], { timeoutMs: 60_000 });
  for (const args of [
    ['init', '--initial-branch', 'main'], ['config', 'user.name', 'Release fixture'],
    ['config', 'user.email', 'release-fixture@example.invalid'], ['add', '--', '.'], ['commit', '-m', 'Synthetic rejection fixture'],
  ]) await releaseCommand(fixture, 'git', args);
  const before = await releaseCommand(fixture, 'git', ['rev-parse', 'HEAD']);
  const plan = JSON.parse(await invoke(fixture, ['release', version, '--resume', '--workspace', fixture, '--dry-run', '--notes-from', before]));
  assert.equal(plan.notesFrom, before);
  const localOnly = JSON.parse(await invoke(fixture, ['release', version, '--dry-run', '--no-push', '--skip-npm', '--skip-github']));
  assert.equal(localOnly.push, false);
  assert.equal(localOnly.npm, false);
  assert.equal(localOnly.github, false);
  await assert.rejects(invoke(fixture, ['release', version, '--dry-run', '--notes-from', 'HEAD']), /full lowercase commit/);
  await assert.rejects(invoke(fixture, ['release', version, '--prepare', '--offline', '--yes']), /SYNTHETIC_ARCHIVE_REJECTED/);
  assert.equal(await releaseCommand(fixture, 'git', ['rev-parse', 'HEAD']), before);
  assert.equal(await releaseCommand(fixture, 'git', ['tag', '--list', `v${version}`]), '');
  await assert.rejects(access(join(fixture, '.release-artifacts', version, before, 'release.json')), { code: 'ENOENT' });
  await assert.rejects(access(join(fixture, '.release-artifacts/running')), { code: 'ENOENT' });
});
