/**
 * Adapted from is-unicode-supported (https://github.com/sindresorhus/is-unicode-supported).
 *
 * Copyright (c) Sindre Sorhus
 * Licensed under the MIT License. See the NOTICE file at the root of this
 * package for the full attribution and license text.
 */

import process from 'node:process';

export default function isUnicodeSupported() {
  const { env } = process;
  const { TERM, TERM_PROGRAM } = env;

  if (process.platform !== 'win32') {
    return TERM !== 'linux'; // Linux console (kernel)
  }

  return (
    Boolean(env['WT_SESSION']) || // Windows Terminal
    Boolean(env['TERMINUS_SUBLIME']) || // Terminus (<0.2.27)
    env['ConEmuTask'] === '{cmd::Cmder}' || // ConEmu and cmder
    TERM_PROGRAM === 'Terminus-Sublime' ||
    TERM_PROGRAM === 'vscode' ||
    TERM === 'xterm-256color' ||
    TERM === 'alacritty' ||
    TERM === 'rxvt-unicode' ||
    TERM === 'rxvt-unicode-256color' ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm'
  );
}
