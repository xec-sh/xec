import * as os from 'node:os';
import * as yaml from 'js-yaml';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/main.js');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * `-o json|yaml|csv` is the scripting contract: stdout carries exactly one
 * machine-readable document and nothing else — no spinners, no frames, no
 * prose. Every assertion here parses the WHOLE stdout, because "mostly JSON
 * with a banner on top" is precisely the defect this file pins down.
 */
describe('machine output contract (-o)', () => {
  let dir: string;
  let bareDir: string;

  const run = (cliArgs: string[], cwd: string = dir): Promise<RunResult> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...cliArgs], { cwd }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          stdout: String(stdout),
          stderr: String(stderr),
        });
      });
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-machine-'));
    await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.xec', 'config.yaml'),
      yaml.dump({
        version: '1.0',
        targets: {
          hosts: {
            'web-1': { host: 'web1.example.com', user: 'deploy' },
            'web-2': { host: 'web2.example.com', user: 'deploy' },
          },
          containers: {
            app: { image: 'alpine:latest' },
          },
        },
      })
    );

    // A directory with no .xec at all: -c must be the only source of truth.
    bareDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-machine-c-'));
    await fs.mkdir(path.join(bareDir, 'custom'), { recursive: true });
    await fs.writeFile(
      path.join(bareDir, 'custom', 'alt.yaml'),
      yaml.dump({
        version: '1.0',
        targets: { hosts: { 'alt-1': { host: 'alt.example.com', user: 'ops' } } },
        tasks: { greet: { command: 'echo MARKER_FROM_ALT' } },
      })
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(bareDir, { recursive: true, force: true });
  });

  describe('inspect', () => {
    it('-o json emits a single parseable document on stdout', async () => {
      const { code, stdout } = await run(['inspect', 'targets', '-o', 'json']);

      expect(code).toBe(0);
      const results = JSON.parse(stdout) as Array<{ name: string }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.map(r => r.name)).toContain('hosts.web-1');
    }, 60_000);

    it('-o yaml emits parseable YAML on stdout', async () => {
      const { code, stdout } = await run(['inspect', 'targets', '-o', 'yaml']);

      expect(code).toBe(0);
      const results = yaml.load(stdout) as Array<{ name: string }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.map(r => r.name)).toContain('hosts.web-1');
    }, 60_000);

    it('-o csv emits a header row and data rows', async () => {
      const { code, stdout } = await run(['inspect', 'targets', '-o', 'csv']);

      expect(code).toBe(0);
      const lines = stdout.trim().split('\n');
      expect(lines[0]).toContain('name');
      expect(stdout).toContain('hosts.web-1');
    }, 60_000);

    it('--format json remains as an alias of -o json', async () => {
      const { code, stdout } = await run(['inspect', 'targets', '--format', 'json']);

      expect(code).toBe(0);
      const results = JSON.parse(stdout) as Array<{ name: string }>;
      expect(results.map(r => r.name)).toContain('hosts.web-1');
    }, 60_000);

    it('default text output is unchanged and not JSON', async () => {
      const { code, stdout } = await run(['inspect', 'targets']);

      expect(code).toBe(0);
      expect(stdout).toContain('web-1');
      expect(stdout.trim().startsWith('[')).toBe(false);
    }, 60_000);
  });

  describe('format validation', () => {
    it('rejects an unknown format with exit code 2 and names the valid ones', async () => {
      const { code, stderr } = await run(['inspect', 'targets', '-o', 'bogus']);

      expect(code).toBe(2);
      expect(stderr).toContain('text, json, yaml, csv');
    }, 60_000);
  });

  describe('copy', () => {
    it('-o json reports the operations and nothing else on stdout', async () => {
      await fs.writeFile(path.join(dir, 'src.txt'), 'payload\n');

      const { code, stdout } = await run(['copy', 'src.txt', 'dst.txt', '-o', 'json']);

      expect(code).toBe(0);
      const records = JSON.parse(stdout) as Array<{ success: boolean; sourcePath: string }>;
      expect(records).toHaveLength(1);
      expect(records[0]!.success).toBe(true);
      expect(await fs.readFile(path.join(dir, 'dst.txt'), 'utf-8')).toBe('payload\n');
    }, 60_000);

    it('overwrites the destination: copy is scp, not a vault', async () => {
      await fs.writeFile(path.join(dir, 'over.txt'), 'new\n');
      await fs.writeFile(path.join(dir, 'existing.txt'), 'old\n');

      const { code } = await run(['copy', 'over.txt', 'existing.txt']);

      expect(code).toBe(0);
      expect(await fs.readFile(path.join(dir, 'existing.txt'), 'utf-8')).toBe('new\n');
    }, 60_000);

    it('no longer advertises --force: the flag never guarded anything', async () => {
      await fs.writeFile(path.join(dir, 'f.txt'), 'x\n');

      const { code, stderr } = await run(['copy', 'f.txt', 'f2.txt', '--force']);

      expect(code).not.toBe(0);
      expect(stderr).toContain('unknown option');
    }, 60_000);
  });

  describe('on', () => {
    it('--dry-run -o json emits the plan as data', async () => {
      const { code, stdout } = await run(['on', 'web-1', 'uptime', '--dry-run', '-o', 'json']);

      expect(code).toBe(0);
      const plan = JSON.parse(stdout) as Array<{ target: string; command: string; dryRun: boolean }>;
      expect(plan).toHaveLength(1);
      expect(plan[0]!.target).toBe('hosts.web-1');
      expect(plan[0]!.command).toBe('uptime');
      expect(plan[0]!.dryRun).toBe(true);
    }, 60_000);

    it('--dry-run without -o keeps the human text', async () => {
      const { code, stdout } = await run(['on', 'web-1', 'uptime', '--dry-run']);

      expect(code).toBe(0);
      expect(stdout).toContain('[DRY RUN]');
    }, 60_000);

    it('repeated -e accumulates instead of failing validation', async () => {
      const { code, stdout, stderr } = await run([
        'on', 'web-1', '-e', 'A=1', '-e', 'B=2', 'uptime', '--dry-run',
      ]);

      expect(stderr + stdout).not.toContain('Validation failed');
      expect(code).toBe(0);
    }, 60_000);
  });

  describe('in', () => {
    it('--dry-run -o json emits the plan as data', async () => {
      const { code, stdout } = await run(['in', 'app', 'ls', '--dry-run', '-o', 'json']);

      expect(code).toBe(0);
      const plan = JSON.parse(stdout) as Array<{ target: string; dryRun: boolean }>;
      expect(plan).toHaveLength(1);
      expect(plan[0]!.target).toBe('containers.app');
      expect(plan[0]!.dryRun).toBe(true);
    }, 60_000);
  });

  describe('watch', () => {
    it('repeated --pattern accumulates instead of failing validation', async () => {
      const { code, stdout, stderr } = await run([
        'watch', 'local', '.', '--pattern', '*.ts', '--pattern', '*.js',
        '--command', 'echo changed', '--dry-run',
      ]);

      expect(stderr + stdout).not.toContain('Validation failed');
      expect(code).toBe(0);
      expect(stdout + stderr).toContain('*.ts, *.js');
    }, 60_000);

    it('--poll selects the polling strategy instead of being ignored', async () => {
      // Refusing the flag was the wrong answer: polling is exactly what a
      // local path needs when fs.watch is unavailable — a wedged fseventsd
      // or a network filesystem — so the flag now selects the strategy.
      const { code, stdout, stderr } = await run([
        'watch', 'local', '.', '--command', 'echo x', '--poll', '--dry-run',
      ]);

      expect(stderr + stdout).not.toContain('Validation failed');
      expect(code).toBe(0);
    }, 60_000);
  });

  describe('-c / --config', () => {
    it('inspect reads the file -c names, not the conventional location', async () => {
      const { code, stdout } = await run(
        ['inspect', 'targets', '-c', 'custom/alt.yaml', '-o', 'json'],
        bareDir
      );

      expect(code).toBe(0);
      const results = JSON.parse(stdout) as Array<{ name: string }>;
      expect(results.map(r => r.name)).toContain('hosts.alt-1');
    }, 60_000);

    it('run executes a task defined only in the file -c names', async () => {
      const { code, stdout } = await run(['run', 'greet', '-c', 'custom/alt.yaml'], bareDir);

      expect(code).toBe(0);
      expect(stdout).toContain('MARKER_FROM_ALT');
    }, 60_000);

    it('a missing -c file is an error, not a shrug', async () => {
      const { code, stderr } = await run(['inspect', 'targets', '-c', 'nope.yaml'], bareDir);

      expect(code).not.toBe(0);
      expect(stderr).toContain('Config file not found');
    }, 60_000);
  });
});
