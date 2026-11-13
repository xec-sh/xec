import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

const website = createRequire(new URL('../../website/package.json', import.meta.url));
const search = createRequire(website.resolve('@easyops-cn/docusaurus-search-local'));
const parser = search('cheerio');
const text = 'Привет 🌐';
const cases = [
  { name: 'UTF-8 metadata', bytes: Buffer.from('<meta charset="utf-8"><title>' + text + '</title>'), expected: text },
  { name: 'UTF-8 BOM', bytes: Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from('<title>' + text + '</title>')]), expected: text },
  { name: 'UTF-16 BOM', bytes: Buffer.concat([Buffer.from([255, 254]), Buffer.from('<title>' + text + '</title>', 'utf16le')]), expected: text },
  { name: 'Windows 1251', bytes: Buffer.concat([
    Buffer.from('<meta charset="windows-1251"><title>'), Buffer.from([207, 240, 232, 226, 229, 242]), Buffer.from('</title>'),
  ]), expected: 'Привет' },
  { name: 'Windows 1252', bytes: Buffer.concat([
    Buffer.from('<meta charset="windows-1252"><title>caf'), Buffer.from([233]), Buffer.from('</title>'),
  ]), expected: 'café' },
  { name: 'XML UTF-8', bytes: Buffer.from('<?xml version="1.0" encoding="utf-8"?><page><title>' + text + '</title></page>'),
    expected: text, options: { xmlMode: true } },
];

for (const { name, bytes, expected, options = {} } of cases) {
  test('search parser preserves ' + name + ' in buffers and split streams', async () => {
    assert.equal(parser.loadBuffer(bytes, options)('title').text(), expected);
    const document = await new Promise((resolve, reject) => {
      const decoder = parser.decodeStream(options, (error, result) => error ? reject(error) : resolve(result));
      decoder.on('error', reject);
      Readable.from([...bytes].map(value => Buffer.from([value]))).pipe(decoder);
    });
    assert.equal(document('title').text(), expected);
  });
}
