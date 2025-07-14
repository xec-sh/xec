/**
 * Xec Standard Library
 * 
 * A collection of built-in modules providing common functionality
 * for infrastructure automation and orchestration.
 */

// Export specific items to avoid conflicts
import type { Module } from '../core/types.js';

// Export module instances
export { default as coreModule } from './core/index.js';
export { default as fileModule } from './file/index.js';
export { default as systemModule } from './system/index.js';

// Standard library module collection
import coreModule from './core/index.js';
import fileModule from './file/index.js';
import systemModule from './system/index.js';

export const stdlibModules: Record<string, Module> = {
  '@xec/stdlib-core': coreModule,
  '@xec/stdlib-system': systemModule,
  '@xec/stdlib-file': fileModule
};

// Helper to load all stdlib modules
export async function loadStandardLibrary() {
  const modules = [];

  for (const [name, module] of Object.entries(stdlibModules)) {
    // Modules no longer have setup method
    modules.push(module);
  }

  return modules;
}

// Helper to get a specific stdlib module
export function getStdlibModule(name: string) {
  return stdlibModules[name];
}

// Helper to list all available stdlib modules
export function listStdlibModules() {
  return Object.keys(stdlibModules);
}