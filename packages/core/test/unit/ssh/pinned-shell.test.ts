import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NodeSSH, sshHostFingerprint } from '../../../src/adapters/ssh/ssh.js';
import createServer from './ssh-server.js';
import { PUBLIC_KEY_PATH } from './helpers.js';

it('uses existing NodeSSH for a real pinned PTY; probes and mismatches never authenticate', async () => {
  const server = createServer();
  const clients = new Set<any>();
  let authenticationRequests = 0;
  server.on('connection', (client) => {
    clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
    client.on('authentication', () => authenticationRequests++);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const ssh = new NodeSSH();
  try {
    const known = sshHostFingerprint(Buffer.from(readFileSync(PUBLIC_KEY_PATH, 'utf8').trim().split(/\s+/)[1]!, 'base64'));
    expect(await NodeSSH.probeHostKey({ host: '127.0.0.1', port })).toBe(known);
    expect(authenticationRequests).toBe(0);
    await expect(ssh.connect({ host: '127.0.0.1', port, username: 'steel', password: 'password', expectedHostFingerprint: `SHA256:${'a'.repeat(43)}` })).rejects.toMatchObject({ code: 'EHOSTKEY' });
    expect(authenticationRequests).toBe(0);
    await ssh.connect({ host: '127.0.0.1', port, username: 'steel', password: 'password', expectedHostFingerprint: known, hostHash: 'sha256' });
    const shell = await ssh.requestShell({ term: 'xterm-256color', cols: 80, rows: 24 });
    shell.setWindow(30, 100, 0, 0);
    const output = new Promise<string>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('PTY did not answer: ' + JSON.stringify(text.slice(-300)))), 5000);
      shell.on('data', (data: Buffer) => { text += data.toString(); if (text.includes('xec-pty-result')) { clearTimeout(timer); resolve(text); } });
    });
    shell.write("printf '__xec_size__'; stty size; printf 'xec-pty-%s\\n' result\r");
    const text = await output;
    expect(text).toContain('xec-pty-result');
    expect(text).toContain('__xec_size__30 100');
    shell.destroy();
  } finally {
    ssh.dispose(true); for (const client of clients) client.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
