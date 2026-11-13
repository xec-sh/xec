/**
 * Adapted from Clack (https://github.com/bombshell-dev/clack).
 *
 * Copyright (c) Nate Moore
 * Licensed under the MIT License. See the NOTICE file at the root of this
 * package for the full attribution and license text.
 */

/**
 * Find the next non-disabled cursor position with wraparound.
 * If delta is 0, returns the current cursor if enabled, otherwise finds the next enabled option.
 */
export function findCursor<T extends { disabled?: boolean }>(
  cursor: number,
  delta: number,
  options: readonly T[]
): number {
  if (options.length === 0) return 0;
  const max = options.length - 1;
  const requested = cursor + delta;
  let next = requested < 0 ? max : requested > max ? 0 : requested;
  const direction = delta < 0 ? -1 : 1;
  for (let checked = 0; checked < options.length; checked++) {
    if (!options[next]?.disabled) return next;
    next = (next + direction + options.length) % options.length;
  }
  return Math.max(0, Math.min(max, cursor));
}

/**
 * Move a cursor within a multi-line string by (deltaX, deltaY), treating the
 * cursor as an offset into `value`. Horizontal moves flow across line breaks,
 * vertical moves keep the column where possible and clamp to the target
 * line's length. The result is always a valid offset within `value`.
 */
export function findTextCursor(
  cursor: number,
  deltaX: number,
  deltaY: number,
  value: string
): number {
  // `split` always yields at least one line and cursorY is clamped to the
  // line count below, so the `?? 0` fallbacks never fire at runtime.
  const lines = value.split('\n');
  const lineLength = (index: number): number => lines[index]?.length ?? 0;
  let cursorY = 0;
  let cursorX = cursor;

  for (const line of lines) {
    if (cursorX <= line.length) {
      break;
    }
    cursorX -= line.length + 1;
    cursorY++;
  }

  cursorY = Math.max(0, Math.min(lines.length - 1, cursorY + deltaY));

  cursorX = Math.min(cursorX, lineLength(cursorY)) + deltaX;
  while (cursorX < 0 && cursorY > 0) {
    cursorY--;
    cursorX += lineLength(cursorY) + 1;
  }
  while (cursorX > lineLength(cursorY) && cursorY < lines.length - 1) {
    cursorX -= lineLength(cursorY) + 1;
    cursorY++;
  }
  cursorX = Math.max(0, Math.min(lineLength(cursorY), cursorX));

  let newCursor = 0;
  for (let i = 0; i < cursorY; i++) {
    newCursor += lineLength(i) + 1;
  }
  return newCursor + cursorX;
}
