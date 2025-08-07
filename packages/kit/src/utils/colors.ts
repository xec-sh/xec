import picocolors from 'picocolors';


export interface ColorSupport {
  level: 0 | 1 | 2 | 3;
  hasBasic: boolean;
  has256: boolean;
  has16m: boolean;
}

/**
 * Detect color support in the current terminal
 */
export function detectColorSupport(): ColorSupport {
  // Check if colors are explicitly disabled
  if (
    process.env['NO_COLOR'] ||
    process.env['TERM'] === 'dumb' ||
    process.env['NODE_DISABLE_COLORS'] === '1'
  ) {
    return {
      level: 0,
      hasBasic: false,
      has256: false,
      has16m: false,
    };
  }

  // Force color support if requested
  if (process.env['FORCE_COLOR'] === '3') {
    return {
      level: 3,
      hasBasic: true,
      has256: true,
      has16m: true,
    };
  }

  if (process.env['FORCE_COLOR'] === '2') {
    return {
      level: 2,
      hasBasic: true,
      has256: true,
      has16m: false,
    };
  }

  if (process.env['FORCE_COLOR'] === '1' || process.env['FORCE_COLOR'] === 'true') {
    return {
      level: 1,
      hasBasic: true,
      has256: false,
      has16m: false,
    };
  }

  // Check if we're not in a TTY
  if (!process.stdout.isTTY) {
    return {
      level: 0,
      hasBasic: false,
      has256: false,
      has16m: false,
    };
  }

  // Check terminal capabilities
  const term = process.env['TERM'] || '';

  // 24-bit color support
  if (
    process.env['COLORTERM'] === 'truecolor' ||
    process.env['COLORTERM'] === '24bit' ||
    term === 'xterm-kitty' ||
    term === 'iTerm.app'
  ) {
    return {
      level: 3,
      hasBasic: true,
      has256: true,
      has16m: true,
    };
  }

  // 256 color support
  if (
    /^xterm-256|^screen-256|^tmux-256|^rxvt-unicode-256/.test(term) ||
    process.env['COLORTERM'] === '256' ||
    process.env['TERM_PROGRAM'] === 'iTerm.app'
  ) {
    return {
      level: 2,
      hasBasic: true,
      has256: true,
      has16m: false,
    };
  }

  // Basic color support
  if (
    /^xterm|^screen|^tmux|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(term) ||
    process.env['COLORTERM']
  ) {
    return {
      level: 1,
      hasBasic: true,
      has256: false,
      has16m: false,
    };
  }

  // No color support
  return {
    level: 0,
    hasBasic: false,
    has256: false,
    has16m: false,
  };
}

/**
 * Create a color instance with fallback support
 */
export function createColors(forceLevel?: 0 | 1 | 2 | 3): ReturnType<typeof picocolors.createColors> {
  const support = detectColorSupport();
  const level = forceLevel ?? support.level;

  // Configure picocolors based on color level
  if (level === 0) {
    // No color support - return no-op functions
    return picocolors.createColors(false);
  }

  return picocolors.createColors(true);
}

/**
 * Get appropriate symbol based on terminal capabilities
 */
export function getSymbol(unicode: string, ascii: string): string {
  // Check if terminal supports unicode
  const isUnicodeSupported =
    process.platform !== 'win32' ||
    process.env['TERM_PROGRAM'] === 'vscode' ||
    process.env['WT_SESSION'] || // Windows Terminal
    process.env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm';

  return isUnicodeSupported ? unicode : ascii;
}

/**
 * Fallback theme for limited color support
 */
export function getFallbackTheme(colorSupport: ColorSupport) {
  if (!colorSupport.hasBasic) {
    // No colors - use plain text symbols
    return {
      symbol: {
        success: '[OK]',
        error: '[ERROR]',
        warning: '[WARN]',
        info: '[INFO]',
        question: '?',
        bullet: '*',
        pointer: '>',
        checkbox: {
          on: '[x]',
          off: '[ ]',
        },
      },
    };
  }

  // Basic colors - use simple ASCII symbols
  return {
    symbol: {
      success: getSymbol('✓', '√'),
      error: getSymbol('✗', 'X'),
      warning: getSymbol('⚠', '!'),
      info: getSymbol('ℹ', 'i'),
      question: '?',
      bullet: getSymbol('•', '*'),
      pointer: getSymbol('▶', '>'),
      checkbox: {
        on: getSymbol('☑', '[x]'),
        off: getSymbol('☐', '[ ]'),
      },
    },
  };
}

// Export singleton instance
export const colorSupport = detectColorSupport();
export const colors = createColors();
export const supportsUnicode = getSymbol('✓', 'x') === '✓';