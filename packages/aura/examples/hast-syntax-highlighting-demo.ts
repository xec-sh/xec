import { parseColor } from "../src/lib/colors.js"
import { getKeyHandler } from "../src/lib/key-handler.js"
import { setupCommonDemoKeys } from "./lib/standalone-keys"
import { SyntaxStyle, hastToStyledText, type HASTElement } from "../src/lib/hast-styled-text.js"
import {
  Renderer,
  BoxComponent,
  TextComponent,
  type ParsedKey,
  GroupComponent,
  createRenderer,
} from "../src/index.js"

const exampleHAST: HASTElement = (await import("./assets/hast-example.json", { with: { type: "json" } })) as HASTElement

let renderer: Renderer | null = null
let keyboardHandler: ((key: ParsedKey) => void) | null = null
let parentContainer: GroupComponent | null = null

export function run(rendererInstance: Renderer): void {
  renderer = rendererInstance
  renderer.start()
  renderer.setBackgroundColor("#0D1117")

  parentContainer = new GroupComponent("parent-container", {
    zIndex: 10,
    visible: true,
    padding: 1,
  })
  renderer.root.add(parentContainer)

  const titleBox = new BoxComponent("title-box", {
    height: 3,
    borderStyle: "double",
    borderColor: "#4ECDC4",
    backgroundColor: "#0D1117",
    title: "HAST to Styled Text Demo",
    titleAlignment: "center",
  })
  parentContainer.add(titleBox)

  const instructionsText = new TextComponent("instructions", {
    content: "ESC to return | R to re-transform | Demonstrating HAST tree conversion to syntax-highlighted text",
    fg: "#888888",
  })
  titleBox.add(instructionsText)

  const codeBox = new BoxComponent("code-box", {
    borderStyle: "single",
    borderColor: "#6BCF7F",
    backgroundColor: "#0D1117",
    title: "TypeScript Code",
    titleAlignment: "left",
    paddingLeft: 1,
  })
  parentContainer.add(codeBox)

  const syntaxStyle = new SyntaxStyle({
    keyword: { fg: parseColor("#FF6B9D"), bold: true },
    string: { fg: parseColor("#A8E6CF") },
    comment: { fg: parseColor("#888888"), italic: true },
    number: { fg: parseColor("#FFD93D") },
    function: { fg: parseColor("#6BCF7F") },
    type: { fg: parseColor("#4ECDC4") },
    operator: { fg: parseColor("#FF8C94") },
    variable: { fg: parseColor("#C7CEEA") },
    bracket: { fg: parseColor("#FFFFFF") },
    punctuation: { fg: parseColor("#DDDDDD") },
    default: { fg: parseColor("#FFFFFF") },
  })
  const transformStart = performance.now()
  const styledText = hastToStyledText(exampleHAST, syntaxStyle)
  const transformEnd = performance.now()
  const transformTime = (transformEnd - transformStart).toFixed(2)

  const codeDisplay = new TextComponent("code-display", {
    content: styledText,
    bg: "#0D1117",
    selectable: true,
    selectionBg: "#264F78",
    selectionFg: "#FFFFFF",
  })
  codeBox.add(codeDisplay)

  const timingText = new TextComponent("timing-display", {
    content: `HAST transformation time: ${transformTime}ms (Cache: ${syntaxStyle.getCacheSize()} entries) (Press 'R' to re-transform)`,
    fg: "#A8E6CF",
  })
  parentContainer.add(timingText)

  keyboardHandler = (key: ParsedKey) => {
    if (key.name === "r" || key.name === "R") {
      syntaxStyle.clearCache()

      const retransformStart = performance.now()
      const newStyledText = hastToStyledText(exampleHAST, syntaxStyle)
      const retransformEnd = performance.now()
      const newTransformTime = (retransformEnd - retransformStart).toFixed(2)

      codeDisplay.content = newStyledText
      timingText.content = `HAST transformation time: ${newTransformTime}ms (Cache: ${syntaxStyle.getCacheSize()} entries) (Press 'R' to re-transform)`

      console.log(`Style cache entries: ${syntaxStyle.getCacheSize()}`)
    }
  }

  getKeyHandler().on("keypress", keyboardHandler)
}

export function destroy(rendererInstance: Renderer): void {
  if (keyboardHandler) {
    getKeyHandler().off("keypress", keyboardHandler)
    keyboardHandler = null
  }

  parentContainer?.destroy()
  parentContainer = null

  renderer = null
}

if (import.meta.main) {
  const renderer = await createRenderer({
    exitOnCtrlC: true,
    targetFps: 60,
  })
  run(renderer)
  setupCommonDemoKeys(renderer)
}
