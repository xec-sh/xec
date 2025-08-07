// Default theme for @xec-sh/kit

import pc from 'picocolors';

import { getSymbol, colorSupport } from '../utils/colors.js';

import type { Theme } from '../core/types.js';

export function createDefaultTheme(): Theme {
  // Use Unicode symbols if supported, otherwise ASCII fallbacks
  const symbols = {
    success: getSymbol('✔', '√'),
    error: getSymbol('✖', 'X'),
    warning: getSymbol('⚠', '!'),
    info: getSymbol('ℹ', 'i'),
    bullet: getSymbol('•', '*'),
    arrow: getSymbol('→', '->'),
    pointer: getSymbol('❯', '>'),
    checkboxChecked: getSymbol('✔', 'x'),
    checkboxUnchecked: ' ',
    radioActive: getSymbol('●', '(*)'),
    radioInactive: getSymbol('○', '( )'),
    spinnerFrames: colorSupport.hasBasic
      ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      : ['-', '\\', '|', '/']
  };

  return {
    colors: {
      primary: '#007ACC',
      secondary: '#40A9FF',
      success: '#52C41A',
      warning: '#FAAD14',
      error: '#F5222D',
      info: '#1890FF',
      muted: '#666666'
    },
    symbols: {
      question: '?',
      success: colorSupport.hasBasic ? pc.green(symbols.success) : symbols.success,
      error: colorSupport.hasBasic ? pc.red(symbols.error) : symbols.error,
      warning: colorSupport.hasBasic ? pc.yellow(symbols.warning) : symbols.warning,
      info: colorSupport.hasBasic ? pc.blue(symbols.info) : symbols.info,
      bullet: symbols.bullet,
      arrow: symbols.arrow,
      pointer: colorSupport.hasBasic ? pc.cyan(symbols.pointer) : symbols.pointer,
      checkbox: {
        checked: colorSupport.hasBasic ? pc.green(symbols.checkboxChecked) : symbols.checkboxChecked,
        unchecked: symbols.checkboxUnchecked,
        cursor: colorSupport.hasBasic ? pc.cyan(symbols.pointer) : symbols.pointer
      },
      radio: {
        active: colorSupport.hasBasic ? pc.green(symbols.radioActive) : symbols.radioActive,
        inactive: symbols.radioInactive,
        cursor: colorSupport.hasBasic ? pc.cyan(symbols.pointer) : symbols.pointer
      },
      spinner: {
        frames: symbols.spinnerFrames,
        interval: 80
      }
    },
    formatters: {
      primary: (text: string) => colorSupport.hasBasic ? pc.cyan(text) : text,
      bold: (text: string) => colorSupport.hasBasic ? pc.bold(text) : text,
      highlight: (text: string) => colorSupport.hasBasic ? pc.cyan(text) : text,
      muted: (text: string) => colorSupport.hasBasic ? pc.gray(text) : text,
      error: (text: string) => colorSupport.hasBasic ? pc.red(text) : text,
      success: (text: string) => colorSupport.hasBasic ? pc.green(text) : text,
      warning: (text: string) => colorSupport.hasBasic ? pc.yellow(text) : text,
      info: (text: string) => colorSupport.hasBasic ? pc.blue(text) : text,
      inverse: (text: string) => colorSupport.hasBasic ? pc.inverse(text) : text,
      secondary: (text: string) => colorSupport.hasBasic ? pc.blue(text) : text
    }
  };
}