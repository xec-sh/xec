import type { Command, ExecutionResult, ExecutionEngine } from '../../../src/index.js';

import { parallel, ParallelEngine } from '../../../src/utils/parallel.js';

/**
 * What a fan-out counts as success, and what it does when one fails.
 *
 * The bookkeeping here decides whether a caller is told the truth about a
 * batch: a result classed as succeeded when it exited non-zero, or a
 * `stopOnError` that keeps starting work after the decision to stop, both
 * fail quietly and in the direction of appearing to have worked.
 */
describe('running commands together', () => {
  /** An engine that answers from a script rather than running anything. */
  const engineFor = (
    answer: (command: string) => Partial<ExecutionResult> | Error
  ): { engine: ExecutionEngine; started: string[] } => {
    const started: string[] = [];

    const engine = {
      execute: async (cmd: Command): Promise<ExecutionResult> => {
        const text = cmd.command ?? '';
        started.push(text);

        const scripted = answer(text);
        if (scripted instanceof Error) throw scripted;

        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
          signal: undefined,
          command: text,
          duration: 1,
          startedAt: new Date(),
          finishedAt: new Date(),
          adapter: 'mock',
          ...scripted,
        } as ExecutionResult;
      },
    } as unknown as ExecutionEngine;

    return { engine, started };
  };

  const ok = () => ({ exitCode: 0 });
  const bad = () => ({ exitCode: 1, ok: false });

  describe('what counts as success', () => {
    it('counts a zero exit with no signal', async () => {
      const { engine } = engineFor(ok);

      const result = await parallel(['a', 'b'], engine);

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('counts a non-zero exit as failure', async () => {
      const { engine } = engineFor(cmd => (cmd === 'b' ? bad() : ok()));

      const result = await parallel(['a', 'b'], engine);

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });

    it('counts a signalled process as failure even at exit zero', async () => {
      // A process killed by SIGKILL reports no exit code, and coalescing
      // that to zero made an OOM kill look like success.
      const { engine } = engineFor(() => ({ exitCode: 0, signal: 'SIGKILL', ok: undefined }));

      const result = await parallel(['a'], engine);

      expect(result.failed).toHaveLength(1);
    });

    it('falls back to the rule when an engine omits ok', async () => {
      // A custom engine may return a plain object. Reading a missing `ok`
      // as false would call every such result a failure.
      const { engine } = engineFor(() => ({ exitCode: 0, ok: undefined }));

      const result = await parallel(['a'], engine);

      expect(result.succeeded).toHaveLength(1);
    });

    it('counts a thrown error as failure', async () => {
      const { engine } = engineFor(cmd => (cmd === 'b' ? new Error('boom') : ok()));

      const result = await parallel(['a', 'b'], engine);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toBeInstanceOf(Error);
    });
  });

  describe('stopping on the first failure', () => {
    it('starts nothing more once one has failed', async () => {
      const { engine, started } = engineFor(cmd => (cmd === 'a' ? bad() : ok()));

      await parallel(['a', 'b', 'c'], engine, { stopOnError: true, maxConcurrency: 1 });

      expect(started).toEqual(['a']);
    });

    it('runs everything when not asked to stop', async () => {
      const { engine, started } = engineFor(cmd => (cmd === 'a' ? bad() : ok()));

      await parallel(['a', 'b', 'c'], engine, { stopOnError: false, maxConcurrency: 1 });

      expect(started).toEqual(['a', 'b', 'c']);
    });

    it('stops on a thrown error too', async () => {
      const { engine, started } = engineFor(cmd => (cmd === 'a' ? new Error('boom') : ok()));

      await parallel(['a', 'b', 'c'], engine, { stopOnError: true, maxConcurrency: 1 });

      expect(started).toEqual(['a']);
    });
  });

  describe('concurrency', () => {
    it('never exceeds the limit', async () => {
      let running = 0;
      let peak = 0;

      const engine = {
        execute: async (): Promise<ExecutionResult> => {
          running++;
          peak = Math.max(peak, running);
          await new Promise(resolve => setTimeout(resolve, 5));
          running--;
          return { exitCode: 0, ok: true } as ExecutionResult;
        },
      } as unknown as ExecutionEngine;

      await parallel(['a', 'b', 'c', 'd', 'e', 'f'], engine, { maxConcurrency: 2 });

      expect(peak).toBeLessThanOrEqual(2);
    });

    it('does not start more workers than there are commands', async () => {
      const { engine, started } = engineFor(ok);

      await parallel(['only'], engine, { maxConcurrency: 10 });

      expect(started).toEqual(['only']);
    });
  });

  describe('progress', () => {
    it('reports after each command, with the running tallies', async () => {
      const { engine } = engineFor(cmd => (cmd === 'b' ? bad() : ok()));
      const seen: Array<[number, number, number, number]> = [];

      await parallel(['a', 'b'], engine, {
        maxConcurrency: 1,
        onProgress: (done, total, good, badCount) => seen.push([done, total, good, badCount]),
      });

      expect(seen).toEqual([[1, 2, 1, 0], [2, 2, 1, 1]]);
    });
  });

  describe('the result itself', () => {
    it('keeps the results in the order the commands were given', async () => {
      const { engine } = engineFor(cmd => ({ exitCode: 0, stdout: cmd }));

      const result = await parallel(['a', 'b', 'c'], engine, { maxConcurrency: 3 });

      expect(result.results.map(r => (r as ExecutionResult).stdout)).toEqual(['a', 'b', 'c']);
    });

    it('reports how long the whole batch took', async () => {
      const { engine } = engineFor(ok);

      const result = await parallel(['a'], engine);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('handles an empty list without inventing a success', async () => {
      const { engine } = engineFor(ok);

      const result = await parallel([], engine);

      expect(result.results).toEqual([]);
      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });

  describe('the engine wrapper', () => {
    it('throws the first failure from all()', async () => {
      const { engine } = engineFor(() => new Error('the reason'));

      await expect(new ParallelEngine(engine).all(['a'])).rejects.toThrow('the reason');
    });

    it('returns the results when nothing failed', async () => {
      const { engine } = engineFor(ok);

      await expect(new ParallelEngine(engine).all(['a', 'b'])).resolves.toHaveLength(2);
    });

    it('answers every() with whether all of them succeeded', async () => {
      const good = engineFor(ok).engine;
      const mixed = engineFor(cmd => (cmd === 'b' ? bad() : ok())).engine;

      await expect(new ParallelEngine(good).every(['a', 'b'])).resolves.toBe(true);
      await expect(new ParallelEngine(mixed).every(['a', 'b'])).resolves.toBe(false);
    });

    it('answers some() with whether any of them succeeded', async () => {
      const mixed = engineFor(cmd => (cmd === 'b' ? bad() : ok())).engine;
      const allBad = engineFor(bad).engine;

      await expect(new ParallelEngine(mixed).some(['a', 'b'])).resolves.toBe(true);
      await expect(new ParallelEngine(allBad).some(['a', 'b'])).resolves.toBe(false);
    });
  });

  describe('the limited-concurrency path', () => {
    // A separate implementation from the unlimited one, reached only when
    // maxConcurrency is set — so every rule above has to be checked twice.

    it('runs a plain string command', async () => {
      const { engine, started } = engineFor(ok);

      const result = await parallel(['a', 'b'], engine, { maxConcurrency: 1 });

      expect(started).toEqual(['a', 'b']);
      expect(result.succeeded).toHaveLength(2);
    });

    it('runs everything when nothing fails', async () => {
      const { engine, started } = engineFor(ok);

      await parallel(['a', 'b', 'c'], engine, { stopOnError: true, maxConcurrency: 1 });

      expect(started).toEqual(['a', 'b', 'c']);
    });

    it('counts a non-zero exit as failure here too', async () => {
      const { engine } = engineFor(() => ({ exitCode: 1, ok: undefined }));

      const result = await parallel(['a'], engine, { maxConcurrency: 1 });

      expect(result.failed).toHaveLength(1);
      expect(result.succeeded).toHaveLength(0);
    });

    it('reports a duration that is an elapsed time', async () => {
      // `Date.now() - startTime`, not a sum of the two, which would report
      // a batch as having taken fifty-six years.
      const { engine } = engineFor(ok);

      const result = await parallel(['a'], engine, { maxConcurrency: 1 });

      expect(result.duration).toBeLessThan(60_000);
    });
  });

  describe('a result without ok', () => {
    it('is a failure when it exited non-zero', async () => {
      // The fallback rule has to answer both ways; reading it as success
      // would call every failure from a custom engine a success.
      const { engine } = engineFor(() => ({ exitCode: 3, ok: undefined }));

      const result = await parallel(['a'], engine);

      expect(result.failed).toHaveLength(1);
    });
  });

  describe('all()', () => {
    it('stops on the first failure', async () => {
      // `all` passes stopOnError itself; losing that would run the whole
      // batch before reporting the first failure.
      const { engine, started } = engineFor(cmd => (cmd === 'a' ? bad() : ok()));

      await expect(new ParallelEngine(engine).all(['a', 'b', 'c'], { maxConcurrency: 1 }))
        .rejects.toThrow();

      expect(started).toEqual(['a']);
    });

    it('passes the caller options through', async () => {
      let peak = 0;
      let running = 0;
      const engine = {
        execute: async (): Promise<ExecutionResult> => {
          running++;
          peak = Math.max(peak, running);
          await new Promise(resolve => setTimeout(resolve, 5));
          running--;
          return { exitCode: 0, ok: true } as ExecutionResult;
        },
      } as unknown as ExecutionEngine;

      await new ParallelEngine(engine).all(['a', 'b', 'c', 'd'], { maxConcurrency: 2 });

      expect(peak).toBeLessThanOrEqual(2);
    });
  });

  describe('every()', () => {
    it('stops on the first failure rather than running the rest', async () => {
      const { engine, started } = engineFor(cmd => (cmd === 'a' ? bad() : ok()));

      await expect(new ParallelEngine(engine).every(['a', 'b', 'c'], { maxConcurrency: 1 }))
        .resolves.toBe(false);

      expect(started).toEqual(['a']);
    });

    it('is true only when the failed list is empty', async () => {
      const { engine } = engineFor(ok);

      await expect(new ParallelEngine(engine).every(['a'])).resolves.toBe(true);
    });
  });

  describe('some()', () => {
    it('does not count a signalled process', async () => {
      // Killed by a signal with no exit code: the same rule the rest of
      // the file uses, or `some` answers true for a batch that was killed.
      const { engine } = engineFor(() => ({ exitCode: 0, signal: 'SIGKILL', ok: undefined }));

      await expect(new ParallelEngine(engine).some(['a', 'b'])).resolves.toBe(false);
    });

    it('is false when every command failed', async () => {
      const { engine } = engineFor(bad);

      await expect(new ParallelEngine(engine).some(['a', 'b', 'c'])).resolves.toBe(false);
    });

    it('is true when one succeeds among failures', async () => {
      const { engine } = engineFor(cmd => (cmd === 'c' ? ok() : bad()));

      await expect(new ParallelEngine(engine).some(['a', 'b', 'c'])).resolves.toBe(true);
    });

    it('is false when every command threw', async () => {
      const { engine } = engineFor(() => new Error('boom'));

      await expect(new ParallelEngine(engine).some(['a', 'b'])).resolves.toBe(false);
    });
  });
});
