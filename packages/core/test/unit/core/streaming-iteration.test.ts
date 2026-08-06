import { $ } from '../../../src/index.js';
import { emit } from '../../helpers/platform.js';

/**
 * `for await (const line of $\`cmd\`)` must deliver lines as they arrive.
 *
 * It used to await the whole command and then split its stdout, which made
 * the loop useless for exactly the commands it exists for: `kubectl logs -f`,
 * `journalctl -f`, a long build. For a follow, "when the command ends" is
 * never, so the first line never arrived.
 */
describe('output arrives while the command is still running', () => {
  it('yields each line as it is produced, not at the end', async () => {
    const started = Date.now();
    const arrivals: number[] = [];

    for await (const line of $`sh -c 'echo a; sleep 0.4; echo b'`) {
      void line;
      arrivals.push(Date.now() - started);
    }

    expect(arrivals).toHaveLength(2);
    // The first line must not wait for the second. Buffering showed both at
    // ~800ms; streaming shows the first almost immediately.
    expect(arrivals[0]).toBeLessThan(300);
    expect(arrivals[1]).toBeGreaterThan(300);
  }, 20_000);

  it('works on a command that never ends, and stops when the loop breaks', async () => {
    const seen: string[] = [];

    for await (const line of $`sh -c 'i=0; while true; do echo tick-$i; i=$((i+1)); sleep 0.15; done'`.nothrow()) {
      seen.push(line);
      if (seen.length === 3) break;
    }

    expect(seen).toEqual(['tick-0', 'tick-1', 'tick-2']);
  }, 20_000);

  it('does not leave the command running after an early break', async () => {
    const promise = $`sh -c 'while true; do echo x; sleep 0.1; done'`.nothrow();

    for await (const line of promise) {
      void line;
      break;
    }

    // Breaking out kills the command; awaiting it must therefore settle
    // rather than hang forever.
    const result = await promise;
    expect(result.ok).toBe(false);
  }, 20_000);
});

describe('the loop reports failure rather than ending quietly', () => {
  it('throws after delivering the lines the command produced', async () => {
    const delivered: string[] = [];

    // The stream ends when the process exits, strictly before the promise
    // settles — ending the loop on the stream alone finished a failed
    // command silently.
    await expect(
      (async () => {
        for await (const line of $`sh -c 'echo one; echo two; exit 3'`) {
          delivered.push(line);
        }
      })()
    ).rejects.toThrow('exit code 3');

    expect(delivered).toEqual(['one', 'two']);
  }, 20_000);

  it('completes normally under nothrow', async () => {
    const delivered: string[] = [];

    for await (const line of $`sh -c 'echo one; exit 3'`.nothrow()) {
      delivered.push(line);
    }

    expect(delivered).toEqual(['one']);
  }, 20_000);
});

describe('line splitting edge cases', () => {
  it('yields nothing for a command with no output', async () => {
    const lines: string[] = [];
    for await (const line of $`true`) lines.push(line);

    expect(lines).toEqual([]);
  }, 20_000);

  it('yields a final line that has no trailing newline', async () => {
    const lines: string[] = [];
    for await (const line of $`node -e ${emit('x')}`) lines.push(line);

    expect(lines).toEqual(['x']);
  }, 20_000);

  it('reassembles a line split across chunk boundaries', async () => {
    // Written in two writes with a gap, so the line genuinely arrives in
    // two separate chunks.
    const lines: string[] = [];
    const split = 'process.stdout.write("half-");setTimeout(()=>process.stdout.write("whole\\n"),200)';
    for await (const line of $`node -e ${split}`) {
      lines.push(line);
    }

    expect(lines).toEqual(['half-whole']);
  }, 20_000);
});
