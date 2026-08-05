import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

/**
 * `method: 'askpass'` emitted `SUDO_ASKPASS=/tmp/askpass_$$ sudo -A …` and
 * never created that file — the method could not deliver a password, and the
 * PID-predictable path was an invitation for a local user on the remote to
 * create it first. Five tests exercised the option; all five asserted
 * `instanceOf(SSHAdapter)` and nothing about the command, which is how a
 * sudo method stayed broken with a green suite.
 *
 * These tests pin the construction itself: every askpass spelling gets the
 * one correct script — created under umask 077, random name, cleaned up with
 * the command's exit status preserved.
 */
describe('sudo askpass construction', () => {
  const build = (method: string): string => {
    const adapter = new SSHAdapter({});

    return (adapter as unknown as {
      buildSudoCommandWithConfig(cmd: string, cfg: object): string;
    }).buildSudoCommandWithConfig('whoami', {
      enabled: true,
      password: 'pw',
      method,
    });
  };

  /** Random path/tag hex collapsed, so two constructions can be compared. */
  const shape = (command: string): string => command.replace(/[0-9a-fA-F]{16,}/g, 'HEX');

  it.each(['askpass', 'secure', 'secure-askpass'])('%s builds the secure script', method => {
    const command = build(method);

    expect(command).toContain('umask 077');
    expect(command).toContain('/tmp/.xec-askpass-');
    expect(command).toContain('chmod 700');
    expect(command).toContain('sudo -A');
    expect(command).toContain('rm -f');
    expect(command).toContain('exit $__xec_sudo_status');
  });

  it('never emits the phantom PID path', () => {
    expect(build('askpass')).not.toContain('askpass_$$');
  });

  it('askpass and secure-askpass are the same construction', () => {
    expect(shape(build('askpass'))).toBe(shape(build('secure-askpass')));
  });
});
