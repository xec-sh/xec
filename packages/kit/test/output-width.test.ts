import { Writable } from 'node:stream';
import { it, expect, describe } from 'vitest';

import Prompt from '../src/core/prompts/prompt.js';

/**
 * A prompt must measure the terminal it is writing to.
 *
 * The render path took its width from the global `process.stdout.columns`,
 * while the class accepts an injected `output`. Under a test harness, in CI,
 * or behind a pipe the global is undefined, and a narrow injected terminal
 * was wrapped to the width of the developer's own window: frames rendered
 * for the wrong terminal, and rendered differently on a laptop than in CI.
 */
describe('render width follows the injected output', () => {
  function run(columns: number | undefined, text: string): string[] {
    const written: string[] = [];
    const output = new Writable({
      write(chunk, _enc, done) { written.push(String(chunk)); done(); },
    }) as Writable & { columns?: number };
    output.columns = columns;

    const prompt = new Prompt<string>(
      { render: () => text, input: process.stdin, output },
      false
    );
    // Render once without starting the event loop.
    (prompt as unknown as { render(): void }).render();
    return written;
  }

  it('wraps to the injected width, not the global one', () => {
    const frames = run(10, 'aaaaaaaaaaaaaaaaaaaa'); // 20 chars into 10 cols
    // Strip control sequences (cursor.hide travels with the first frame).
    const frame = frames.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    const longest = Math.max(...frame.split('\n').map(line => line.length));

    expect(longest).toBeLessThanOrEqual(10);
  });

  it('survives an output with no width at all', () => {
    expect(() => run(undefined, 'plain')).not.toThrow();
  });
});
