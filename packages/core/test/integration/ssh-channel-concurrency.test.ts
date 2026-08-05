import { describeSSH, getSSHConfig } from '@xec-sh/testing';

import { NodeSSH } from '../../src/adapters/ssh/ssh.js';

/**
 * sshd grants at most MaxSessions concurrent sessions per connection — 10
 * by default — and refuses the rest with a hard "Channel open failure".
 * A parallel fan-out over one pooled connection hit that ceiling as an
 * ordinary race: one in every couple of full-suite runs, always in the
 * concurrent-operations test, never reproducible alone.
 *
 * The connection now queues channel openings below the server's grant and
 * retries a refusal while siblings close. Twenty concurrent commands over
 * one connection is double the default ceiling: without the queue this
 * fails on most runs, with it every command must come back.
 */
describeSSH('SSH channel concurrency', () => {
  it('runs 20 concurrent commands over one connection without a refusal', async () => {
    const config = getSSHConfig('ubuntu-apt');
    const ssh = new NodeSSH();
    await ssh.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      // Fixture containers are rebuilt at will; their keys are not identity.
      hostKeyChecking: 'off',
    });

    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          ssh.execCommand(`echo channel-${index}`)
        )
      );

      results.forEach((result, index) => {
        expect(result.code).toBe(0);
        expect(result.stdout).toBe(`channel-${index}`);
      });
    } finally {
      ssh.dispose();
    }
  }, 60_000);
});
