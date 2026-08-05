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
 * Utilities attached to the default Prism instance
 */
export interface PrismUtilities {
  /** Create a new Prism instance with custom options */
  create: typeof createPrism;
  /** Prism instance bound to stderr */
  stderr: PrismBuilderInstance;
  /** Strip ANSI codes from a string */
  strip: (str: string) => string;
  /** Get the visible length of a string (ignoring ANSI codes) */
  stringLength: (str: string) => number;
  /** Check if colors are supported on stdout */
  supportsColor: () => boolean;
  /** Get the detected stdout color level */
  colorLevel: () => ColorLevel;
}

/**
 * The default Prism instance: a builder plus the attached utilities
 */
export type PrismInstance = PrismBuilderInstance & PrismUtilities;

/**
 * Default Prism instance
 */
const prism: PrismInstance = Object.assign(createPrism(), {
  create: createPrism,
  stderr: createPrismStderr(),
  strip: stripAnsi,
  stringLength,
  supportsColor: () => stdoutColor().level > 0,
  colorLevel: () => stdoutColor().level,
});

export default prism;
