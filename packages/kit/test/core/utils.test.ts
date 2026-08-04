import type { Key } from 'node:readline';

import { cursor } from 'sisteransi';
import { vi, test, expect, describe, afterEach } from 'vitest';

import { MockReadable } from './mock-readable.js';
import { MockWritable } from './mock-writable.js';
import { block, isCancel, CANCEL_SYMBOL } from '../../src/core/utils/index.js';

describe('utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // CANCEL_SYMBOL is public (upstream #592) so consumers can resolve or
  // compare the sentinel directly instead of only via isCancel.
  describe('CANCEL_SYMBOL', () => {
    test('is exported and recognised by isCancel', async () => {
      expect(typeof CANCEL_SYMBOL).toBe('symbol');
      expect(isCancel(CANCEL_SYMBOL)).toBe(true);

      const index = await import('../../src/index.js');
      const coreIndex = await import('../../src/core/index.js');
      expect(index.CANCEL_SYMBOL).toBe(CANCEL_SYMBOL);
      expect(coreIndex.CANCEL_SYMBOL).toBe(CANCEL_SYMBOL);
    });
  });

  describe('block', () => {
    test('clears output on keypress', () => {
      const input = new MockReadable();
      const output = new MockWritable();
      const callback = block({ input, output });

      const event: Key = {
        name: 'x',
      };
      const eventData = Buffer.from('bloop');
      input.emit('keypress', eventData, event);
      callback();
      expect(output.buffer).to.deep.equal([cursor.hide, cursor.move(-1, 0), cursor.show]);
    });

    test('clears output vertically when return pressed', () => {
      const input = new MockReadable();
      const output = new MockWritable();
      const callback = block({ input, output });

      const event: Key = {
        name: 'return',
      };
      const eventData = Buffer.from('bloop');
      input.emit('keypress', eventData, event);
      callback();
      expect(output.buffer).to.deep.equal([cursor.hide, cursor.move(0, -1), cursor.show]);
    });

    test('ignores additional keypresses after dispose', () => {
      const input = new MockReadable();
      const output = new MockWritable();
      const callback = block({ input, output });

      const event: Key = {
        name: 'x',
      };
      const eventData = Buffer.from('bloop');
      input.emit('keypress', eventData, event);
      callback();
      input.emit('keypress', eventData, event);
      expect(output.buffer).to.deep.equal([cursor.hide, cursor.move(-1, 0), cursor.show]);
    });

    test('exits on ctrl-c', () => {
      const input = new MockReadable();
      const output = new MockWritable();
      // purposely don't keep the callback since we would exit the process
      block({ input, output });
      // @ts-expect-error - process.exit doesn't return undefined
      const spy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

      const event: Key = {
        name: 'c',
      };
      const eventData = Buffer.from('\x03');
      input.emit('keypress', eventData, event);
      expect(spy).toHaveBeenCalled();
      expect(output.buffer).to.deep.equal([cursor.hide, cursor.show]);
    });

    test('does not clear if overwrite=false', () => {
      const input = new MockReadable();
      const output = new MockWritable();
      const callback = block({ input, output, overwrite: false });

      const event: Key = {
        name: 'c',
      };
      const eventData = Buffer.from('bloop');
      input.emit('keypress', eventData, event);
      callback();
      expect(output.buffer).to.deep.equal([cursor.hide, cursor.show]);
    });
  });
});
