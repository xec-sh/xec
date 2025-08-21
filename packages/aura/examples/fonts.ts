import { setupCommonDemoKeys } from "./lib/standalone-keys"
import { renderFontToFrameBuffer } from "../src/lib/ascii.font"
import { RGBA, CliRenderer, TextComponent, GroupComponent, createCliRenderer, FrameBufferComponent } from "../src/index"

let scrollY = 0
const contentHeight = 56
let buffer: FrameBufferComponent | null = null
let renderer: CliRenderer | null = null
let parentContainer: GroupComponent | null = null

function updateScrollPosition(): void {
  if (!buffer || !renderer) return

  const maxScroll = Math.max(0, contentHeight - renderer.terminalHeight)
  scrollY = Math.max(0, Math.min(scrollY, maxScroll))
  buffer.y = -scrollY
  renderer.needsUpdate()
}

function handleKeyPress(key: string): void {
  const scrollAmount = 3

  switch (key) {
    case "\u001b[A": // Up arrow
    case "k":
      console.log("up")
      scrollY -= scrollAmount
      updateScrollPosition()
      break
    case "\u001b[B": // Down arrow
    case "j":
      scrollY += scrollAmount
      updateScrollPosition()
      break
  }
}

export function run(rendererInstance: CliRenderer): void {
  renderer = rendererInstance
  renderer.setBackgroundColor("#000028")

  parentContainer = new GroupComponent("fonts-container", {
    zIndex: 15,
    visible: true,
  })
  renderer.root.add(parentContainer)

  buffer = new FrameBufferComponent("ascii-demo", {
    width: renderer.terminalWidth,
    height: contentHeight,
    position: "absolute",
    zIndex: 10,
  })
  rendererInstance.root.add(buffer)
  buffer.frameBuffer.clear()

  // Reset scroll position
  scrollY = 0

  // Set up keyboard handling
  if (!process.stdin.listenerCount("data")) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding("utf8")
  }

  process.stdin.on("data", handleKeyPress)

  // Large title with block font (multi-color)
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "FONTS",
    x: 5,
    y: 1,
    fg: [RGBA.fromInts(255, 100, 100, 255), RGBA.fromInts(100, 100, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "block",
  })

  // Tiny font title
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "TINY FONT DEMO",
    x: 5,
    y: 8,
    fg: RGBA.fromInts(255, 255, 255, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  // Sample text in yellow
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "HELLO WORLD",
    x: 5,
    y: 11,
    fg: RGBA.fromInts(255, 255, 0, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  // Numbers and symbols in green
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "1234567890",
    x: 5,
    y: 14,
    fg: RGBA.fromInts(0, 255, 0, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  // Special characters in magenta
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "!@#$%&*()+-=",
    x: 5,
    y: 17,
    fg: RGBA.fromInts(255, 0, 255, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  // Block font demo section
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "BLOCK FONT DEMO",
    x: 5,
    y: 20,
    fg: RGBA.fromInts(255, 255, 255, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  // Multi-color block font example
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "HI",
    x: 5,
    y: 23,
    fg: [RGBA.fromInts(255, 255, 0, 255), RGBA.fromInts(0, 255, 255, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "block",
  })

  // Another multi-color example
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "2025",
    x: 25,
    y: 23,
    fg: [RGBA.fromInts(255, 128, 0, 255), RGBA.fromInts(128, 255, 128, 255)],
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "block",
  })

  // Shade font demo section
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "SHADE FONT DEMO",
    x: 5,
    y: 30,
    fg: RGBA.fromInts(255, 255, 255, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  // Shade font with multi-color
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "COOL",
    x: 5,
    y: 33,
    fg: [
      RGBA.fromInts(255, 200, 100, 255), // c1 - warm orange
      RGBA.fromInts(100, 150, 200, 255), // c2 - cool blue
    ],
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "shade",
  })

  // Slick font demo section
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "SLICK FONT DEMO",
    x: 5,
    y: 42,
    fg: RGBA.fromInts(255, 255, 255, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  // Slick font with multi-color
  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "STYLE",
    x: 5,
    y: 45,
    fg: [
      RGBA.fromInts(100, 255, 100, 255), // c1 - bright green
      RGBA.fromInts(255, 100, 255, 255), // c2 - bright magenta
    ],
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "slick",
  })

  const scrollInstructions = new TextComponent("scroll-instructions", {
    content: "USE J/K OR ARROW KEYS TO SCROLL",
    position: "absolute",
    left: renderer.terminalWidth - 32,
    top: 1,
    fg: RGBA.fromInts(255, 255, 0, 255),
    zIndex: 25,
  })
  parentContainer.add(scrollInstructions)

  renderFontToFrameBuffer(buffer.frameBuffer, {
    text: "ESC TO RETURN",
    x: 5,
    y: 53,
    fg: RGBA.fromInts(128, 128, 128, 255),
    bg: RGBA.fromInts(0, 0, 40, 255),
    font: "tiny",
  })

  updateScrollPosition()
}

export function destroy(rendererInstance: CliRenderer): void {
  process.stdin.removeListener("data", handleKeyPress)

  rendererInstance.root.remove("ascii-demo")

  if (parentContainer) {
    rendererInstance.root.remove("fonts-container")
    parentContainer = null
  }

  scrollY = 0
  buffer = null
  renderer = null
}

if (import.meta.main) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })
  run(renderer)
  setupCommonDemoKeys(renderer)
}
