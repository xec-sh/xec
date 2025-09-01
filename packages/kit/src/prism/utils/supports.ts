/**
 * Terminal color support detection
 */

import tty from 'node:tty';
import { env, stdout, stderr } from 'node:process';

export enum ColorLevel {
  None = 0,
  Basic = 1, // 16 colors
  Ansi256 = 2, // 256 colors
  TrueColor = 3, // 16.7 million colors
}

export interface ColorSupport {
  level: ColorLevel;
  hasBasic: boolean;
  has256: boolean;
  has16m: boolean;
}

/**
 * Detect color support for a stream
 */
export function detectColorSupport(stream: NodeJS.WriteStream = stdout): ColorSupport {
  // Check if colors are explicitly disabled
  if (env['NO_COLOR'] || env['FORCE_COLOR'] === '0' || env['FORCE_COLOR'] === 'false') {
    return createColorSupport(ColorLevel.None);
  }

  // Check if colors are explicitly enabled
  const forceColor = env['FORCE_COLOR'];
  if (forceColor === 'true' || forceColor === '1') {
    return createColorSupport(ColorLevel.Basic);
  }
  if (forceColor === '2') {
    return createColorSupport(ColorLevel.Ansi256);
  }
  if (forceColor === '3') {
    return createColorSupport(ColorLevel.TrueColor);
  }

  // Not in TTY
  if (!tty.isatty((stream as any).fd || 1)) {
    // Check for CI environments that support colors
    if (env['CI']) {
      if (
        env['TRAVIS'] ||
        env['CIRCLECI'] ||
        env['APPVEYOR'] ||
        env['GITLAB_CI'] ||
        env['GITHUB_ACTIONS'] ||
        env['BUILDKITE'] ||
        env['DRONE']
      ) {
        return createColorSupport(ColorLevel.Basic);
      }
      return createColorSupport(ColorLevel.None);
    }
    return createColorSupport(ColorLevel.None);
  }

  // Windows
  if (process.platform === 'win32') {
    // Windows 10 build 14931+ supports 16m colors
    const osRelease = env['OS_RELEASE'];
    if (osRelease) {
      const version = osRelease.split('.');
      if (Number(version[0]) >= 10 && Number(version[2]) >= 14931) {
        return createColorSupport(ColorLevel.TrueColor);
      }
    }
    return createColorSupport(ColorLevel.Basic);
  }

  // Check TERM environment variable
  const term = env['TERM'];
  if (!term) {
    return createColorSupport(ColorLevel.None);
  }

  // Terminals that support TrueColor
  if (
    term === 'xterm-256color' ||
    term === 'screen-256color' ||
    term === 'tmux-256color' ||
    term === 'rxvt-unicode-256color'
  ) {
    // Check for TrueColor support
    if (
      env['COLORTERM'] === 'truecolor' ||
      env['COLORTERM'] === '24bit' ||
      env['TERM_PROGRAM'] === 'iTerm.app' ||
      env['TERM_PROGRAM'] === 'Hyper' ||
      env['TERM_PROGRAM'] === 'vscode'
    ) {
      return createColorSupport(ColorLevel.TrueColor);
    }
    return createColorSupport(ColorLevel.Ansi256);
  }

  // Basic color support
  if (/color|ansi|cygwin|linux/i.test(term)) {
    return createColorSupport(ColorLevel.Basic);
  }

  // Dumb terminal
  if (term === 'dumb') {
    return createColorSupport(ColorLevel.None);
  }

  // Default to basic colors
  return createColorSupport(ColorLevel.Basic);
}

/**
 * Create color support object
 */
function createColorSupport(level: ColorLevel): ColorSupport {
  return {
    level,
    hasBasic: level >= ColorLevel.Basic,
    has256: level >= ColorLevel.Ansi256,
    has16m: level >= ColorLevel.TrueColor,
  };
}

// Cache results
let stdoutColorSupport: ColorSupport | undefined;
let stderrColorSupport: ColorSupport | undefined;

/**
 * Get stdout color support (cached)
 */
export function stdoutColor(): ColorSupport {
  if (!stdoutColorSupport) {
    stdoutColorSupport = detectColorSupport(stdout);
  }
  return stdoutColorSupport;
}

/**
 * Get stderr color support (cached)
 */
export function stderrColor(): ColorSupport {
  if (!stderrColorSupport) {
    stderrColorSupport = detectColorSupport(stderr);
  }
  return stderrColorSupport;
}

/**
 * Clear cached color support (useful for testing)
 */
export function clearColorCache(): void {
  stdoutColorSupport = undefined;
  stderrColorSupport = undefined;
}

/**
 * Check if colors are enabled
 */
export function isColorEnabled(stream: NodeJS.WriteStream = stdout): boolean {
  return detectColorSupport(stream).level > ColorLevel.None;
}

/**
 * Get the best color method for the current terminal
 */
export function getBestColorMethod(
  stream: NodeJS.WriteStream = stdout
): 'none' | 'ansi16' | 'ansi256' | 'truecolor' {
  const support = detectColorSupport(stream);

  switch (support.level) {
    case ColorLevel.TrueColor:
      return 'truecolor';
    case ColorLevel.Ansi256:
      return 'ansi256';
    case ColorLevel.Basic:
      return 'ansi16';
    default:
      return 'none';
  }
}
