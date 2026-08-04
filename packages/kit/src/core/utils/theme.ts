import prism from '../../prism/index.js';

/**
 * The kit's colour roles.
 *
 * Components never name colours; they name what a thing *is* — focused,
 * running, failed — and the theme decides how that looks. Before this layer
 * existed the palette had drifted: prompts focused in cyan, the spinner spun
 * in magenta, `log.info` dotted in blue, each chosen at its call site and
 * none aware of the others. Restyling the kit meant editing every component.
 *
 * One object now carries the whole visual identity, and `updateSettings`
 * swaps it atomically.
 */
export interface KitTheme {
  /** Focus and selection: the active step, the highlighted option. */
  accent(text: string): string;
  /** Motion: spinner frames, progress fill. The brand pairs a violet with
   * the accent cyan, so live work reads differently from a settled focus. */
  activity(text: string): string;
  /** A completed step, a passing state. */
  success(text: string): string;
  /** Needs attention, not failed. */
  warning(text: string): string;
  /** Failed, cancelled, invalid. */
  error(text: string): string;
  /** Neutral information. */
  info(text: string): string;
  /** Structure: bars, frames, hints, disabled entries. */
  muted(text: string): string;
}

/**
 * The default identity: the xec brand pair over a conventional status triad.
 *
 * accent cyan and activity magenta are the terminal's stand-ins for the brand
 * gradient (#22D3EE → #6D3BF5); green/yellow/red keep their universal
 * meanings; structure stays grey so content carries the colour.
 */
export const DEFAULT_THEME: KitTheme = {
  accent: prism.cyan,
  activity: prism.magenta,
  success: prism.green,
  warning: prism.yellow,
  error: prism.red,
  info: prism.blue,
  muted: prism.gray,
};
