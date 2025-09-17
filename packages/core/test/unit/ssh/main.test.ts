import { Server } from 'ssh2';
import invariant from 'assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { join, dirname } from 'node:path';
import { it, expect, describe, afterAll, beforeAll } from '@jest/globals';

import createServer from './ssh-server.js';
import { NodeSSH } from '../../../src/adapters/ssh/ssh.js';
import { wait, exists, PRIVATE_KEY_PATH } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);

let ports = 8876;

function getFixturePath(fixturePath: string): string {
  return join(__dirname, 'fixtures', fixturePath);
}

function createSSHTest(
  title: string,
  callback: (port: number, client: NodeSSH, server: Server) => Promise<void>,
  skip = false,
): void {
  const testFunc = skip ? it.skip : it;
  testFunc(title, async () => {
    ports += 1;

    const server = createServer();
    const client = new NodeSSH();
    const port = ports;
    await new Promise<void>(function (resolve) {
      server.listen(port, '127.0.0.1', resolve);
    });
    try {
      await callback(port, client, server);
    } finally {
      client.dispose();
      await new Promise(function (resolve) {
        server.close(resolve);
      });
    }
  });
}

async function connectWithPassword(port: number, client: NodeSSH) {
  await client.connect({
    host: '127.0.0.1',
    port,
    username: 'steel',
    password: 'password',
  });
}

async function connectWithPrivateKey(port: number, client: NodeSSH) {
  await client.connect({
    host: '127.0.0.1',
    port,
    username: 'steel',
    privateKeyPath: PRIVATE_KEY_PATH,
  });
}

async function connectWithInlinePrivateKey(port: number, client: NodeSSH) {
  await client.connect({
    host: '127.0.0.1',
    port,
    username: 'steel',
    privateKey: readFileSync(PRIVATE_KEY_PATH, 'utf8'),
  });
}

describe('SSH Node Tests', () => {
  afterAll(async () => {
    await new Promise<void>((resolve) => {
      exec(`rm -rf ${getFixturePath('ignored')}`, (err) => {
        if (err) console.error('Cleanup error:', err);
        exec(`rm -rf ${getFixturePath('ignored-2')}`, (err2) => {
          if (err2) console.error('Cleanup error:', err2);
          resolve();
        });
      });
    });
  });

  beforeAll(async () => {
    // Create the directories if they don't exist
    await new Promise<void>((resolve) => {
      exec(`mkdir -p ${getFixturePath('.')}`, () => {
        exec(`rm -rf ${getFixturePath('ignored')}`, () => {
          exec(`rm -rf ${getFixturePath('ignored-2')}`, () => {
            exec(`mkdir -p ${getFixturePath('ignored')}`, () => {
              exec(`mkdir -p ${getFixturePath('ignored-2')}`, () => {
                resolve();
              });
            });
          });
        });
      });
    });
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

  createSSHTest(
    'requests a shell that works',
    async (port, client) => {
      await connectWithPassword(port, client);
      const data: Buffer[] = [];
      const shell = await client.requestShell();
      shell.on('data', function (chunk: Buffer) {
        data.push(chunk);
      });
      shell.write('ls /\n');
      await wait(50);
      shell.end();
      const joinedData = data.join('');
      expect(joinedData).toMatch(/ls \//);
    },
    true,
  );

  createSSHTest('creates directories with sftp properly', async (port, client) => {
    await connectWithPassword(port, client);
    expect(await exists(getFixturePath('ignored/a/b'))).toBe(false);
    await client.mkdir(getFixturePath('ignored/a/b'), 'sftp');
    expect(await exists(getFixturePath('ignored/a/b'))).toBe(true);
  });

  createSSHTest('creates directories with exec properly', async (port, client) => {
    await connectWithPassword(port, client);
    // Clean up from previous test
    await new Promise<void>((resolve) => {
      exec(`rm -rf ${getFixturePath('ignored/a')}`, () => resolve());
    });
    expect(await exists(getFixturePath('ignored/a/b'))).toBe(false);
    await client.mkdir(getFixturePath('ignored/a/b'), 'exec');
    expect(await exists(getFixturePath('ignored/a/b'))).toBe(true);
  });

  createSSHTest('throws error when it cant create directories', async (port, client) => {
    await connectWithPassword(port, client);
    try {
      await client.mkdir('/etc/passwd/asdasdasd');
      expect(false).toBe(true);
    } catch (_: any) {
      expect(_.message.indexOf('ENOTDIR: not a directory') !== -1).toBe(true);
    }
  });

  createSSHTest('exec with correct escaped parameters', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec('echo', ['$some', 'S\\Thing', '"Yo"']);
    expect(result).toBe('$some S\\Thing "Yo"');
  });

  createSSHTest('exec with correct cwd', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec('pwd', [], { cwd: '/etc' });
    expect(result).toBe('/etc');
  });

  createSSHTest('throws if stream is stdout and stuff is written to stderr', async (port, client) => {
    await connectWithPassword(port, client);
    try {
      await client.exec('node', ['-e', 'console.error("Test")']);
      expect(false).toBe(true);
    } catch (_: any) {
      expect(_.message).toBe('Test');
    }
  });

  createSSHTest('does not throw if stream is stderr and is written to', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec('node', ['-e', 'console.error("Test")'], { stream: 'stderr' });
    expect(result).toBe('Test');
  });

  createSSHTest('returns both streams if asked to', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec('node', ['-e', 'console.log("STDOUT"); console.error("STDERR")'], { stream: 'both' });
    invariant(typeof result === 'object' && result);
    expect(result.stdout).toBe('STDOUT');
    // STDERR tests are flaky on CI
    if (!process.env['CI']) {
      expect(result.stderr).toBe('STDERR');
    }
  });

  createSSHTest('writes to stdin properly', async (port, client) => {
    await connectWithPassword(port, client);
    const result = await client.exec('node', ['-e', 'process.stdin.pipe(process.stdout)'], { stdin: 'Twinkle!\nStars!' });
    expect(result).toBe('Twinkle!\nStars!');
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
      exec(`rm -f ${targetFile}`, () => resolve());
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
      getFixturePath('ignored/aa'),
      getFixturePath('ignored/bb'),
      getFixturePath('ignored/cc'),
      getFixturePath('ignored/dd'),
      getFixturePath('ignored/ee/ff'),
      getFixturePath('ignored/ff'),
      getFixturePath('ignored/gg'),
      getFixturePath('ignored/hh'),
      getFixturePath('ignored/ii'),
      getFixturePath('ignored/jj'),
      getFixturePath('ignored/really/really/really/really/really/more deep files'),
      getFixturePath('ignored/really/really/really/really/yes/deep files'),
      getFixturePath('ignored/really/really/really/really/deep'),
    ];
    const filesReceived: string[] = [];
    const existsBefore = await Promise.all(remoteFiles.map((file) => exists(file)));
    expect(existsBefore.every(Boolean)).toBe(false);
    await client.putDirectory(getFixturePath('multiple'), getFixturePath('ignored'), {
      tick(local, remote, error) {
        expect(error).toBe(null);
        expect(remoteFiles.indexOf(remote) !== -1).toBe(true);
        filesReceived.push(remote);
      },
    });
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
    await client.exec('node', [getFixturePath('test-program')], {
      stream: 'both',
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

  createSSHTest('allows stream callbacks on execCommand', async (port, client) => {
    await connectWithPassword(port, client);
    const outputFromCallbacks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    await client.execCommand(`node ${getFixturePath('test-program')}`, {
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

  createSSHTest('has a working noTrim option', async (port, client) => {
    await connectWithPassword(port, client);
    const resultWithTrim = await client.exec('echo', ["\nhello\n\n\n\n"], { stream: 'stdout' });
    expect(resultWithTrim).toBe('hello');

    const resultWithoutTrim = await client.exec('echo', ['\n\n\nhi\n\n\n'], { stream: 'stdout', noTrim: true });
    expect(resultWithoutTrim).toBe('\n\n\nhi\n\n\n\n');
  });
});