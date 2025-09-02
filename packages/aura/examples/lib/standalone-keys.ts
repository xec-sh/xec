import { getKeyHandler } from "../../src/lib/key-handler.js"

import type { Renderer, ParsedKey } from "../../src/index.js"

export function setupCommonDemoKeys(renderer: Renderer) {
  getKeyHandler().on("keypress", (key: ParsedKey) => {
    if (key.name === "`" || key.name === '"') {
      renderer.console.toggle()
    } else if (key.name === "t") {
      renderer.toggleDebugOverlay()
    } else if (key.name === "g" && key.ctrl) {
      console.log("dumping hit grid")
      renderer.dumpHitGrid()
    } else if (key.name === "l" && key.shift) {
      renderer.start()
    } else if (key.name === "s" && key.shift) {
      renderer.stop()
    } else if (key.name === "a" && key.shift) {
      renderer.auto()
    }
  })
}
