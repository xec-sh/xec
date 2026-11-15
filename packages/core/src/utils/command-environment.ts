import type { Command } from '../types/command.js';

type EnvironmentScope = Pick<Command, 'env' | 'envMode'>;

/** Resolve explicit replacement before defaults or lazy caching erase input ownership. */
export function resolveEnvironmentPolicy(
  scopes: readonly (EnvironmentScope | undefined)[],
): EnvironmentScope {
  const envMode = scopes.find(scope => scope?.envMode !== undefined)?.envMode;
  if (envMode !== 'replace') return { envMode };
  // A replacement boundary with no map means {}, not an inherited preset.
  const owner = scopes.find(scope => scope?.env !== undefined || scope?.envMode !== undefined);
  return { envMode, env: { ...owner?.env } };
}
