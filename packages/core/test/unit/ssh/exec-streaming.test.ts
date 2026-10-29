import { EventEmitter } from 'node:events';
import { it, vi, expect, describe } from 'vitest';
import { Duplex, Writable, PassThrough } from 'node:stream';

import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';

function transport(stdout: string, stderr = '') {
  const ssh = new NodeSSH();
  const channel = Object.assign(new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } }), {
    stderr: new PassThrough(), signal: vi.fn(), close: vi.fn(),
  });
  channel.close.mockImplementation(() => { channel.push(null); channel.stderr.end(); channel.emit('close'); });
  const connection = Object.assign(new EventEmitter(), { exec: (_command: unknown, _options: unknown, accept: (error: undefined, value: typeof channel) => void) => {
    accept(undefined, channel);
    setImmediate(() => { channel.push(Buffer.from(stdout)); channel.stderr.end(stderr); channel.emit('exit', 0); channel.push(null); });
    channel.once('end', () => setImmediate(() => channel.emit('close')));
  } });
  ssh.connection = connection as never;
  return { ssh, channel };
}

describe('SSH exec stream ownership', () => {
  it('can stream without retaining a second copy of either output', async () => {
    const { ssh } = transport('x'.repeat(100_000), 'diagnostic');
    let bytes = 0, error = '';
    const result = await ssh.execCommand('inspect', { collectStdout: false, collectStderr: false,
      onStdout: chunk => { bytes += chunk.length; }, onStderr: chunk => { error += chunk.toString(); } });
    expect(bytes).toBe(100_000); expect(error).toBe('diagnostic');
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });
  it('waits for slow destinations and preserves successful stderr', async () => {
    const { ssh } = transport('x'.repeat(100_000), 'diagnostic');
    const adapter = new SSHAdapter();
    let bytes = 0, error = '';
    const stdout = new Writable({ highWaterMark: 16, write(chunk, _encoding, done) {
      setTimeout(() => { bytes += chunk.length; done(); }, 25);
    } });
    const stderr = new Writable({ write(chunk, _encoding, done) { error += chunk; done(); } });
    try {
      const result = await (adapter as any).executeSSHCommand(ssh, 'inspect', { stdout, stderr, timeout: 1000 });
      expect(stdout.writableFinished).toBe(true); expect(stderr.writableFinished).toBe(true);
      expect(bytes).toBe(100_000); expect(error).toBe('diagnostic');
      expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    } finally { await adapter.dispose(); }
  });
  it('propagates a destination failure and terminates its remote channel', async () => {
    const { ssh, channel } = transport('output');
    const adapter = new SSHAdapter();
    const stdout = new Writable({ write(_chunk, _encoding, done) { done(new Error('journal unavailable')); } });
    try {
      await expect((adapter as any).executeSSHCommand(ssh, 'inspect', { stdout, timeout: 1000 })).rejects.toThrow('journal unavailable');
      expect(channel.signal).toHaveBeenCalledWith('TERM'); expect(channel.close).toHaveBeenCalled();
    } finally { await adapter.dispose(); }
  });
});
