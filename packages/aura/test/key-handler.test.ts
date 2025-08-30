#!/usr/bin/env tsx
/**
 * Test script for key-handler to verify cross-platform key combinations
 */

import { parseKeypress, isKeyCombination, formatKeyCombination } from '../src/lib/key-handler.js'

// Test cases for various key combinations
const testCases = [
  // Simple keys
  { input: 'a', expected: { name: 'a', ctrl: false, meta: false, shift: false, option: false } },
  { input: 'A', expected: { name: 'a', ctrl: false, meta: false, shift: true, option: false } },
  { input: '1', expected: { name: '1', ctrl: false, meta: false, shift: false, option: false, number: true } },
  { input: ' ', expected: { name: 'space', ctrl: false, meta: false, shift: false, option: false } },

  // Control keys
  { input: '\x01', expected: { name: 'a', ctrl: true, meta: false, shift: false, option: false } },
  { input: '\x03', expected: { name: 'c', ctrl: true, meta: false, shift: false, option: false } },

  // Special keys
  { input: '\r', expected: { name: 'return', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\n', expected: { name: 'enter', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\t', expected: { name: 'tab', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x7f', expected: { name: 'backspace', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b', expected: { name: 'escape', ctrl: false, meta: false, shift: false, option: false } },

  // Arrow keys
  { input: '\x1b[A', expected: { name: 'up', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[B', expected: { name: 'down', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[C', expected: { name: 'right', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[D', expected: { name: 'left', ctrl: false, meta: false, shift: false, option: false } },

  // Modified arrow keys - Ctrl
  { input: '\x1b[1;5A', expected: { name: 'up', ctrl: true, meta: false, shift: false, option: false } },
  { input: '\x1b[1;5B', expected: { name: 'down', ctrl: true, meta: false, shift: false, option: false } },
  { input: '\x1b[1;5C', expected: { name: 'right', ctrl: true, meta: false, shift: false, option: false } },
  { input: '\x1b[1;5D', expected: { name: 'left', ctrl: true, meta: false, shift: false, option: false } },

  // Modified arrow keys - Option/Alt
  { input: '\x1b[1;3A', expected: { name: 'up', ctrl: false, meta: false, shift: false, option: true } },
  { input: '\x1b[1;3B', expected: { name: 'down', ctrl: false, meta: false, shift: false, option: true } },
  { input: '\x1b[1;3C', expected: { name: 'right', ctrl: false, meta: false, shift: false, option: true } },
  { input: '\x1b[1;3D', expected: { name: 'left', ctrl: false, meta: false, shift: false, option: true } },

  // Modified arrow keys - Shift
  { input: '\x1b[1;2A', expected: { name: 'up', ctrl: false, meta: false, shift: true, option: false } },
  { input: '\x1b[1;2B', expected: { name: 'down', ctrl: false, meta: false, shift: true, option: false } },
  { input: '\x1b[1;2C', expected: { name: 'right', ctrl: false, meta: false, shift: true, option: false } },
  { input: '\x1b[1;2D', expected: { name: 'left', ctrl: false, meta: false, shift: true, option: false } },

  // Modified arrow keys - Cmd/Meta (macOS)
  { input: '\x1b[1;9A', expected: { name: 'up', ctrl: false, meta: true, shift: false, option: false } },
  { input: '\x1b[1;9B', expected: { name: 'down', ctrl: false, meta: true, shift: false, option: false } },
  { input: '\x1b[1;9C', expected: { name: 'right', ctrl: false, meta: true, shift: false, option: false } },
  { input: '\x1b[1;9D', expected: { name: 'left', ctrl: false, meta: true, shift: false, option: false } },

  // Multiple modifiers - Shift+Ctrl
  { input: '\x1b[1;6A', expected: { name: 'up', ctrl: true, meta: false, shift: true, option: false } },
  { input: '\x1b[1;6B', expected: { name: 'down', ctrl: true, meta: false, shift: true, option: false } },
  { input: '\x1b[1;6C', expected: { name: 'right', ctrl: true, meta: false, shift: true, option: false } },
  { input: '\x1b[1;6D', expected: { name: 'left', ctrl: true, meta: false, shift: true, option: false } },

  // Multiple modifiers - Shift+Option
  { input: '\x1b[1;4A', expected: { name: 'up', ctrl: false, meta: false, shift: true, option: true } },
  { input: '\x1b[1;4B', expected: { name: 'down', ctrl: false, meta: false, shift: true, option: true } },

  // Home/End/PageUp/PageDown
  { input: '\x1b[H', expected: { name: 'home', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[F', expected: { name: 'end', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[5~', expected: { name: 'pageup', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[6~', expected: { name: 'pagedown', ctrl: false, meta: false, shift: false, option: false } },

  // Delete key
  { input: '\x1b[3~', expected: { name: 'delete', ctrl: false, meta: false, shift: false, option: false } },

  // Option+Delete (macOS)
  { input: '\x1b\x1b[3~', expected: { name: 'delete', ctrl: false, meta: false, shift: false, option: true } },

  // Option+Backspace (macOS)
  { input: '\x1b\x7f', expected: { name: 'backspace', ctrl: false, meta: false, shift: false, option: true } },

  // Word navigation (Option+Left/Right on macOS)
  { input: '\x1bb', expected: { name: 'left', ctrl: false, meta: false, shift: false, option: true } },
  { input: '\x1bf', expected: { name: 'right', ctrl: false, meta: false, shift: false, option: true } },

  // Function keys
  { input: '\x1bOP', expected: { name: 'f1', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1bOQ', expected: { name: 'f2', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[15~', expected: { name: 'f5', ctrl: false, meta: false, shift: false, option: false } },
  { input: '\x1b[24~', expected: { name: 'f12', ctrl: false, meta: false, shift: false, option: false } },

  // Meta+character
  { input: '\x1ba', expected: { name: 'a', ctrl: false, meta: true, shift: false, option: false } },
  { input: '\x1bA', expected: { name: 'a', ctrl: false, meta: true, shift: true, option: false } },
]

// Run tests
console.log('Testing Key Handler Parser\n')
console.log('='.repeat(80))

let passed = 0
let failed = 0

for (const test of testCases) {
  const result = parseKeypress(test.input)

  const matches =
    result.name === test.expected.name &&
    result.ctrl === test.expected.ctrl &&
    result.meta === test.expected.meta &&
    result.shift === test.expected.shift &&
    result.option === test.expected.option &&
    (test.expected.number === undefined || result.number === test.expected.number)

  if (matches) {
    passed++
    console.log(`✓ ${JSON.stringify(test.input)} → ${formatKeyCombination(result)}`)
  } else {
    failed++
    console.log(`✗ ${JSON.stringify(test.input)}`)
    console.log(`  Expected: ${JSON.stringify(test.expected)}`)
    console.log(`  Got:      ${JSON.stringify({
      name: result.name,
      ctrl: result.ctrl,
      meta: result.meta,
      shift: result.shift,
      option: result.option,
      number: result.number
    })}`)
  }
}

console.log('\n' + '='.repeat(80))
console.log(`Results: ${passed} passed, ${failed} failed`)

// Test the helper functions
console.log('\n' + '='.repeat(80))
console.log('Testing Helper Functions\n')

const key = parseKeypress('\x1b[1;5C')
console.log(`formatKeyCombination: ${formatKeyCombination(key)} (should be Ctrl+right)`)

console.log(`\nisKeyCombination tests:`)
console.log(`  Ctrl+right: ${isKeyCombination(key, 'ctrl+right')} (should be true)`)
console.log(`  Cmd+right: ${isKeyCombination(key, 'cmd+right')} (should be false)`)
console.log(`  Control+right: ${isKeyCombination(key, 'control+right')} (should be true)`)

const optionKey = parseKeypress('\x1b[1;3D')
console.log(`\nOption+left: ${formatKeyCombination(optionKey)}`)
console.log(`  option+left: ${isKeyCombination(optionKey, 'option+left')} (should be true)`)
console.log(`  alt+left: ${isKeyCombination(optionKey, 'alt+left')} (should be true)`)

process.exit(failed > 0 ? 1 : 0)