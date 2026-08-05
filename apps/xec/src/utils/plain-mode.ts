/**
 * Output and prompt policy for non-interactive use.
 *
 * A pipe or a CI log must receive plain lines only — no spinner frames, no
 * cursor codes, no guide bars, no colour — so that `VAL=$(xec secrets get k)`
 * captures the value and nothing else. Prompts are the same decision on the
 * input side: a prompt drawn into a pipe waits forever for keys that cannot
 * arrive.
 */

/** Treat '', '0' and 'false' as unset: some runners export CI=false. */
const truthy = (value: string | undefined): boolean =>
  value !== undefined && value !== '' && value !== '0' && value !== 'false';

/** True when stdout expects plain lines: piped, NO_COLOR, or CI. */
export function isPlainOutput(): boolean {
  return !process.stdout.isTTY || truthy(process.env['NO_COLOR']) || truthy(process.env['CI']);
}

/** True when an interactive prompt can actually be answered. */
export function canPrompt(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true && !truthy(process.env['CI']);
}
