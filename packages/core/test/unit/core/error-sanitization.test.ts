import { sanitizeCommandForError } from '../../../src/core/error.js';

/**
 * What a failure message may show of the command that failed.
 *
 * The rule used to be truncation: `cat /etc/hosts` became
 * `cat [arguments hidden]`, and anything over three words became
 * `docker ... (6 arguments)`. It was chosen as a security control but was a
 * poor one — a credential in the first three words of an unlisted command
 * passed straight through, while a harmless path was hidden — and it left
 * the reader unable to tell which command had failed.
 *
 * The rule now is redaction, using the same patterns as output, events and
 * verbose echoes: credentials are removed, everything else stays legible.
 */
describe('sanitizeCommandForError', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['XEC_SANITIZE_COMMANDS'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('redacts credentials', () => {
    it.each([
      ['a GitHub token', 'git push https://ghp_abcdefghij1234567890abcd@github.com/o/r', 'ghp_abcdefghij1234567890abcd'],
      ['basic auth on a command line', 'curl -u admin:hunter2 https://api.example.com', 'hunter2'],
      ['credentials in a database URL', 'psql postgres://app:S3cretPass@db:5432/prod', 'S3cretPass'],
      ['an environment assignment', 'docker run -e API_KEY=sk_live_1234567890abcd img', 'sk_live_1234567890abcd'],
      ['a password flag', 'mysql --password=hunter2 -u root', 'hunter2'],
    ])('redacts %s', (_label, command, secret) => {
      const sanitized = sanitizeCommandForError(command);

      expect(sanitized).not.toContain(secret);
      expect(sanitized).toContain('[REDACTED]');
    });

    it('redacts a secret that truncation used to leave in place', () => {
      // Truncation kept the first three words verbatim; a token in the second
      // reached the log untouched.
      const sanitized = sanitizeCommandForError('deploy --token=ghp_abcdefghij1234567890abcd prod');

      expect(sanitized).not.toContain('ghp_abcdefghij1234567890abcd');
    });
  });

  describe('keeps the command identifiable', () => {
    it.each([
      'cat /etc/hosts',
      'rm -rf /var/tmp/build-cache',
      'kubectl get pods -n production -o json',
      'find / -name "*.log" -mtime +30',
    ])('leaves %s untouched', command => {
      // Nothing here is a credential, so nothing is removed — the reader can
      // see exactly what failed.
      expect(sanitizeCommandForError(command)).toBe(command);
    });

    it('preserves the surrounding command when redacting', () => {
      const sanitized = sanitizeCommandForError(
        'docker run -e TOKEN=ghp_abcdefghij1234567890abcd registry.example.com/app:1.2.3'
      );

      expect(sanitized).toContain('docker run');
      expect(sanitized).toContain('registry.example.com/app:1.2.3');
    });
  });

  describe('the opt-out', () => {
    it('returns the command verbatim when explicitly disabled', () => {
      process.env['XEC_SANITIZE_COMMANDS'] = 'false';

      const command = 'curl -u admin:hunter2 https://api.example.com';
      expect(sanitizeCommandForError(command)).toBe(command);
    });

    it('still redacts when a test-runner worker id is set', () => {
      // Keying off NODE_ENV or VITEST_WORKER_ID would disable the control
      // exactly where build logs are most widely readable.
      process.env['VITEST_WORKER_ID'] = '1';
      process.env['NODE_ENV'] = 'test';

      expect(sanitizeCommandForError('curl -u admin:hunter2 https://x')).not.toContain('hunter2');
    });
  });

  describe('edge cases', () => {
    it.each([
      ['an empty string', ''],
      ['whitespace only', '   '],
      ['a bare command', 'ls'],
      ['special characters', 'echo "hello $USER" | grep -E "^h.*"'],
      ['multiple spaces', 'echo    spaced     out'],
    ])('handles %s without altering it', (_label, command) => {
      expect(sanitizeCommandForError(command)).toBe(command);
    });
  });
});
