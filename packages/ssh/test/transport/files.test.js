import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { rm, access, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { connection } from './peer.js';

async function files(t, configure) {
  const client = await connection(t, (session) =>
    session.on('sftp', (accept) => {
      const peer = accept();
      peer.on('error', () => {});
      configure(peer);
    })
  );
  const sftp = await new Promise((resolve, reject) =>
    client.sftp((error, value) => (error ? reject(error) : resolve(value)))
  );
  sftp.on('error', () => {});
  t.after(() => sftp.destroy());
  return sftp;
}
const request = (sftp, method, ...args) =>
  new Promise((resolve, reject) => sftp[method](...args, (error, result) => (error ? reject(error) : resolve(result))));
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'xec-sftp-files-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

for (const variant of ['exact-limit', 'overflow', 'close-refused', 'overflow-close-refused', 'empty']) {
  test(
    `bounded readFile: ${variant} waits for handle close and never trusts an ATTRS allocation`,
    { timeout: 6000 },
    async (t) => {
      const data = Buffer.from(variant === 'empty' ? '' : 'synthetic-content');
      let closes = 0,
        stats = 0;
      const sftp = await files(t, (peer) => {
        peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
        peer.on('FSTAT', (id) => {
          stats++;
          peer.attrs(id, { size: Number.MAX_SAFE_INTEGER });
        });
        peer.on('READ', (id, _handle, position, length) => {
          if (position >= data.length) peer.status(id, 1);
          else peer.data(id, data.subarray(position, position + length));
        });
        peer.on('CLOSE', (id) => {
          closes++;
          peer.status(id, variant.includes('refused') ? 3 : 0);
        });
      });
      let callbacks = 0;
      const result = await new Promise((resolve) =>
        sftp.readFile(
          '/synthetic',
          {
            encoding: 'utf8',
            maxBytes: variant.includes('overflow') ? data.length - 1 : data.length,
          },
          (error, contents) => {
            callbacks++;
            resolve({ error, contents });
          }
        )
      );
      assert.equal(closes, 1);
      assert.equal(callbacks, 1);
      assert.equal(stats, 0);
      if (variant === 'exact-limit' || variant === 'empty') {
        assert.ifError(result.error);
        assert.equal(result.contents, data.toString());
      } else {
        assert(result.error instanceof Error);
        assert.equal(result.contents, undefined);
        if (variant === 'overflow') assert.equal(result.error.code, 'EFBIG');
        else if (variant === 'close-refused') assert.equal(result.error.code, 3);
        else {
          assert(result.error instanceof AggregateError);
          assert.deepEqual(
            result.error.errors.map((error) => error.code),
            ['EFBIG', 3]
          );
        }
      }
    }
  );
}

test('readFile and transfer invalid resource limits fail before OPEN', { timeout: 6000 }, async (t) => {
  let opens = 0;
  const sftp = await files(t, (peer) =>
    peer.on('OPEN', (id) => {
      opens++;
      peer.status(id, 3);
    })
  );
  for (const maxBytes of [-1, 0.5, Infinity, NaN, 1024 * 1024 * 1024 + 1])
    assert.throws(() => sftp.readFile('/synthetic', { maxBytes }, () => {}), /maxBytes/);
  for (const options of [
    { concurrency: Infinity },
    { concurrency: 0.5 },
    { concurrency: 257 },
    { chunkSize: Infinity },
    { chunkSize: 0 },
    { chunkSize: 1024 * 1024 + 1 },
    { concurrency: 256, chunkSize: 1024 * 1024 },
    { fileSize: -1 },
    { fileSize: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.throws(() => sftp.fastGet('/synthetic', '/not-used', options, () => {}), /Transfer|transfer/);
  assert.equal(opens, 0);
});

test('writeFile append refuses failed handle metadata without a pathname fallback', { timeout: 6000 }, async (t) => {
  let closes = 0,
    stats = 0,
    writes = 0;
  const sftp = await files(t, (peer) => {
    peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
    peer.on('FSTAT', (id) => peer.status(id, 3));
    peer.on('STAT', (id) => {
      stats++;
      peer.attrs(id, { size: 99 });
    });
    peer.on('WRITE', (id) => {
      writes++;
      peer.status(id, 0);
    });
    peer.on('CLOSE', (id) => {
      closes++;
      peer.status(id, 0);
    });
  });
  await assert.rejects(request(sftp, 'appendFile', '/synthetic', 'content'), { code: 3 });
  assert.deepEqual({ closes, stats, writes }, { closes: 1, stats: 0, writes: 0 });
});

test('fastGet handles short reads and closes both owners before reporting success', { timeout: 6000 }, async (t) => {
  const target = join(await directory(t), 'download');
  const content = Buffer.from('0123456789'.repeat(101));
  let closes = 0;
  const sftp = await files(t, (peer) => {
    peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
    peer.on('FSTAT', (id) => peer.attrs(id, { size: content.length }));
    peer.on('READ', (id, _handle, position, length) =>
      peer.data(id, content.subarray(position, position + Math.min(length, 17)))
    );
    peer.on('CLOSE', (id) => {
      closes++;
      peer.status(id, 0);
    });
  });
  let progressed = 0;
  await request(sftp, 'fastGet', '/synthetic', target, {
    concurrency: 3,
    chunkSize: 64,
    step(total) {
      assert(total > progressed);
      progressed = total;
    },
  });
  assert.deepEqual(await readFile(target), content);
  assert.equal(progressed, content.length);
  assert.equal(closes, 1);
});

test(
  'fastGet preserves FSTAT and close failures without opening a destination or following its path',
  { timeout: 6000 },
  async (t) => {
    const target = join(await directory(t), 'download');
    let closes = 0,
      stats = 0;
    const sftp = await files(t, (peer) => {
      peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
      peer.on('FSTAT', (id) => peer.status(id, 3));
      peer.on('STAT', (id) => {
        stats++;
        peer.attrs(id, { size: 1 });
      });
      peer.on('CLOSE', (id) => {
        closes++;
        peer.status(id, 4);
      });
    });
    await assert.rejects(request(sftp, 'fastGet', '/synthetic', target), (error) => {
      assert(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((value) => value.code),
        [3, 4]
      );
      return true;
    });
    await assert.rejects(access(target), { code: 'ENOENT' });
    assert.deepEqual({ closes, stats }, { closes: 1, stats: 0 });
  }
);

for (const variant of ['content', 'empty-close-refused', 'mode-refused']) {
  test(`fastPut ${variant} preserves acknowledged write and cleanup outcomes`, { timeout: 6000 }, async (t) => {
    const source = join(await directory(t), 'upload');
    const data = Buffer.from(variant.startsWith('empty') ? '' : 'synthetic-upload'.repeat(10));
    await writeFile(source, data);
    const received = Buffer.alloc(data.length);
    let closes = 0,
      pathModes = 0,
      writes = 0;
    const sftp = await files(t, (peer) => {
      peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
      peer.on('FSETSTAT', (id) => peer.status(id, variant === 'mode-refused' ? 3 : 0));
      peer.on('SETSTAT', (id) => {
        pathModes++;
        peer.status(id, 0);
      });
      peer.on('WRITE', (id, _handle, position, chunk) => {
        writes++;
        chunk.copy(received, position);
        peer.status(id, 0);
      });
      peer.on('CLOSE', (id) => {
        closes++;
        peer.status(id, variant === 'empty-close-refused' ? 4 : 0);
      });
    });
    const operation = request(sftp, 'fastPut', source, '/synthetic', { concurrency: 2, chunkSize: 64, mode: 0o600 });
    if (variant === 'content') {
      await operation;
      assert.deepEqual(received, data);
      assert(writes > 0);
    } else {
      await assert.rejects(operation, { code: variant === 'mode-refused' ? 3 : 4 });
      assert.equal(writes, 0);
    }
    assert.equal(closes, 1);
    assert.equal(pathModes, 0);
  });
}

test(
  'SFTP write counts acknowledged bytes rather than buffer offsets and validates ranges before dispatch',
  { timeout: 6000 },
  async (t) => {
    const pieces = [];
    const sftp = await files(t, (peer) =>
      peer.on('WRITE', (id, _handle, _position, data) => {
        pieces.push(Buffer.from(data));
        peer.status(id, 0);
      })
    );
    const handle = Buffer.from([1]),
      data = Buffer.from('prefix-content-tail');
    assert.equal(await request(sftp, 'write', handle, data, 7, 7, 0), 7);
    assert.equal(Buffer.concat(pieces).toString(), 'content');
    for (const [offset, length, position] of [
      [-1, 1, 0],
      [0, 0.5, 0],
      [0, 1, NaN],
      [0, 1, Number.MAX_SAFE_INTEGER],
    ])
      assert.throws(() => sftp.write(handle, data, offset, length, position, () => {}), /offset|length|position|range/);
    assert.equal(pieces.length, 1);
  }
);
