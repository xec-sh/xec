import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { ExecutionEngine } from '@xec-sh/core';
import { it, vi, expect, describe, afterAll, beforeAll, beforeEach } from 'vitest';

import { PostgreSQLFluentAPI } from '../../src/docker-services/databases.js';

const execute = promisify(execFile);
// Automatic dependency detection; never download an image for this small fixture.
const image = await execute('docker', ['image', 'inspect', 'postgres:15-alpine', '--format', '{{.Id}}'],
  { timeout: 15_000 }).then(result => result.stdout.trim(), () => undefined);

describe.skipIf(!image)('PostgreSQL service restore against an isolated database', () => {
  const name = `xec-postgres-restore-${randomUUID()}`;
  const database = 'restore_fixture';
  const user = 'fixture';
  let container: string | undefined;
  let service: PostgreSQLFluentAPI;
  let engine: ExecutionEngine;

  const docker = async (args: string[], timeout = 60_000) => (await execute('docker', args,
    { timeout, maxBuffer: 1024 * 1024 })).stdout.trim();
  const sql = (statement: string) => docker(['exec', container!, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', user, '-d', database, '-At', '-c', statement]);
  const file = (path: string, contents: string) => docker(['exec', container!, 'sh', '-c',
    'umask 077; printf "%s" "$1" > "$2"', 'restore-fixture', contents, path]);

  beforeAll(async () => {
    container = await docker(['create', '--pull=never', '--name', name,
      '--label', `xec.restore-test=${name}`, '--network', 'none', '--cpus', '0.5', '--memory', '256m', '--pids-limit', '64',
      '--read-only', '--tmpfs', '/var/lib/postgresql/data:rw,size=134217728',
      '--tmpfs', '/var/run/postgresql:rw,size=8388608,mode=1777', '--tmpfs', '/tmp:rw,size=16777216,mode=1777',
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', `POSTGRES_USER=${user}`, '-e', `POSTGRES_DB=${database}`,
      '-e', 'PSQLRC=/tmp/restore.psqlrc', image!,
      '-c', 'shared_buffers=16MB', '-c', 'max_connections=10', '-c', 'max_wal_size=32MB', '-c', 'min_wal_size=32MB',
      '-c', 'listen_addresses=127.0.0.1'], 120_000);
    expect(container).toMatch(/^[a-f0-9]{64}$/);
    await docker(['start', container]);
    // The temporary initdb server has no TCP listener; wait for the final server.
    await vi.waitFor(async () => {
      expect(await docker(['exec', container!, 'psql', '-X', '-h', '127.0.0.1', '-U', user,
        '-d', database, '-At', '-c', 'SELECT current_database()'])).toBe(database);
    }, { timeout: 60_000, interval: 250 });
    engine = new ExecutionEngine({ defaultTimeout: 60_000 });
    service = new PostgreSQLFluentAPI(engine, { name: container, user, database,
      env: { PSQLRC: '/tmp/restore.psqlrc' } });
    await file('/tmp/restore.psqlrc', "\\set ON_ERROR_STOP off\nINSERT INTO startup_side_effect VALUES ('psqlrc');\n");
  }, 240_000);

  beforeEach(async () => {
    await sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE TABLE startup_side_effect (value text)');
    // Establish that this startup file really changes bare psql's behavior.
    await docker(['exec', container!, 'psql', '-U', user, '-d', database, '-c', 'SELECT 1']);
    expect(await sql('SELECT count(*) FROM startup_side_effect')).toBe('1');
    await sql('TRUNCATE startup_side_effect');
  });

  afterAll(async () => {
    try {
      // A create reply can be lost after Docker accepted the container. Recover
      // only this fixture's exact nonce, never infer that a client timeout undid it.
      if (!container) {
        const matches = (await docker(['ps', '-aq', '--no-trunc', '--filter', `label=xec.restore-test=${name}`]))
          .split(/\r?\n/).filter(Boolean);
        if (matches.length !== 1) throw new Error(`Container creation was not confirmed; inspect fixture ${name} before retrying`);
        [container] = matches;
      }
      expect(container).toMatch(/^[a-f0-9]{64}$/);
      expect(await docker(['inspect', container!, '--format', '{{.Name}}'])).toBe(`/${name}`);
      expect(await docker(['inspect', container!, '--format', '{{ index .Config.Labels "xec.restore-test" }}'])).toBe(name);
      expect(await docker(['inspect', container!, '--format', '{{.Image}}'])).toBe(image);
      await docker(['rm', '--force', '--volumes', container!]);
      expect(await docker(['ps', '-aq', '--no-trunc', '--filter', `id=${container}`])).toBe('');
    } finally { await engine?.dispose(); }
  }, 120_000);

  it('round trips the ordinary backup, including rows and sequence state', async () => {
    await sql("CREATE TABLE roundtrip (id serial PRIMARY KEY, value text); INSERT INTO roundtrip(value) VALUES ('one'), ('two')");
    await service.backup('/tmp/plain backup.sql');
    await sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await service.restore('/tmp/plain backup.sql');
    expect(await sql('SELECT id, value FROM roundtrip ORDER BY id')).toBe('1|one\n2|two');
    expect(await sql("INSERT INTO roundtrip(value) VALUES ('three') RETURNING id")).toBe('3\nINSERT 0 1');
    expect(await sql('SELECT count(*) FROM startup_side_effect')).toBe('0');
  });

  it('ignores psqlrc and rolls back every preceding write after a SQL error', async () => {
    await file('/tmp/failing.sql', 'CREATE TABLE before_error (id integer); SELECT 1/0; CREATE TABLE after_error (id integer);');
    const pending = service.restore('/tmp/failing.sql');
    await expect(pending).rejects.toThrow('Inspect the destination before retrying');
    await expect(pending).rejects.toMatchObject({ cause: { originalError: { exitCode: 3 } } });
    expect(await sql("SELECT to_regclass('before_error') IS NULL, to_regclass('after_error') IS NULL")).toBe('t|t');
    expect(await sql('SELECT count(*) FROM startup_side_effect')).toBe('0');
  });

  it('rejects a transaction-incompatible command without a nontransactional fallback', async () => {
    await file('/tmp/vacuum.sql', 'CREATE TABLE before_vacuum (id integer); VACUUM;');
    await expect(service.restore('/tmp/vacuum.sql')).rejects.toMatchObject({ cause: { originalError: { exitCode: 3 } } });
    expect(await sql("SELECT to_regclass('before_vacuum') IS NULL")).toBe('t');
  });

  it('reports failure without claiming rollback when an unsupported script commits itself', async () => {
    await file('/tmp/own-commit.sql', 'CREATE TABLE committed_by_script (id integer); COMMIT; SELECT 1/0;');
    await expect(service.restore('/tmp/own-commit.sql')).rejects.toThrow('Inspect the destination before retrying');
    expect(await sql("SELECT to_regclass('committed_by_script') IS NOT NULL")).toBe('t');
  });
});
