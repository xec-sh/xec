/**
 * Variable Interpolation Engine
 * Handles ${var}, ${env.VAR}, ${cmd:command}, ${secret:key}, ${params.name}
 */

import { $ } from '@xec-sh/core';

import { SecretManager } from '../secrets/index.js';

import type { Configuration, VariableContext } from './types.js';

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
 * Variable interpolator implementation
 */
export class VariableInterpolator {
  private static readonly VARIABLE_REGEX = /(?<!\\)\$\{([^}]+)\}/g;
  private static readonly MAX_DEPTH = 10;
  private secretsCache: Map<string, string> = new Map();
  private secretManager?: SecretManager;

  constructor(secretManager?: SecretManager) {
    this.secretManager = secretManager;
  }

  /**
   * Interpolate variables in a string
   */
  interpolate(value: string, context: VariableContext): string {
    if (typeof value !== 'string') {
      return value;
    }

    // Track resolved variables to detect circular references
    const resolving = new Set<string>();

    return this.interpolateWithDepth(value, context, resolving, 0);
  }

  /**
   * Async version of interpolate that supports command execution
   */
  async interpolateAsync(value: string, context: VariableContext): Promise<string> {
    if (typeof value !== 'string') {
      return value;
    }

    // Track resolved variables to detect circular references
    const resolving = new Set<string>();

    return this.interpolateWithDepthAsync(value, context, resolving, 0);
  }

  /**
   * Resolve variables in entire configuration object
   */
  async resolveConfig(config: Configuration, context: VariableContext): Promise<Configuration> {
    // First pass: resolve vars section itself
    if (config.vars) {
      config.vars = await this.resolveObject(config.vars, {
        ...context,
        vars: config.vars
      });

      // Update context with resolved vars
      context.vars = config.vars;
    }

    // Second pass: resolve rest of config
    const resolved = await this.resolveObject(config, context);
    return resolved as Configuration;
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

  private interpolateWithDepth(
    value: string,
    context: VariableContext,
    resolving: Set<string>,
    depth: number
  ): string {
    if (depth > VariableInterpolator.MAX_DEPTH) {
      throw new Error(`Maximum variable interpolation depth (${VariableInterpolator.MAX_DEPTH}) exceeded`);
    }

    return value.replace(VariableInterpolator.VARIABLE_REGEX, (match, inner) => {
      // Check for circular reference
      if (resolving.has(match)) {
        throw new Error(`Circular variable reference detected: ${match}`);
      }

      resolving.add(match);

      try {
        const resolved = this.resolveVariable(inner, context);

        // If undefined, return the original template unchanged
        if (resolved === undefined) {
          return match;
        }

        // Recursively interpolate the resolved value
        if (typeof resolved === 'string' && this.hasVariables(resolved)) {
          return this.interpolateWithDepth(resolved, context, resolving, depth + 1);
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
    depth: number
  ): Promise<string> {
    if (depth > VariableInterpolator.MAX_DEPTH) {
      throw new Error(`Maximum variable interpolation depth (${VariableInterpolator.MAX_DEPTH}) exceeded`);
    }

    const regex = new RegExp(VariableInterpolator.VARIABLE_REGEX.source, 'g');
    const matches = Array.from(value.matchAll(regex));
    let result = value;

    for (const match of matches) {
      const fullMatch = match[0];
      const inner = match[1];

      if (!inner) {
        continue;
      }

      // Check circular reference
      if (resolving.has(fullMatch)) {
        throw new Error(`Circular variable reference detected: ${fullMatch}`);
      }

      resolving.add(fullMatch);

      try {
        const resolved = await this.resolveVariableAsync(inner, context);

        // If undefined, leave the original template unchanged
        if (resolved === undefined) {
          continue;
        }

        // Recursively interpolate the resolved value
        let finalValue = String(resolved);
        if (typeof resolved === 'string' && this.hasVariables(resolved)) {
          finalValue = await this.interpolateWithDepthAsync(resolved, context, resolving, depth + 1);
        }

        result = result.replace(fullMatch, finalValue);
      } finally {
        resolving.delete(fullMatch);
      }
    }

    return result;
  }

  private parseReference(reference: string): Omit<VariableReference, 'raw'> | null {
    // Handle default values: ${var:defaultValue}
    const colonIndex = reference.indexOf(':');
    let path = reference;
    let defaultValue: string | undefined;

    if (colonIndex !== -1) {
      const prefix = reference.substring(0, colonIndex);

      // Check if it's a command substitution
      if (prefix === 'cmd' || prefix === 'secret') {
        // For cmd: and secret:, everything after : is the path
        return {
          type: prefix as VariableType,
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

      case 'cmd':
      case 'secret':
        // These should have been handled above
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

  private resolveVariable(reference: string, context: VariableContext): any {
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
        // Command execution not supported in synchronous interpolation
        console.warn(`Command substitution '${parsed.path}' not supported in synchronous context. Use interpolateAsync() instead.`);
        value = `[cmd:${parsed.path}]`;
        break;

      case 'secret':
        // For synchronous context, use cached value or warn
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

  private async resolveVariableAsync(reference: string, context: VariableContext): Promise<any> {
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
        value = await this.executeCommandAsync(parsed.path);
        break;

      case 'secret':
        value = await this.getSecretAsync(parsed.path, context);
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

  private async resolveObject(obj: any, context: VariableContext): Promise<any> {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.interpolateAsync(obj, context);
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map(item => this.resolveObject(item, context)));
    }

    if (typeof obj === 'object') {
      const resolved: any = {};

      for (const [key, value] of Object.entries(obj)) {
        // Handle special $unset marker
        if (value === '$unset') {
          continue;
        }

        // Resolve key (in case it contains variables)
        const resolvedKey = await this.interpolateAsync(key, context);

        // Resolve value
        resolved[resolvedKey] = await this.resolveObject(value, context);
      }

      return resolved;
    }

    return obj;
  }

  private async executeCommandAsync(command: string): Promise<string> {
    try {
      // Execute command in shell mode for proper shell interpretation
      const trimmedCommand = command.trim();
      // Use $.raw to avoid escaping the command string, with shell enabled
      const result = await $.raw`${trimmedCommand}`.shell(true).nothrow();

      // Check if command failed
      if (!result.ok) {
        console.warn(`Command substitution failed for '${command}': ${result.stderr || `Exit code ${result.exitCode}`}`);
        return '';
      }

      return result.stdout.trim();
    } catch (error: any) {
      console.warn(`Command substitution failed for '${command}': ${error.message}`);
      return '';
    }
  }

  private getSecretSync(key: string, context: VariableContext): string {
    // Check cache first
    if (this.secretsCache.has(key)) {
      return this.secretsCache.get(key)!;
    }

    // In sync context, fall back to environment variables
    const envKey = `SECRET_${key.toUpperCase().replace(/[.-]/g, '_')}`;
    const value = process.env[envKey];

    if (value) {
      this.secretsCache.set(key, value);
      return value;
    }

    console.warn(`Secret '${key}' not available in synchronous context. Use interpolateAsync() instead.`);
    return `[secret:${key}]`;
  }

  private async getSecretAsync(key: string, context: VariableContext): Promise<string> {
    // Check cache first
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
        console.warn(`Failed to retrieve secret '${key}' from secret manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Fall back to environment variables
    const envKey = `SECRET_${key.toUpperCase().replace(/[.-]/g, '_')}`;
    const value = process.env[envKey];

    if (value) {
      this.secretsCache.set(key, value);
      return value;
    }

    console.warn(`Secret '${key}' not found`);
    return '';
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