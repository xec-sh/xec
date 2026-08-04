import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';

import { COMMAND_MANIFEST } from '../src/utils/command-manifest.js';

const COMMANDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/commands');

/**
 * The manifest lets `xec --help` list every command without importing any of
 * them — each module statically imports `@xec-sh/ops`, so loading all twelve
 * to read their names cost ~140ms on every invocation.
 *
 * A hand-maintained list of what code already knows is exactly the shape that
 * rots: the lockfile drift that broke CI for a dozen commits was the same
 * mistake. So this test loads every command for real and fails if the
 * manifest and reality disagree — a new command, a renamed alias or an edited
 * description breaks the suite rather than quietly disappearing from help.
 */
describe('the command manifest matches the commands', () => {
  /** Register a module into a throwaway program and read back what it added. */
  async function describeModule(moduleName: string) {
    const program = new Command();
    const module = await import(path.join(COMMANDS_DIR, `${moduleName}.ts`));

    expect(typeof module.default, `${moduleName} must export a register function`).toBe('function');
    module.default(program);

    return program.commands.map(cmd => ({
      name: cmd.name(),
      description: cmd.description(),
      aliases: cmd.aliases(),
      module: moduleName,
    }));
  }

  it('lists every command module on disk', () => {
    const modules = fs
      .readdirSync(COMMANDS_DIR)
      .filter(file => file.endsWith('.ts'))
      .map(file => file.replace(/\.ts$/, ''))
      .sort();

    const listed = [...new Set(COMMAND_MANIFEST.map(entry => entry.module))].sort();

    expect(listed).toEqual(modules);
  });

  it('records each command exactly as the module registers it', async () => {
    const actual = (
      await Promise.all([...new Set(COMMAND_MANIFEST.map(e => e.module))].sort().map(describeModule))
    ).flat();

    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

    // Compared whole rather than field by field: a description that drifts is
    // a wrong `--help`, and a missing alias is a command a user cannot reach.
    expect([...actual].sort(byName)).toEqual([...COMMAND_MANIFEST].sort(byName));
  }, 60_000);

  it('has no duplicate names or aliases', () => {
    const seen = new Map<string, string>();

    for (const entry of COMMAND_MANIFEST) {
      for (const token of [entry.name, ...entry.aliases]) {
        const owner = seen.get(token);
        expect(owner, `'${token}' claimed by both ${owner} and ${entry.name}`).toBeUndefined();
        seen.set(token, entry.name);
      }
    }
  });
});
