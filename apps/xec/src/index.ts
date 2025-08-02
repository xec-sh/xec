/**
 * @xec-sh/cli - Xec Command Line Interface
 * 
 * Public API exports for programmatic usage
 */

// Export programmatic APIs
export * from './api/index.js';

// Export types
export * from './api/types.js';

// Re-export core functionality from @xec-sh/core
export { $ } from '@xec-sh/core';
// Export utilities that might be useful for extensions
export { createTargetEngine } from './utils/direct-execution.js';

export { UnifiedModuleLoader } from './utils/unified-module-loader.js';