import { Readable } from 'node:stream';

import { $, ExecutionEngine } from '../../../src/index.js';

/**
 * `.interactive()` hands the command this process's terminal.
 *
 * It did not. It derived the engine with `Object.create`, and the process
 * builder — which is what the template path actually calls `execute`
 * through — captures the engine it was constructed for. The copy inherited
 * the original's builder, so every command ran on the original engine with
 * the original's configuration, and the interactive settings were dropped
 * without a word.
 *
 * The visible end of it: `xec release` offering to run `npm login`, which
 * got a piped copy of stdin instead of the terminal, could not prompt, and
 * hung forever.
 */
describe('a command given the terminal', () => {
  const emit = (text: string): string => `process.stdout.write(${JSON.stringify(text)})`;

  it('writes to the terminal rather than into the result', async () => {
    // Inherited output is not captured — the bytes went to the terminal.
    // Capturing it is the tell that the configuration was ignored.
    const result = await $.interactive()`node -e ${emit('to the terminal')}`.nothrow();

    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(0);
  }, 20_000);

  it('gives the child the real descriptor, not a copy', async () => {
    // `child.stdin` is null when the descriptor was inherited: the child
    // owns it. A stream there means a pipe was made, which is what loses
    // `isTTY`, raw mode and the signal keys — everything a prompt needs.
    const promise = $.interactive()`node -e ${emit('x')}`.nothrow();
    await promise;

    expect(promise.child?.stdin ?? null).toBeNull();
  }, 20_000);

  it('still pipes when the caller supplies data', async () => {
    // Only `process.stdin` means "inherit". A Readable is data to write.
    const result = await $.with({ stdin: Readable.from(['fed in\n']) })`node -e ${
      'let b="";process.stdin.on("data",c=>b+=c).on("end",()=>process.stdout.write(b.trim()))'
    }`;

    expect(result.stdout).toBe('fed in');
  }, 20_000);

  it('keeps the configuration on a derived engine', async () => {
    // The general form of the defect: anything set on a derived engine has
    // to survive to the command.
    const engine = new ExecutionEngine().interactive();
    const result = await engine.run`node -e ${emit('derived')}`.nothrow();

    expect(result.stdout).toBe('');
  }, 20_000);

  it('composes with the other chainable methods', async () => {
    const result = await $.interactive().timeout('10s')`node -e ${emit('composed')}`.nothrow();

    expect(result.stdout).toBe('');
    expect(result.exitCode).toBe(0);
  }, 20_000);
});
