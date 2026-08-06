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
// The one star export left in the workspace, and deliberate: it re-exports
// another *package*, whose surface is itself explicit and reviewed where it
// is declared. The rule against `export *` is about not letting your own
// surface be decided by whatever a neighbouring file happens to declare;
// enumerating core's exports here would be a copy that drifts.
export * from '@xec-sh/core';

// ========================================
// RE-EXPORT GLOBAL NAMESPACE
// ========================================
// The namespace is already defined in globals.ts via declare global
// We just re-export it here for consistency with the import pattern
export type { Xec } from './globals.js';

// Re-export external utilities from script-utils
import {
  fs,
  os,
  glob,
  path,
  fetch,
  which,
} from '@xec-sh/ops';

export { fs, os, glob, path, fetch, which };

// Re-export ModuleLoader from @xec-sh/loader
export { ModuleLoader } from '@xec-sh/loader';
// ========================================
// EXPORT ADVANCED UTILITIES
// ========================================
export { createTargetEngine } from '@xec-sh/ops';

// ========================================
// RE-EXPORT CLI-SPECIFIC TYPES
// ========================================
export type {
  TargetType,
  TargetConfig,
  Configuration,
  CommandConfig,
  ResolvedTarget,
} from '@xec-sh/ops';

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
} from '@xec-sh/ops';