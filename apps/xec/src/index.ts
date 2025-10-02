/**
 * @xec-sh/cli - Xec Command Line Interface
 * 
 * ✨ Simplified Import Experience
 * 
 * Just use:
 * ```typescript
 * import '@xec-sh/cli';
 * ```
 * 
 * This single import provides:
 * - All @xec-sh/core functionality ($ and all types)
 * - All CLI utilities (echo, spinner, etc.)
 * - Global type definitions for IntelliSense
 * - No need for separate imports!
 */

// ========================================
// SIDE EFFECTS: Load globals for IntelliSense
// ========================================
import './globals.js';

// ========================================
// RE-EXPORT EVERYTHING FROM CORE
// ========================================
export * from '@xec-sh/core';

// Re-export ModuleLoader from @xec-sh/loader
export { ModuleLoader } from '@xec-sh/loader';

// Re-export external utilities from script-utils
import { default as scriptUtils } from './utils/script-utils.js';

export const fs = scriptUtils.fs;
export const os = scriptUtils.os;
export const glob = scriptUtils.glob;
export const path = scriptUtils.path;
export const fetch = scriptUtils.fetch;
export const which = scriptUtils.which;

// ========================================
// EXPORT ADVANCED UTILITIES
// ========================================
export { createTargetEngine } from './utils/direct-execution.js';
// ========================================
// RE-EXPORT CLI SCRIPT UTILITIES
// ========================================
// These are already exported in globals.ts, but we re-export here
// for programmatic usage when importing the module
export {
  ps,
  cd,
  env,
  csv,
  pwd,
  log,
  kit,
  echo,
  exit,
  kill,
  yaml,
  diff,
  sleep,
  retry,
  quote,
  prism,
  within,
  setEnv,
  tmpdir,
  spinner,
  tmpfile,
  loadEnv,
  template,
  parseArgs,
} from './utils/script-utils.js';

// ========================================
// RE-EXPORT GLOBAL NAMESPACE
// ========================================
// The namespace is already defined in globals.ts via declare global
// We just re-export it here for consistency with the import pattern
export type { Xec } from './globals.js';

// ========================================
// RE-EXPORT CLI-SPECIFIC TYPES
// ========================================
export type {
  TargetType,
  TargetConfig,
  Configuration,
  CommandConfig,
  ResolvedTarget,
} from './config/types.js';