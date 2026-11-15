import type { Configuration } from './types.js';

import { isDeepStrictEqual } from 'node:util';

import { deepMerge, getConfigValue, assertConfigData } from './utils.js';

/** Configuration-level defaults only. CLI options and adapters own theirs. */
export function getDefaultConfig(): Configuration {
  return { version: '1.0', targets: { local: { type: 'local' } } };
}

export const ROOT_KEY_ORDER = [
  'version', 'name', 'description', 'targets', 'commands', 'secrets',
  'vars', 'tasks', 'profiles', 'scripts',
] as const;

/** Preserve authored values while presenting the known sections consistently. */
export function sortConfigKeys<T>(config: T): T {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return config;
  assertConfigData(config);
  const keys = [...ROOT_KEY_ORDER.filter(key => Object.hasOwn(config, key)),
    ...Object.keys(config).filter(key => !ROOT_KEY_ORDER.some(known => known === key))];
  return Object.fromEntries(keys.map(key => [key, (config as Record<string, unknown>)[key]])) as T;
}

export function mergeWithDefaults<T extends object>(config: T): T & Configuration;
export function mergeWithDefaults<T extends object, D extends object>(config: T, defaults: D): T & D;
export function mergeWithDefaults(config: object, defaults: object = getDefaultConfig()): object {
  return deepMerge(defaults, config, { skipUndefined: true });
}

export function isDefaultValue(valuePath: string, value: unknown, defaults: object = getDefaultConfig()): boolean {
  const configured = getConfigValue(defaults, valuePath);
  return configured !== undefined && isDeepStrictEqual(configured, value);
}
