import { it, expect, describe } from 'vitest';

import { CopyCommand } from '../../src/commands/copy.js';

describe('native SCP transport trust policy', () => {
  const args = (config: Record<string, unknown>) =>
    (new CopyCommand() as unknown as { buildSshArgs(config: Record<string, unknown>): string[] }).buildSshArgs(config);
  it('requires verified known hosts by default', () => {
    expect(args({})).toEqual(['-o', 'StrictHostKeyChecking=yes']);
  });
  it('preserves explicitly requested first-use trust and the configured inventory', () => {
    expect(args({ hostKeyChecking: 'accept-new', knownHostsPath: '/trusted/hosts' })).toEqual([
      '-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=/trusted/hosts',
    ]);
  });
  it('does not interpret a misspelled policy as permissive first-use trust', () => {
    expect(() => args({ hostKeyChecking: 'strcit' })).toThrow('hostKeyChecking');
  });
});
