/**
 * Render tests for the TableOptions that were declared, documented and
 * silently ignored: compact, maxHeight, showRowNumbers, wordWrap: 'wrap',
 * alternateRows and the structured footer. Each case here pins the option
 * to an observable difference in the rendered frame.
 */

import { test, expect, describe, afterAll, beforeAll, beforeEach } from 'vitest';

import prism from '../src/prism/index.js';
import * as prompts from '../src/index.js';
import { MockWritable } from './test-utils.js';
import { ColorLevel } from '../src/prism/utils/supports.js';

/** A MockWritable that reports as a TTY (alternateRows is TTY-gated). */
class TTYWritable extends MockWritable {
  override isTTY = true;
}

interface Person {
  id: number;
  name: string;
  note?: string;
}

const columns = [
  { key: 'id', header: 'ID', width: 4 },
  { key: 'name', header: 'Name', width: 8 },
];

function createData(count = 3): Person[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Name${i + 1}` }));
}

function lines(output: MockWritable): string[] {
  return output.buffer.join('').split('\n');
}

/** Strip ANSI codes for structural assertions (colour is asserted separately). */
function plain(text: string): string {
   
  return text.replace(/\[[0-9;]*m/g, '');
}

describe('table render options', () => {
  let output: MockWritable;

  beforeEach(() => {
    output = new MockWritable();
  });

  describe('compact', () => {
    test('drops the cell padding inside borders', () => {
      prompts.table({ data: createData(1), columns, compact: true, output });

      const frame = output.buffer.join('');
      // no space between the border and the cell content
      expect(frame).toContain('│1   │');
      expect(frame).not.toContain('│ 1    │');
      // the horizontal border spans only the column width
      expect(frame).toContain('┌────┬────────┐');
    });

    test('default keeps one space of padding', () => {
      prompts.table({ data: createData(1), columns, output });

      const frame = output.buffer.join('');
      expect(frame).toContain('│ 1    │');
      expect(frame).toContain('┌──────┬──────────┐');
    });
  });

  describe('maxHeight', () => {
    test('caps the body and names the hidden rows', () => {
      prompts.table({ data: createData(10), columns, maxHeight: 4, output });

      const frame = output.buffer.join('');
      // 3 rows fit, the 4th line is the overflow indicator
      expect(frame).toContain('Name3');
      expect(frame).not.toContain('Name4');
      expect(frame).toContain('… 7 more rows');
    });

    test('does nothing when the data fits', () => {
      prompts.table({ data: createData(3), columns, maxHeight: 10, output });

      const frame = output.buffer.join('');
      expect(frame).toContain('Name3');
      expect(frame).not.toContain('more rows');
    });
  });

  describe('showRowNumbers', () => {
    test('prepends a right-aligned # column', () => {
      prompts.table({ data: createData(3), columns, showRowNumbers: true, output });

      const frame = plain(output.buffer.join(''));
      expect(frame).toContain('#');
      // 1-based numbers, right-aligned in their own first column
      expect(frame).toContain('│ 1 │ 1    │');
      expect(frame).toContain('│ 3 │ 3    │');
    });

    test('does not mutate or copy the data rows', () => {
      const data = createData(2);
      const before = data[0];
      prompts.table({ data, columns, showRowNumbers: true, output });

      expect(data[0]).toBe(before);
      expect(Object.keys(data[0]!)).toEqual(['id', 'name']);
    });
  });

  describe('wordWrap: wrap', () => {
    test('breaks an overflowing cell across physical lines', () => {
      prompts.table({
        data: [{ id: 1, name: 'Alpha', note: 'a very long note' }],
        columns: [
          { key: 'name', header: 'Name', width: 8 },
          { key: 'note', header: 'Note', width: 6 },
        ],
        wordWrap: 'wrap',
        output,
      });

      const frame = output.buffer.join('');
      // the note wraps instead of truncating
      expect(frame).not.toContain('...');
      expect(frame).toContain('a very');
      expect(frame).toContain('long');
      expect(frame).toContain('note');
      // the short cell pads with blank continuation lines, borders intact
      const noteLines = lines(output).filter((line) => line.includes('│') && !line.includes('Name'));
      expect(noteLines.length).toBeGreaterThan(1);
      for (const line of noteLines) {
        expect(line.startsWith('│')).toBe(true);
      }
    });

    test('default truncate cuts with an ellipsis', () => {
      prompts.table({
        data: [{ id: 1, name: 'Alpha', note: 'a very long note' }],
        columns: [{ key: 'note', header: 'Note', width: 6 }],
        output,
      });

      expect(output.buffer.join('')).toContain('...');
    });
  });

  describe('alternateRows', () => {
    let savedLevel: ColorLevel;
    let savedCI: string | undefined;

    beforeAll(() => {
      savedLevel = prism.level;
      prism.level = ColorLevel.Basic;
      savedCI = process.env['CI'];
      process.env['CI'] = 'false';
    });

    afterAll(() => {
      prism.level = savedLevel;
      process.env['CI'] = savedCI;
    });

    test('odd rows render in the muted role on a TTY', () => {
      const tty = new TTYWritable();
      prompts.table({ data: createData(4), columns, alternateRows: true, output: tty });

      const frame = tty.buffer.join('');
      // data rows only — the header also contains the word "Name"
      const rows = frame.split('\n').filter((line) => /Name\d/.test(line));
      // rows 2 and 4 (odd indexes) are muted, rows 1 and 3 are not
      expect(rows[1]).toContain('[90m');
      expect(rows[3]).toContain('[90m');
      expect(rows[0]).not.toContain('[90m');
      expect(rows[2]).not.toContain('[90m');
    });

    test('stays plain when piped (not a TTY)', () => {
      prompts.table({ data: createData(4), columns, alternateRows: true, output });

      expect(output.buffer.join('')).not.toContain('[90m');
    });
  });

  describe('footer', () => {
    test('string footer renders below the bottom border', () => {
      prompts.table({ data: createData(2), columns, footer: 'Total: 2', output });

      const frameLines = lines(output);
      const bottom = frameLines.findIndex((line) => line.includes('└'));
      const footer = frameLines.findIndex((line) => line.includes('Total: 2'));
      expect(footer).toBeGreaterThan(bottom);
    });

    test('footer text function receives the data', () => {
      prompts.table({
        data: createData(3),
        columns,
        footer: { text: (data) => `${data.length} people` },
        output,
      });

      expect(output.buffer.join('')).toContain('3 people');
    });

    test('per-column footers form an aligned row inside the frame', () => {
      prompts.table({
        data: createData(3),
        columns,
        footer: {
          columns: {
            id: 'Σ',
            name: (data) => `${data.length} rows`,
          },
        },
        output,
      });

      const frameLines = lines(output);
      const footerRow = frameLines.find((line) => line.includes('3 rows'));
      // a real bordered row, above the bottom border, aligned per column
      expect(footerRow).toBeDefined();
      expect(footerRow!.startsWith('│')).toBe(true);
      expect(footerRow).toContain('Σ');
      const bottom = frameLines.findIndex((line) => line.includes('└'));
      expect(frameLines.indexOf(footerRow!)).toBeLessThan(bottom);
    });
  });
});
