import { PassThrough } from 'node:stream';

import { REPLServer } from '../../../src/repl/repl-server.js';

/**
 * Stopping a REPL gives the input stream back.
 *
 * Node's `repl.close()` leaves its own listeners attached: five start/stop
 * cycles left five `data` listeners on stdin, and the tenth tripped
 * MaxListenersExceededWarning — a warning for a real leak, since a host that
 * opens a REPL more than once accumulates them for the life of the process.
 */
describe('a stopped REPL releases its input', () => {
  const counts = (stream: PassThrough): Record<string, number> =>
    Object.fromEntries(stream.eventNames().map(e => [String(e), stream.listenerCount(e)]));

  const serverOn = (input: PassThrough): REPLServer =>
    new REPLServer({
      showWelcome: false,
      replOptions: { input, output: new PassThrough(), terminal: false },
    });

  it('leaves no listener behind after a cycle', () => {
    const input = new PassThrough();
    const before = counts(input);

    const server = serverOn(input);
    server.start();
    server.stop();

    expect(counts(input)).toEqual(before);
  });

  it('does not accumulate across many cycles', () => {
    const input = new PassThrough();

    for (let i = 0; i < 12; i++) {
      const server = serverOn(input);
      server.start();
      server.stop();
    }

    // Ten is where Node starts warning; the old code reached it at the
    // tenth cycle and kept going.
    expect(input.listenerCount('data')).toBeLessThan(10);
    expect(input.listenerCount('end')).toBeLessThan(10);
  });

  it('keeps a listener the caller attached while it ran', () => {
    // The listeners removed are the ones `start` attached, recorded then —
    // not whatever is new at close time. An application that subscribes
    // during a session keeps its subscription.
    const input = new PassThrough();
    const mine = (): void => {};

    const server = serverOn(input);
    server.start();
    input.on('data', mine);
    server.stop();

    expect(input.listeners('data')).toContain(mine);
  });
});
