import { ExecutionEngine, isRecoverable, classifyFailure } from '../../src/index.js';

import type {
  FailureKind,
  UshEventMap,
  ExecutionResult,
  CommandStartEvent,
  CallableExecutionEngine,
} from '../../src/index.js';

/**
 * The types a consumer needs must be reachable from the package root.
 *
 * These were internal, so a consuming project — strictly typed everywhere
 * else — was reduced to `private engine: any` and `(event: any)` on every
 * handler. This file fails to compile if any of them stops being exported,
 * which is the only way a type-only regression can be caught.
 */
describe('public type surface', () => {
  it('lets a consumer type an event handler', () => {
    const engine = new ExecutionEngine();
    const seen: string[] = [];

    // If UshEventMap were unexported, this parameter would have to be `any`.
    const onStart = (event: UshEventMap['command:start']): void => {
      seen.push(event.command);
      // envKeys, not env: the values are deliberately not published.
      expect(Array.isArray(event.envKeys) || event.envKeys === undefined).toBe(true);
    };

    engine.on('command:start', onStart);
    expect(engine.listenerCount('command:start')).toBe(1);

    engine.off('command:start', onStart);
    expect(seen).toEqual([]);
  });

  it('exposes the individual event interfaces', () => {
    const event: CommandStartEvent = {
      command: 'echo hi',
      timestamp: new Date(),
      adapter: 'local',
      envKeys: ['PATH'],
    };

    expect(event.command).toBe('echo hi');
  });

  it('exposes the failure classification as a usable union', () => {
    const kind: FailureKind = classifyFailure({ code: 'ECONNRESET' });
    expect(kind).toBe('connection-lost');
    expect(isRecoverable(kind)).toBe(true);
  });

  it('exposes the engine and result types by name', () => {
    // Compile-time assertions: these alias declarations are the test.
    const assertEngine = (value: CallableExecutionEngine): CallableExecutionEngine => value;
    const assertResult = (value: ExecutionResult): number => value.exitCode;

    expect(typeof assertEngine).toBe('function');
    expect(typeof assertResult).toBe('function');
  });
});
