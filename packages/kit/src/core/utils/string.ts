import type { Key } from 'node:readline';

export interface DiffResult {
  lines: number[];
  numLinesBefore: number;
  numLinesAfter: number;
  numLines: number;
}

export function diffLines(a: string, b: string): DiffResult | undefined {
  if (a === b) return undefined;

  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const numLines = Math.max(aLines.length, bLines.length);
  const diff: number[] = [];

  for (let i = 0; i < numLines; i++) {
    if (aLines[i] !== bLines[i]) diff.push(i);
  }

  return {
    lines: diff,
    numLinesBefore: aLines.length,
    numLinesAfter: bLines.length,
    numLines,
  };
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Remove one displayed character, including combining marks and joined emoji. */
export function deleteLastGrapheme(value: string): string {
  let lastIndex = 0;
  for (const part of graphemes.segment(value)) lastIndex = part.index;
  return value.slice(0, lastIndex);
}

/** Accept text and paste input while excluding terminal control sequences. */
export function isPrintableInput(value: string | undefined, key?: Pick<Key, 'ctrl' | 'meta'>): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !key?.ctrl
    && !key?.meta
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value);
}
