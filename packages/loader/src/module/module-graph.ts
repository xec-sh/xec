import type { ModuleFetcher } from './module-fetcher.js';
/** Owned native module graphs: local files and preverified remote ESM sources. */
import type { ModuleHooks, ResolveHookSync } from 'node:module';
import type { ModuleGraphLimits, ModuleFetchOptions, ModuleImportOptions } from '../types/index.js';

import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as nodeModule from 'node:module';
import { context as createBuildContext } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { diagnosticURL } from './module-integrity.js';
import { TypeScriptTransformer } from '../transform/typescript-transformer.js';

const graphParameter = '__xec_module_graph';
const graphFragment = '__xec_module_graph=';
const remoteProtocol = (url: URL): boolean => url.protocol === 'https:' || url.protocol === 'http:';

export interface ModuleGraphOptions {
  /** The same main-thread verified fetcher used by the owning ModuleLoader. */
  fetcher?: Pick<ModuleFetcher, 'fetch'>;
  limits?: ModuleGraphLimits;
}

interface RemoteSource { source: string; raw: string; bytes: number }

export class ModuleGraphError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'ModuleGraphError'; }
}

/**
 * One native hook owner for authored local files and verified remote snapshots.
 * Remote preparation parses dependency metadata, never executes a bundle.
 * Computed imports can use only previously prepared remote URLs. Their native
 * ESM identity is the final HTTP URL plus a private, never-fetched fragment.
 * Keep this owner alive through exported callbacks. Disposal removes hooks,
 * not effects or the runtime's ESM cache; use a fresh process for unbounded reloads.
 */
export class ModuleGraph {
  readonly sourceURL: string | undefined;
  private readonly identity = randomUUID();
  private readonly transformer = new TypeScriptTransformer(undefined, { sourcemap: 'inline' });
  private readonly fetcher: Pick<ModuleFetcher, 'fetch'> | undefined;
  private readonly limits: Required<ModuleGraphLimits>;
  private hooks: ModuleHooks | undefined;
  private readonly remote = new Map<string, RemoteSource>();
  private readonly aliases = new Map<string, string>();
  private preparation = Promise.resolve();
  private active = 0;

  constructor(source?: string | URL, options: ModuleGraphOptions = {}) {
    const sourceUrl = source === undefined ? undefined : source instanceof URL ? new URL(source.href)
      : /^(?:file|https?):/u.test(source) ? new URL(source) : pathToFileURL(resolve(source));
    if (sourceUrl && sourceUrl.protocol !== 'file:' && !remoteProtocol(sourceUrl)) throw new TypeError('Module graphs require a file or HTTP(S) URL');
    if (sourceUrl) this.assertUnmarked(sourceUrl);
    this.sourceURL = sourceUrl?.href;
    this.fetcher = options.fetcher;
    this.limits = {
      timeoutMs: options.limits?.timeoutMs ?? 30_000,
      maxNodes: options.limits?.maxNodes ?? 128,
      maxBytes: options.limits?.maxBytes ?? 32 * 1024 * 1024,
      concurrency: options.limits?.concurrency ?? 4,
    };
    for (const [name, minimum, maximum] of [
      ['timeoutMs', 1, 2_147_483_647], ['maxNodes', 1, 4096],
      ['maxBytes', 1, 64 * 1024 * 1024], ['concurrency', 1, 8],
    ] as const) {
      const value = this.limits[name];
      if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`Module graph ${name} must be an integer from ${minimum} to ${maximum}`);
    }
    if (typeof nodeModule.registerHooks !== 'function') {
      throw new ModuleGraphError('Module graphs require native module.registerHooks (Node.js >=22.15 or a compatible runtime)', 'MODULE_GRAPH_UNSUPPORTED');
    }
    this.hooks = nodeModule.registerHooks({
      resolve: this.resolveModule,
      load: (url, context, nextLoad) => {
        if (!this.owns(url)) return nextLoad(url, context);
        const authored = this.authored(url);
        if (remoteProtocol(new URL(authored))) {
          if (Object.keys(context.importAttributes).length) throw new ModuleGraphError('Remote ESM import attributes are unsupported', 'MODULE_FORMAT_UNSUPPORTED');
          const node = this.remote.get(authored);
          if (!node) throw this.notPrepared(authored);
          return { shortCircuit: true, format: 'module', source: node.source };
        }
        const filename = fileURLToPath(authored);
        if (!this.transformer.needsTransformation(filename)) return nextLoad(url, context);
        if (Object.keys(context.importAttributes).length) throw new TypeError('Import attributes are not supported for TypeScript command modules');
        const commonjs = filename.endsWith('.cts');
        return {
          shortCircuit: true, format: commonjs ? 'commonjs' : 'module',
          source: this.transformer.transformSync(readFileSync(filename, 'utf8'), filename, {
            platform: 'node', format: commonjs ? 'cjs' : 'esm',
          }),
        };
      },
    });
  }

  /** Prepare missing remote sources without evaluating any code. */
  async prepare(source = this.sourceURL, options: ModuleImportOptions = {}): Promise<string> {
    this.assertOpen();
    if (!source) throw new TypeError('A module graph entry is required');
    const url = new URL(source);
    this.assertUnmarked(url);
    options.signal?.throwIfAborted();
    if (url.protocol === 'file:') return url.href;
    if (!remoteProtocol(url)) throw new ModuleGraphError('Remote graph entries require HTTP(S)', 'MODULE_SCHEME_UNSUPPORTED');
    if (!this.fetcher) throw new TypeError('Remote module graphs require an explicit verified fetcher');
    url.hash = '';
    this.active++;
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const deadline = Date.now() + this.limits.timeoutMs;
    const timer = setTimeout(() => controller.abort(new DOMException('Module graph preparation timed out', 'TimeoutError')), this.limits.timeoutMs);
    const previous = this.preparation;
    const ready = new Promise<void>((resolveReady, rejectReady) => {
      const aborted = () => { controller.signal.removeEventListener('abort', aborted); rejectReady(controller.signal.reason); };
      controller.signal.addEventListener('abort', aborted, { once: true });
      previous.then(() => { controller.signal.removeEventListener('abort', aborted); resolveReady(); });
      if (controller.signal.aborted) aborted();
    });
    const operation = ready.then(() => this.prepareRemote(url.href, controller, deadline));
    const settled = operation.then(() => undefined, () => undefined);
    this.preparation = previous.then(() => settled);
    try { return await operation; }
    finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      this.active--;
    }
  }

  /** Import once per owner and canonical URL. Signals cancel preparation, never running JS/TLA. */
  async load(source = this.sourceURL, options: ModuleImportOptions = {}): Promise<Record<string, unknown>> {
    this.assertOpen();
    this.active++;
    try {
      const prepared = await this.prepare(source, options);
      options.signal?.throwIfAborted();
      return await import(this.identify(prepared));
    } finally { this.active--; }
  }

  /** Call after preparations, evaluations and graph-owned callbacks settle. */
  dispose(): void {
    if (this.active) throw new ModuleGraphError('Cannot dispose a module graph while an operation is active', 'MODULE_GRAPH_ACTIVE');
    this.hooks?.deregister();
    this.hooks = undefined;
    this.remote.clear();
    this.aliases.clear();
  }

  private assertOpen(): void {
    if (!this.hooks) throw new ModuleGraphError('Module graph has been disposed', 'MODULE_GRAPH_DISPOSED');
  }

  private assertUnmarked(url: URL): void {
    if (url.searchParams.has(graphParameter) || url.hash.startsWith(`#${graphFragment}`)) throw new TypeError('The source URL contains a reserved module graph parameter');
  }

  private notPrepared(url: string): ModuleGraphError {
    return new ModuleGraphError(`Remote module was not prepared: ${diagnosticURL(url)}`, 'MODULE_NOT_PREPARED');
  }

  private owns(value: string | undefined): boolean {
    if (!value || !/^(?:file|https?):/u.test(value)) return false;
    const url = new URL(value);
    return remoteProtocol(url) ? url.hash === `#${graphFragment}${this.identity}` : url.searchParams.get(graphParameter) === this.identity;
  }

  private identify(value: string): string {
    const url = new URL(value);
    if (remoteProtocol(url)) url.hash = graphFragment + this.identity;
    else url.searchParams.set(graphParameter, this.identity);
    return url.href;
  }

  private authored(value: string): string {
    if (!this.owns(value)) return value;
    const url = new URL(value);
    if (remoteProtocol(url)) url.hash = '';
    else url.searchParams.delete(graphParameter);
    return url.href;
  }

  private remoteDependency(specifier: string, parent: string): string {
    if (specifier.startsWith('node:') && nodeModule.isBuiltin(specifier)) return specifier;
    if (!/^(?:https?:|\.{1,2}\/|\/|\?|#)/u.test(specifier)) {
      throw new ModuleGraphError(`Remote ESM imports require HTTP(S) URLs or explicit node: builtins in ${diagnosticURL(parent)}`, 'MODULE_SCHEME_UNSUPPORTED');
    }
    const url = new URL(specifier, parent);
    this.assertUnmarked(url);
    if (!remoteProtocol(url)) throw new ModuleGraphError('Remote graph dependencies require HTTP(S)', 'MODULE_SCHEME_UNSUPPORTED');
    url.hash = '';
    return url.href;
  }

  private readonly resolveModule: ResolveHookSync = (specifier, context, nextResolve) => {
    const entry = this.owns(specifier);
    if (!entry && !this.owns(context.parentURL)) return nextResolve(specifier, context);
    const authored = this.authored(specifier);
    const parent = context.parentURL ? this.authored(context.parentURL) : undefined;
    if ((entry && remoteProtocol(new URL(authored))) || (parent && remoteProtocol(new URL(parent)))) {
      if (Object.keys(context.importAttributes).length) throw new ModuleGraphError('Remote ESM import attributes are unsupported', 'MODULE_FORMAT_UNSUPPORTED');
      const dependency = this.remoteDependency(authored, parent ?? authored);
      if (dependency.startsWith('node:')) return nextResolve(dependency, context);
      const canonical = this.aliases.get(dependency) ?? dependency;
      if (!this.remote.has(canonical)) throw this.notPrepared(dependency);
      return { shortCircuit: true, url: this.identify(canonical) };
    }
    // Local files keep native package conditions, attributes and CommonJS cache.
    const resolved = nextResolve(authored, { ...context, parentURL: parent });
    const local = entry || specifier.startsWith('./') || specifier.startsWith('../')
      || specifier.startsWith('/') || specifier.startsWith('file:') || specifier.startsWith('#');
    if (!local || !resolved.url.startsWith('file:')) return resolved;
    if (fileURLToPath(resolved.url).split(/[\\/]/).includes('node_modules')) return resolved;
    return { ...resolved, url: this.identify(resolved.url) };
  };

  private async prepareRemote(entry: string, controller: AbortController, deadline: number): Promise<string> {
    const { signal } = controller;
    signal.throwIfAborted();
    const known = this.aliases.get(entry) ?? entry;
    if (this.remote.has(known)) return known;
    const staged = new Map<string, RemoteSource>();
    const aliases = new Map<string, string>();
    const queue: string[] = [];
    const visited = new Set<string>(this.aliases.keys());
    let bytes = [...this.remote.values()].reduce((total, node) => total + node.bytes, 0);
    const enqueue = (url: string) => {
      if (url.startsWith('node:') || visited.has(url)) return;
      if (visited.size >= this.limits.maxNodes) throw new ModuleGraphError('Module graph exceeds its node limit', 'MODULE_GRAPH_LIMIT');
      visited.add(url); queue.push(url);
    };
    enqueue(entry);
    const failures: unknown[] = [];
    const pending = new Set<Promise<void>>();
    const work = async (url: string) => {
      signal.throwIfAborted();
      const options: ModuleFetchOptions = { signal, timeout: Math.max(1, deadline - Date.now()), maxBytes: Math.min(this.limits.maxBytes, 8 * 1024 * 1024) };
      const fetched = await this.fetcher!.fetch(url, options);
      signal.throwIfAborted();
      const final = new URL(fetched.url); this.assertUnmarked(final); final.hash = '';
      if (!remoteProtocol(final)) throw new ModuleGraphError('Verified fetch returned a non-HTTP URL', 'MODULE_SCHEME_UNSUPPORTED');
      aliases.set(url, final.href);
      const previous = staged.get(final.href) ?? this.remote.get(final.href);
      if (previous) {
        if (previous.raw !== fetched.content) throw new ModuleGraphError('A prepared URL returned different source bytes', 'MODULE_SOURCE_CHANGED');
        return;
      }
      const size = Buffer.byteLength(fetched.content, 'utf8');
      bytes += size;
      if (bytes > this.limits.maxBytes) throw new ModuleGraphError('Module graph exceeds its total source byte limit', 'MODULE_GRAPH_LIMIT');
      // Reserve before parsing so two aliases cannot compile/evaluate separate copies.
      const node = { raw: fetched.content, source: fetched.content, bytes: size };
      staged.set(final.href, node);
      aliases.set(final.href, final.href);
      visited.add(final.href);
      if (visited.size > this.limits.maxNodes) throw new ModuleGraphError('Module graph exceeds its node limit', 'MODULE_GRAPH_LIMIT');
      const parsed = await this.parse(fetched.content, final, signal);
      node.source = parsed.source;
      for (const specifier of parsed.imports) enqueue(this.remoteDependency(specifier, final.href));
    };
    while (queue.length || pending.size) {
      while (queue.length && pending.size < this.limits.concurrency && !signal.aborted) {
        const operation = work(queue.shift()!).catch(error => {
          if (!failures.includes(error)) failures.push(error);
          controller.abort(error);
        }).finally(() => pending.delete(operation));
        pending.add(operation);
      }
      if (!pending.size) break;
      await Promise.race(pending);
    }
    if (failures.length > 1) throw new AggregateError(failures, 'Remote graph preparation and cancellation failed', { cause: failures[0] });
    if (failures.length) throw failures[0];
    signal.throwIfAborted();
    for (const [url, node] of staged) this.remote.set(url, node);
    for (const [url, canonical] of aliases) this.aliases.set(url, canonical);
    return this.aliases.get(entry) ?? entry;
  }

  private async parse(raw: string, url: URL, signal: AbortSignal): Promise<{ source: string; imports: string[] }> {
    const pathname = url.pathname.toLowerCase();
    if (/\.(?:cjs|cts|json|css|wasm|html?|svg|png|jpe?g|gif|woff2?)$/u.test(pathname)) {
      throw new ModuleGraphError(`Remote module is not supported ESM source: ${diagnosticURL(url.href)}`, 'MODULE_FORMAT_UNSUPPORTED');
    }
    const loader = pathname.endsWith('.tsx') ? 'tsx' : pathname.endsWith('.jsx') ? 'jsx'
      : /\.[cm]?ts$/u.test(pathname) ? 'ts' : 'js';
    signal.throwIfAborted();
    const compiler = await createBuildContext({
      stdin: { contents: raw, sourcefile: diagnosticURL(url.href), loader },
      bundle: false, write: false, metafile: true, format: 'esm', platform: 'neutral',
      target: 'esnext', sourcemap: 'inline', treeShaking: false, logLevel: 'silent', tsconfigRaw: {},
    });
    let cancelled: Promise<void> | undefined;
    const cleanup: unknown[] = [];
    const cancel = () => { cancelled ??= compiler.cancel().catch(error => { cleanup.push(error); }); };
    signal.addEventListener('abort', cancel, { once: true });
    let result;
    let failure: unknown;
    let failed = false;
    try {
      if (signal.aborted) cancel();
      signal.throwIfAborted();
      result = await compiler.rebuild();
    } catch (error) {
      failure = signal.aborted ? signal.reason : error;
      failed = true;
    }
    signal.removeEventListener('abort', cancel);
    await cancelled;
    try { await compiler.dispose(); } catch (error) { cleanup.push(error); }
    if (cleanup.length) throw new AggregateError(failed ? [failure, ...cleanup] : cleanup, 'Module parsing cleanup failed', { cause: failed ? failure : cleanup[0] });
    if (failed) throw failure;
    signal.throwIfAborted();
    if (!result) throw new ModuleGraphError('Module parsing did not produce a result', 'MODULE_PARSE_FAILED');
    if (Object.values(result.metafile!.inputs).some(input => input.format === 'cjs')) throw new ModuleGraphError('Remote CommonJS/UMD source is unsupported; select an ESM URL', 'MODULE_FORMAT_UNSUPPORTED');
    const outputs = Object.values(result.metafile!.outputs);
    const imports = outputs.flatMap(output => output.imports);
    if (imports.some(item => item.kind === 'require-call' || item.kind === 'require-resolve')) throw new ModuleGraphError('Remote require() is unsupported; select an ESM URL', 'MODULE_FORMAT_UNSUPPORTED');
    return { source: loader === 'js' ? raw : result.outputFiles![0]!.text, imports: imports.map(item => item.path) };
  }
}
