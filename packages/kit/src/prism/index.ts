/**
 * Prism - Advanced terminal color system
 *
 * @module prism
 */

import { PrismBuilder } from './core/builder.js';
import prismDefault, { createPrism, createPrismStderr } from './core/prism.js';

export { ColorLevel } from './utils/supports.js';
// Re-export utilities
export { hasAnsi, stringLength, stripAnsi as strip } from './utils/ansi.js';
export { parseColor, getCssColor, isValidColor, getCssColorNames } from './color/parser.js';

export { stdoutColor, stderrColor, isColorEnabled, getBestColorMethod } from './utils/supports.js';

export {
  mixRgb,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
  rgbToLab,
  labToRgb,
  rgbToLch,
  lchToRgb,
  hexToRgb,
  rgbToHex,
  luminance,
  contrastRatio,
} from './color/spaces.js';

// Re-export types
export type { PrismOptions } from './core/prism.js';

export type { RGB, HSL, HSV, LAB, LCH } from './color/spaces.js';

// Export main API
export { createPrism, PrismBuilder, createPrismStderr };
export const prism = prismDefault;
export default prism;
