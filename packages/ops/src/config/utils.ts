/**
 * Configuration utilities
 */

import path from "path";
import { homedir } from "os";

/**
 * Deep merge objects
 * Arrays are replaced, not merged
 * Special key $unset removes keys
 * Special key $merge forces array concatenation
 */
export function deepMerge(target: any, source: any, options?: { skipUndefined?: boolean }): any {
  if (source === null || source === undefined) {
    return target;
  }

  if (target === null || target === undefined) {
    return source;
  }

  // Handle primitives and functions
  if (typeof source !== 'object' || typeof target !== 'object') {
    return source;
  }

  // Handle arrays - replace by default
  if (Array.isArray(source)) {
    // Check for special $merge marker
    if (Array.isArray(target) && source[0] === '$merge') {
      return [...target, ...source.slice(1)];
    }
    return source;
  }

  // Handle objects
  const result: any = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];

    // Skip undefined values if requested
    if (options?.skipUndefined && sourceValue === undefined) {
      continue;
    }

    // Handle $unset marker
    if (sourceValue === '$unset') {
      delete result[key];
      continue;
    }

    // Handle arrays with $merge marker
    if (Array.isArray(sourceValue)) {
      if (Array.isArray(result[key]) && sourceValue[0] === '$merge') {
        result[key] = [...result[key], ...sourceValue.slice(1)];
      } else {
        result[key] = sourceValue;
      }
    }
    // Recursively merge objects
    else if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], sourceValue, options);
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Convert duration string to milliseconds
 * Supports: 100 (ms), '100ms', '30s', '5m', '1h'
 */
export function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') {
    return duration;
  }

  const match = duration.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1] || '0', 10);
  const unit = match[2] || 'ms';

  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Format duration from milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/**
 * Parse memory size string to bytes
 * Supports: 512 (bytes), '512B', '1KB', '100MB', '2GB'
 */
export function parseMemorySize(size: string | number): number {
  if (typeof size === 'number') {
    return size;
  }

  const match = size.match(/^(\d+)([A-Z]*)?$/i);
  if (!match) {
    throw new Error(`Invalid memory size format: ${size}`);
  }

  const value = parseInt(match[1] || '0', 10);
  const unit = (match[2] || 'B').toUpperCase();

  switch (unit) {
    case 'B':
      return value;
    case 'K':
    case 'KB':
      return value * 1024;
    case 'M':
    case 'MB':
      return value * 1024 * 1024;
    case 'G':
    case 'GB':
      return value * 1024 * 1024 * 1024;
    default:
      throw new Error(`Unknown memory size unit: ${unit}`);
  }
}

/**
 * Check if a string is a valid target reference
 */
export function isValidTargetReference(ref: string): boolean {
  // Check for type prefix format (e.g., docker:container, pod:name)
  if (ref.includes(':')) {
    const parts = ref.split(':', 2);
    const type = parts[0] || '';
    const name = parts[1] || '';
    return ['docker', 'pod', 'ssh'].includes(type) && !!name && name.length > 0;
  }

  // Check for dot notation (e.g., hosts.web-1, containers.app)
  if (ref.includes('.')) {
    const firstDotIndex = ref.indexOf('.');
    const type = ref.substring(0, firstDotIndex);
    const name = ref.substring(firstDotIndex + 1);

    // Check if it's a known target type
    if (['hosts', 'containers', 'pods', 'local'].includes(type)) {
      return !!name && name.length > 0;
    }

    // Common TLDs to distinguish hostnames from target references
    const commonTLDs = ['com', 'org', 'net', 'io', 'dev', 'app', 'co', 'me', 'info', 'biz'];
    const lastDotIndex = ref.lastIndexOf('.');
    const possibleTLD = ref.substring(lastDotIndex + 1);

    // If it ends with a common TLD, it's likely a hostname
    if (commonTLDs.includes(possibleTLD.toLowerCase())) {
      return true;
    }

    // If it looks like it might be a target reference (e.g., "unknown.something")
    // with a single dot and the first part is all lowercase letters
    const dotCount = (ref.match(/\./g) || []).length;
    if (dotCount === 1 && type.match(/^[a-z]+$/) && name.match(/^[a-z][a-z0-9-]*$/)) {
      // This looks like a target reference with unknown type
      return false;
    }

    // Multi-dot patterns or patterns with special chars are treated as hostnames
    // (fall through)
  }

  // Special case for local
  if (ref === 'local') {
    return true;
  }

  // Otherwise, it should be a direct reference (hostname or container name)
  return ref.length > 0;
}

/**
 * Parse target reference into components
 */
export function parseTargetReference(ref: string): {
  type: 'hosts' | 'containers' | 'pods' | 'local' | 'auto';
  name?: string;
  isWildcard: boolean;
} {
  // Handle local
  if (ref === 'local') {
    return { type: 'local', isWildcard: false };
  }

  // Handle type prefix format
  if (ref.includes(':')) {
    const parts = ref.split(':', 2);
    const prefix = parts[0] || '';
    const name = parts[1] || '';
    const typeMap: Record<string, 'hosts' | 'containers' | 'pods'> = {
      'ssh': 'hosts',
      'docker': 'containers',
      'pod': 'pods',
      'kubernetes': 'pods'
    };

    return {
      type: typeMap[prefix] || 'auto',
      name,
      isWildcard: !!name && (name.includes('*') || name.includes('?'))
    };
  }

  // Handle dot notation
  if (ref.includes('.')) {
    const firstDotIndex = ref.indexOf('.');
    const type = ref.substring(0, firstDotIndex);
    const name = ref.substring(firstDotIndex + 1);

    if (['hosts', 'containers', 'pods'].includes(type)) {
      return {
        type: type as 'hosts' | 'containers' | 'pods',
        name,
        isWildcard: !!name && (name.includes('*') || name.includes('?'))
      };
    }
  }

  // Auto-detect type
  return {
    type: 'auto',
    name: ref,
    isWildcard: ref.includes('*') || ref.includes('?')
  };
}

/**
 * Match pattern against string (supports * and ? wildcards)
 */
export function matchPattern(pattern: string, str: string): boolean {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .split('*').map(part => part.split('?').map(escapeRegex).join('.'))
    .join('.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Expand brace expressions
 * Example: "web-{1,2,3}" -> ["web-1", "web-2", "web-3"]
 */
export function expandBraces(pattern: string): string[] {
  const match = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);
  if (!match) {
    return [pattern];
  }

  const [, prefix, items, suffix] = match;
  const expanded: string[] = [];

  if (!items) {
    return [pattern];
  }

  for (const item of items.split(',')) {
    const trimmed = item.trim();

    // Handle ranges like {1..3}
    const rangeMatch = trimmed.match(/^(\d+)\.\.(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1] || '0', 10);
      const end = parseInt(rangeMatch[2] || '0', 10);

      for (let i = start; i <= end; i++) {
        expanded.push(`${prefix || ''}${i}${suffix || ''}`);
      }
    } else {
      expanded.push(`${prefix || ''}${trimmed}${suffix || ''}`);
    }
  }

  // Recursively expand nested braces
  return expanded.flatMap(item => expandBraces(item));
}

/**
 * Flatten nested object to dot notation
 * Example: { a: { b: 1 } } -> { 'a.b': 1 }
 */
export function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, fullKey));
    } else {
      flattened[fullKey] = value;
    }
  }

  return flattened;
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return !!(
    process.env['CI'] ||
    process.env['GITHUB_ACTIONS'] ||
    process.env['GITLAB_CI'] ||
    process.env['CIRCLECI'] ||
    process.env['JENKINS_URL'] ||
    process.env['TEAMCITY_VERSION']
  );
}

/**
 * Get default shell based on platform
 */
export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env['COMSPEC'] || 'cmd.exe';
  }

  return process.env['SHELL'] || '/bin/sh';
}

/**
 * Get the global xec configuration directory
 * Defaults to ~/.xec, can be overridden with XEC_HOME_DIR environment variable
 */
export function getGlobalConfigDir(): string {
  return process.env['XEC_HOME_DIR'] || path.join(homedir(), '.xec');
}

/**
 * Get the module cache directory
 * Used for storing cached npm modules and dependencies
 */
export function getModuleCacheDir(): string {
  return path.join(getGlobalConfigDir(), 'module-cache');
}

/**
 * Get the secrets storage directory
 * Used for storing encrypted secrets locally
 */
export function getSecretsDir(): string {
  return path.join(getGlobalConfigDir(), 'secrets');
}