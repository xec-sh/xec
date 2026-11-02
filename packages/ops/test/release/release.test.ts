import type { ReleaseCommand } from '../../src/release/index.js';

import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { it, expect, describe, afterEach } from 'vitest';
import { rm, mkdir, chmod, mkdtemp, readFile, copyFile, writeFile } from 'node:fs/promises';

import {
  planRelease, releaseNotes, releaseCommand, distributionTag, pushReleaseRefs, registryAddress, ensureReleaseTag, assertReleaseHead, artifactIntegrity, acquireReleaseLock,
  createGithubRelease, ReleaseCommandError, commitReleaseVersion, validatePackedPackage, verifyReleaseArtifact,
  verifyRemoteReleaseTag, publishPreparedRelease, discoverReleasePackages, prepareReleaseArtifacts, registryArtifactMatches,
} from '../../src/release/index.js';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function temporary() { const directory = await mkdtemp(join(tmpdir(), 'xec-release-test-')); directories.push(directory); return directory; }
async function repository() {
  const root = await temporary();
  await releaseCommand(root, 'git', ['init', '--initial-branch', 'main']);
  await releaseCommand(root, 'git', ['config', 'user.name', 'Release Fixture']);
  await releaseCommand(root, 'git', ['config', 'user.email', 'fixture@example.invalid']);
  await writeFile(join(root, '.gitignore'), '.release-artifacts/\nnode_modules/\ndist/\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@12.16.1' }));
  await writeFile(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  for (const [name, dependencies] of [['a', {}], ['b', { '@fixture/a': 'workspace:*' }]] as const) {
    await mkdir(join(root, 'packages', name), { recursive: true });
    await writeFile(join(root, 'packages', name, 'package.json'), JSON.stringify({ name: `@fixture/${name}`, version: '1.0.0-rc.1', type: 'module', main: 'dist/index.js', files: ['dist'], dependencies }));
  }
  await writeFile(join(root, 'build.mjs'), "import { mkdir, writeFile } from 'node:fs/promises'; for(const name of ['a','b']) { await mkdir('packages/'+name+'/dist',{recursive:true}); await writeFile('packages/'+name+'/dist/index.js','export const fixture = 1;'); }");
  await releaseCommand(root, 'git', ['add', '--', '.gitignore', 'package.json', 'pnpm-workspace.yaml', 'packages', 'build.mjs']);
  await releaseCommand(root, 'git', ['commit', '-m', 'fixture source']);
  return root;
}

/** Fixture builds have no external deps; all git, archive, packing and npm IO is real. */
function fixtureRunner() {
  let builds = 0;
  const run: ReleaseCommand = async (cwd, command, args, options) => {
    if (command === 'pnpm' && args[0] === 'install') return '';
    if (command === process.execPath && args[0] === 'build.mjs') builds++;
    return releaseCommand(cwd, command, args, options);
  };
  return { run, builds: () => builds };
}

async function prepared() {
  const root = await repository();
  const runner = fixtureRunner();
  const release = await prepareReleaseArtifacts(root, '1.0.0-rc.1', { run: runner.run, build: { executable: process.execPath, args: ['build.mjs'] } });
  await ensureReleaseTag(root, release.version, runner.run);
  return { root, release, ...runner };
}

describe('release inventory, refs and sealed artifacts', () => {
  it('discovers private/public workspaces and orders dependencies without parsing YAML lists', async () => {
    const root = await repository();
    const packages = await discoverReleasePackages(root);
    expect(packages.map(pkg => pkg.name)).toEqual(['@fixture/a', '@fixture/b']);
    expect(await releaseCommand(root, 'git', ['status', '--porcelain'])).toBe('');
    await expect(readFile(join(root, 'pnpm-lock.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(distributionTag('1.0.0-rc.1')).toBe('rc'); expect(distributionTag('1.0.0-1')).toBe('next'); expect(distributionTag('1.0.0')).toBe('latest');
    expect(() => distributionTag('v1.0.0')).toThrow('canonical');
    expect(() => distributionTag('1.0.0+build')).toThrow('canonical');
    expect(distributionTag('1.0.0-latest.1')).toBe('next');
    expect(distributionTag('1.0.0-v1.1')).toBe('next');
    expect(() => registryAddress('http://outside.invalid')).toThrow('HTTPS');
  });
  it('plans a dirty tree without changing files, refs or invoking pnpm hooks', async () => {
    const root = await repository();
    await writeFile(join(root, '.pnpmfile.cjs'), "require('fs').writeFileSync('hook-ran', 'unexpected'); module.exports={};");
    await writeFile(join(root, 'unrelated.txt'), 'keep');
    const before = await releaseCommand(root, 'git', ['status', '--porcelain']);
    const head = await releaseCommand(root, 'git', ['rev-parse', 'HEAD']);
    const plan = await planRelease(root, '1.0.0');
    expect(plan.blockers).toHaveLength(1); expect(plan.packages).toHaveLength(2);
    expect(await releaseCommand(root, 'git', ['status', '--porcelain'])).toBe(before);
    expect(await releaseCommand(root, 'git', ['rev-parse', 'HEAD'])).toBe(head);
    await expect(readFile(join(root, 'hook-ran'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, 'pnpm-lock.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('preserves an advanced remote branch and refuses a divergent selected tag', async () => {
    const root = await repository(), remote = await temporary(), successor = await temporary();
    await releaseCommand(remote, 'git', ['init', '--bare', '--initial-branch=main']);
    await releaseCommand(root, 'git', ['remote', 'add', 'origin', remote]);
    await ensureReleaseTag(root, '1.0.0-rc.1'); await pushReleaseRefs(root, '1.0.0-rc.1');
    await releaseCommand(successor, 'git', ['clone', remote, '.']);
    await releaseCommand(successor, 'git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'later work']);
    await releaseCommand(successor, 'git', ['push', 'origin', 'HEAD:main']);
    const advanced = await releaseCommand(root, 'git', ['ls-remote', '--heads', 'origin', 'refs/heads/main']);
    await pushReleaseRefs(root, '1.0.0-rc.1');
    expect(await releaseCommand(root, 'git', ['ls-remote', '--heads', 'origin', 'refs/heads/main'])).toBe(advanced);
    await releaseCommand(root, 'git', ['tag', '-f', '-a', 'v1.0.0-rc.1', '-m', 'different local tag']);
    await expect(pushReleaseRefs(root, '1.0.0-rc.1')).rejects.toThrow('Remote release tag differs');
    expect(await releaseCommand(root, 'git', ['ls-remote', '--heads', 'origin', 'refs/heads/main'])).toBe(advanced);
  });
  it('rejects broken exported entries and local runtime dependencies before publication', async () => {
    const root = await temporary();
    await mkdir(join(root, 'package'));
    const pack = async (manifest: object) => {
      await writeFile(join(root, 'package/package.json'), JSON.stringify({ name: '@fixture/a', version: '1.0.0', ...manifest }));
      await releaseCommand(root, 'tar', ['-czf', join(root, 'bad.tgz'), 'package']);
      return validatePackedPackage(root, join(root, 'bad.tgz'), { name: '@fixture/a', version: '1.0.0' });
    };
    await expect(pack({ exports: './missing.js' })).rejects.toThrow('exported entry');
    await expect(pack({ dependencies: { a: 'file:../a' } })).rejects.toThrow('local dependencies');
  });
  it('never treats an unavailable registry as an absent package', async () => {
    const { root, release, run } = await prepared();
    let published = 0;
    const failing: ReleaseCommand = async (cwd, executable, args, options) => {
      if (executable === 'npm') {
        if (args[0] === 'publish') published++;
        throw new ReleaseCommandError('npm', 1, '{"error":{"code":"E503"}}', 'registry unavailable');
      }
      return run(cwd, executable, args, options);
    };
    await expect(publishPreparedRelease(root, release.version, { run: failing, registry: 'http://127.0.0.1:1' })).rejects.toThrow('Cannot verify registry state');
    expect(published).toBe(0); await verifyReleaseArtifact(release.artifacts[0]!);
  });
  it('reconciles GitHub after a lost response and leaves existing drafts unchanged', async () => {
    const root = await repository(), remote = await temporary();
    await releaseCommand(remote, 'git', ['init', '--bare']);
    await releaseCommand(root, 'git', ['remote', 'add', 'origin', remote]);
    await ensureReleaseTag(root, '1.0.0-rc.1'); await pushReleaseRefs(root, '1.0.0-rc.1');
    const notes = await releaseNotes(root, '1.0.0-rc.1', 'fixture/repository');
    expect(notes).toContain('fixture source'); expect(notes).toContain('@fixture/a@1.0.0-rc.1');
    let exists = false, draft = false, creates = 0, unavailable = false;
    const run: ReleaseCommand = async (cwd, executable, args, options) => {
      if (executable !== 'gh') return releaseCommand(cwd, executable, args, options);
      if (args[0] === 'api') {
        if (unavailable) throw new ReleaseCommandError('gh', 1, '', 'API unavailable');
        return exists ? 'v1.0.0-rc.1' : '';
      }
      if (args[1] === 'create') {
        expect(args).toContain('--verify-tag'); expect(args).toContain('--prerelease');
        expect(await readFile(args[args.indexOf('--notes-file') + 1]!, 'utf8')).toBe(notes);
        exists = true; creates++;
        throw new ReleaseCommandError('gh', 1, '', 'lost response after write');
      }
      expect(args[1]).toBe('view');
      return JSON.stringify({ tagName: 'v1.0.0-rc.1', isDraft: draft, isPrerelease: true, url: 'https://github.com/fixture/repository/releases/tag/v1.0.0-rc.1' });
    };
    expect(await createGithubRelease(root, '1.0.0-rc.1', 'fixture/repository', notes, run)).toContain('/releases/');
    await createGithubRelease(root, '1.0.0-rc.1', 'fixture/repository', notes, run); expect(creates).toBe(1);
    draft = true;
    await expect(createGithubRelease(root, '1.0.0-rc.1', 'fixture/repository', notes, run)).rejects.toThrow('release kind differs');
    unavailable = true;
    await expect(createGithubRelease(root, '1.0.0-rc.1', 'fixture/repository', notes, run)).rejects.toThrow('API unavailable');
    expect(creates).toBe(1);
  });
  it('commits only version files, preserves workspace ranges and refuses dirty input', async () => {
    const root = await repository();
    await commitReleaseVersion(root, '1.0.0');
    expect((await releaseCommand(root, 'git', ['show', '--pretty=', '--name-only', 'HEAD'])).split('\n')).toEqual(['packages/a/package.json', 'packages/b/package.json']);
    const manifest = JSON.parse(await readFile(join(root, 'packages/b/package.json'), 'utf8'));
    expect(manifest.dependencies['@fixture/a']).toBe('workspace:*');
    await writeFile(join(root, 'unrelated.txt'), 'retain this');
    await expect(commitReleaseVersion(root, '1.0.1')).rejects.toThrow('clean');
    expect(await readFile(join(root, 'unrelated.txt'), 'utf8')).toBe('retain this');
  });
  it('identifies an SSH authentication failure before examining or changing release refs', async () => {
    const refused = new ReleaseCommandError('git', 128, '', 'Permission denied (publickey).');
    const run: ReleaseCommand = async (_cwd, executable, args) => {
      expect([executable, ...args]).toEqual(['git', 'ls-remote', '--tags', 'origin', 'refs/tags/v1.0.0']);
      throw refused;
    };
    await expect(verifyRemoteReleaseTag('.', '1.0.0', false, run)).rejects.toMatchObject({
      message: expect.stringContaining('git ls-remote --tags origin refs/tags/v1.0.0'), cause: refused,
    });
  });
  it('pushes just the release tag even with followTags and divergent historical tags', async () => {
    const root = await repository(), remote = await temporary();
    await releaseCommand(remote, 'git', ['init', '--bare']);
    await releaseCommand(root, 'git', ['remote', 'add', 'origin', remote]);
    await releaseCommand(root, 'git', ['tag', '-a', 'v0.1.0', '-m', 'historical']);
    await releaseCommand(root, 'git', ['push', 'origin', 'refs/tags/v0.1.0']);
    await releaseCommand(root, 'git', ['tag', '-f', '-a', 'v0.1.0', '-m', 'local rewritten history']);
    await releaseCommand(root, 'git', ['tag', '-a', 'v9.0.0', '-m', 'unrelated']);
    await releaseCommand(root, 'git', ['config', 'push.followTags', 'true']);
    await ensureReleaseTag(root, '1.0.0-rc.1');
    await pushReleaseRefs(root, '1.0.0-rc.1');
    expect((await releaseCommand(root, 'git', ['ls-remote', '--tags', 'origin'])).includes('v9.0.0')).toBe(false);
    await pushReleaseRefs(root, '1.0.0-rc.1');
    await releaseCommand(root, 'git', ['commit', '--allow-empty', '-m', 'later']);
    await expect(assertReleaseHead(root, '1.0.0-rc.1')).rejects.toThrow('differs');
  });
  it('never seals archives rejected or changed by package acceptance', async () => {
    const root = await repository(), runner = fixtureRunner();
    const options = { run: runner.run, build: { executable: process.execPath, args: ['build.mjs'] } };
    await expect(prepareReleaseArtifacts(root, '1.0.0-rc.1', { ...options, verifyArtifact: async () => { throw new Error('acceptance failed'); } })).rejects.toThrow('acceptance failed');
    await expect(prepareReleaseArtifacts(root, '1.0.0-rc.1', { ...options, verifyArtifact: async ({ artifact }) => { await writeFile(artifact.file, 'changed during validation'); } })).rejects.toThrow('changed');
    const release = await prepareReleaseArtifacts(root, '1.0.0-rc.1', options);
    expect(release.artifacts).toHaveLength(2);
    expect(await releaseCommand(root, 'git', ['status', '--porcelain'])).toBe('');
  });
  it('builds a snapshot, verifies entries and reuses identical archives on resume', async () => {
    const { root, release, run, builds } = await prepared();
    expect(builds()).toBe(1);
    await expect(readFile(join(root, 'packages/a/dist/index.js'))).rejects.toMatchObject({ code: 'ENOENT' });
    const resumed = await prepareReleaseArtifacts(root, release.version, { run, build: { executable: process.execPath, args: ['build.mjs'] } });
    expect(resumed).toEqual(release); expect(builds()).toBe(1);
    await chmod(release.artifacts[0]!.file, 0o600); await writeFile(release.artifacts[0]!.file, 'changed');
    await expect(verifyReleaseArtifact(release.artifacts[0]!)).rejects.toThrow('changed');
    await expect(prepareReleaseArtifacts(root, release.version, { run, build: { executable: 'never', args: [] } })).rejects.toThrow('changed');
  });
  it('does not steal an existing writer lock', async () => {
    const root = await temporary(), unlock = await acquireReleaseLock(root);
    try { await expect(acquireReleaseLock(root)).rejects.toThrow('locked'); }
    finally { await unlock(); }
    await (await acquireReleaseLock(root))();
  });
  it('redacts credentials and bounds a process that ignores SIGTERM', async () => {
    await expect(releaseCommand(process.cwd(), process.execPath, ['-e', "console.error('123456'); process.exit(2)"], { redact: ['123456'] }))
      .rejects.toMatchObject({ status: 2, stderr: '[redacted]\n' });
    const started = Date.now();
    await expect(releaseCommand(process.cwd(), process.execPath, ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], { timeoutMs: 50 })).rejects.toBeInstanceOf(ReleaseCommandError);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

it('recovers partial publication and lost replies without replay, retagging or overwriting conflicts', async () => {
  const { root, release, run } = await prepared();
  const versions = new Map<string, { name: string; version: string; dist: { integrity: string } }>();
  const downloads = new Map<string, Buffer>();
  const tags = new Map<string, string>(), channelOverrides = new Map<string, string>();
  let puts = 0, loseResponse = true, rejectedName = '@fixture/b', unavailable = false;
  let laggingIndex = false, staleReads = 0;
  const server = createServer((request, response) => {
    const name = decodeURIComponent(request.url!.split('?')[0]!).replace(/^\//, '');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET') {
      if (unavailable) { response.statusCode = 503; response.end('{"error":"unavailable"}'); return; }
      const bytes = downloads.get(name);
      if (bytes) { response.setHeader('content-type', 'application/octet-stream'); response.end(bytes); return; }
      const value = versions.get(name);
      if (!value) { response.statusCode = 404; response.end(JSON.stringify({ error: 'not found' })); }
      else if (laggingIndex && request.headers.accept?.includes('application/vnd.npm.install-v1+json')) {
        staleReads++;
        response.setHeader('vary', 'Accept');
        response.end(JSON.stringify({ name, versions: { '0.9.0': { ...value, version: '0.9.0' } }, 'dist-tags': { latest: '0.9.0' } }));
      }
      else {
        const channel = channelOverrides.get(name) ?? value.version;
        response.end(JSON.stringify({ name, versions: { [value.version]: value, [channel]: { ...value, version: channel } }, 'dist-tags': { [tags.get(name)!]: channel } }));
      }
    } else if (request.method === 'PUT') {
      if (name === rejectedName) { request.resume(); response.statusCode = 403; response.end('{"error":"fixture write denied"}'); return; }
      const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const record = Object.values(body.versions)[0] as { name: string; version: string; dist: { integrity: string } };
        const archive = Object.values(body._attachments)[0] as { data: string };
        const integrity = artifactIntegrity(Buffer.from(archive.data, 'base64'));
        if (integrity !== record.dist.integrity) { response.statusCode = 400; response.end('{"error":"integrity"}'); return; }
        const pathname = new URL((record.dist as { tarball?: string }).tarball!).pathname;
        downloads.set(decodeURIComponent(pathname).slice(1), Buffer.from(archive.data, 'base64'));
        puts++; versions.set(name, record); tags.set(name, Object.keys(body['dist-tags'])[0]!);
        if (loseResponse) { loseResponse = false; response.statusCode = 503; response.end('{"error":"reply lost after write"}'); }
        else response.end('{"ok":true}');
      });
    } else { response.statusCode = 405; response.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  const registry = `http://127.0.0.1:${address.port}/`;
  const userconfig = join(root, '.release-artifacts', 'test-user.npmrc'), globalconfig = userconfig + '.global';
  await writeFile(userconfig, `//127.0.0.1:${address.port}/:_authToken=isolated-fixture-token\n`); await writeFile(globalconfig, '');
  const env = { NPM_CONFIG_USERCONFIG: userconfig, NPM_CONFIG_GLOBALCONFIG: globalconfig, npm_config_fetch_retries: '0', npm_config_cache: join(root, '.release-artifacts/cache') };
  try {
    versions.set('@fixture/b', { name: '@fixture/b', version: release.version, dist: { integrity: artifactIntegrity(Buffer.from('conflict before the first write')) } });
    tags.set('@fixture/b', 'rc');
    await expect(publishPreparedRelease(root, release.version, { run, registry, env })).rejects.toThrow('differs');
    expect(puts).toBe(0); versions.clear(); tags.clear();
    await expect(publishPreparedRelease(root, release.version, { run, registry, env })).rejects.toThrow('Publication interrupted');
    expect(puts).toBe(1); await assertReleaseHead(root, release.version);
    rejectedName = '';
    await publishPreparedRelease(root, release.version, { run, registry, env });
    expect(puts).toBe(2); expect([...tags.values()]).toEqual(['rc', 'rc']);
    const journal = await readFile(join(dirname(release.artifacts[0]!.file), 'publication.jsonl'), 'utf8');
    expect(journal).toContain('dispatching'); expect(journal).toContain('registry-confirmed');
    await publishPreparedRelease(root, release.version, { run, registry, env }); expect(puts).toBe(2);
    laggingIndex = true;
    await expect(publishPreparedRelease(root, release.version, { run, registry, env, confirmationTimeoutMs: 0 })).rejects.toThrow('npm version index');
    expect(staleReads).toBeGreaterThan(0); expect(puts).toBe(2);
    laggingIndex = false;
    channelOverrides.set('@fixture/a', '1.0.0-rc.2');
    const progress: string[] = [];
    await publishPreparedRelease(root, release.version, { run, registry, env, progress: message => progress.push(message) });
    expect(progress.join(' ')).toContain('preserving newer'); expect(puts).toBe(2);
    unavailable = true;
    await expect(publishPreparedRelease(root, release.version, { run, registry, env })).rejects.toThrow('Cannot verify registry state');
    expect(puts).toBe(2); unavailable = false;
    versions.get('@fixture/a')!.dist.integrity = artifactIntegrity(Buffer.from('different bytes'));
    await expect(registryArtifactMatches(root, release.artifacts[0]!, { run, registry, env })).rejects.toThrow('differs');
    await expect(publishPreparedRelease(root, release.version, { run, registry, env })).rejects.toThrow('differs');
    expect(puts).toBe(2);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 60000);

it.each(['accepted', 'reserved'])('waits for a %s upload and resumes without another PUT', async outcome => {
  const fixture = await prepared();
  const artifacts = fixture.release.artifacts;
  const uploads = new Set<string>();
  let visible = false, downloadable = false, writes = 0;
  const run: ReleaseCommand = async (cwd, executable, args, options) => {
    if (executable !== 'npm') return fixture.run(cwd, executable, args, options);
    if (args[0] === 'publish') {
      const pkg = artifacts.find(a => a.file === args[1])!;
      writes++; uploads.add(pkg.name);
      if (outcome === 'reserved') throw new ReleaseCommandError('npm', 1, '{"error":{"code":"E409"}}', 'Cannot publish over previously staged version');
      return '';
    }
    const pkg = artifacts.find(a => args[1]!.startsWith(a.name + '@'))!;
    if (!visible || !uploads.has(pkg.name)) throw new ReleaseCommandError('npm', 1, '{"error":{"code":"E404"}}', '');
    if (args[0] === 'pack') {
      if (!downloadable) throw new ReleaseCommandError('npm', 1, '{"error":{"code":"E404"}}', 'tarball is not available yet');
      const directory = args[args.indexOf('--pack-destination') + 1]!;
      expect(args[args.indexOf('--cache') + 1]).toBe(join(directory, 'cache'));
      await copyFile(pkg.file, join(directory, 'verified.tgz'));
      return JSON.stringify([{ filename: 'verified.tgz' }]);
    }
    return args.includes('dist-tags') ? JSON.stringify({rc:pkg.version}) :
      JSON.stringify({name:pkg.name, version:pkg.version, dist:{integrity:pkg.integrity}});
  };
  const options = {run, confirmationTimeoutMs:0, confirmationIntervalMs:1};
  await expect(publishPreparedRelease(fixture.root, fixture.release.version, options)).rejects.toThrow('Registry confirmation pending');
  await expect(publishPreparedRelease(fixture.root, fixture.release.version, options)).rejects.toThrow('Registry confirmation pending');
  expect(writes).toBe(1);
  visible = true;
  await expect(publishPreparedRelease(fixture.root, fixture.release.version, options)).rejects.toThrow('downloadable tarball');
  expect(writes).toBe(1);
  downloadable = true;
  await publishPreparedRelease(fixture.root, fixture.release.version, options);
  expect(writes).toBe(artifacts.length);
}, 30000);
