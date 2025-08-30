import { Buffer } from "node:buffer"
import { EventEmitter } from "events"
import { singleton } from "./singleton.js"
import type { ParsedKey } from "../types.js"

// ANSI escape sequence modifier flags (xterm-style)
// These are used in sequences like \x1b[1;5A (Ctrl+Up)
const MODIFIER_FLAGS = {
  SHIFT: 1,
  ALT: 2,    // Alt/Option key
  CTRL: 4,
  META: 8,   // Command key on macOS, Windows key on Windows
} as const

// Function key mappings
const FUNCTION_KEYS: Record<string, string> = {
  // xterm/gnome ESC O letter
  'OP': 'f1', 'OQ': 'f2', 'OR': 'f3', 'OS': 'f4',
  // xterm/rxvt ESC [ number ~
  '[11~': 'f1', '[12~': 'f2', '[13~': 'f3', '[14~': 'f4',
  '[15~': 'f5', '[17~': 'f6', '[18~': 'f7', '[19~': 'f8',
  '[20~': 'f9', '[21~': 'f10', '[23~': 'f11', '[24~': 'f12',
  // Cygwin/libuv
  '[[A': 'f1', '[[B': 'f2', '[[C': 'f3', '[[D': 'f4', '[[E': 'f5',
}

// Navigation key mappings
const NAVIGATION_KEYS: Record<string, string> = {
  // Arrow keys
  '[A': 'up', '[B': 'down', '[C': 'right', '[D': 'left',
  'OA': 'up', 'OB': 'down', 'OC': 'right', 'OD': 'left',
  // Home/End/Page
  '[H': 'home', '[F': 'end',
  'OH': 'home', 'OF': 'end',
  '[1~': 'home', '[4~': 'end',
  '[7~': 'home', '[8~': 'end',
  '[5~': 'pageup', '[6~': 'pagedown',
  '[[5~': 'pageup', '[[6~': 'pagedown',
  // Insert/Delete
  '[2~': 'insert', '[3~': 'delete',
  // Clear
  '[E': 'clear', 'OE': 'clear',
  // Tab
  '[Z': 'tab',
}

// Modified key mappings (shift + navigation keys)
const SHIFTED_KEYS: Record<string, string> = {
  '[a': 'up', '[b': 'down', '[c': 'right', '[d': 'left', '[e': 'clear',
  '[2$': 'insert', '[3$': 'delete', '[5$': 'pageup', '[6$': 'pagedown',
  '[7$': 'home', '[8$': 'end',
}

// Control + navigation keys
const CTRL_KEYS: Record<string, string> = {
  'Oa': 'up', 'Ob': 'down', 'Oc': 'right', 'Od': 'left', 'Oe': 'clear',
  '[2^': 'insert', '[3^': 'delete', '[5^': 'pageup', '[6^': 'pagedown',
  '[7^': 'home', '[8^': 'end',
}

// All special keys combined
const SPECIAL_KEYS: Record<string, string> = {
  ...FUNCTION_KEYS,
  ...NAVIGATION_KEYS,
  ...SHIFTED_KEYS,
  ...CTRL_KEYS,
}

export const nonAlphanumericKeys = [
  ...new Set(Object.values(SPECIAL_KEYS)),
  'backspace', 'return', 'enter', 'escape', 'space', 'tab', 'delete'
]

/**
 * Parse ANSI escape sequences with modifiers
 * Format: \x1b[<code>;<modifier><suffix>
 * Example: \x1b[1;5A = Ctrl+Up
 */
function parseAnsiSequence(sequence: string): ParsedKey | null {
  // Match ANSI escape sequences with optional modifiers
  // Format: ESC [ <params> <letter> or ESC O <letter>
  const match = sequence.match(/^\x1b(?:\x1b)?(?:O|\[(?:\[)?)([0-9;]*)([~^$A-Za-z])/)
  if (!match) return null

  const [fullMatch, params = '', suffix] = match
  const hasDoubleEscape = sequence.startsWith('\x1b\x1b')
  
  // Parse parameters
  let code = ''
  let modifierValue = 1
  
  if (params) {
    const parts = params.split(';')
    if (parts.length === 2) {
      // Format: <code>;<modifier>
      code = parts[0] || ''
      modifierValue = parseInt(parts[1], 10) || 1
    } else if (parts.length === 1) {
      // Format: <code> only
      code = parts[0]
    }
  }

  // Build the lookup key for special keys
  let lookupCode = ''
  if (fullMatch.startsWith('\x1bO')) {
    // Function keys and alt arrow keys: OP, OQ, OA, OB, etc.
    lookupCode = 'O' + suffix
  } else if (fullMatch.startsWith('\x1b[[')) {
    // Cygwin-style function keys: [[A, [[B, etc.
    lookupCode = '[[' + suffix
  } else if (code && suffix === '~') {
    // Keys like [1~ for home, [3~ for delete
    lookupCode = '[' + code + suffix
  } else if (suffix.match(/[A-Z]/)) {
    // Arrow keys and navigation: [A, [B, [C, [D, [H, [F
    lookupCode = '[' + suffix
  } else {
    // Other combinations
    lookupCode = '[' + code + suffix
  }
  
  const key: ParsedKey = {
    name: SPECIAL_KEYS[lookupCode] || suffix.toLowerCase(),
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    number: false,
    sequence,
    raw: sequence,
    code: lookupCode,
  }

  // Apply modifiers based on ANSI standard
  if (modifierValue > 1) {
    const modifier = modifierValue - 1
    key.shift = !!(modifier & MODIFIER_FLAGS.SHIFT)
    key.option = !!(modifier & MODIFIER_FLAGS.ALT)
    key.ctrl = !!(modifier & MODIFIER_FLAGS.CTRL)
    key.meta = !!(modifier & MODIFIER_FLAGS.META)
  }

  // Handle double escape as Option/Alt modifier
  if (hasDoubleEscape) {
    key.option = true
  }

  // Check for legacy modified keys
  if (SHIFTED_KEYS[lookupCode]) {
    key.shift = true
    key.name = SHIFTED_KEYS[lookupCode]
  } else if (CTRL_KEYS[lookupCode]) {
    key.ctrl = true
    key.name = CTRL_KEYS[lookupCode]
  }

  return key
}

/**
 * Parse single character or simple control sequences
 */
function parseSimpleKey(char: string): ParsedKey {
  const key: ParsedKey = {
    name: '',
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    number: false,
    sequence: char,
    raw: char,
  }

  // Special control characters first (before general control char check)
  switch (char) {
    case '\r':
      key.name = 'return'
      return key
    case '\n':
      key.name = 'enter'
      return key
    case '\t':
      key.name = 'tab'
      return key
    case '\b':
    case '\x7f':
      key.name = 'backspace'
      return key
    case '\x1b':
      key.name = 'escape'
      return key
    case ' ':
      key.name = 'space'
      return key
  }

  // Control characters (Ctrl+A through Ctrl+Z)
  if (char.length === 1 && char.charCodeAt(0) <= 0x1a) {
    key.name = String.fromCharCode(char.charCodeAt(0) + 'a'.charCodeAt(0) - 1)
    key.ctrl = true
    return key
  }

  // Regular characters
  if (char.length === 1) {
    const code = char.charCodeAt(0)
    if (code >= 48 && code <= 57) {
      // Numbers 0-9
      key.name = char
      key.number = true
    } else if (code >= 65 && code <= 90) {
      // Uppercase letters (with shift)
      key.name = char.toLowerCase()
      key.shift = true
    } else if (code >= 97 && code <= 122) {
      // Lowercase letters
      key.name = char
    } else {
      // Special characters
      key.name = char
    }
  }

  return key
}

/**
 * Parse meta/alt key combinations (ESC + character)
 */
function parseMetaKey(sequence: string): ParsedKey | null {
  if (!sequence.startsWith('\x1b') || sequence.length < 2) return null
  
  const remaining = sequence.slice(1)
  
  // Special meta combinations
  const specialMeta: Record<string, { name: string; option?: boolean }> = {
    '\x7f': { name: 'backspace', option: true },  // Option+Backspace
    '\b': { name: 'backspace', option: true },    // Alt+Backspace
    ' ': { name: 'space', option: true },         // Option+Space
    'b': { name: 'left', option: true },          // Option+Left (word backward)
    'f': { name: 'right', option: true },         // Option+Right (word forward)
    'd': { name: 'delete', option: true },        // Option+D (delete word forward)
  }

  if (specialMeta[remaining]) {
    const key = parseSimpleKey('')
    Object.assign(key, specialMeta[remaining])
    key.sequence = sequence
    key.raw = sequence
    return key
  }

  // ESC + ESC (double escape)
  if (remaining === '\x1b') {
    return {
      name: 'escape',
      ctrl: false,
      meta: true,
      shift: false,
      option: false,
      number: false,
      sequence,
      raw: sequence,
    }
  }

  // Regular meta + character
  if (remaining.length === 1) {
    const baseKey = parseSimpleKey(remaining)
    baseKey.meta = true
    baseKey.sequence = sequence
    baseKey.raw = sequence
    return baseKey
  }

  return null
}

/**
 * Parse macOS-specific command key sequences
 */
function parseMacOSSequence(sequence: string): ParsedKey | null {
  // macOS Command key combinations (often reported as meta)
  const macOSPatterns: Record<string, Partial<ParsedKey>> = {
    '\x1b[1;9A': { name: 'up', meta: true },      // Cmd+Up
    '\x1b[1;9B': { name: 'down', meta: true },    // Cmd+Down
    '\x1b[1;9C': { name: 'right', meta: true },   // Cmd+Right
    '\x1b[1;9D': { name: 'left', meta: true },    // Cmd+Left
    '\x1b[1;3A': { name: 'up', option: true },    // Option+Up
    '\x1b[1;3B': { name: 'down', option: true },  // Option+Down
    '\x1b[1;3C': { name: 'right', option: true }, // Option+Right
    '\x1b[1;3D': { name: 'left', option: true },  // Option+Left
  }

  const match = macOSPatterns[sequence]
  if (match) {
    return {
      name: match.name || '',
      ctrl: false,
      shift: false,
      number: false,
      sequence,
      raw: sequence,
      meta: match.meta || false,
      option: match.option || false,
    }
  }

  return null
}

/**
 * Main keypress parser function
 */
export function parseKeypress(input: Buffer | string = ''): ParsedKey {
  // Convert Buffer to string
  let sequence: string
  if (Buffer.isBuffer(input)) {
    // Handle high-bit characters
    if (input[0] && input[0] > 127 && input[1] === undefined) {
      input[0] = (input[0] as number) - 128
      sequence = '\x1b' + String(input)
    } else {
      sequence = input.toString('utf8')
    }
  } else {
    sequence = String(input || '')
  }

  // Try parsing in order of specificity
  
  // 1. Try macOS-specific sequences first
  const macOSKey = parseMacOSSequence(sequence)
  if (macOSKey) return macOSKey

  // 2. Try ANSI escape sequences
  if (sequence.startsWith('\x1b')) {
    // Handle special double-escape sequences
    if (sequence === '\x1b\x1b[3~') {
      // Option+Delete on macOS
      return {
        name: 'delete',
        ctrl: false,
        meta: false,
        shift: false,
        option: true,
        number: false,
        sequence,
        raw: sequence,
        code: '[3~',
      }
    }

    const ansiKey = parseAnsiSequence(sequence)
    if (ansiKey) return ansiKey

    // 3. Try meta key combinations
    const metaKey = parseMetaKey(sequence)
    if (metaKey) return metaKey
  }

  // 4. Parse simple keys and control characters
  return parseSimpleKey(sequence)
}

/**
 * KeyHandler class for managing keyboard input
 */
export class KeyHandler extends EventEmitter {
  private isRaw = false
  private destroyed = false

  constructor() {
    super()

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true)
      this.isRaw = true
    }
    
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', this.handleData)
  }

  private handleData = (chunk: Buffer | string): void => {
    if (this.destroyed) return

    const str = chunk.toString()
    
    // Filter out mouse events
    if (this.isMouseEvent(str)) return
    
    const parsedKey = parseKeypress(chunk)
    this.emit('keypress', parsedKey)
  }

  private isMouseEvent(str: string): boolean {
    // SGR mouse mode: \x1b[<...M or \x1b[<...m
    if (/\x1b\[<\d+;\d+;\d+[Mm]/.test(str)) return true
    
    // Basic mouse mode: \x1b[M followed by 3 bytes
    if (str.startsWith('\x1b[M') && str.length >= 6) return true
    
    // X10 mouse mode
    if (/\x1b\[M[\x20-\x7f]{3}/.test(str)) return true
    
    return false
  }

  public destroy(): void {
    if (this.destroyed) return
    
    this.destroyed = true
    process.stdin.removeAllListeners('data')
    
    if (this.isRaw && process.stdin.setRawMode) {
      try {
        process.stdin.setRawMode(false)
      } catch {
        // Ignore errors when stdin is already closed
      }
    }
    
    this.removeAllListeners()
  }
}

// Singleton instance management
let keyHandler: KeyHandler | null = null

export function getKeyHandler(): KeyHandler {
  if (!keyHandler) {
    keyHandler = singleton('KeyHandler', () => new KeyHandler())
  }
  return keyHandler
}

/**
 * Destroy the singleton key handler instance
 */
export function destroyKeyHandler(): void {
  if (keyHandler) {
    keyHandler.destroy()
    keyHandler = null
  }
}

/**
 * Helper function to format key combination as string
 */
export function formatKeyCombination(key: ParsedKey): string {
  const parts: string[] = []
  
  if (key.ctrl) parts.push('Ctrl')
  if (key.meta) parts.push('Cmd')
  if (key.option) parts.push('Option')
  if (key.shift) parts.push('Shift')
  
  parts.push(key.name || key.sequence)
  
  return parts.join('+')
}

/**
 * Check if a key matches a specific combination
 */
export function isKeyCombination(key: ParsedKey, combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  const keyName = parts[parts.length - 1]
  
  const hasCtrl = parts.includes('ctrl') || parts.includes('control')
  const hasMeta = parts.includes('cmd') || parts.includes('command') || parts.includes('meta')
  const hasOption = parts.includes('option') || parts.includes('alt')
  const hasShift = parts.includes('shift')
  
  return (
    key.name === keyName &&
    key.ctrl === hasCtrl &&
    key.meta === hasMeta &&
    key.option === hasOption &&
    key.shift === hasShift
  )
}