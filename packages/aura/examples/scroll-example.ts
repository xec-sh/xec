import { setupCommonDemoKeys } from "./lib/standalone-keys"
import { ScrollBoxComponent } from "../src/components/scroll-box.js"
import { t, fg, bold, RGBA, italic, underline, BoxComponent, TextComponent, type Renderer, createRenderer, ASCIIFontComponent } from "../src/index.js"

let scrollBox: ScrollBoxComponent | null = null
let renderer: Renderer | null = null
let mainContainer: BoxComponent | null = null
let instructionsBox: BoxComponent | null = null

export function run(rendererInstance: Renderer): void {
  renderer = rendererInstance
  renderer.setBackgroundColor("#1a1b26")

  mainContainer = new BoxComponent(renderer, {
    id: "main-container",
    // TODO: Using 100% sets the width and height once as absolute values and does not update when the window is resized
    // width: "100%",
    // height: "100%",
    flexDirection: "column",
    backgroundColor: "#1a1b26",
  })

  scrollBox = new ScrollBoxComponent(renderer, {
    id: "scroll-box",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    rootOptions: {
      backgroundColor: "#24283b",
      border: true,
    },
    wrapperOptions: {
      backgroundColor: "#1f2335",
    },
    viewportOptions: {
      backgroundColor: "#1a1b26",
    },
    contentOptions: {
      backgroundColor: "#16161e",
    },
    scrollbarOptions: {
      showArrows: true,
      trackOptions: {
        foregroundColor: "#7aa2f7",
        backgroundColor: "#414868",
      },
    },
  })

  instructionsBox = new BoxComponent(renderer, {
    id: "instructions",
    width: "100%",
    flexDirection: "column",
    backgroundColor: "#2a2b3a",
    paddingLeft: 1,
  })

  const instructionsText1 = new TextComponent(renderer, {
    content: t`${bold(fg("#7aa2f7")("Controls:"))} ${fg("#c0caf5")("↑/↓/PgUp/PgDn/Home/End")} ${fg("#565f89")("|")} ${bold(fg("#9ece6a")("A"))} ${fg("#c0caf5")("Toggle arrows")} ${fg("#565f89")("|")} ${bold(fg("#bb9af7")("Tab"))} ${fg("#c0caf5")("Focus scrollbox")}`,
  })

  const instructionsText2 = new TextComponent(renderer, {
    content: t`${bold(fg("#7aa2f7")("Scrollbars:"))} ${bold(fg("#e0af68")("V"))} ${fg("#c0caf5")("Toggle vertical")} ${fg("#565f89")("|")} ${bold(fg("#f7768e")("H"))} ${fg("#c0caf5")("Toggle horizontal")}`,
  })

  instructionsBox.add(instructionsText1)
  instructionsBox.add(instructionsText2)

  mainContainer.add(scrollBox)
  mainContainer.add(instructionsBox)

  renderer.root.add(mainContainer)

  scrollBox.focus()

  // Generate 1000 boxes, each with multiline styled text
  // Add an ASCII renderable at the top (index 0) for immediate visibility
  addAsciiRenderable(0)

  for (let index = 1; index < 1000; index++) {
    if ((index + 1) % 100 === 0) {
      addAsciiRenderable(index)
    } else {
      addBox(index)
    }
  }

  function addBox(i: number) {
    const box = new BoxComponent(renderer!, {
      id: `box-${i + 1}`,
      width: "100%",
      padding: 1,
      marginBottom: 1,
      backgroundColor: i % 2 === 0 ? "#292e42" : "#2f3449",
    })

    const content = makeMultilineContent(i)
    const text = new TextComponent(renderer!, {
      content,
    })

    box.add(text)
    scrollBox!.add(box)
  }

  function addAsciiRenderable(i: number) {
    const fonts = ["tiny", "block", "shade", "slick"] as const
    const font = fonts[i % fonts.length]
    const colors = [
      [RGBA.fromInts(166, 227, 161, 255), RGBA.fromInts(122, 162, 247, 255)],
      [RGBA.fromInts(247, 118, 142, 255), RGBA.fromInts(245, 194, 231, 255)],
      [RGBA.fromInts(125, 196, 228, 255), RGBA.fromInts(199, 146, 234, 255)],
      [RGBA.fromInts(244, 191, 117, 255), RGBA.fromInts(249, 226, 175, 255)],
    ][i % 4]

    const longText =
      `ASCII FONT RENDERABLE #${i + 1} - ${font.toUpperCase()} STYLE - This is an extremely long piece of text that will definitely exceed the width of the scrollbox and trigger horizontal scrolling functionality. `.repeat(
        15,
      ) +
      `Additional content includes: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. `.repeat(
        12,
      ) +
      `The quick brown fox jumps over the lazy dog while the sly red panda silently observes from the treetops, contemplating the mysteries of the universe and wondering about the meaning of life. Meanwhile, technology continues to advance at an unprecedented rate, bringing both amazing opportunities and challenging ethical dilemmas to humanity's doorstep. From artificial intelligence to quantum computing, the future holds limitless possibilities that our ancestors could only dream of in their wildest imaginations.`.repeat(
        8,
      )

    const asciiRenderable = new ASCIIFontComponent(renderer!, {
      id: `ascii-${i + 1}`,
      text: longText,
      font,
      fg: colors,
      bg: RGBA.fromInts(26, 27, 38, 255),
      selectionBg: "#f7768e",
      selectionFg: "#c0caf5",
      zIndex: 10,
    })

    scrollBox!.add(asciiRenderable)
  }

  function makeMultilineContent(i: number) {
    const palette = [fg("#7aa2f7"), fg("#9ece6a"), fg("#f7768e"), fg("#7dcfff"), fg("#bb9af7"), fg("#e0af68")]
    const colorize = palette[i % palette.length]
    const id = (i + 1).toString().padStart(4, "0")
    const tag = i % 3 === 0 ? underline("INFO") : i % 3 === 1 ? bold("WARN") : bold(fg("#f7768e")("ERROR"))

    const barUnits = 10 + (i % 30)
    const bar = "█".repeat(Math.floor(barUnits * 0.6)).padEnd(barUnits, "░")
    const details = "data ".repeat((i % 4) + 2)

    return t`${fg("#565f89")(`[${id}]`)} ${bold(colorize(`Box ${i + 1}`))} ${fg("#565f89")("|")} ${tag}
      ${fg("#9aa5ce")("Multiline content with mixed styles for stress testing.")}
      ${colorize("• Title:")} ${bold(italic(`Lorem ipsum ${i}`))}
      ${fg("#9ece6a")("• Detail A:")} ${fg("#c0caf5")(details.trim())}
      ${fg("#bb9af7")("• Detail B:")} ${fg("#a9b1d6")("The quick brown fox jumps over the lazy dog.")}
      ${fg("#7dcfff")("• Progress:")} ${fg("#73daca")(bar)} ${fg("#565f89")(barUnits)}
      ${fg("#565f89")("— end of box —")}`
  }
}

export function destroy(rendererInstance: Renderer): void {
  if (mainContainer) {
    rendererInstance.root.remove(mainContainer.id)
    mainContainer.destroy()
    mainContainer = null
  }
  if (scrollBox) {
    scrollBox.destroy()
    scrollBox = null
  }
  if (instructionsBox) {
    instructionsBox.destroy()
    instructionsBox = null
  }
  renderer = null
}

if (import.meta.main) {
  const renderer = await createRenderer({
    exitOnCtrlC: true,
  })

  run(renderer)
  setupCommonDemoKeys(renderer)

  const { getKeyHandler } = await import("../src/lib/key-handler")
  getKeyHandler().on("keypress", (key) => {
    if (key.name === "a" && scrollBox) {
      const currentState = scrollBox.verticalScrollBar?.showArrows ?? false
      scrollBox.verticalScrollBar!.showArrows = !currentState
      scrollBox.horizontalScrollBar!.showArrows = !currentState
      console.log(`Arrows ${!currentState ? "enabled" : "disabled"}`)
    } else if (key.name === "v" && scrollBox) {
      const currentState = scrollBox.verticalScrollBar.visible
      scrollBox.verticalScrollBar.visible = !currentState
      console.log(`Vertical scrollbar ${!currentState ? "shown" : "hidden"}`)
    } else if (key.name === "h" && scrollBox) {
      const currentState = scrollBox.horizontalScrollBar.visible
      scrollBox.horizontalScrollBar.visible = !currentState
      console.log(`Horizontal scrollbar ${!currentState ? "shown" : "hidden"}`)
    }
  })
}