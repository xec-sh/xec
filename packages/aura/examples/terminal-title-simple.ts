#!/usr/bin/env bun
/**
 * Simple Terminal Title Test
 * Verifies that the terminal title can be set
 */

import { createRenderer } from "../src/renderer/renderer.js"

async function main() {
  console.log("Creating renderer...")
  const renderer = await createRenderer({
    useAlternateScreen: false,
    exitOnCtrlC: true,
  })

  console.log("Setting terminal title to: 'Aura Terminal Title Test'")
  renderer.setTerminalTitle("Aura Terminal Title Test")
  
  console.log("Terminal title has been set!")
  console.log("Check your terminal's title bar.")
  console.log("Waiting 3 seconds...")
  
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  console.log("Changing title to: '✨ Title Changed!'")
  renderer.setTerminalTitle("✨ Title Changed!")
  
  console.log("Waiting 3 more seconds...")
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  console.log("Resetting title to: 'Terminal'")
  renderer.setTerminalTitle("Terminal")
  
  console.log("Test complete!")
  process.exit(0)
}

main().catch(console.error)