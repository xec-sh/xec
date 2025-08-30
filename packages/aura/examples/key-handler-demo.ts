#!/usr/bin/env tsx
/**
 * Interactive demo for testing key handler with real keyboard input
 */

import { getKeyHandler, formatKeyCombination, destroyKeyHandler } from '../src/lib/key-handler.js'

console.log('🎹 Key Handler Interactive Demo')
console.log('=' .repeat(60))
console.log('Press any key combination to see how it\'s parsed.')
console.log('Special keys to try:')
console.log('  • Ctrl+C, Ctrl+A, Ctrl+Z')
console.log('  • Cmd+Left/Right (macOS)')
console.log('  • Option+Left/Right (macOS word navigation)')
console.log('  • Option+Delete/Backspace (macOS word deletion)')
console.log('  • Shift+Arrow keys')
console.log('  • Function keys (F1-F12)')
console.log('  • Home, End, PageUp, PageDown')
console.log('  • Tab, Enter, Escape')
console.log('')
console.log('Press Ctrl+C or Escape to exit.')
console.log('=' .repeat(60))
console.log('')

const keyHandler = getKeyHandler()

keyHandler.on('keypress', (key) => {
  // Format the output
  const formatted = formatKeyCombination(key)
  
  // Build modifier string
  const modifiers = []
  if (key.ctrl) modifiers.push('ctrl')
  if (key.meta) modifiers.push('meta')
  if (key.option) modifiers.push('option')
  if (key.shift) modifiers.push('shift')
  
  // Build output line
  let output = `Key: ${formatted.padEnd(20)}`
  output += ` | Name: ${(key.name || '').padEnd(12)}`
  output += ` | Modifiers: ${modifiers.join(', ').padEnd(25)}`
  
  // Add sequence info for debugging
  const sequence = JSON.stringify(key.sequence)
  if (sequence.length <= 15) {
    output += ` | Seq: ${sequence}`
  } else {
    output += ` | Seq: ${sequence.substring(0, 12)}...`
  }
  
  // Add code if present
  if (key.code) {
    output += ` | Code: ${key.code}`
  }
  
  console.log(output)
  
  // Exit conditions
  if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
    console.log('\n👋 Exiting...')
    destroyKeyHandler()
    process.exit(0)
  }
})

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n👋 Caught SIGINT, exiting...')
  destroyKeyHandler()
  process.exit(0)
})

process.on('exit', () => {
  destroyKeyHandler()
})