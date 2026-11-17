# Changelog

## Unreleased

## [0.13.0] - 2026-11-15

- Remove the external terminal-control dependency. Prompts, spinners and task logs share Kit's existing ANSI utilities.

- Validate cursor coordinates and redraw counts before producing terminal control sequences; retain upstream attribution.
