import { getKeyHandler } from "../../src/lib/key-handler.js"

import type { ParsedKey, CliRenderer } from "../../src/index.js"

export function setupCommonDemoKeys(renderer: CliRenderer) {
  getKeyHandler().on("keypress", (key: ParsedKey) => {
    if (key.name === "`") {
      renderer.console.toggle()
    } else if (key.name === "t") {
      renderer.toggleDebugOverlay()
    } else if (key.name === "g" && key.ctrl) {
      console.log("dumping hit grid")
      renderer.dumpHitGrid()
    }
  })
}
