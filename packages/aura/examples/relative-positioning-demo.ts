import { setupCommonDemoKeys } from "./lib/standalone-keys"
import {
  BoxComponent,
  TextComponent,
  TextAttributes,
  GroupComponent,
  createCliRenderer,
} from "../src/index"

import type { Renderer } from "../src/index"

let globalKeyboardHandler: ((key: Buffer) => void) | null = null
let animationSpeed = 4000
let animationTime = 0

export function run(renderer: Renderer): void {
  renderer.start()
  renderer.setBackgroundColor("#001122")

  const rootContainer = new GroupComponent("root-container", {
    position: "relative",
    left: 0,
    top: 0,
    zIndex: 10,
    visible: true,
  })
  renderer.root.add(rootContainer)

  const title = new TextComponent("main-title", {
    content: "Relative Positioning Demo - Child positions are relative to parent",
    position: "absolute",
    left: 5,
    top: 1,
    fg: "#FFFF00",
    attributes: TextAttributes.BOLD | TextAttributes.UNDERLINE,
    zIndex: 1000,
  })
  rootContainer.add(title)

  const parentContainerA = new GroupComponent("parent-container-a", {
    position: "absolute",
    left: 10,
    top: 5,
    zIndex: 50,
    visible: true,
  })
  rootContainer.add(parentContainerA)

  const parentBoxA = new BoxComponent("parent-box-a", {
    left: 0,
    top: 0,
    width: 40,
    height: 12,
    backgroundColor: "#220044",
    zIndex: 1,
    borderStyle: "double",
    borderColor: "#FF44FF",
    title: "Parent A (moves in circle)",
    titleAlignment: "center",
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  })
  parentContainerA.add(parentBoxA)

  const childA1 = new BoxComponent("child-a1", {
    width: "auto",
    height: "auto",
    backgroundColor: "#440066",
    zIndex: 2,
    borderStyle: "single",
    borderColor: "#FF88FF",
    title: "Child 1",
    titleAlignment: "center",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 8,
  })
  parentBoxA.add(childA1)

  const childA2 = new BoxComponent("child-a2", {
    width: "auto",
    height: "auto",
    backgroundColor: "#660044",
    zIndex: 2,
    borderStyle: "single",
    borderColor: "#FF88FF",
    title: "Child 2",
    titleAlignment: "center",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 8,
  })
  parentBoxA.add(childA2)

  const childA3 = new BoxComponent("child-a3", {
    width: "auto",
    height: "auto",
    backgroundColor: "#440044",
    zIndex: 2,
    borderStyle: "single",
    borderColor: "#FF88FF",
    title: "Child 3",
    titleAlignment: "center",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 8,
  })
  parentBoxA.add(childA3)

  const parentContainerB = new GroupComponent("parent-container-b", {
    position: "absolute",
    left: 50,
    top: 8,
    zIndex: 50,
    visible: true,
  })
  rootContainer.add(parentContainerB)

  const parentBoxB = new BoxComponent("parent-box-b", {
    left: 0,
    top: 0,
    width: 40,
    height: 10,
    backgroundColor: "#004422",
    zIndex: 1,
    borderStyle: "rounded",
    borderColor: "#44FF44",
    title: "Parent B (moves vertically)",
    titleAlignment: "center",
    padding: 1,
    flexDirection: "column",
    justifyContent: "space-between",
  })
  parentContainerB.add(parentBoxB)

  const parentLabelB = new TextComponent("parent-label-b", {
    content: "Parent B Position: (50, 8)",
    fg: "#44FF44",
    attributes: TextAttributes.BOLD,
    zIndex: 2,
  })
  parentBoxB.add(parentLabelB)

  const childB1 = new TextComponent("child-b1", {
    content: "Child at (1,3) - relative to parent",
    fg: "#88FF88",
    zIndex: 2,
  })
  parentBoxB.add(childB1)

  const childB2 = new TextComponent("child-b2", {
    content: "Child at (1,5) - relative to parent",
    fg: "#88FF88",
    zIndex: 2,
  })
  parentBoxB.add(childB2)

  const staticContainer = new GroupComponent("static-container", {
    position: "absolute",
    left: 5,
    top: 20,
    zIndex: 50,
    visible: true,
  })
  rootContainer.add(staticContainer)

  const staticBox = new BoxComponent("static-box", {
    left: 0,
    top: 0,
    width: 40,
    height: 8,
    backgroundColor: "#442200",
    zIndex: 1,
    borderStyle: "single",
    borderColor: "#FFFF44",
    title: "Static Parent (doesn't move)",
    titleAlignment: "center",
    padding: 1,
    flexDirection: "column",
  })
  staticContainer.add(staticBox)

  const staticChild1 = new TextComponent("static-child1", {
    content: "Static child at (2,2) - never moves",
    fg: "#FFFF88",
    zIndex: 2,
  })
  staticBox.add(staticChild1)

  const staticChild2 = new TextComponent("static-child2", {
    content: "Static child at (2,4) - never moves",
    fg: "#FFFF88",
    zIndex: 2,
  })
  staticBox.add(staticChild2)

  const explanation1 = new TextComponent("explanation1", {
    content: "Key Concept: Parent A uses flex layout - children are arranged in a row",
    position: "absolute",
    left: 5,
    top: 30,
    fg: "#AAAAAA",
    attributes: TextAttributes.BOLD,
    zIndex: 1000,
  })
  rootContainer.add(explanation1)

  const explanation2 = new TextComponent("explanation2", {
    content: "When parent moves, children move with it while maintaining flex layout",
    position: "absolute",
    left: 5,
    top: 31,
    fg: "#AAAAAA",
    zIndex: 1000,
  })
  rootContainer.add(explanation2)

  const explanation3 = new TextComponent("explanation3", {
    content: "Flex children automatically fit parent width and grow/shrink as needed",
    position: "absolute",
    left: 5,
    top: 32,
    fg: "#AAAAAA",
    zIndex: 1000,
  })
  rootContainer.add(explanation3)

  const controls = new TextComponent("controls", {
    content: "Controls: +/- to change animation speed",
    position: "absolute",
    left: 5,
    top: 34,
    fg: "#FFFFFF",
    attributes: TextAttributes.BOLD,
    zIndex: 1000,
  })
  rootContainer.add(controls)

  const speedDisplay = new TextComponent("speed-display", {
    content: `Animation Speed: ${animationSpeed}ms (min: 500, max: 8000)`,
    position: "absolute",
    left: 5,
    top: 35,
    fg: "#CCCCCC",
    zIndex: 1000,
  })
  rootContainer.add(speedDisplay)

  renderer.setFrameCallback(async (deltaMs) => {
    animationTime += deltaMs

    const circleRadius = 15
    const circleSpeed = (animationTime / animationSpeed) * Math.PI * 2
    const parentAX = 20 + Math.cos(circleSpeed) * circleRadius
    const parentAY = 8 + (Math.sin(circleSpeed) * circleRadius) / 2

    parentContainerA.setPosition({
      left: Math.round(parentAX),
      top: Math.round(parentAY),
    })

    const verticalSpeed = (animationTime / (animationSpeed * 1.5)) * Math.PI * 2
    const parentBY = 8 + Math.sin(verticalSpeed) * 8

    parentContainerB.setPosition({
      left: 50,
      top: Math.round(parentBY),
    })
    parentLabelB.content = `Parent B Position: (50, ${Math.round(parentBY)})`
  })

  globalKeyboardHandler = (key: Buffer) => {
    const keyStr = key.toString()

    if (keyStr === "+" || keyStr === "=") {
      animationSpeed = Math.max(500, animationSpeed - 300)
      speedDisplay.content = `Animation Speed: ${animationSpeed}ms (min: 500, max: 8000)`
    } else if (keyStr === "-" || keyStr === "_") {
      animationSpeed = Math.min(8000, animationSpeed + 300)
      speedDisplay.content = `Animation Speed: ${animationSpeed}ms (min: 500, max: 8000)`
    }
  }

  process.stdin.on("data", globalKeyboardHandler)
}

export function destroy(renderer: Renderer): void {
  if (globalKeyboardHandler) {
    process.stdin.removeListener("data", globalKeyboardHandler)
    globalKeyboardHandler = null
  }

  renderer.root.remove("root-container")

  renderer.clearFrameCallbacks()
  renderer.setCursorPosition(0, 0, false)
  animationTime = 0
}

if (import.meta.main) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  run(renderer)
  setupCommonDemoKeys(renderer)
}
