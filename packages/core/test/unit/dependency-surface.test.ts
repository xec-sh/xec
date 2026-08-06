import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * For a tool that executes infrastructure commands, third-party code on the
 * critical path is attack surface, not a styling preference. zx answers this
 * by vendoring everything at build time (`dependencies: {}`); our answer is
 * one declared dependency — ssh2 — loaded only when an SSH target is used.
 *
 * These tests pin both halves so a stray import cannot silently regress them.
 * They run against the built dist with plain node, because that is what a
 * consumer actually loads.
 */
describe('dependency surface of the execution core', () => {
  it('declares ssh2 as the only runtime dependency', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['ssh2']);
  });

  it('loads zero external modules for local execution', async () => {
    const distEntry = path.join(PACKAGE_ROOT, 'dist', 'index.js');
    if (!fs.existsSync(distEntry)) {
      // The contract is about what a consumer loads, which only exists after
      // a build; without dist there is nothing meaningful to measure.
      console.warn('dist/ not built; skipping load-surface check');
      return;
    }

    const script = `
      import { createRequire } from 'node:module';
      const { $ } = await import(${JSON.stringify(distEntry)});
      await $\`echo probe\`;
      const req = createRequire(import.meta.url);
      const external = Object.keys(req.cache ?? {}).filter(k => k.includes('node_modules'));
      console.log(JSON.stringify(external));
    `;

    const { stdout } = await run('node', ['--input-type=module', '-e', script], {
      cwd: PACKAGE_ROOT,
      timeout: 60_000,
    });

    const external = JSON.parse(stdout.trim().split('\n').pop()!) as string[];
    expect(external).toEqual([]);
  }, 90_000);

  it('does not import ssh2 anywhere except the ssh transport', () => {
    // A static import outside the transport would drag ssh2 back onto the
    // local path via the module graph, defeating the lazy require.
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;

        const source = fs.readFileSync(full, 'utf8');
        const valueImport = /^import\s+(?!type\b)[^;]*from\s+'ssh2'/m.test(source);
        if (valueImport && !full.includes(`${path.sep}adapters${path.sep}ssh${path.sep}`)) {
          offenders.push(full);
        }
      }
    };

    walk(path.join(PACKAGE_ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
