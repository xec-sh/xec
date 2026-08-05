import { $ } from '../../src/index.js';

import type { CallableExecutionEngine } from '../../src/index.js';

/**
 * `$.verbose = true` is zx muscle memory and the release command's dry-run
 * switch. The set trap existed; the read half did not — a readback answered
 * undefined, indistinguishable from the silent no-op the trap was added to
 * kill. And the type surface never declared the property (nor a call
 * signature on interactive()'s return), so the IDE flagged working runtime
 * code as uncallable.
 */
describe('engine configuration properties on $', () => {
  afterEach(() => {
    $.verbose = false;
    $.quiet = false;
  });

  it('verbose reads back what was set', () => {
    expect($.verbose).toBe(false);

    $.verbose = true;
    expect($.verbose).toBe(true);

    $.verbose = false;
    expect($.verbose).toBe(false);
  });

  it('quiet reads back what was set', () => {
    $.quiet = true;
    expect($.quiet).toBe(true);
  });

  it('the declared type carries what the runtime honours', () => {
    // Compile-time half of the contract: assignments and the tag-call on
    // interactive() must type-check against the public surface — these
    // lines failing to compile is the regression this test exists for.
    const engine: CallableExecutionEngine = $;
    engine.verbose = true;
    const interactiveTag: CallableExecutionEngine = engine.interactive();

    expect(typeof interactiveTag).toBe('function');
    expect(engine.verbose).toBe(true);
  });
});
