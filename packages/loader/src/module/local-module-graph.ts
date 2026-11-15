/** Local ESM graphs keep their authored paths and native package resolution. */
import type { ModuleHooks, ResolveHookSync } from 'node:module';

import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as nodeModule from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { TypeScriptTransformer } from '../transform/typescript-transformer.js';

const graphParameter = '__xec_module_graph';

/**
 * A bounded owner for local JS/TS command modules and their deferred imports.
 *
 * Requires Node's synchronous module hooks (Node >=22.15); constructing this
 * capability on an unsupported runtime fails without changing other loaders.
 * Each graph adds a private query to local file URLs for a fresh ESM identity.
 * The file path, relative imports and native import.meta are not rewritten.
 * Bare packages and CommonJS retain Node's ordinary cache and export conditions.
 *
 * Keep the graph alive until every callback that may import a module settles.
 * dispose() removes its hooks, not Node's ESM cache or already executed effects.
 * Do not invoke graph-owned callbacks after disposal. For unbounded reloads use
 * a fresh process, so the native ESM registry is reclaimed as well.
 */
export class LocalModuleGraph {
  readonly sourceURL: string;
  private readonly identity = randomUUID();
  private readonly transformer = new TypeScriptTransformer(undefined, { sourcemap: 'inline' });
  private hooks: ModuleHooks | undefined;

  constructor(source: string | URL) {
    const sourceUrl = source instanceof URL ? new URL(source.href)
      : source.startsWith('file:') ? new URL(source) : pathToFileURL(resolve(source));
    if (sourceUrl.protocol !== 'file:') throw new TypeError('Local module graphs require a file URL or filesystem path');
    if (sourceUrl.searchParams.has(graphParameter)) throw new TypeError('The source URL contains a reserved module graph parameter');
    this.sourceURL = sourceUrl.href;
    if (typeof nodeModule.registerHooks !== 'function') {
      throw new Error('Local TypeScript command graphs require Node.js >=22.15 with module.registerHooks');
    }
    this.hooks = nodeModule.registerHooks({
      resolve: this.resolveModule,
      load: (url, context, nextLoad) => {
        if (!this.owns(url)) return nextLoad(url, context);
        const filename = fileURLToPath(url);
        if (!this.transformer.needsTransformation(filename)) return nextLoad(url, context);
        if (Object.keys(context.importAttributes).length > 0) {
          throw new TypeError('Import attributes are not supported for TypeScript command modules');
        }
        const commonjs = filename.endsWith('.cts');
        return {
          shortCircuit: true,
          format: commonjs ? 'commonjs' : 'module',
          source: this.transformer.transformSync(readFileSync(filename, 'utf8'), filename, {
            platform: 'node', format: commonjs ? 'cjs' : 'esm',
          }),
        };
      },
    });
  }

  /** Import this graph's entry once; repeated calls share this graph's module. */
  async load(): Promise<Record<string, unknown>> {
    if (!this.hooks) throw new Error('Local module graph has been disposed');
    return import(this.identify(this.sourceURL));
  }

  /** Release only this graph's hooks after its actions and callbacks settle. */
  dispose(): void {
    this.hooks?.deregister();
    this.hooks = undefined;
  }

  private owns(value: string | undefined): boolean {
    return !!value && value.startsWith('file:') && new URL(value).searchParams.get(graphParameter) === this.identity;
  }

  private identify(value: string): string {
    const url = new URL(value);
    url.searchParams.set(graphParameter, this.identity);
    return url.href;
  }

  private authored(value: string): string {
    if (!this.owns(value)) return value;
    const url = new URL(value);
    url.searchParams.delete(graphParameter);
    return url.href;
  }

  private readonly resolveModule: ResolveHookSync = (specifier, context, nextResolve) => {
    const entry = this.owns(specifier);
    if (!entry && !this.owns(context.parentURL)) return nextResolve(specifier, context);
    // Ask Node to resolve from the original directory, preserving all native
    // export conditions, import attributes, symlink and package rules.
    const resolved = nextResolve(this.authored(specifier), {
      ...context,
      parentURL: context.parentURL ? this.authored(context.parentURL) : context.parentURL,
    });
    const local = entry || specifier.startsWith('./') || specifier.startsWith('../')
      || specifier.startsWith('/') || specifier.startsWith('file:') || specifier.startsWith('#');
    if (!local || !resolved.url.startsWith('file:')) return resolved;
    // Dependencies stay shared even when explicitly imported through a path.
    if (fileURLToPath(resolved.url).split(/[\\/]/).includes('node_modules')) return resolved;
    return { ...resolved, url: this.identify(resolved.url) };
  };
}
