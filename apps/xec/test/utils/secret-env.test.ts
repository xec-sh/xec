import type { SecretManager } from '@xec-sh/ops';

import { isRegisteredSecret } from '@xec-sh/core';

import { resolveEnvPairs, isSecretReference, secretReferenceKey } from '../../src/utils/secret-env.js';

/**
 * `--env` is the seam where a credential enters a command, and every way it
 * could go wrong here ends with a secret somewhere it should not be, or a
 * variable the far side never received.
 */
describe('environment values that name a secret', () => {
  /** A store holding exactly what a test puts in it. */
  const store = (entries: Record<string, string>): (() => Promise<SecretManager>) => {
    let opened = 0;
    const manager = {
      get: async (key: string) => entries[key] ?? null,
      opened: () => opened,
    };
    const open = async () => {
      opened++;
      return manager as unknown as SecretManager;
    };
    return Object.assign(open, { count: () => opened });
  };

  const empty = store({});

  it('passes an ordinary value through unchanged', async () => {
    const { env } = await resolveEnvPairs(['NODE_ENV=production'], empty);

    expect(env).toEqual({ NODE_ENV: 'production' });
  });

  it('keeps everything after the first equals sign', async () => {
    // `split('=')` kept only the first segment, which silently truncated
    // every base64 value with '=' padding and every connection string.
    const { env } = await resolveEnvPairs(
      ['DSN=postgres://u:p@h/db?opt=1', 'B64=aGVsbG8gd29ybGQ='],
      empty
    );

    expect(env['DSN']).toBe('postgres://u:p@h/db?opt=1');
    expect(env['B64']).toBe('aGVsbG8gd29ybGQ=');
  });

  it('accepts an empty value', async () => {
    const { env } = await resolveEnvPairs(['EMPTY='], empty);

    expect(env).toEqual({ EMPTY: '' });
  });

  describe('a name with no value', () => {
    it('forwards the variable from this environment', async () => {
      // What `docker run -e KEY` means. It was silently ignored before, so
      // the far side ran without a variable the operator had asked to send.
      process.env['XEC_TEST_FORWARDED'] = 'from-here';
      try {
        const { env } = await resolveEnvPairs(['XEC_TEST_FORWARDED'], empty);
        expect(env).toEqual({ XEC_TEST_FORWARDED: 'from-here' });
      } finally {
        delete process.env['XEC_TEST_FORWARDED'];
      }
    });

    it('fails when there is nothing to forward', async () => {
      await expect(resolveEnvPairs(['XEC_TEST_ABSENT'], empty)).rejects.toThrow(
        /XEC_TEST_ABSENT/
      );
    });

    it('rejects a pair with no name', async () => {
      await expect(resolveEnvPairs(['=orphan'], empty)).rejects.toThrow(/needs a name/);
    });
  });

  describe('secret:// references', () => {
    it('resolves the value from the store', async () => {
      const { env } = await resolveEnvPairs(
        ['PGPASSWORD=secret://pg'],
        store({ pg: 'correct-horse-battery' })
      );

      expect(env).toEqual({ PGPASSWORD: 'correct-horse-battery' });
    });

    it('registers what it resolved so it cannot be printed', async () => {
      const value = 'a-token-registered-by-this-test';
      expect(isRegisteredSecret(value)).toBe(false);

      await resolveEnvPairs(['TOKEN=secret://api'], store({ api: value }));

      expect(isRegisteredSecret(value)).toBe(true);
    });

    it('does not register a literal value nobody called a secret', async () => {
      // `--env TOKEN=abc` is the operator writing a value in the clear. It
      // is not treated as a secret, because redacting a value the operator
      // typed would rewrite unrelated output that happens to contain it.
      const value = 'a-literal-value-typed-in-the-clear';

      await resolveEnvPairs([`TOKEN=${value}`], empty);

      expect(isRegisteredSecret(value)).toBe(false);
    });

    it('fails before anything runs when the key does not exist', async () => {
      // Naming the key here, rather than after a connection is open and half
      // a deployment has run, is the whole point of resolving up front.
      await expect(
        resolveEnvPairs(['PGPASSWORD=secret://absent'], store({ other: 'x' }))
      ).rejects.toThrow(/absent/);
    });

    it('suggests how to store the missing key', async () => {
      await expect(
        resolveEnvPairs(['PGPASSWORD=secret://pg'], store({}))
      ).rejects.toThrow(/xec secrets set pg/);
    });

    it('rejects a reference naming nothing', async () => {
      await expect(resolveEnvPairs(['X=secret://'], empty)).rejects.toThrow(/needs a name/);
    });

    it('reports a value too short to redact instead of implying protection', async () => {
      const { env, unprotected } = await resolveEnvPairs(
        ['PIN=secret://pin'],
        store({ pin: '42' })
      );

      expect(env).toEqual({ PIN: '42' });
      expect(unprotected).toEqual(['PIN']);
    });

    it('says nothing about values it did protect', async () => {
      const { unprotected } = await resolveEnvPairs(
        ['A=secret://a', 'B=plain'],
        store({ a: 'long-enough-to-redact' })
      );

      expect(unprotected).toEqual([]);
    });

    it('opens the store once, however many references there are', async () => {
      const open = store({ a: 'first-secret-value', b: 'second-secret-value' });

      await resolveEnvPairs(['A=secret://a', 'B=secret://b'], open);

      expect((open as unknown as { count: () => number }).count()).toBe(1);
    });

    it('never opens the store when nothing references it', async () => {
      // An ordinary command must not pay for a feature it is not using.
      const open = store({});

      await resolveEnvPairs(['A=1', 'B=2'], open);

      expect((open as unknown as { count: () => number }).count()).toBe(0);
    });

    it('leaves a value that merely mentions the scheme alone', async () => {
      const { env } = await resolveEnvPairs(['NOTE=see secret://pg for this'], empty);

      expect(env['NOTE']).toBe('see secret://pg for this');
    });
  });

  describe('recognising a reference', () => {
    it('matches only at the start', () => {
      expect(isSecretReference('secret://pg')).toBe(true);
      expect(isSecretReference('x secret://pg')).toBe(false);
      expect(isSecretReference('secret:/pg')).toBe(false);
      expect(isSecretReference('')).toBe(false);
    });

    it('keeps a key containing slashes whole', () => {
      expect(secretReferenceKey('secret://prod/db/password')).toBe('prod/db/password');
    });
  });
});
