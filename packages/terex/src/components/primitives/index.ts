/**
 * Primitive components - the basic building blocks
 * These are the simplest components that all other components are built from
 */

// Text component
export { Text, text, createText, styledText, centeredText } from './text.js';
// Space component
export { Space, space, vSpace, hSpace, emptyLine, separator, createSpace } from './space.js';

// Line component
export { 
  Line, 
  hLine,
  vLine,
  divider, 
  createLine, 
  LINE_CHARS, 
  customLine, 
  heavyDivider, 
  doubleDivider 
} from './line.js';
export type { TextState, TextOptions } from './text.js';

export type { SpaceState, SpaceOptions } from './space.js';
export type { LineState, LineStyle, LineOptions } from './line.js';