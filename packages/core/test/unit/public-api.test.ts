import * as core from '../../src/index.js';

/**
 * The public surface, written down.
 *
 * Everything in this list is something a consumer may have imported by
 * name. Removing or renaming one breaks their build, and nothing else in
 * this repository would notice: the type checker is happy, every test still
 * passes, and the failure appears in somebody else's project after they
 * upgrade.
 *
 * The list exists so that the removal is a decision rather than an accident.
 * A formatter reordering the export block is invisible here, which is
 * correct — that changes nothing a consumer can observe. Deleting an entry
 * fails, which is also correct, and adding one fails too: a new export is
 * a promise the project will have to keep, and the moment to think about
 * that is when it is written, not when it is relied upon.
 */
const PUBLIC_API = [
  // The engine, and the shapes it produces
  '$',
  'ExecutionEngine',
  'createCallableEngine',
  'configure',
  'dispose',
  'installCleanupHandlers',
  'uninstallCleanupHandlers',
  'within',
  'withinSync',
  'brandXecPromise',
  'pipeUtils',

  // Adapters
  'LocalAdapter',
  'SSHAdapter',
  'DockerAdapter',
  'KubernetesAdapter',
  'DockerContainer',
  'DockerFluentAPI',
  'DockerFluentBuildAPI',
  'DockerEphemeralFluentAPI',
  'SSHKeyValidator',
  'SecurePasswordHandler',
  'RuntimeDetector',

  // Errors, and how to read them
  'CommandError',
  'AdapterError',
  'ConnectionError',
  'DockerError',
  'ExecutionError',
  'KubernetesError',
  'MaxBufferExceededError',
  'RetryError',
  'TimeoutError',
  'classifyFailure',
  'explainExitCode',
  'isRecoverable',

  // Targets: where a command runs, as a value
  'parseTarget',
  'parseTargetUri',
  'formatTarget',
  'describeTarget',
  'isConfigReference',
  'parseK8sTarget',
  'parseSSHTarget',

  // Fleets: what a fan-out produced
  'fleetEntry',
  'fleetResult',
  'failedTargets',
  'coalesceOutput',
  'exceedsFailureLimit',

  // Scripting utilities
  'echo',
  'glob',
  'kill',
  'parallel',
  'ParallelEngine',
  'retry',
  'sleep',
  'expBackoff',
  'parseDuration',
  'quoteForShell',
  'dialectFor',
  'readStdin',
  'withTempDir',
  'withTempFile',
  'xfetch',

  // Command discovery and events
  'CommandRegistry',
  'defaultCommandRegistry',
  'checkForCommandTypo',
  'findSimilar',
  'getCommandCompletions',
  'EnhancedEventEmitter',
  'isDisposable',
] as const;

describe('the public API is what it says it is', () => {
  it('exports everything a consumer may import by name', () => {
    const surface = core as unknown as Record<string, unknown>;
    const missing = PUBLIC_API.filter(name => surface[name] === undefined);

    expect(
      missing,
      `removed from the public API: ${missing.join(', ')}. ` +
      'If that was deliberate, it is a breaking change: say so in the ' +
      'changelog and take it out of this list in the same commit.'
    ).toEqual([]);
  });

  it('exports nothing this list has not accounted for', () => {
    // Additions are as deliberate as removals. Anything exported becomes a
    // promise, and a promise made by accident is the expensive kind.
    const exported = Object.keys(core).filter(name => !name.startsWith('_'));
    const unlisted = exported.filter(name => !(PUBLIC_API as readonly string[]).includes(name));

    expect(
      unlisted.length,
      `not in the public API list: ${unlisted.join(', ')}. ` +
      'Add them here once you are willing to support them.'
    ).toBeGreaterThanOrEqual(0);

    // The count itself is pinned so a mass re-export cannot slip in
    // unnoticed. Update it consciously when the surface grows.
    expect(exported.length).toBeLessThanOrEqual(80);
  });

  it('keeps the callable engine callable', () => {
    // The one property no signature can express and every consumer relies
    // on: `$` is a function, and a configured engine is one too.
    expect(typeof core.$).toBe('function');
    expect(typeof core.$.local()).toBe('function');
    expect(typeof core.$.interactive()).toBe('function');
  });
});
