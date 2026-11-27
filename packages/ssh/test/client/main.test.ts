import type { AddressInfo } from 'node:net';

import { Server } from 'ssh2';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sep, join, dirname } from 'node:path';

import { SSHClient } from '../../src/client.js';
import createServer, { hasPosixShell } from './ssh-server.js';
import { exists, shellRoundTrip, PRIVATE_KEY_PATH } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);

let fixtureDirectory: string;

function getFixturePath(fixturePath: string): string {
  return join(fixtureDirectory, fixturePath);
}

/**
 * The fixture path as seen by the remote POSIX shell and SFTP client.
 *
 * The remote shell parses it, and a POSIX shell reads the `\a` in
 * `D:\a\xec` as an escape. Node accepts either spelling on Windows.
 */
function getRemoteFixturePath(fixturePath: string): string {
  return getFixturePath(fixturePath).split(sep).join('/');
}

function createSSHTest(
  title: string,
  callback: (port: number, client: SSHClient, server: Server) => Promise<void>,
  skip = false,
): void {
  // The fake server runs the client's commands through a POSIX shell,
  // because that is what a real remote host is and what the adapter quotes
  // for. Without one there is nothing here to test.
  const testFunc = skip || !hasPosixShell() ? it.skip : it;
  testFunc(title, async () => {
    const server = createServer();
    const client = new SSHClient();
    await new Promise<void>(function (resolve) {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      await callback((server.address() as AddressInfo).port, client, server);
    } finally {
      client.dispose();
      await new Promise(function (resolve) {
        server.close(resolve);
      });
    }
  });
}

async function connectWithPassword(port: number, client: SSHClient) {
  await client.connect({
    host: '127.0.0.1',
    hostKeyChecking: 'off',
    port,
    username: 'steel',
    password: 'password',
  });
}

async function connectWithPrivateKey(port: number, client: SSHClient) {
  await client.connect({
    host: '127.0.0.1',
    hostKeyChecking: 'off',
    port,
    username: 'steel',
    privateKeyPath: PRIVATE_KEY_PATH,
  });
}

async function connectWithInlinePrivateKey(port: number, client: SSHClient) {
  await client.connect({
    host: '127.0.0.1',
    hostKeyChecking: 'off',
    port,
    username: 'steel',
    privateKey: readFileSync(PRIVATE_KEY_PATH, 'utf8'),
  });
}

describe('SSH Node Tests', () => {
  // Through the filesystem rather than through `rm -rf` and `mkdir -p`,
  // neither of which exists in cmd — the fixture directories were simply
  // never created there, and every transfer test failed on their absence.
  const resetFixtures = async (): Promise<void> => {
    for (const name of ['ignored', 'ignored-2']) {
      await fs.rm(getFixturePath(name), { recursive: true, force: true });
    }
  };

  afterAll(async () => { await resetFixtures(); if (fixtureDirectory) await fs.rm(fixtureDirectory, { recursive: true, force: true }); });

  beforeAll(async () => {
    fixtureDirectory = await fs.mkdtemp(join(tmpdir(), 'xec-ssh-client-'));
    await fs.cp(join(__dirname, 'fixtures'), fixtureDirectory, { recursive: true });
    await fs.mkdir(getFixturePath('.'), { recursive: true });
    await resetFixtures();
    for (const name of ['ignored', 'ignored-2']) {
      await fs.mkdir(getFixturePath(name), { recursive: true });
    }
  });

  createSSHTest('connects to a server with password', async (port, client) => {
    await expect(connectWithPassword(port, client)).resolves.not.toThrow();
  });

  createSSHTest('connects to a server with a private key', async (port, client) => {
    await expect(connectWithPrivateKey(port, client)).resolves.not.toThrow();
  });

  createSSHTest('connects to a server with an inline private key', async (port, client) => {
    await expect(connectWithInlinePrivateKey(port, client)).resolves.not.toThrow();
  });

  createSSHTest('preserves the declared string and Buffer SFTP read results', async (port, client) => {
    await connectWithPassword(port, client);
    await client.withSFTP(async sftp => {
      const text = await new Promise<string>((resolve, reject) => sftp.readFile(__filename, 'utf8', (error, value) => error ? reject(error) : resolve(value)));
      const bytes = await new Promise<Buffer>((resolve, reject) => sftp.readFile(__filename, (error, value) => error ? reject(error) : resolve(value)));
      expect(typeof text).toBe('string'); expect(text).toBe(await fs.readFile(__filename, 'utf8'));
      expect(Buffer.isBuffer(bytes)).toBe(true); expect(bytes.toString('utf8')).toBe(text);
    });
  });

  createSSHTest('requests a shell that works', async (port, client) => {
    await connectWithPassword(port, client);
    const shell = await client.requestShell();
    try {
      const output = await shellRoundTrip(shell, () => shell.write("printf 'shell-roundtrip-%s\\n' ok\r"), 'shell-roundtrip-ok');
      expect(output).toContain('shell-roundtrip-ok');
    } finally { shell.destroy(); }
  });

  createSSHTest('creates directories with sftp properly', async (port, client) => {
    await connectWithPassword(port, client);
    expect(await exists(getFixturePath('ignored/a/b'))).toBe(false);
    await client.mkdir(getFixturePath('ignored/a/b'));
    expect(await exists(getFixturePath('ignored/a/b'))).toBe(true);
  });

  createSSHTest('throws error when it cant create directories', async (port, client) => {
    await connectWithPassword(port, client);
    // A directory under a *file*, which is the error being asked about.
    // `/etc/passwd` supplied one only where it exists.
    const directory = await fs.mkdtemp(join(tmpdir(), 'xec-ssh-'));
    const blocker = join(directory, 'a-file');
    await fs.writeFile(blocker, '');

    try {
      await client.mkdir(join(blocker, 'asdasdasd'));
      expect(false).toBe(true);
    } catch (_: any) {
      expect(_.message).toMatch(/ENOTDIR|not a directory/i);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  createSSHTest('preserves stdout, stderr and an explicit nonzero exit independently', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec("printf '  output\\n'; printf 'problem\\n' >&2; exit 7");
    expect(result).toMatchObject({ code: 7, stdout: '  output\n', stderr: 'problem\n' });
  });

  createSSHTest('streams stdin without trimming its contents', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec('cat', { stdin: 'Twinkle!\nStars!\n' });
    expect(result).toMatchObject({ code: 0, stdout: 'Twinkle!\nStars!\n' });
  });

  createSSHTest('gets files properly', async (port, client) => {
    await connectWithPassword(port, client);
    const sourceFile = __filename;
    const targetFile = getFixturePath('ignored/test-get');
    expect(await exists(targetFile)).toBe(false);
    await client.getFile(targetFile, sourceFile);
    expect(await exists(targetFile)).toBe(true);
    expect(readFileSync(targetFile, 'utf8').trim()).toBe(readFileSync(sourceFile, 'utf8').trim());
  });

  createSSHTest('puts files properly', async (port, client) => {
    await connectWithPassword(port, client);
    const sourceFile = __filename;
    const targetFile = getFixturePath('ignored/test-put');
    // Clean up any existing file
    await new Promise<void>((resolve) => {
      fs.rm(targetFile, { force: true }).then(() => resolve());
    });
    expect(await exists(targetFile)).toBe(false);
    await client.putFile(sourceFile, targetFile);
    expect(await exists(targetFile)).toBe(true);
    expect(readFileSync(targetFile, 'utf8').trim()).toBe(readFileSync(sourceFile, 'utf8').trim());
  });

  createSSHTest('puts multiple files properly', async (port, client) => {
    await connectWithPassword(port, client);

    const files = [
      { local: getFixturePath('multiple/aa'), remote: getFixturePath('ignored/aa') },
      { local: getFixturePath('multiple/bb'), remote: getFixturePath('ignored/bb') },
      { local: getFixturePath('multiple/cc'), remote: getFixturePath('ignored/cc') },
      { local: getFixturePath('multiple/dd'), remote: getFixturePath('ignored/dd') },
      { local: getFixturePath('multiple/ff'), remote: getFixturePath('ignored/ff') },
      { local: getFixturePath('multiple/gg'), remote: getFixturePath('ignored/gg') },
      { local: getFixturePath('multiple/hh'), remote: getFixturePath('ignored/hh') },
      { local: getFixturePath('multiple/ii'), remote: getFixturePath('ignored/ii') },
      { local: getFixturePath('multiple/jj'), remote: getFixturePath('ignored/jj') },
    ];
    const existsBefore = await Promise.all(files.map((file) => exists(file.remote)));
    expect(existsBefore.every(Boolean)).toBe(false);
    await client.putFiles(files);
    const existsAfter = await Promise.all(files.map((file) => exists(file.remote)));
    expect(existsAfter.every(Boolean)).toBe(true);
  });

  createSSHTest('puts entire directories at once', async (port, client) => {
    await connectWithPassword(port, client);
    const remoteFiles = [
      getRemoteFixturePath('ignored/aa'),
      getRemoteFixturePath('ignored/bb'),
      getRemoteFixturePath('ignored/cc'),
      getRemoteFixturePath('ignored/dd'),
      getRemoteFixturePath('ignored/ee/ff'),
      getRemoteFixturePath('ignored/ff'),
      getRemoteFixturePath('ignored/gg'),
      getRemoteFixturePath('ignored/hh'),
      getRemoteFixturePath('ignored/ii'),
      getRemoteFixturePath('ignored/jj'),
      getRemoteFixturePath('ignored/really/really/really/really/really/more deep files'),
      getRemoteFixturePath('ignored/really/really/really/really/yes/deep files'),
      getRemoteFixturePath('ignored/really/really/really/really/deep'),
    ];
    const filesReceived: string[] = [];
    const existsBefore = await Promise.all(remoteFiles.map((file) => exists(file)));
    expect(existsBefore.every(Boolean)).toBe(false);
    const transferred = await client.putDirectory(getFixturePath('multiple'), getRemoteFixturePath('ignored'), {
      tick(local, remote, error) {
        expect(error).toBe(null);
        expect(remoteFiles.indexOf(remote) !== -1).toBe(true);
        filesReceived.push(remote);
      },
    });
    expect(transferred).toBe(true);
    remoteFiles.sort();
    filesReceived.sort();
    expect(remoteFiles).toEqual(filesReceived);
    const existsAfter = await Promise.all(remoteFiles.map((file) => exists(file)));
    expect(existsAfter.every(Boolean)).toBe(true);
  });

  createSSHTest('gets entire directories at once', async (port, client) => {
    await connectWithPassword(port, client);
    const localFiles = [
      getFixturePath('ignored-2/aa'),
      getFixturePath('ignored-2/bb'),
      getFixturePath('ignored-2/cc'),
      getFixturePath('ignored-2/dd'),
      getFixturePath('ignored-2/ee/ff'),
      getFixturePath('ignored-2/ff'),
      getFixturePath('ignored-2/gg'),
      getFixturePath('ignored-2/hh'),
      getFixturePath('ignored-2/ii'),
      getFixturePath('ignored-2/jj'),
      getFixturePath('ignored-2/really/really/really/really/really/more deep files'),
      getFixturePath('ignored-2/really/really/really/really/yes/deep files'),
      getFixturePath('ignored-2/really/really/really/really/deep'),
    ];
    const filesReceived: string[] = [];
    const existsBefore = await Promise.all(localFiles.map((file) => exists(file)));
    expect(existsBefore.every(Boolean)).toBe(false);
    await client.getDirectory(getFixturePath('ignored-2'), getFixturePath('multiple'), {
      tick(local, remote, error) {
        expect(error).toBe(null);
        expect(localFiles.indexOf(local) !== -1).toBe(true);
        filesReceived.push(local);
      },
    });
    localFiles.sort();
    filesReceived.sort();
    expect(localFiles).toEqual(filesReceived);
    const existsAfter = await Promise.all(localFiles.map((file) => exists(file)));
    expect(existsAfter.every(Boolean)).toBe(true);
  });

  createSSHTest('allows stream callbacks on exec', async (port, client) => {
    await connectWithPassword(port, client);
    const outputFromCallbacks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    await client.exec(`node ${getRemoteFixturePath('test-program')}`, {
      onStderr(chunk) {
        outputFromCallbacks.stderr.push(chunk);
      },
      onStdout(chunk) {
        outputFromCallbacks.stdout.push(chunk);
      },
    });
    expect(outputFromCallbacks.stdout.join('').trim()).toBe('STDOUT');
    // STDERR tests are flaky on CI
    if (!process.env['CI']) {
      expect(outputFromCallbacks.stderr.join('').trim()).toBe('STDERR');
    }
  });

  createSSHTest('forwards an outbound TCP/IP connection from client', async (port, client, server) => {
    const SRC_IP = '127.0.0.1';
    const SRC_PORT = 1212;
    const DEST_IP = '127.0.0.2';
    const DEST_PORT = 2424;

    await new Promise((resolve) => {
      server.on('connection', async (connection) => {
        connection.once('ready', async () => {
          const channel = await client.forwardOut(SRC_IP, SRC_PORT, DEST_IP, DEST_PORT);
          expect(channel.readable).toBe(true);
          resolve(undefined);
        });

        // Approve first TCP/IP request.
        connection.once('tcpip', (accept, reject, info) => {
          expect(info.destIP).toBe(DEST_IP);
          expect(info.destPort).toBe(DEST_PORT);
          expect(info.srcIP).toBe(SRC_IP);
          expect(info.srcPort).toBe(SRC_PORT);
          accept();
        });
      });
      connectWithPassword(port, client);
    });
  });

  createSSHTest('forwards an inbound TCP/IP connection to client', async (port, client, server) => {
    const IP = '127.0.0.1';
    const PORT = 1212;
    const REMOTE_IP = '127.0.0.2';
    const REMOTE_PORT = 2424;

    await new Promise((resolve) => {
      server.on('connection', async (connection) => {
        connection.once('ready', async () => {
          // Wait for a connection.
          const { port: forwardPort, dispose } = await client.forwardIn(IP, PORT, (details) => {
            expect(details.destIP).toBe(IP);
            expect(details.destPort).toBe(PORT);
            expect(details.srcIP).toBe(REMOTE_IP);
            expect(details.srcPort).toBe(REMOTE_PORT);

            // Expect to get an unforward request on server.
            connection.once('request', (accept, reject, name, info) => {
              expect(name).toBe('cancel-tcpip-forward');
              expect(info.bindAddr).toBe(IP);
              expect(info.bindPort).toBe(PORT);
              accept?.();
              resolve(undefined);
            });

            setTimeout(() => dispose(), 100);
          });

          expect(dispose).toBeTruthy();
          expect(forwardPort).toBe(PORT);
        });

        // Expect to get a request on server.
        connection.once('request', (accept, reject, name, info) => {
          expect(name).toBe('tcpip-forward');
          expect(info.bindAddr).toBe(IP);
          expect(info.bindPort).toBe(PORT);
          accept?.(PORT);

          // Simulate a connection
          connection.forwardOut(info.bindAddr, info.bindPort, REMOTE_IP, REMOTE_PORT, () => {
            // Nothing more to be done here.
          });
        });
      });
      connectWithPassword(port, client);
    });
  });

  createSSHTest('forwards an outbound UNIX socket connection from client', async (port, client, server) => {
    const PATH = '/run/test.sock';

    await new Promise((resolve) => {
      server.on('connection', async (connection) => {
        connection.once('ready', async () => {
          const channel = await client.forwardOutStreamLocal(PATH);
          expect(channel.readable).toBe(true);
          resolve(undefined);
        });

        // Approve first UNIX socket request.
        connection.once('openssh.streamlocal', (accept, reject, info) => {
          expect((info as any).socketPath).toBe(PATH);
          accept?.();
        });
      });
      connectWithPassword(port, client);
    });
  });

  createSSHTest('forwards an inbound UNIX socket connection to client', async (port, client, server) => {
    const PATH = '/run/test.sock';

    await new Promise((resolve) => {
      server.on('connection', async (connection) => {
        connection.once('ready', async () => {
          // Wait for a connection.
          const { dispose } = await client.forwardInStreamLocal(PATH, (details) => {
            expect(details.socketPath).toBe(PATH);

            // Expect to get an unforward request on server.
            connection.once('request', (accept, reject, name, info) => {
              expect(name).toBe('cancel-streamlocal-forward@openssh.com');
              expect((info as any).socketPath).toBe(PATH);
              accept?.();
              resolve(undefined);
            });

            setTimeout(() => dispose(), 100);
          });

          expect(dispose).toBeTruthy();
        });

        // Expect to get a request on server.
        connection.once('request', (accept, reject, name, info) => {
          expect(name).toBe('streamlocal-forward@openssh.com');
          expect((info as any).socketPath).toBe(PATH);
          accept?.();

          // Simulate a connection
          connection.openssh_forwardOutStreamLocal(PATH, () => {
            // Nothing more to be done here.
          });
        });
      });
      connectWithPassword(port, client);
    });
  });

  createSSHTest('forwards an inbound TCP/IP connection to client with automatically assigned port', async (port, client, server) => {
    const IP = '127.0.0.1';
    const PORT = 1212;
    const REMOTE_IP = '127.0.0.2';
    const REMOTE_PORT = 2424;

    await new Promise((resolve) => {
      server.on('connection', async (connection) => {
        connection.once('ready', async () => {
          // Wait for a connection.
          const { port: forwardPort, dispose } = await client.forwardIn(IP, 0, (details) => {
            expect(details.destIP).toBe(IP);
            expect(details.destPort).toBe(PORT);
            expect(details.srcIP).toBe(REMOTE_IP);
            expect(details.srcPort).toBe(REMOTE_PORT);

            // Expect to get an unforward request on server.
            connection.once('request', (accept, reject, name, info) => {
              expect(name).toBe('cancel-tcpip-forward');
              expect(info.bindAddr).toBe(IP);
              expect(info.bindPort).toBe(PORT);
              accept?.();
              resolve(undefined);
            });

            setTimeout(() => dispose(), 100);
          });

          expect(dispose).toBeTruthy();
          expect(forwardPort).toBe(PORT);
        });

        // Expect to get a request on server.
        connection.once('request', (accept, reject, name, info) => {
          expect(name).toBe('tcpip-forward');
          expect(info.bindAddr).toBe(IP);

          // Port equal to 0 -> server chooses the port dynamically.
          expect(info.bindPort).toBe(0);
          accept?.(PORT);

          // Simulate a connection
          connection.forwardOut(info.bindAddr, PORT, REMOTE_IP, REMOTE_PORT, () => {
            // Nothing more to be done here.
          });
        });
      });
      connectWithPassword(port, client);
    });
  });

  createSSHTest('preserves whitespace in the default low-level result', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec("printf '\\nhello\\n\\n'");
    expect(result.stdout).toBe('\nhello\n\n');
  });
});
