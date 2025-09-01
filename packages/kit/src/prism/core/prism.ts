/**
 * Main Prism class and factory
 */

import { stripAnsi, stringLength } from '../utils/ansi.js';
import { ColorLevel, stdoutColor, stderrColor } from '../utils/supports.js';
import { PrismBuilder, BuilderOptions, PrismBuilderInstance } from './builder.js';

export interface PrismOptions {
  level?: ColorLevel;
  enabled?: boolean;
}

/**
 * Create a Prism instance
 */
export function createPrism(options: PrismOptions = {}): PrismBuilderInstance {
  const detectedLevel = stdoutColor().level;

  const builderOptions: BuilderOptions = {
    level: options.level !== undefined ? options.level : detectedLevel,
    enabled: options.enabled !== undefined ? options.enabled : true,
  };

  // Respect NO_COLOR environment variable
  if (process.env['NO_COLOR']) {
    builderOptions.enabled = false;
  }

  // Respect FORCE_COLOR environment variable
  if (process.env['FORCE_COLOR'] === '0' || process.env['FORCE_COLOR'] === 'false') {
    builderOptions.enabled = false;
  }

  return new PrismBuilder(builderOptions) as PrismBuilderInstance;
}

/**
 * Create a Prism instance for stderr
 */
export function createPrismStderr(options: PrismOptions = {}): PrismBuilderInstance {
  const detectedLevel = stderrColor().level;

  const builderOptions: BuilderOptions = {
    level: options.level !== undefined ? options.level : detectedLevel,
    enabled: options.enabled !== undefined ? options.enabled : true,
  };

  return new PrismBuilder(builderOptions) as PrismBuilderInstance;
}

/**
 * Default Prism instance
 */
const prism = createPrism();

// Export utility functions on the default instance
Object.assign(prism, {
  /**
   * Create a new Prism instance with custom options
   */
  create: createPrism,

  /**
   * Create a Prism instance for stderr
   */
  stderr: createPrismStderr(),

  /**
   * Strip ANSI codes from a string
   */
  strip: stripAnsi,

  /**
   * Get the visible length of a string (ignoring ANSI codes)
   */
  stringLength,

  /**
   * Check if colors are supported
   */
  supportsColor: () => stdoutColor().level > 0,

  /**
   * Get the current color level
   */
  colorLevel: () => stdoutColor().level,
});

export default prism;
