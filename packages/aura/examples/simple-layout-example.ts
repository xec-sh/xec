import { getKeyHandler } from "../src/lib/key-handler"
import { setupCommonDemoKeys } from "./lib/standalone-keys"
import {
  Renderer,
  BoxComponent,
  TextComponent,
  type ParsedKey,
  GroupComponent,
  createRenderer,
} from "../src/index"

interface LayoutDemo {
  name: string
  description: string
  setup: () => void
}

let renderer: Renderer | null = null
let header: BoxComponent | null = null
let headerText: TextComponent | null = null
let contentArea: GroupComponent | null = null
let sidebar: BoxComponent | null = null
let sidebarText: TextComponent | null = null
let mainContent: BoxComponent | null = null
let mainContentText: TextComponent | null = null
let rightSidebar: BoxComponent | null = null
let rightSidebarText: TextComponent | null = null
let footer: BoxComponent | null = null
let footerText: TextComponent | null = null
let moveableElement: BoxComponent | null = null
let moveableText: TextComponent | null = null
let absolutePositionedBox: BoxComponent | null = null
let absolutePositionedText: TextComponent | null = null
let currentDemoIndex = 0
let autoAdvanceTimeout: Timer | null = null
let autoplayEnabled = true
let moveableElementVisible = true
let moveableElementX = 0
let moveableElementY = 0

const layoutDemos: LayoutDemo[] = [
  {
    name: "Horizontal Layout",
    description: "Sidebar on left, main content on right",
    setup: () => setupHorizontalLayout(),
  },
  {
    name: "Vertical Layout",
    description: "Sidebar on top, main content below",
    setup: () => setupVerticalLayout(),
  },
  {
    name: "Centered Layout",
    description: "Content centered with margins",
    setup: () => setupCenteredLayout(),
  },
  {
    name: "Three Column",
    description: "Left sidebar, center content, right sidebar",
    setup: () => setupThreeColumnLayout(),
  },
]

function resetElementLayout(element: BoxComponent): void {
  element.flexBasis = "auto"
  element.flexGrow = 0
  element.flexShrink = 0
  element.width = "auto"
  element.height = "auto"

  element.minWidth = undefined
  element.maxWidth = undefined
  element.minHeight = undefined
  element.maxHeight = undefined
}

function setupHorizontalLayout(): void {
  if (!contentArea || !sidebar || !mainContent || !rightSidebar) return

  sidebar.visible = true
  mainContent.visible = true
  rightSidebar.visible = false

  resetElementLayout(sidebar)
  resetElementLayout(mainContent)

  contentArea.flexDirection = "row"
  contentArea.alignItems = "stretch"

  const sidebarWidth = Math.max(15, Math.floor(renderer!.terminalWidth * 0.2))
  sidebar.flexBasis = sidebarWidth
  sidebar.flexGrow = 0
  sidebar.flexShrink = 0
  sidebar.width = sidebarWidth
  sidebar.minWidth = 15
  sidebar.height = "auto"
  if (sidebarText) sidebarText.content = "LEFT SIDEBAR"
  sidebar.backgroundColor = "#64748b"

  mainContent.flexBasis = "auto"
  mainContent.flexGrow = 1
  mainContent.flexShrink = 1
  mainContent.width = "auto"
  mainContent.minWidth = 20
  mainContent.height = "auto"
  if (mainContentText) mainContentText.content = "MAIN CONTENT"
  mainContent.backgroundColor = "#eab308"
}

function setupVerticalLayout(): void {
  if (!contentArea || !sidebar || !mainContent || !rightSidebar) return

  sidebar.visible = true
  mainContent.visible = true
  rightSidebar.visible = false

  resetElementLayout(sidebar)
  resetElementLayout(mainContent)

  contentArea.flexDirection = "column"
  contentArea.alignItems = "stretch"

  const contentHeight = renderer!.terminalHeight - 6
  const topBarHeight = Math.max(3, Math.floor(contentHeight * 0.2))
  sidebar.flexBasis = topBarHeight
  sidebar.flexGrow = 0
  sidebar.flexShrink = 0
  sidebar.height = topBarHeight
  sidebar.minHeight = 3
  sidebar.width = "auto"
  if (sidebarText) sidebarText.content = "TOP BAR"
  sidebar.backgroundColor = "#059669"

  mainContent.flexBasis = "auto"
  mainContent.flexGrow = 1
  mainContent.flexShrink = 1
  mainContent.height = "auto"
  mainContent.minHeight = 5
  mainContent.width = "auto"
  if (mainContentText) mainContentText.content = "MAIN CONTENT"
  mainContent.backgroundColor = "#eab308"
}

function setupCenteredLayout(): void {
  if (!contentArea || !sidebar || !mainContent || !rightSidebar) return

  sidebar.visible = false
  mainContent.visible = true
  rightSidebar.visible = false

  resetElementLayout(mainContent)

  contentArea.flexDirection = "row"
  contentArea.alignItems = "stretch"
  contentArea.justifyContent = "center"

  const centerWidth = Math.max(30, Math.floor(renderer!.terminalWidth * 0.6))
  mainContent.flexBasis = centerWidth
  mainContent.flexGrow = 0
  mainContent.flexShrink = 0
  mainContent.width = centerWidth
  mainContent.minWidth = 30
  mainContent.maxWidth = Math.floor(renderer!.terminalWidth * 0.8)
  mainContent.height = "auto"
  if (mainContentText) mainContentText.content = "CENTERED CONTENT"
  mainContent.backgroundColor = "#7c3aed"
}

function setupThreeColumnLayout(): void {
  if (!contentArea || !sidebar || !mainContent || !rightSidebar) return

  sidebar.visible = true
  mainContent.visible = true
  rightSidebar.visible = true

  resetElementLayout(sidebar)
  resetElementLayout(mainContent)
  resetElementLayout(rightSidebar)

  contentArea.flexDirection = "row"
  contentArea.alignItems = "stretch"

  const terminalWidth = renderer!.terminalWidth
  const sidebarWidth = Math.max(12, Math.floor(terminalWidth * 0.15))

  sidebar.flexBasis = sidebarWidth
  sidebar.flexGrow = 0
  sidebar.flexShrink = 0
  sidebar.width = sidebarWidth
  sidebar.minWidth = 12
  sidebar.height = "auto"
  if (sidebarText) sidebarText.content = "LEFT"
  sidebar.backgroundColor = "#dc2626"

  mainContent.flexBasis = "auto"
  mainContent.flexGrow = 1
  mainContent.flexShrink = 1
  mainContent.width = "auto"
  mainContent.minWidth = 20
  mainContent.height = "auto"
  if (mainContentText) mainContentText.content = "CENTER"
  mainContent.backgroundColor = "#059669"

  rightSidebar.flexBasis = sidebarWidth
  rightSidebar.flexGrow = 0
  rightSidebar.flexShrink = 0
  rightSidebar.width = sidebarWidth
  rightSidebar.minWidth = 12
  rightSidebar.height = "auto"
  if (rightSidebarText) rightSidebarText.content = "RIGHT"
  rightSidebar.backgroundColor = "#7c3aed"
}

function createLayoutElements(rendererInstance: Renderer): void {
  renderer = rendererInstance
  renderer.setBackgroundColor("#001122")

  header = new BoxComponent(renderer.root.ctx, { id: "header",
    zIndex: 0,
    width: "auto",
    height: 3,
    backgroundColor: "#3b82f6",
    borderStyle: "single",
    alignItems: "center",
    border: true,
  })

  headerText = new TextComponent(renderer.root.ctx, { id: "header-text",
    content: "LAYOUT DEMO",
    fg: "#ffffff",
    // bg: "transparent",
    zIndex: 1,

  })

  header.add(headerText)

  contentArea = new GroupComponent(renderer.root.ctx, { id: "content-area",
    zIndex: 0,
    width: "auto",
    height: "auto",
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
  })

  sidebar = new BoxComponent(renderer.root.ctx, { id: "sidebar",
    zIndex: 0,
    width: "auto",
    height: "auto",
    backgroundColor: "#64748b",
    borderStyle: "single",
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: true,
  })

  sidebarText = new TextComponent(renderer.root.ctx, { id: "sidebar-text",
    content: "SIDEBAR",
    fg: "#ffffff",
    bg: "transparent",
    zIndex: 1,
  })

  sidebar.add(sidebarText)

  mainContent = new BoxComponent(renderer.root.ctx, { id: "main-content",
    zIndex: 0,
    width: "auto",
    height: "auto",
    backgroundColor: "#919599",
    borderStyle: "single",
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: true,
  })

  mainContentText = new TextComponent(renderer.root.ctx, { id: "main-content-text",
    content: "MAIN CONTENT",
    fg: "#1e293b",
    bg: "transparent",
    zIndex: 1,
  })

  mainContent.add(mainContentText)

  rightSidebar = new BoxComponent(renderer.root.ctx, { id: "right-sidebar",
    zIndex: 0,
    width: "auto",
    height: "auto",
    backgroundColor: "#7c3aed",
    borderStyle: "single",
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: true,
  })

  rightSidebarText = new TextComponent(renderer.root.ctx, { id: "right-sidebar-text",
    content: "RIGHT",
    fg: "#ffffff",
    bg: "transparent",
    zIndex: 1,
  })

  rightSidebar.add(rightSidebarText)

  footer = new BoxComponent(renderer.root.ctx, { id: "footer",
    zIndex: 0,
    width: "auto",
    height: 3,
    backgroundColor: "#1e40af",
    borderStyle: "single",
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: true,
  })

  footerText = new TextComponent(renderer.root.ctx, { id: "footer-text",
    content: "",
    fg: "#ffffff",
    bg: "transparent",
    zIndex: 1,
  })

  footer.add(footerText)

  moveableElement = new BoxComponent(renderer.root.ctx, { id: "moveable",
    zIndex: 100,
    width: 8,
    height: 3,
    backgroundColor: "#ff6b6b",
    borderStyle: "single",
    borderColor: "#ff4757",
    position: "absolute",
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: true,
  })

  moveableText = new TextComponent(renderer.root.ctx, { id: "moveable-text",
    content: "MOVE",
    fg: "#ffffff",
    bg: "transparent",
    zIndex: 101,
  })

  moveableElement.add(moveableText)

  absolutePositionedBox = new BoxComponent(renderer.root.ctx, { id: "absolute-positioned-box",
    zIndex: 150,
    width: 20,
    height: 3,
    backgroundColor: "#22c55e",
    borderStyle: "single",
    borderColor: "#16a34a",
    position: "absolute",
    bottom: 1,
    right: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    border: true,
  })

  absolutePositionedText = new TextComponent(renderer.root.ctx, { id: "absolute-positioned-text",
    content: "BOTTOM RIGHT",
    fg: "#ffffff",
    bg: "transparent",
    zIndex: 151,
  })

  absolutePositionedBox.add(absolutePositionedText)

  // Add all elements to contentArea in the correct order: left, center, right
  contentArea.add(sidebar)
  contentArea.add(mainContent)
  contentArea.add(rightSidebar)

  // Set initial visibility (rightSidebar is hidden for the first demo)
  rightSidebar.visible = false

  renderer.root.add(header)
  renderer.root.add(contentArea)
  renderer.root.add(footer)
  renderer.root.add(moveableElement)
  renderer.root.add(absolutePositionedBox)

  centerMoveableElement()
  updateFooterText()
  renderer.on("resize", handleResize)
}

function handleResize(width: number, height: number): void {
  // Root layout is automatically resized by the renderer
  centerMoveableElement()
}

function handleKeyPress(key: ParsedKey): void {
  switch (key.name) {
    case "space": // Space - next layout
      nextDemo()
      break
    case "r": // R - restart cycle
      currentDemoIndex = 0
      applyCurrentDemo()
      break
    case "p": // P - toggle autoplay
      toggleAutoplay()
      break
    case "v": // V - toggle moveable element visibility
      toggleMoveableElement()
      break
    case "w": // W - move up
      moveMoveableElement(0, -1)
      break
    case "a": // A - move left
      moveMoveableElement(-1, 0)
      break
    case "s": // S - move down
      moveMoveableElement(0, 1)
      break
    case "d": // D - move right
      moveMoveableElement(1, 0)
      break
  }
}

function nextDemo(): void {
  currentDemoIndex = (currentDemoIndex + 1) % layoutDemos.length
  applyCurrentDemo()
}

function toggleAutoplay(): void {
  autoplayEnabled = !autoplayEnabled

  if (autoplayEnabled) {
    if (autoAdvanceTimeout) {
      clearTimeout(autoAdvanceTimeout)
    }
    autoAdvanceTimeout = setTimeout(() => {
      nextDemo()
    }, 4000)
  } else {
    if (autoAdvanceTimeout) {
      clearTimeout(autoAdvanceTimeout)
      autoAdvanceTimeout = null
    }
  }

  updateFooterText()
}

function toggleMoveableElement(): void {
  if (!moveableElement) return

  moveableElementVisible = !moveableElementVisible
  moveableElement.visible = moveableElementVisible
  updateFooterText()
}

function moveMoveableElement(deltaX: number, deltaY: number): void {
  if (!moveableElement || !renderer) return

  moveableElementX += deltaX
  moveableElementY += deltaY

  moveableElementX = Math.max(0, Math.min(renderer.terminalWidth - 8, moveableElementX))
  moveableElementY = Math.max(0, Math.min(renderer.terminalHeight - 3, moveableElementY))

  moveableElement.setPosition({
    left: moveableElementX,
    top: moveableElementY,
  })
}

function centerMoveableElement(): void {
  if (!renderer || !moveableElement) return

  moveableElementX = Math.floor((renderer.terminalWidth - 8) / 2)
  moveableElementY = Math.floor((renderer.terminalHeight - 3) / 2)

  moveableElement.setPosition({
    left: moveableElementX,
    top: moveableElementY,
  })
}

function updateFooterText(): void {
  if (!footerText) return

  const autoplayStatus = autoplayEnabled ? "ON" : "OFF"
  const moveableStatus = moveableElementVisible ? "ON" : "OFF"
  footerText.content = `SPACE: next | R: restart | P: autoplay (${autoplayStatus}) | V: overlay (${moveableStatus}) | WASD: move`
}

function applyCurrentDemo(): void {
  const demo = layoutDemos[currentDemoIndex]
  if (!headerText) return

  const autoplayStatus = autoplayEnabled ? "AUTO" : "MANUAL"
  headerText.content = `${demo.name} (${currentDemoIndex + 1}/${layoutDemos.length}) - ${autoplayStatus}`
  demo.setup()

  if (autoAdvanceTimeout) {
    clearTimeout(autoAdvanceTimeout)
  }

  if (autoplayEnabled) {
    autoAdvanceTimeout = setTimeout(() => {
      nextDemo()
    }, 4000)
  }
}

export function run(rendererInstance: Renderer): void {
  createLayoutElements(rendererInstance)
  getKeyHandler().on("keypress", handleKeyPress)
  currentDemoIndex = 0
  applyCurrentDemo()
}

export function destroy(rendererInstance: Renderer): void {
  if (autoAdvanceTimeout) {
    clearTimeout(autoAdvanceTimeout)
    autoAdvanceTimeout = null
  }

  getKeyHandler().off("keypress", handleKeyPress)

  if (renderer) {
    renderer.off("resize", handleResize)
  }

  if (header) rendererInstance.root.remove(header.id)
  if (contentArea) rendererInstance.root.remove(contentArea.id)
  if (footer) rendererInstance.root.remove(footer.id)
  if (moveableElement) rendererInstance.root.remove(moveableElement.id)
  if (absolutePositionedBox) rendererInstance.root.remove(absolutePositionedBox.id)

  header = null
  headerText = null
  contentArea = null
  sidebar = null
  sidebarText = null
  mainContent = null
  mainContentText = null
  rightSidebar = null
  rightSidebarText = null
  footer = null
  footerText = null
  moveableElement = null
  moveableText = null
  absolutePositionedBox = null
  absolutePositionedText = null
  renderer = null
  currentDemoIndex = 0
  moveableElementVisible = true
  moveableElementX = 0
  moveableElementY = 0
}

if (import.meta.main) {
  const renderer = await createRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })
  run(renderer)
  setupCommonDemoKeys(renderer)
}
