/**
 * Variable Interpolation Engine
 * Handles ${var}, ${env.VAR}, ${cmd:command}, ${secret:key}, ${secrets.key}, ${params.name}
 */

import type { Configuration, VariableContext } from './types.js';

import { $ } from '@xec-sh/core';

import { SecretManager } from '../secrets/index.js';

/**
 * Variable reference types
 */
type VariableType = 'vars' | 'env' | 'cmd' | 'secret' | 'params';

/**
 * Parsed variable reference
 */
interface VariableReference {
  type: VariableType;
  path: string;
  defaultValue?: string;
  raw: string;
}

/**
 * Options controlling how interpolation handles references that cannot be resolved.
 */
export interface InterpolateOptions {
  /**
   * Behaviour for references that resolve to `undefined` and have no default value:
   * - 'error' (default): throw a descriptive error. The literal `${...}` text is
   *   never silently passed on to a command, password field, or config value.
   * - 'keep': leave the original `${...}` text in place. Intended for previews
   *   (e.g. task explain) and deferred resolution, never for execution paths.
   */
  onUndefined?: 'error' | 'keep';

  /**
   * Reference types that are kept as literal text when unresolvable even in
   * 'error' mode. Used for load-time config resolution, where `${params.*}`
   * references are only resolvable later, at task runtime.
   */
  lenientTypes?: readonly VariableType[];
}

interface ResolvedInterpolateOptions {
  onUndefined: 'error' | 'keep';
  lenientTypes: readonly VariableType[];
}

const DEFAULT_OPTIONS: ResolvedInterpolateOptions = {
  onUndefined: 'error',
  lenientTypes: [],
};

/**
 * Variable interpolator implementation
 */
export class VariableInterpolator {
  private static readonly VARIABLE_REGEX = /(?<!\\)\$\{([^}]+)\}/g;
  private static readonly ESCAPED_VARIABLE_REGEX = /\\(\$\{[^}]+\})/g;
  private static readonly MAX_DEPTH = 10;
  private secretsCache: Map<string, string> = new Map();
  private secretManager?: SecretManager;

  constructor(secretManager?: SecretManager) {
    this.secretManager = secretManager;
  }

  /**
   * Interpolate variables in a string.
   *
   * By default an unresolvable reference throws; pass
   * `{ onUndefined: 'keep' }` to leave unresolvable references as literal text.
   */
  interpolate(value: string, context: VariableContext, options?: InterpolateOptions): string {
    if (typeof value !== 'string') {
      return value;
    }

    const opts = this.resolveOptions(options);

    // Track resolved variables to detect circular references
    const resolving = new Set<string>();

    const result = this.interpolateWithDepth(value, context, resolving, 0, opts);
    return this.unescape(result);
  }

  /**
   * Async version of interpolate that supports command execution and secret providers
   */
  async interpolateAsync(
    value: string,
    context: VariableContext,
    options?: InterpolateOptions
  ): Promise<string> {
    if (typeof value !== 'string') {
      return value;
    }

    const opts = this.resolveOptions(options);

    // Track resolved variables to detect circular references
    const resolving = new Set<string>();

    const result = await this.interpolateWithDepthAsync(value, context, resolving, 0, opts);
    return this.unescape(result);
  }

  /**
   * Resolve a single variable reference (the text between `${` and `}`) to its
   * raw value, preserving its type (string/number/boolean/object).
   *
   * Used by the condition evaluator so that `${vars.count} > 3` compares
   * numbers rather than stringified text. Synchronous: `${cmd:...}` references
   * are rejected with a clear error.
   */
  resolveValue(reference: string, context: VariableContext, options?: InterpolateOptions): unknown {
    const opts = this.resolveOptions(options);
    const value = this.resolveVariable(reference, context, opts);

    if (value === undefined) {
      const match = `\${${reference}}`;
      const kept = this.handleUnresolved(match, reference, opts, 'sync');
      // In 'keep' mode a value context has nothing meaningful to keep — report undefined.
      return kept === match ? undefined : kept;
    }

    if (typeof value === 'string' && this.hasVariables(value)) {
      return this.interpolate(value, context, options);
    }

    if (typeof value === 'string') {
      return this.unescape(value);
    }

    return value;
  }

  /**
   * Resolve variables in entire configuration object
   */
  async resolveConfig(
    config: Configuration,
    context: VariableContext,
    options?: InterpolateOptions
  ): Promise<Configuration> {
    const opts = this.resolveOptions(options);

    // First pass: resolve vars section itself
    if (config.vars) {
      config.vars = await this.resolveObject(config.vars, {
        ...context,
        vars: config.vars
      }, opts);

      // Update context with resolved vars
      context.vars = config.vars;
    }

    // Second pass: resolve the rest of the config. The vars section must not
    // be interpolated again — its escape backslashes were already stripped by
    // the first pass, so a second pass would resolve `\${...}` references the
    // user asked to keep literal.
    const { vars: resolvedVars, ...rest } = config;
    const resolved = await this.resolveObject(rest, context, opts) as Configuration;
    if (resolvedVars) {
      resolved.vars = resolvedVars;
    }
    return resolved;
  }

  /**
   * Check if a value contains variables
   */
  hasVariables(value: any): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Create a new regex instance to avoid lastIndex issues
    const regex = new RegExp(VariableInterpolator.VARIABLE_REGEX.source, VariableInterpolator.VARIABLE_REGEX.flags);
    return regex.test(value);
  }

  /**
   * Parse variable references from a string
   */
  parseVariables(value: string): VariableReference[] {
    const references: VariableReference[] = [];
    const regex = new RegExp(VariableInterpolator.VARIABLE_REGEX);
    let match;

    while ((match = regex.exec(value)) !== null) {
      if (match[1]) {
        const ref = this.parseReference(match[1]);
        if (ref) {
          references.push({
            ...ref,
            raw: match[0]
          });
        }
      }
    }

    return references;
  }

  // Private methods

  private resolveOptions(options?: InterpolateOptions): ResolvedInterpolateOptions {
    return {
      onUndefined: options?.onUndefined ?? DEFAULT_OPTIONS.onUndefined,
      lenientTypes: options?.lenientTypes ?? DEFAULT_OPTIONS.lenientTypes,
    };
  }

  /**
   * Strip the escape backslash from `\${...}` sequences so escaped references
   * render as literal `${...}` text instead of keeping the backslash.
   */
  private unescape(value: string): string {
    return value.replace(VariableInterpolator.ESCAPED_VARIABLE_REGEX, '$1');
  }

  /**
   * Decide what to do with an unresolvable reference: keep the literal text
   * (lenient modes) or throw a descriptive error.
   */
  private handleUnresolved(
    match: string,
    inner: string,
    opts: ResolvedInterpolateOptions,
    mode: 'sync' | 'async'
  ): string {
    if (opts.onUndefined === 'keep') {
      return match;
    }

    const parsed = this.parseReference(inner);
    if (parsed && opts.lenientTypes.includes(parsed.type)) {
      return match;
    }

    throw new Error(this.unresolvedMessage(match, inner, mode, parsed));
  }

  private unresolvedMessage(
    match: string,
    inner: string,
    mode: 'sync' | 'async',
    parsed: Omit<VariableReference, 'raw'> | null
  ): string {
    if (!parsed) {
      return `Invalid variable reference '${match}'. Expected forms: \${vars.name}, \${env.NAME}, \${params.name}, \${secrets.name}, \${secret:name} or \${cmd:command}.`;
    }

    switch (parsed.type) {
      case 'vars':
        return `Unable to resolve '${match}': variable '${parsed.path}' is not defined and no default value was provided (use \${${inner}:default} to supply one).`;
      case 'env':
        return `Unable to resolve '${match}': environment variable '${parsed.path}' is not set and no default value was provided (use \${${inner}:default} to supply one).`;
      case 'params':
        return `Unable to resolve '${match}': parameter '${parsed.path}' was not provided and has no default value.`;
      case 'secret': {
        const syncHint = mode === 'sync'
          ? ` Synchronous lookup only checks context.secrets, the cache and the SECRET_${parsed.path.toUpperCase().replace(/[.-]/g, '_')} environment variable; if this secret lives in a provider, use interpolateAsync().`
          : '';
        return `Unable to resolve '${match}': secret '${parsed.path}' not found.${syncHint}`;
      }
      case 'cmd':
        return `Unable to resolve '${match}': command substitution produced no value.`;
      default:
        return `Unable to resolve '${match}'.`;
    }
  }

  private interpolateWithDepth(
    value: string,
    context: VariableContext,
    resolving: Set<string>,
    depth: number,
    opts: ResolvedInterpolateOptions
  ): string {
    if (depth > VariableInterpolator.MAX_DEPTH) {
      throw new Error(`Maximum variable interpolation depth (${VariableInterpolator.MAX_DEPTH}) exceeded`);
    }

    // The replacer-function form of String.replace is immune to `$&`/`$1`
    // pattern expansion in the substituted value.
    return value.replace(VariableInterpolator.VARIABLE_REGEX, (match, inner: string) => {
      // Check for circular reference
      if (resolving.has(match)) {
        throw new Error(`Circular variable reference detected: ${match}`);
      }

      resolving.add(match);

      try {
        const resolved = this.resolveVariable(inner, context, opts);

        if (resolved === undefined) {
          return this.handleUnresolved(match, inner, opts, 'sync');
        }

        // Recursively interpolate the resolved value
        if (typeof resolved === 'string' && this.hasVariables(resolved)) {
          return this.interpolateWithDepth(resolved, context, resolving, depth + 1, opts);
        }

        return String(resolved);
      } finally {
        resolving.delete(match);
      }
    });
  }

  private async interpolateWithDepthAsync(
    value: string,
    context: VariableContext,
    resolving: Set<string>,
    depth: number,
    opts: ResolvedInterpolateOptions
  ): Promise<string> {
    if (depth > VariableInterpolator.MAX_DEPTH) {
      throw new Error(`Maximum variable interpolation depth (${VariableInterpolator.MAX_DEPTH}) exceeded`);
    }

    const regex = new RegExp(VariableInterpolator.VARIABLE_REGEX.source, VariableInterpolator.VARIABLE_REGEX.flags);

    // Build the output in a single left-to-right pass. This avoids both the
    // O(n^2) rescan of String.replace-per-match and the `$&`/`$1` pattern
    // expansion that string-form replacement applies to substituted values.
    let result = '';
    let lastIndex = 0;

    for (const match of value.matchAll(regex)) {
      const fullMatch = match[0];
      const inner = match[1];
      const index = match.index;

      if (inner === undefined || index === undefined) {
        continue;
      }

      result += value.slice(lastIndex, index);
      lastIndex = index + fullMatch.length;

      // Check circular reference
      if (resolving.has(fullMatch)) {
        throw new Error(`Circular variable reference detected: ${fullMatch}`);
      }

      resolving.add(fullMatch);

      try {
        const resolved = await this.resolveVariableAsync(inner, context, opts);

        if (resolved === undefined) {
          result += this.handleUnresolved(fullMatch, inner, opts, 'async');
          continue;
        }

        // Recursively interpolate the resolved value
        if (typeof resolved === 'string' && this.hasVariables(resolved)) {
          result += await this.interpolateWithDepthAsync(resolved, context, resolving, depth + 1, opts);
        } else {
          result += String(resolved);
        }
      } finally {
        resolving.delete(fullMatch);
      }
    }

    result += value.slice(lastIndex);
    return result;
  }

  private parseReference(reference: string): Omit<VariableReference, 'raw'> | null {
    // Handle default values: ${var:defaultValue}
    const colonIndex = reference.indexOf(':');
    let path = reference;
    let defaultValue: string | undefined;

    if (colonIndex !== -1) {
      const prefix = reference.substring(0, colonIndex);

      // Check if it's a command or secret reference
      if (prefix === 'cmd' || prefix === 'secret' || prefix === 'secrets') {
        // For cmd: and secret:/secrets:, everything after : is the path
        return {
          type: prefix === 'cmd' ? 'cmd' : 'secret',
          path: reference.substring(colonIndex + 1),
          defaultValue: undefined
        };
      } else {
        // Otherwise, it's a default value
        path = prefix;
        defaultValue = reference.substring(colonIndex + 1);
      }
    }

    // Parse the path
    const parts = path.split('.');
    const firstPart = parts[0];

    // Determine type
    let type: VariableType;
    let actualPath: string;

    switch (firstPart) {
      case 'vars':
      case 'env':
      case 'params':
        type = firstPart;
        actualPath = parts.slice(1).join('.');
        break;

      case 'secret':
      case 'secrets':
        // Dotted secret namespace: ${secrets.name} / ${secret.name}
        type = 'secret';
        actualPath = parts.slice(1).join('.');
        if (!actualPath) {
          return null;
        }
        break;

      case 'cmd':
        // ${cmd.something} is invalid — command substitution requires ${cmd:command}
        return null;

      default:
        // Default to vars
        type = 'vars';
        actualPath = path;
    }

    return {
      type,
      path: actualPath,
      defaultValue
    };
  }

  private resolveVariable(
    reference: string,
    context: VariableContext,
    opts: ResolvedInterpolateOptions
  ): any {
    const parsed = this.parseReference(reference);
    if (!parsed) {
      return undefined;
    }

    let value: any;

    switch (parsed.type) {
      case 'vars':
        value = this.getByPath(context.vars || {}, parsed.path);
        break;

      case 'env':
        value = context.env ? context.env[parsed.path] : process.env[parsed.path];
        break;

      case 'cmd':
        // Command execution is not possible in synchronous interpolation.
        if (opts.onUndefined === 'error' && !opts.lenientTypes.includes('cmd')) {
          throw new Error(`Cannot resolve '\${cmd:${parsed.path}}' synchronously: command substitution requires interpolateAsync().`);
        }
        value = undefined;
        break;

      case 'secret':
        value = this.getSecretSync(parsed.path, context);
        break;

      case 'params':
        value = this.getByPath(context.params || {}, parsed.path);
        break;
    }

    // Use default value if undefined
    if (value === undefined && parsed.defaultValue !== undefined) {
      value = parsed.defaultValue;
    }

    return value;
  }

  private async resolveVariableAsync(
    reference: string,
    context: VariableContext,
    opts: ResolvedInterpolateOptions
  ): Promise<any> {
    const parsed = this.parseReference(reference);
    if (!parsed) {
      return undefined;
    }

    let value: any;

    switch (parsed.type) {
      case 'vars':
        value = this.getByPath(context.vars || {}, parsed.path);
        break;

      case 'env':
        value = context.env ? context.env[parsed.path] : process.env[parsed.path];
        break;

      case 'cmd':
        value = await this.executeCommandAsync(parsed.path, opts);
        break;

      case 'secret':
        value = await this.getSecretAsync(parsed.path, context, opts);
        break;

      case 'params':
        value = this.getByPath(context.params || {}, parsed.path);
        break;
    }

    // Use default value if undefined
    if (value === undefined && parsed.defaultValue !== undefined) {
      value = parsed.defaultValue;
    }

    return value;
  }

  private async resolveObject(
    obj: any,
    context: VariableContext,
    opts: ResolvedInterpolateOptions
  ): Promise<any> {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.interpolateAsync(obj, context, opts);
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => this.resolveObject(item, context, opts)));
    }

    if (typeof obj === 'object') {
      const resolved: any = {};

      for (const [key, value] of Object.entries(obj)) {
        // Handle special $unset marker
        if (value === '$unset') {
          continue;
        }

        // Resolve key (in case it contains variables)
        const resolvedKey = await this.interpolateAsync(key, context, opts);

        // Resolve value
        resolved[resolvedKey] = await this.resolveObject(value, context, opts);
      }

      return resolved;
    }

    return obj;
  }

  private async executeCommandAsync(
    command: string,
    opts: ResolvedInterpolateOptions
  ): Promise<string | undefined> {
    const strict = opts.onUndefined === 'error' && !opts.lenientTypes.includes('cmd');

    try {
      // Execute command in shell mode for proper shell interpretation
      const trimmedCommand = command.trim();
      // Use $.raw to avoid escaping the command string, with shell enabled
      const result = await $.raw`${trimmedCommand}`.shell(true).nothrow();

      // Check if command failed
      if (!result.ok) {
        const detail = result.stderr?.trim() || `exit code ${result.exitCode}`;
        if (strict) {
          throw new Error(`Command substitution '\${cmd:${command}}' failed: ${detail}`);
        }
        console.warn(`Command substitution failed for '${command}': ${detail}`);
        return undefined;
      }

      return result.stdout.trim();
    } catch (error) {
      if (strict) {
        throw error instanceof Error
          ? error
          : new Error(`Command substitution '\${cmd:${command}}' failed: ${String(error)}`);
      }
      console.warn(`Command substitution failed for '${command}': ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private getSecretSync(key: string, context: VariableContext): string | undefined {
    // Explicitly provided secrets take precedence
    if (context.secrets && context.secrets[key] !== undefined) {
      return context.secrets[key];
    }

    // Check cache next
    if (this.secretsCache.has(key)) {
      return this.secretsCache.get(key)!;
    }

    // In sync context, fall back to environment variables
    const envKey = `SECRET_${key.toUpperCase().replace(/[.-]/g, '_')}`;
    const value = process.env[envKey];

    if (value !== undefined) {
      this.secretsCache.set(key, value);
      return value;
    }

    return undefined;
  }

  private async getSecretAsync(
    key: string,
    context: VariableContext,
    opts: ResolvedInterpolateOptions
  ): Promise<string | undefined> {
    // Explicitly provided secrets take precedence
    if (context.secrets && context.secrets[key] !== undefined) {
      return context.secrets[key];
    }

    // Check cache next
    if (this.secretsCache.has(key)) {
      return this.secretsCache.get(key)!;
    }

    // Try secret manager first
    if (this.secretManager) {
      try {
        const value = await this.secretManager.get(key);
        if (value !== null) {
          this.secretsCache.set(key, value);
          return value;
        }
      } catch (error) {
        const message = `Failed to retrieve secret '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`;
        if (opts.onUndefined === 'error' && !opts.lenientTypes.includes('secret')) {
          throw new Error(message);
        }
        console.warn(message);
      }
    }

    // Fall back to environment variables
    const envKey = `SECRET_${key.toUpperCase().replace(/[.-]/g, '_')}`;
    const value = process.env[envKey];

    if (value !== undefined) {
      this.secretsCache.set(key, value);
      return value;
    }

    return undefined;
  }

  private getByPath(obj: any, path: string): any {
    if (!path) {
      return obj;
    }

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Clear secrets cache
   */
  clearSecretsCache(): void {
    this.secretsCache.clear();
  }
}
