import { $ } from '../../../src/index.js';
import { explainExitCode, sanitizeCommandForError } from '../../../src/core/error.js';

/**
 * A failure message is read by a human at 3am or by an agent deciding what to
 * do next. It has to say what ran, what happened and what that means.
 *
 * The command used to be *truncated* for safety — `cat /etc/hosts` became
 * `cat [arguments hidden]`, anything over three words became
 * `docker ... (6 arguments)`. That failed both goals at once: unreadable for
 * the reader, while a credential in the first three words survived untouched.
 * Redaction, which every other layer already applies, is the control that
 * works and keeps the command legible.
 */
describe('failure messages identify the command', () => {
  it('keeps the command readable instead of truncating it', async () => {
    await expect($`sh -c 'exit 1'`).rejects.toThrow("sh -c 'exit 1'");
  });

  it('redacts credentials in the command it shows', () => {
    const masked = sanitizeCommandForError(
      'docker run -e GITHUB_TOKEN=ghp_abcdefghij1234567890abcd registry/app'
    );

    expect(masked).not.toContain('ghp_abcdefghij1234567890abcd');
    expect(masked).toContain('[REDACTED]');
    // The rest of the command survives — that is the whole point.
    expect(masked).toContain('docker run');
    expect(masked).toContain('registry/app');
  });

  it('redacts a credential that truncation would have missed', () => {
    // Truncation kept the first three words verbatim, so a secret in
    // argument two went straight into the log.
    const masked = sanitizeCommandForError('curl -u admin:hunter2 https://api.example.com');

    expect(masked).not.toContain('hunter2');
  });
});

describe('failure messages explain the exit code', () => {
  it.each([
    [137, 'out-of-memory'],
    [143, 'SIGTERM'],
    [127, 'command not found'],
    [126, 'not executable'],
    [130, 'Ctrl-C'],
  ])('explains %i', (code, expected) => {
    expect(explainExitCode(code)).toContain(expected);
  });

  it('says nothing for codes that carry no general meaning', () => {
    // An application's own exit 3 means whatever that application decided.
    expect(explainExitCode(3)).toBe('');
    expect(explainExitCode(1)).toBe('');
  });

  it('carries the explanation into the thrown error', async () => {
    await expect($`sh -c 'exit 127'`).rejects.toThrow('command not found');
  });
});

describe('durations read as durations', () => {
  it('accepts a string timeout', async () => {
    // `.timeout(30000)` invites the classic seconds/milliseconds slip;
    // `.timeout('30s')` cannot be misread.
    const started = Date.now();
    const result = await $.exec('sleep 5').timeout('300ms').nothrow();

    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(3_000);
  }, 15_000);

  it('still accepts milliseconds as a number', async () => {
    const result = await $.exec('sleep 5').timeout(300).nothrow();

    expect(result.ok).toBe(false);
  }, 15_000);

  it('rejects a duration it cannot parse', () => {
    expect(() => $.exec('true').timeout('soon' as never)).toThrow('Invalid duration');
  });
});
