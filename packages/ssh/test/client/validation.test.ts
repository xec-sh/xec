import type { SSHConnectionConfig } from '../../src/contracts.js';

import { join } from 'node:path';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { SSHClient } from '../../src/client.js';
import TransportClient from '../../src/transport/client.js';

describe('SSH connection validation before network dispatch', () => {
  afterEach(() => vi.restoreAllMocks());
  const base = { host: 'fixture.invalid', username: 'operator' };
  const invalid: [string, unknown, RegExp][] = [
    ['missing host', { username: 'operator' }, /host or.*sock/],
    ['non-string host', { ...base, host: 2 }, /host.*string/],
    ['empty host', { ...base, host: '' }, /host or.*sock|host.*string/],
    ['non-socket value', { username: 'operator', sock: 1 }, /sock.*object/],
    ['invalid username', { ...base, username: 2 }, /username.*string/],
    ['invalid password', { ...base, password: {} }, /password.*string/],
    ['invalid private key', { ...base, privateKey: 1 }, /privateKey.*string or Buffer/],
    ['ambiguous key input', { ...base, privateKey: 'key', privateKeyPath: 'file' }, /privateKeyPath.*privateKey/],
    ['missing private key file', { ...base, privateKeyPath: join(import.meta.dirname, 'fixtures', 'absent-key') }, /does not exist/],
  ];
  it.each(invalid)('rejects %s without probing localhost or a live SSH service', async (_name, config, message) => {
    const connect = vi.spyOn(TransportClient.prototype, 'connect').mockImplementation(() => { throw new Error('Unexpected network dispatch'); });
    const ssh = new SSHClient();
    try {
      await expect(ssh.connect(config as SSHConnectionConfig)).rejects.toThrow(message);
      expect(ssh.isConnected()).toBe(false);
      expect(connect).not.toHaveBeenCalled();
    } finally { ssh.dispose(true); }
  });
});
