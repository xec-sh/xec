/**
 * ExecutionContext manages the execution environment for scripts
 * @module @xec-sh/loader/core/execution-context
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type {
  TargetInfo,
  ScriptContext,
  ExecutionEngine,
  ExecutionContextOptions,
} from '../types/index.js';

/**
 * Per-run values, resolved through the async execution chain.
 *
 * Injected globals used to be plain writes to the shared globalThis, and a
 * parallel fan-out — one script, N targets, started together — raced on
 * them: the run addressed at host A read host B's `$target` and executed
 * there, and the first run to finish restored the globals out from under
 * every run still going, which then read `undefined` mid-flight. Both were
 * observed, not theorized.
 *
 * Now each injected name is a global accessor that resolves against the
 * store of the *current* async chain. `AsyncLocalStorage` follows awaits,
 * timers and dynamic import evaluation, so a script sees its own values
 * from its first line to its last.
 */
const runStore = new AsyncLocalStorage<Map<string, unknown>>();

/**
 * Stores of runs whose inject/restore was called directly, newest last.
 *
 * Two callers need values outside any `runStore.run` scope: tests and
 * embedders that drive injectGlobals/restoreGlobals by hand, and callbacks
 * a script detached from its own async chain (an EventEmitter wired to an
 * outside source). For a single run this reproduces the old behaviour
 * exactly; overlapping runs are only ever ambiguous here, never inside
 * their own chains.
 */
const fallbackStores: Map<string, unknown>[] = [];

/** Names already converted to accessors; conversion happens once each. */
const installedAccessors = new Map<string, PropertyDescriptor | undefined>();

function currentStore(): Map<string, unknown> | undefined {
  return runStore.getStore() ?? fallbackStores[fallbackStores.length - 1];
}

/**
 * Convert one global name into a run-scoped accessor.
 *
 * The pre-existing descriptor — a real value some other layer put on
 * globalThis — stays as the answer whenever no run in the current chain
 * carries the name, so injection still "shadows" and restoration still
 * "reveals", same as the old copy-and-put-back dance.
 */
function installAccessor(key: string): void {
  if (installedAccessors.has(key)) return;

  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  installedAccessors.set(key, original);

  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: original?.enumerable ?? true,
    get() {
      const store = currentStore();
      if (store?.has(key)) return store.get(key);
      if (original) {
        return original.get ? original.get.call(globalThis) : original.value;
      }
      return undefined;
    },
    set(value: unknown) {
      const store = currentStore();
      if (store) {
        store.set(key, value);
        return;
      }
      // No run anywhere: behave like the plain global this used to be.
      installedAccessors.delete(key);
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    },
  });
}

/**
 * ExecutionContext provides isolated execution environment for scripts
 */
export class ExecutionContext {
  private readonly options: ExecutionContextOptions;
  private store: Map<string, unknown> | null = null;

  constructor(options: ExecutionContextOptions = {}) {
    this.options = options;
  }

  /**
   * Get target information
   */
  getTargetInfo(): TargetInfo | undefined {
    return this.options.target;
  }

  /**
   * Get target execution engine
   */
  getTargetEngine(): ExecutionEngine | undefined {
    return this.options.targetEngine;
  }

  /**
   * Get script context
   */
  getScriptContext(): ScriptContext | undefined {
    return this.options.context;
  }

  /**
   * Get custom globals
   */
  getCustomGlobals(): Record<string, unknown> {
    return this.options.customGlobals || {};
  }

  /** Everything this run injects, as one per-run store. */
  private buildStore(): Map<string, unknown> {
    const store = new Map<string, unknown>();

    if (this.options.context) {
      store.set('__xecScriptContext', this.options.context);

      // The context is also the script's working vocabulary: `args` is what
      // the script was invoked with, `argv` the full shell convention,
      // `__filename`/`__dirname` its own location. These were promised by
      // the documentation and existed only inside __xecScriptContext — an
      // internal carrier nobody was told about — so every script that
      // followed the docs died on a ReferenceError.
      store.set('args', this.options.context.args);
      store.set('argv', this.options.context.argv);
      store.set('__filename', this.options.context.__filename);
      store.set('__dirname', this.options.context.__dirname);
    }

    if (this.options.target && this.options.targetEngine) {
      store.set('$target', this.options.targetEngine);
      store.set('$targetInfo', this.options.target);
    }

    if (this.options.customGlobals) {
      for (const [key, value] of Object.entries(this.options.customGlobals)) {
        store.set(key, value);
      }
    }

    return store;
  }

  /**
   * Inject globals into the environment
   */
  async injectGlobals(): Promise<void> {
    if (this.store) return;

    this.store = this.buildStore();
    for (const key of this.store.keys()) {
      installAccessor(key);
    }
    fallbackStores.push(this.store);
  }

  /**
   * Restore original globals
   */
  async restoreGlobals(): Promise<void> {
    if (!this.store) return;

    const index = fallbackStores.indexOf(this.store);
    if (index !== -1) fallbackStores.splice(index, 1);
    this.store = null;
  }

  /**
   * Execute function within this context
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.injectGlobals();

    try {
      // The store rides the async chain: everything `fn` awaits, schedules
      // or dynamically imports resolves the injected names against this
      // run's own values, however many runs are in flight.
      return await runStore.run(this.store!, fn);
    } finally {
      await this.restoreGlobals();
    }
  }

  /**
   * Dispose of this context
   */
  async dispose(): Promise<void> {
    await this.restoreGlobals();
  }
}
