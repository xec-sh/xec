import { Writable } from 'node:stream';
import { it, expect, describe } from 'vitest';

import prism from '../src/prism/index.js';
import { MockWritable } from './test-utils.js';
import { log, stream, taskLog } from '../src/index.js';
import stringWidth from '../src/core/utils/string-width.js';
import { TerminalTextDecoder } from '../src/prism/utils/ansi.js';

describe('incremental Kit output', () => {
  it('uses the supplied destination and preserves split graphemes', async () => {
    const output = new MockWritable();
    output.columns = 8;
    await stream.info(['A👨', '‍👩‍👧‍👦B', '日本語'], { output, withGuide: false, spacing: 0, accessible: true });
    const rendered = output.buffer.join('');
    expect(rendered.replaceAll('\n', '')).toBe('A👨‍👩‍👧‍👦B日本語');
    expect(rendered.split('\n').every(line => stringWidth(line) <= 8)).toBe(true);
  });

  it('supports streams without terminal dimensions', async () => {
    const output = new MockWritable();
    output.columns = NaN;
    await stream.message(['first ', 'second'], { output, spacing: 0, withGuide: false });
    expect(output.buffer.join('')).toBe('first second\n');
  });

  it('waits for output acknowledgments before consuming more input', async () => {
    let written = 0;
    const output = new Writable({ write(chunk, _encoding, done) {
      if (String(chunk).includes('line')) setTimeout(() => { written++; done(); }, 1);
      else done();
    } });
    async function* source() {
      for (let i = 0; i < 10; i++) {
        expect(written).toBe(i);
        yield `line ${i}\n`;
      }
    }
    await stream.message(source(), { output, spacing: 0, withGuide: false });
    expect(written).toBe(10);
  });

  it('closes the producer and rejects a destination failure', async () => {
    const failure = new Error('destination failed');
    let closed = false;
    const output = new Writable({ write(chunk, _encoding, done) {
      done(String(chunk).includes('boom') ? failure : undefined);
    } });
    async function* source() {
      try { yield 'good\n'; yield 'boom\n'; yield 'unreachable\n'; }
      finally { closed = true; }
    }
    await expect(stream.message(source(), { output, spacing: 0, withGuide: false })).rejects.toBe(failure);
    expect(closed).toBe(true);
  });

  it('honors cancellation and closes a cooperative source', async () => {
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    let closed = false;
    async function* source() {
      try { yield 'first\n'; controller.abort(reason); yield 'second\n'; }
      finally { closed = true; }
    }
    const output = new MockWritable();
    await expect(stream.message(source(), { output, signal: controller.signal })).rejects.toBe(reason);
    expect(closed).toBe(true);
    expect(output.buffer.join('')).not.toContain('second');
  });

  it('strips non-display terminal commands in accessible output', async () => {
    const output = new MockWritable();
    await stream.message(['\x1b]52;c;c2VjcmV0\x07\x1b[31msafe\x1b[0m\r\b'], {
      output, accessible: true, spacing: 0, withGuide: false,
    });
    expect(output.buffer.join('')).toBe('safe\n');
    log.info(prism.red('plain'), { output, accessible: true, spacing: 0 });
    expect(output.buffer.join('')).not.toContain('\x1b');
  });
});

describe('task log safety and progress', () => {
  it('sanitizes title, group names, body and completion messages', () => {
    const output = new MockWritable();
    output.isTTY = true;
    const attack = '\x1b]52;c;c2VjcmV0\x07\x1b[2J\r\b';
    const task = taskLog({ title: attack + 'title', output, accessible: true });
    const group = task.group(attack + 'group');
    group.message(attack + 'body');
    group.success(attack + 'group done');
    task.success(attack + 'done');
    const rendered = output.buffer.join('');
    expect(rendered).toContain('body');
    expect(rendered).toContain('group done');
    expect(rendered).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
    expect(rendered).not.toContain('c2VjcmV0');
  });

  it('emits progress immediately in static output without repeating it on completion', () => {
    const output = new MockWritable();
    const task = taskLog({ title: 'Work', output });
    task.message('first record');
    expect(output.buffer.join('')).toContain('first record');
    task.success('Done', { showLog: true });
    expect(output.buffer.join('').match(/first record/g)).toHaveLength(1);
  });

  it('preserves raw fragments in static output', () => {
    const output = new MockWritable();
    const task = taskLog({ title: 'Work', output });
    task.message('frag', { raw: true });
    task.message('ment', { raw: true });
    task.success('Done');
    expect(prism.strip(output.buffer.join(''))).toContain('fragment\n');
  });
});


describe('fragmented terminal input', () => {
  it('preserves styling split across chunks and resets it at completion', async () => {
    const output = new MockWritable();
    await stream.message(['\x1b', '[3', '1mred'], { output, withGuide: false, spacing: 0, accessible: false });
    expect(output.buffer.join('')).toBe('\x1b[31mred\x1b[0m\n');
  });

  it.each([
    ['\x1b]', '52;c;', 'secret', '\x1b', '\\safe'],
    ['\x9d', '52;c;', 'secret', '\x9csafe'],
    ['\x1bP', 'secret', '\x1b', '\\safe'],
  ])('discards fragmented control strings without printing payload', async (...chunks) => {
    const output = new MockWritable();
    await stream.message(chunks, { output, withGuide: false, spacing: 0 });
    expect(output.buffer.join('')).toBe('safe\n');
  });

  it('discards unbounded control payloads using bounded decoder state', () => {
    const decoder = new TerminalTextDecoder();
    expect(decoder.write('\x1b]52;c;')).toBe('');
    for (let i = 0; i < 100; i++) expect(decoder.write('payload'.repeat(10_000))).toBe('');
    expect(decoder.write('\x07safe')).toBe('safe');
    expect(decoder.write('\x1b[' + '1;'.repeat(10_000) + 'msafe')).toBe('safe');
  });

  it('resets styling when the source fails', async () => {
    const output = new MockWritable();
    const error = new Error('source failed');
    async function* source() { yield '\x1b[31mtext'; throw error; }
    await expect(stream.message(source(), { output, withGuide: false, spacing: 0 })).rejects.toBe(error);
    expect(output.buffer.join('')).toBe('\x1b[31mtext\x1b[0m\n');
  });

  it('decodes raw task fragments independently per group', () => {
    const output = new MockWritable();
    const task = taskLog({ title: 'Work', output, accessible: true });
    const first = task.group('First');
    const second = task.group('Second');
    first.message('\x1b]52;c;hidden', { raw: true });
    second.message('visible', { raw: true });
    first.message('\x07done', { raw: true });
    task.success('Complete');
    const text = output.buffer.join('');
    expect(text).toContain('visible');
    expect(text).toContain('done');
    expect(text).not.toContain('hidden');
  });
});
