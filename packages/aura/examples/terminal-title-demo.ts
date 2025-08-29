#!/usr/bin/env bun
/**
 * Terminal Title Demo
 * Demonstrates dynamic terminal title changes using the Aura renderer
 */

import { auraApp } from "../src/app/application.js"
import { Group, Box, Text } from "../src/components/index.js"

async function main() {
  const app = await auraApp({
    exitOnCtrlC: true,
    consoleOptions: {
      outputSuffix: "\n",
    },
  })

  let titleIndex = 0
  const titles = [
    "🚀 Aura Terminal Demo",
    "⚡ Dynamic Title Updates",
    "🎨 Terminal UI Framework",
    "💫 Cross-Platform TUI",
    "🔥 High Performance Rendering"
  ]

  // Update terminal title every 2 seconds
  const titleInterval = setInterval(() => {
    app.renderer.setTerminalTitle(titles[titleIndex])
    titleIndex = (titleIndex + 1) % titles.length
  }, 2000)

  // Set initial title
  app.renderer.setTerminalTitle(titles[0])

  const rootComponent = new Group({
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  })

  rootComponent.appendChild(
    new Box({
      width: 60,
      height: 12,
      borderStyle: "rounded",
      padding: 2,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
    }).appendChild(
      new Text({
        content: "Terminal Title Demo",
        bold: true,
        marginBottom: 1,
      }),
      new Text({
        content: "Watch your terminal's title bar!",
        marginBottom: 1,
      }),
      new Text({
        content: "The title changes every 2 seconds",
        dim: true,
        marginBottom: 2,
      }),
      new Text({
        content: `Current: ${titles[0]}`,
        italic: true,
        id: "current-title",
      }),
      new Text({
        content: "Press Ctrl+C to exit",
        dim: true,
        marginTop: 2,
      })
    )
  )

  // Update the current title display
  setInterval(() => {
    const currentTitleText = rootComponent.querySelector("#current-title") as Text
    if (currentTitleText) {
      const prevIndex = titleIndex === 0 ? titles.length - 1 : titleIndex - 1
      currentTitleText.content = `Current: ${titles[prevIndex]}`
    }
  }, 2000)

  app.mount(rootComponent)
  await app.start()

  // Cleanup on exit
  process.on("exit", () => {
    clearInterval(titleInterval)
    // Reset title to default
    app.renderer.setTerminalTitle("Terminal")
  })
}

main().catch(console.error)