import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('@xec-sh/cli/package.json')), 'bin/xec');
const examples = JSON.parse(await readFile(new URL('../../src/data/examples.json', import.meta.url), 'utf8'));
async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'xec-site-example-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}
const run = (cwd, args) =>
  exec(process.execPath, [cli, ...args], {
    cwd,
    timeout: 45_000,
    env: { ...process.env, NO_COLOR: '1', XEC_HOME_DIR: join(cwd, '.xec-user') },
    maxBuffer: 2 * 1024 * 1024,
  });

test('the exact homepage local example executes through the published CLI', async (t) => {
  const cwd = await fixture(t);
  await exec('git', ['init', '--quiet'], { cwd });
  await exec(
    'git',
    [
      '-c',
      'user.name=Xec Example',
      '-c',
      'user.email=example@xec.invalid',
      'commit',
      '--allow-empty',
      '--no-gpg-sign',
      '--quiet',
      '-m',
      'Example fixture',
    ],
    { cwd }
  );
  await writeFile(join(cwd, 'inspect.ts'), examples.find((example) => example.id === 'local').code);
  const expected = (await exec('git', ['rev-parse', '--short', 'HEAD'], { cwd })).stdout.trim();
  assert.equal((await run(cwd, ['run', 'inspect.ts'])).stdout.trim(), expected);
});

test('the exact homepage pipeline coordinates a real isolated package', async (t) => {
  const cwd = await fixture(t);
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify({
      name: 'xec-site-fixture',
      private: true,
      version: '1.0.0',
      scripts: { typecheck: 'node check.js types', test: 'node check.js test', build: 'node check.js build' },
    })
  );
  await writeFile(
    join(cwd, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n"
  );
  await writeFile(
    join(cwd, 'check.js'),
    "const fs = require('node:fs');const stage = process.argv[2];if(stage==='build' && (!fs.existsSync('types.ok') || !fs.existsSync('test.ok'))) throw Error('Build started before checks');fs.writeFileSync(stage+'.ok', 'passed');\n"
  );
  await writeFile(join(cwd, 'check.ts'), examples.find((example) => example.id === 'pipeline').code);
  await run(cwd, ['run', 'check.ts']);
  assert.equal(await readFile(join(cwd, 'build.ok'), 'utf8'), 'passed');
});

test('documented dynamic commands and YAML tasks use the ordinary CLI entry', async (t) => {
  const cwd = await fixture(t);
  await mkdir(join(cwd, '.xec/commands'), { recursive: true });
  await writeFile(
    join(cwd, '.xec/commands/greet.ts'),
    "export function command(program: import('commander').Command) { program.command('greet <name>').description('Greet someone').option('-u, --uppercase', 'Uppercase').action((name: string, options: { uppercase?: boolean }) => { console.log(options.uppercase ? name.toUpperCase() : name); }); }\n"
  );
  await writeFile(
    join(cwd, '.xec/config.yaml'),
    `version: '1.0'\ntasks:\n  runtime:\n    command: ${JSON.stringify(`${JSON.stringify(process.execPath)} --version`)}\n`
  );
  assert.equal((await run(cwd, ['greet', 'Builder', '--uppercase'])).stdout.trim(), 'BUILDER');
  assert.match((await run(cwd, ['greet', '--help'])).stdout, /--uppercase/);
  assert.match((await run(cwd, ['run', 'runtime'])).stdout, new RegExp(process.version.replaceAll('.', '\\.')));
});
