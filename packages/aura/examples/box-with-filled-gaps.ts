#!/usr/bin/env -S npx tsx
/**
 * Box with Filled Gaps Demo
 * Demonstrates the filledGaps option that adds dividers between children in boxes
 */

import { auraApp } from "../src/app/application.js"
import { BoxComponent as Box, TextComponent as Text } from "../src/components/index.js"

async function main() {
  const app = await auraApp({
    exitOnCtrlC: true,
    consoleOptions: {
      outputSuffix: "\n",
    },
  })

  const { ctx, theme } = app
  
  // Column-oriented box with filled gaps
  const container = new Box(ctx, {
    flexDirection: "column",
    border: true,
    borderStyle: "single",
    borderColor: theme.colors.border,
    gap: 1,
    filledGaps: true,
    padding: 1,
    width: 50,
    height: "auto",
    title: "File Browser"
  })

  // First section - Path
  const pathText = new Text(ctx, {
    text: "/some/directory/path",
    color: theme.colors.primary,
    width: "100%"
  })
  container.add(pathText)

  // Second section - Search
  const searchText = new Text(ctx, {
    text: "Search (/) files...",
    color: theme.colors.muted,
    width: "100%"
  })
  container.add(searchText)

  // Third section - File list
  const filesBox = new Box(ctx, {
    flexDirection: "column",
    width: "100%",
    height: "auto"
  })

  const files = [
    ">  dir1",
    "   dir2",
    "   dir3",
    "   .gitignore",
    "   file1.md",
    "   document.txt"
  ]

  files.forEach(file => {
    const fileText = new Text(ctx, {
      text: file,
      color: theme.colors.foreground,
      width: "100%"
    })
    filesBox.add(fileText)
  })
  
  container.add(filesBox)

  // Fourth section - Stats
  const statsText = new Text(ctx, {
    text: "3 dir(s)/3 files",
    color: theme.colors.description,
    width: "100%"
  })
  container.add(statsText)

  // Demo for row orientation
  const rowContainer = new Box(ctx, {
    flexDirection: "row",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.colors.accent,
    gap: 2,
    filledGaps: true,
    padding: 1,
    width: "auto",
    height: 3,
    marginTop: 2
  })

  const col1 = new Text(ctx, {
    text: "Column 1",
    color: theme.colors.primary
  })
  rowContainer.add(col1)

  const col2 = new Text(ctx, {
    text: "Column 2",
    color: theme.colors.secondary
  })
  rowContainer.add(col2)

  const col3 = new Text(ctx, {
    text: "Column 3",
    color: theme.colors.accent
  })
  rowContainer.add(col3)

  ctx.add(container)
  ctx.add(rowContainer)

  // Handle exit
  app.on("keypress", (key) => {
    if (key.name === "q" || key.ctrl && key.name === "c") {
      app.exit()
    }
  })

  await app.start()
}

main().catch(console.error)