import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { inspectProject } from '../../src/commands/inspect.js';

const commands = vi.hoisted(() => ({ raw: vi.fn() }));
vi.mock('@xec-sh/core', async (actual) => ({
  ...await actual<typeof import('@xec-sh/core')>(),
  $: { cd: () => ({ raw: commands.raw }) },
}));

let directory: string;
let previousDirectory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'xec-inspect-system-'));
  await mkdir(join(directory, '.xec'));
  await writeFile(join(directory, '.xec', 'config.yaml'), "version: '1.0'\nname: inspect-system\n");
  previousDirectory = process.cwd();
  process.chdir(directory);
  commands.raw.mockImplementation(async (_strings: TemplateStringsArray, command: string) => {
    if (command === 'npm --version') return { lines: () => ['11.7.2'] };
    if (command === 'node --version') return { lines: () => ['v24.13.0'] };
    throw new Error('Tool unavailable in this fixture');
  });
});

afterEach(async () => {
  process.chdir(previousDirectory);
  await rm(directory, { recursive: true, force: true });
  commands.raw.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('system inspection uses the public execution path in every environment', () => {
  it.each(['test', 'production'])('reports observed versions under NODE_ENV=%s', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('JEST_WORKER_ID', 'fixture');
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    await inspectProject('system', 'tools', { output: 'json' });
    const result = JSON.parse(String(output.mock.calls[0]?.[0])) as Array<{
      name: string;
      data: { versions: Record<string, string>; installed: Record<string, boolean> };
    }>;
    expect(commands.raw).toHaveBeenCalledTimes(13);
    expect(result[0]?.name).toBe('tools');
    expect(result[0]?.data).toMatchObject({
      versions: { npm: '11.7.2', node: 'v24.13.0' },
      installed: { npm: true, node: true, docker: false },
    });
    expect(result[0]?.data.versions).not.toHaveProperty('docker');
  });
});
