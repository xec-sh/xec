#!/usr/bin/env bun

import { setupCommonDemoKeys } from "./lib/standalone-keys.js"
import { ASCIIFontComponent } from "../src/components/ascii-font.js"
import { RGBA, Renderer, BoxComponent, TextComponent, GroupComponent, createRenderer } from "../src/index.js"

let mainContainer: BoxComponent | null = null
let fontGroup: GroupComponent | null = null
let statusBox: BoxComponent | null = null
let statusText: TextComponent | null = null
let selectionStartText: TextComponent | null = null
let selectionMiddleText: TextComponent | null = null
let selectionEndText: TextComponent | null = null
let debugText: TextComponent | null = null
let allFontRenderables: ASCIIFontComponent[] = []

export function run(renderer: Renderer): void {
  renderer.setBackgroundColor("#0d1117")

  mainContainer = new BoxComponent("mainContainer", {
    position: "absolute",
    left: 1,
    top: 1,
    width: 95,
    height: 80,
    backgroundColor: "#161b22",
    zIndex: 1,
    borderColor: "#50565d",
    title: "ASCII Font Selection Demo",
    titleAlignment: "center",
  })
  renderer.root.add(mainContainer)

  fontGroup = new GroupComponent("fontGroup", {
    position: "absolute",
    left: 2,
    top: 2,
    zIndex: 10,
  })
  mainContainer.add(fontGroup)

  const tinyFont = new ASCIIFontComponent("tinyFont", {
    text: "TINY FONT DEMO",
    font: "tiny",
    fg: RGBA.fromInts(255, 255, 0, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(tinyFont)
  allFontRenderables.push(tinyFont)

  const blockFont = new ASCIIFontComponent("blockFont", {
    text: "opentui",
    font: "block",
    fg: [RGBA.fromInts(255, 100, 100, 255), RGBA.fromInts(100, 255, 100, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(blockFont)
  allFontRenderables.push(blockFont)

  const shadeFont = new ASCIIFontComponent("shadeFont", {
    text: "SHADE FONT DEMO",
    font: "shade",
    fg: [RGBA.fromInts(255, 200, 100, 255), RGBA.fromInts(100, 150, 200, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(shadeFont)
  allFontRenderables.push(shadeFont)

  const slickFont = new ASCIIFontComponent("slickFont", {
    text: "SLICK FONT DEMO",
    font: "slick",
    fg: [RGBA.fromInts(100, 255, 100, 255), RGBA.fromInts(255, 100, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(slickFont)
  allFontRenderables.push(slickFont);

  const retroFont = new ASCIIFontComponent("retroFont", {
    text: "RETRO FONT DEMO",
    font: "retro",
    fg: [RGBA.fromInts(100, 255, 100, 255), RGBA.fromInts(255, 100, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(retroFont)
  allFontRenderables.push(retroFont)

  const cyberFont = new ASCIIFontComponent("cyberFont", {
    text: "CYBER FONT DEMO",
    font: "cyber",
    fg: [RGBA.fromInts(100, 255, 100, 255), RGBA.fromInts(255, 100, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(cyberFont)
  allFontRenderables.push(cyberFont)

  const neonFont = new ASCIIFontComponent("neonFont", {
    text: "NEON FONT DEMO",
    font: "neon",
    fg: [RGBA.fromInts(100, 255, 100, 255), RGBA.fromInts(255, 100, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(neonFont)
  allFontRenderables.push(neonFont)

  const matrixFont = new ASCIIFontComponent("matrixFont", {
    text: "MATRIX FONT DEMO",
    font: "matrix",
    fg: [RGBA.fromInts(100, 255, 100, 255), RGBA.fromInts(255, 100, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(matrixFont)
  allFontRenderables.push(matrixFont)

  const braileFont = new ASCIIFontComponent("braileFont", {
    text: "BRAILE FONT DEMO",
    font: "braile",
    fg: [RGBA.fromInts(200, 255, 200, 255), RGBA.fromInts(100, 200, 100, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(braileFont)
  allFontRenderables.push(braileFont)

  const cyberSmallFont = new ASCIIFontComponent("cyberSmallFont", {
    text: "CYBER SMALL FONT",
    font: "cyberSmall",
    fg: [RGBA.fromInts(255, 200, 100, 255), RGBA.fromInts(255, 150, 50, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(cyberSmallFont)
  allFontRenderables.push(cyberSmallFont)

  const diamFont = new ASCIIFontComponent("diamFont", {
    text: "DIAM FONT",
    font: "diam",
    fg: [RGBA.fromInts(200, 200, 255, 255), RGBA.fromInts(150, 150, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(diamFont)
  allFontRenderables.push(diamFont)

  const futureFont = new ASCIIFontComponent("futureFont", {
    text: "FUTURE FONT",
    font: "future",
    fg: [RGBA.fromInts(255, 200, 200, 255), RGBA.fromInts(255, 100, 100, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    selectionBg: "#4a5568",
    selectionFg: "#ffffff",
    zIndex: 20,
  })
  fontGroup.add(futureFont)
  allFontRenderables.push(futureFont)

  const instructions = new TextComponent("ascii-font-instructions", {
    content: "Click and drag to select text across any ASCII font elements. Press 'C' to clear selection.",
    left: 2,
    top: 56,
    zIndex: 2,
    fg: "#f0f6fc",
  })
  mainContainer.add(instructions)

  statusBox = new BoxComponent("statusBox", {
    position: "absolute",
    left: 1,
    top: 62,
    width: 95,
    height: 10,
    backgroundColor: "#0d1117",
    borderColor: "#50565d",
    title: "Selection Status",
    titleAlignment: "left",
  })
  renderer.root.add(statusBox)

  statusText = new TextComponent("statusText", {
    content: "No selection - try selecting across different ASCII fonts",
    fg: "#f0f6fc",
  })
  statusBox.add(statusText)

  selectionStartText = new TextComponent("selectionStartText", {
    content: "",
    left: 3,
    zIndex: 2,
    fg: "#7dd3fc",
  })
  statusBox.add(selectionStartText)

  selectionMiddleText = new TextComponent("selectionMiddleText", {
    content: "",
    left: 3,
    zIndex: 2,
    fg: "#94a3b8",
  })
  statusBox.add(selectionMiddleText)

  selectionEndText = new TextComponent("selectionEndText", {
    content: "",
    left: 3,
    zIndex: 2,
    fg: "#7dd3fc",
  })
  statusBox.add(selectionEndText)

  debugText = new TextComponent("debugText", {
    content: "",
    left: 3,
    zIndex: 2,
    fg: "#e6edf3",
  })
  statusBox.add(debugText)

  renderer.on("selection", (selection) => {
    if (selection && statusText && debugText && selectionStartText && selectionMiddleText && selectionEndText) {
      const selectedText = selection.getSelectedText()

      const selectedCount = allFontRenderables.filter((r) => r.hasSelection()).length
      const container = renderer.getSelectionContainer()
      const containerInfo = container ? `Container: ${container.id}` : "Container: none"
      debugText.content = `Selected fonts: ${selectedCount}/${allFontRenderables.length} | ${containerInfo}`

      if (selectedText) {
        const lines = selectedText.split("\n")
        const totalLength = selectedText.length

        if (lines.length > 1) {
          statusText.content = `Selected ${lines.length} lines (${totalLength} chars):`
          selectionStartText.content = lines[0]
          selectionMiddleText.content = "..."
          selectionEndText.content = lines[lines.length - 1]
        } else if (selectedText.length > 60) {
          statusText.content = `Selected ${totalLength} chars:`
          selectionStartText.content = selectedText.substring(0, 30)
          selectionMiddleText.content = "..."
          selectionEndText.content = selectedText.substring(selectedText.length - 30)
        } else {
          statusText.content = `Selected ${totalLength} chars:`
          selectionStartText.content = `"${selectedText}"`
          selectionMiddleText.content = ""
          selectionEndText.content = ""
        }
      } else {
        statusText.content = "Empty selection"
        selectionStartText.content = ""
        selectionMiddleText.content = ""
        selectionEndText.content = ""
      }
    }
  })

  renderer.on("key", (data) => {
    const key = data.toString()
    if (key === "c" || key === "C") {
      renderer.clearSelection()
      if (statusText && debugText && selectionStartText && selectionMiddleText && selectionEndText) {
        statusText.content = "Selection cleared"
        selectionStartText.content = ""
        selectionMiddleText.content = ""
        selectionEndText.content = ""
        debugText.content = ""
      }
    }
  })
}

export function destroy(renderer: Renderer): void {
  allFontRenderables = []

  fontGroup?.destroyRecursively()
  mainContainer?.destroyRecursively()
  statusBox?.destroyRecursively()

  fontGroup = null
  mainContainer = null
  statusBox = null
  statusText = null
  selectionStartText = null
  selectionMiddleText = null
  selectionEndText = null
  debugText = null

  renderer.clearSelection()
}

if (import.meta.main) {
  const renderer = await createRenderer({
    targetFps: 30,
    enableMouseMovement: true,
    exitOnCtrlC: true,
  })
  run(renderer)
  setupCommonDemoKeys(renderer)
}
