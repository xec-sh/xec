import { EventEmitter } from "events"

import { parseKeypress } from "./parse.keypress.js"

export class KeyHandler extends EventEmitter {
  constructor() {
    super()

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()
    process.stdin.setEncoding("utf8")

    process.stdin.on("data", (key: Buffer) => {
      const parsedKey = parseKeypress(key)
      this.emit("keypress", parsedKey)
    })
  }

  public destroy(): void {
    process.stdin.removeAllListeners("data")
  }
}

let keyHandler: KeyHandler | null = null

export function getKeyHandler(): KeyHandler {
  if (!keyHandler) {
    keyHandler = new KeyHandler()
  }
  return keyHandler
}
