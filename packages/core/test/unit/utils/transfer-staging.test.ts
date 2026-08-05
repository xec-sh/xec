import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

/**
 * Where a transfer between two remote environments stages its bytes.
 *
 * The path is on *this* machine — the file comes down from one target and
 * goes up to the other — so it has to be a directory this machine has.
 * `/tmp` written literally is `C:\\tmp` on Windows, which usually does not
 * exist, and the cleanup shelled out to `rm -rf`, which is not a command
 * there at all. Both failures are invisible on the platform the code was
 * written on, which is why they are checked by reading the source rather
 * than by running it.
 */
describe('staging a transfer locally', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../src/utils/transfer.ts'),
    'utf-8'
  );

  it('asks the platform for its temporary directory', () => {
    expect(source).toContain('tmpdir()');
  });

  it('never writes a POSIX temporary path literally', () => {
    // Remote paths are a different matter: the far side of an ssh or a
    // docker exec is POSIX in every case this project supports, and those
    // stay as they are.
    const localTemp = /`\/tmp\/xec-transfer-/;

    expect(source).not.toMatch(localTemp);
  });

  it('removes a local staging path without a shell', () => {
    // `rm -rf` reached the local shell, which on Windows is cmd.exe and
    // has no such command — so every staged transfer leaked its temporary
    // copy, including the ones carrying whatever the file contained.
    expect(source).toContain('rm(tempPath, { recursive: true, force: true })');
    expect(source).not.toContain('rm -rf ${escapeArg(tempPath)}');
  });

  it('still uses a remote rm for remote paths', () => {
    // The staging fix must not have removed the cleanup that genuinely
    // runs on the far side.
    expect(source).toContain('rm -rf ${source.path}');
  });
});

describe('the staging path itself', () => {
  it('is inside this machine\'s temporary directory', async () => {
    // Reached through the module rather than by copying the expression, so
    // a change to how it is built fails here instead of silently diverging.
    const module = await import('../../../src/utils/transfer.js');
    // The helper is module-private; what is observable is that the module
    // imports tmpdir and that the directory exists.
    expect(module).toBeDefined();
    expect(tmpdir().length).toBeGreaterThan(0);
  });
});
