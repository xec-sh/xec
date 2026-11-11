import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseCommand } from '@xec-sh/ops/release';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = path.join(root, 'apps/xec/bin/xec');

describe('repository release command', () => {
  it('loads the release recipe in the real Xec CLI without tsx bootstrap', async () => {
    const output = await releaseCommand(root, process.execPath, [cli, 'release', '--list-packages']);
    const packages = JSON.parse(output) as Array<{ name: string; version: string }>;
    expect(packages.map(pkg => pkg.name)).toEqual([
      '@xec-sh/core', '@xec-sh/kit', '@xec-sh/testing', '@xec-sh/loader', '@xec-sh/ops', '@xec-sh/cli',
    ]);
    expect(new Set(packages.map(pkg => pkg.version)).size).toBe(1);
  }, 30_000);

  it('propagates recipe validation failures without invoking publication', async () => {
    await expect(releaseCommand(root, process.execPath, [cli, 'release', 'not-a-version', '--dry-run']))
      .rejects.toThrow(/invalid|Invalid|version/i);
  }, 30_000);
});
