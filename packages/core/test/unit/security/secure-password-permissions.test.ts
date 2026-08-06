import { stat } from 'node:fs/promises';

import { itPosixShell } from '../../helpers/platform.js';

describe('SecurePasswordHandler askpass script permissions', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
  });

  // POSIX mode bits, which Windows does not have: `chmod` there is a no-op
  // and the mode reads back as whatever the filesystem reports. The window
  // this guards against — a plaintext password world-readable between two
  // syscalls — is a POSIX filesystem's window.
  itPosixShell('creates the password script owner-only rather than chmod-ing it afterwards', async () => {
    // Suppress the real chmod so the assertion sees the mode the askpass file
    // was CREATED with, isolating it from the later chmod that narrows it. The
    // defect was that creation used writeFile's default (world-readable) mode
    // and only a subsequent chmod made the file private: for the window between
    // the two syscalls the plaintext sudo password sat in /tmp readable by any
    // local user. The mock is applied via resetModules + dynamic import so it
    // reaches the handler's own `node:fs/promises` binding, not just this file.
    vi.resetModules();
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs/promises')>();
      return { ...actual, chmod: vi.fn(async () => {}) };
    });

    const { SecurePasswordHandler } = await import('../../../src/adapters/ssh/secure-password.js');
    const handler = new SecurePasswordHandler();

    try {
      const scriptPath = await handler.createAskPassScript('S3cret-Pass!42');
      const mode = (await stat(scriptPath)).mode & 0o777;

      // With the real chmod suppressed this reflects the creation mode alone.
      // Any group or other bit here is a window in which the plaintext password
      // was readable by other local users.
      expect(mode & 0o077).toBe(0);
    } finally {
      await handler.dispose();
    }
  });
});
