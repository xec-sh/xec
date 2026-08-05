import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { DoctorCommand } from '../../src/commands/doctor.js';

/** One line of the report, as `doctor` produces it. */
interface Check {
  id: string;
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: string;
}

/**
 * `doctor` exists so that a confusing failure elsewhere can be turned into
 * a direct question. It is worth having only if it answers honestly: a
 * check that reports `ok` for something broken is worse than no check,
 * because it moves the search somewhere else.
 */
describe('checking the environment', () => {
  let originalCwd: string;
  let exitCode: number | undefined;

  /**
   * Run the command the way a shell does.
   *
   * Through commander, not by calling execute(): `-o json` is wired in the
   * action handler, so a direct call would test a path no user takes and
   * miss whether the flag is accepted at all.
   */
  const run = async (argv: string[] = []): Promise<{ checks: Check[]; ok: boolean }> => {
    const written: string[] = [];
    const real = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: unknown }).write = (chunk: string) => {
      written.push(String(chunk));
      return true;
    };

    try {
      await new DoctorCommand().create().parseAsync([...argv, '-o', 'json'], { from: 'user' });
    } finally {
      (process.stdout as { write: unknown }).write = real;
    }

    return JSON.parse(written.join('')) as { checks: Check[]; ok: boolean };
  };

  const find = (checks: Check[], id: string): Check | undefined =>
    checks.find(check => check.id === id);

  beforeEach(() => {
    originalCwd = process.cwd();
    exitCode = process.exitCode;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = exitCode;
  });

  it('reports as data, for a caller that cannot read prose', async () => {
    const report = await run();

    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it('gives every check a stable id', async () => {
    // The name is for a person and may be reworded. The id is what a
    // script matches on, so it is part of the contract.
    const { checks } = await run();

    expect(find(checks, 'runtime.node')).toBeDefined();
    expect(find(checks, 'terminal')).toBeDefined();
    expect(find(checks, 'project')).toBeDefined();
    expect(find(checks, 'secrets')).toBeDefined();
  });

  it('judges the runtime against the version TypeScript tasks need', async () => {
    const { checks } = await run();
    const node = find(checks, 'runtime.node')!;

    expect(node.detail).toContain(process.versions.node);
    // The suite runs on a supported runtime; if it did not, this check
    // failing is exactly the point.
    expect(node.status).toBe('ok');
  });

  it('says what it could not find, and what it is for', async () => {
    const { checks } = await run();
    const missing = checks.filter(check => check.status === 'warn' && check.detail === 'not found');

    for (const check of missing) {
      expect(check.fix, check.id).toBeDefined();
    }
  });

  describe('a project', () => {
    it('is reported with the path to its configuration', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-doctor-'));
      await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
      await fs.writeFile(path.join(dir, '.xec', 'config.yaml'), 'version: "1.0"\n');
      process.chdir(dir);

      try {
        const { checks } = await run();
        const project = find(checks, 'project')!;

        expect(project.status).toBe('ok');
        expect(project.detail).toContain('config.yaml');
      } finally {
        process.chdir(originalCwd);
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('is a warning, not a failure, when there is none', async () => {
      // Plenty of xec is usable without a project — `xec on host "uptime"`
      // needs no configuration at all.
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-nowhere-'));
      process.chdir(dir);

      try {
        const { checks } = await run();

        expect(find(checks, 'project')!.status).toBe('warn');
      } finally {
        process.chdir(originalCwd);
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('the secret store', () => {
    it('fails when git is not excluding it', async () => {
      // The one check here that is a failure rather than a warning: a
      // credential committed to a repository is not undone by deleting
      // the file afterwards.
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-doctor-secrets-'));
      await fs.mkdir(path.join(dir, '.xec', 'secrets'), { recursive: true });
      await fs.writeFile(path.join(dir, '.xec', 'config.yaml'), 'version: "1.0"\n');
      process.chdir(dir);

      try {
        const report = await run();
        const secrets = find(report.checks, 'secrets')!;

        expect(secrets.status).toBe('fail');
        expect(secrets.fix).toContain('.gitignore');
        expect(report.ok).toBe(false);
      } finally {
        process.chdir(originalCwd);
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('is content once the store excludes itself', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-doctor-secrets-'));
      await fs.mkdir(path.join(dir, '.xec', 'secrets'), { recursive: true });
      await fs.writeFile(path.join(dir, '.xec', 'config.yaml'), 'version: "1.0"\n');
      await fs.writeFile(path.join(dir, '.xec', 'secrets', '.gitignore'), '*\n');
      process.chdir(dir);

      try {
        const { checks } = await run();

        expect(find(checks, 'secrets')!.status).toBe('ok');
      } finally {
        process.chdir(originalCwd);
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it('never reports a key name or a value', async () => {
      // A diagnostic that has to be redacted before it can be pasted into
      // an issue is not a diagnostic.
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-doctor-secrets-'));
      await fs.mkdir(path.join(dir, '.xec', 'secrets'), { recursive: true });
      await fs.writeFile(path.join(dir, '.xec', 'config.yaml'), 'version: "1.0"\n');
      await fs.writeFile(path.join(dir, '.xec', 'secrets', '.gitignore'), '*\n');
      await fs.writeFile(
        path.join(dir, '.xec', 'secrets', 'deadbeef.secret'),
        JSON.stringify({ value: 'super-secret-value' })
      );
      process.chdir(dir);

      try {
        const report = await run();
        const text = JSON.stringify(report);

        expect(text).not.toContain('super-secret-value');
        expect(text).not.toContain('deadbeef');
      } finally {
        process.chdir(originalCwd);
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  });

  it('fails the process only when a check failed', async () => {
    process.exitCode = undefined;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-doctor-'));
    await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
    await fs.writeFile(path.join(dir, '.xec', 'config.yaml'), 'version: "1.0"\n');
    process.chdir(dir);

    try {
      const report = await run();

      // Warnings describe something absent that is not always needed, so
      // `xec doctor && ./deploy.sh` is not blocked by a missing kubectl.
      expect(report.ok).toBe(true);
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
