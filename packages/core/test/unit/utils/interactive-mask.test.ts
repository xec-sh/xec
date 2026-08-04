import { Writable, PassThrough } from 'node:stream';

import { InteractiveSession } from '../../../src/utils/interactive.js';

/**
 * `QuestionOptions.mask` and `QuestionOptions.multiline` were declared on the
 * public type and then destructured and dropped. Asking for a masked prompt
 * echoed the secret in clear text — the failure mode a mask option exists to
 * prevent, made worse by looking like it worked.
 */
describe('InteractiveSession masking', () => {
  /** A session wired to in-memory streams, plus everything written out. */
  function session() {
    const input = new PassThrough();
    const written: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        written.push(chunk.toString());
        callback();
      },
    });

    // `terminal: true` is what makes readline echo keystrokes at all, so the
    // masking has something to suppress.
    const interactive = new InteractiveSession({} as never, { input, output, terminal: true });

    return { input, output, written, interactive };
  }

  it('does not echo the answer when mask is set', async () => {
    const { input, written, interactive } = session();

    const answer = interactive.question('Password', { mask: true });
    input.write('hunter2\n');

    expect(await answer).toBe('hunter2');
    expect(written.join('')).not.toContain('hunter2');
    // The prompt itself must still be visible.
    expect(written.join('')).toContain('Password');

    interactive.close();
  });

  it('echoes normally when mask is not set', async () => {
    const { input, written, interactive } = session();

    const answer = interactive.question('Name', {});
    input.write('ada\n');

    expect(await answer).toBe('ada');
    expect(written.join('')).toContain('ada');

    interactive.close();
  });

  it('leaves later prompts echoing after a masked one', async () => {
    // A muted interface that is never restored swallows every prompt after it.
    const { input, written, interactive } = session();

    const secret = interactive.question('Password', { mask: true });
    input.write('s3cret\n');
    await secret;

    const name = interactive.question('Name', {});
    input.write('grace\n');

    expect(await name).toBe('grace');
    expect(written.join('')).toContain('grace');
    expect(written.join('')).not.toContain('s3cret');

    interactive.close();
  });

  it('reads until a blank line when multiline is set', async () => {
    const { input, interactive } = session();

    const answer = interactive.question('Notes', { multiline: true });
    input.write('first\n');
    input.write('second\n');
    input.write('\n');

    expect(await answer).toBe('first\nsecond');

    interactive.close();
  });

  it('masks the dedicated password prompt', async () => {
    const { input, written, interactive } = session();

    const answer = interactive.password('Passphrase');
    input.write('correct horse\n');

    expect(await answer).toBe('correct horse');
    expect(written.join('')).not.toContain('correct horse');
    expect(written.join('')).toContain('Passphrase');

    interactive.close();
  });
});
