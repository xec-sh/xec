import { setupCommonDemoKeys } from "./lib/standalone-keys"
import { ScrollBoxComponent } from "../src/components/scroll-box.js"
import { BoxComponent, TextComponent, type Renderer, createRenderer, ASCIIFontComponent } from "../src/index.js"

let scrollBox: ScrollBoxComponent | null = null
let renderer: Renderer | null = null

export function run(rendererInstance: Renderer): void {
  renderer = rendererInstance
  renderer.setBackgroundColor("#001122")

  scrollBox = new ScrollBoxComponent(renderer, {
    id: "scroll-box",
    width: "100%",
    height: "100%",
    rootOptions: {
      backgroundColor: "#730000",
      border: true,
    },
    wrapperOptions: {
      backgroundColor: "#9f0045",
    },
    viewportOptions: {
      backgroundColor: "#005dbb",
    },
    contentOptions: {
      backgroundColor: "#7fbfff",
    },
    scrollbarOptions: {
      showArrows: true,
      thumbOptions: {
        backgroundColor: "#fe9d15",
      },
      trackOptions: {
        backgroundColor: "#fff693",
      },
    },
  })

  scrollBox.focus()

  renderer.root.add(scrollBox)

  for (let index = 0; index < 20; index++) addItem(`Item ${index + 1}`)

  const item = new BoxComponent(renderer, {
    id: "scroll-item",
    width: 120,
    margin: 5,
    height: 5,
    backgroundColor: "red",
  })

  scrollBox.content.add(item)

  item.add(
    new ASCIIFontComponent(renderer, {
      text: "OPENTUI Scroll",
      margin: "auto",
    }),
  )

  for (let index = 0; index < 20; index++) addItem(`Item ${index + 1}`)

  function addItem(content: string) {
    scrollBox!.content.add(
      new TextComponent(renderer!, {
        content,
      }),
    )
  }
}

export function destroy(rendererInstance: Renderer): void {
  if (scrollBox) {
    rendererInstance.root.remove(scrollBox.id)
    scrollBox.destroy()
    scrollBox = null
  }
  renderer = null
}

if (import.meta.main) {
  const renderer = await createRenderer({
    exitOnCtrlC: true,
  })

  run(renderer)
  setupCommonDemoKeys(renderer)
}