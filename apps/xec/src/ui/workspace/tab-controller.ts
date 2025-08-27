import { TabsComponent, GroupComponent, OptimizedBuffer, TabsComponentEvents } from "@xec-sh/aura"
import { Renderer, Component, TabsOption, parseColor, type ColorInput, RenderableEvents, type ComponentProps } from "@xec-sh/aura"

export interface TabObject {
  title: string
  init(tabGroup: Component): void
  update?(deltaMs: number, tabGroup: Component): void
  show?(): void
  hide?(): void
}

interface Tab {
  title: string
  tabObject: TabObject
  group: Component
  initialized: boolean
}

export interface TabControllerOptions extends ComponentProps {
  backgroundColor?: ColorInput
  textColor?: ColorInput
  tabBarHeight?: number
  tabBarBackgroundColor?: ColorInput
  selectedBackgroundColor?: ColorInput
  selectedTextColor?: ColorInput
  selectedDescriptionColor?: ColorInput
  showDescription?: boolean
  showUnderline?: boolean
  showScrollArrows?: boolean
}

export enum TabControllerEvents {
  TAB_CHANGED = "tabChanged",
}

export class TabControllerComponent extends Component {
  public tabs: Tab[] = []
  private currentTabIndex = 0
  private tabSelectElement: TabsComponent
  private tabBarHeight: number
  private frameCallback: ((deltaMs: number) => Promise<void>) | null = null

  constructor(
    id: string,
    private renderer: Renderer,
    options: TabControllerOptions,
  ) {
    super(id, { ...options, buffered: options.backgroundColor ? true : false })

    this.tabBarHeight = options.tabBarHeight || 4

    this.tabSelectElement = new TabsComponent(`${id}-tabs`, {
      width: "100%",
      height: this.tabBarHeight,
      options: [],
      zIndex: this.zIndex + 100,
      selectedBackgroundColor: options.selectedBackgroundColor || "#333333",
      selectedTextColor: options.selectedTextColor || "#FFFF00",
      textColor: parseColor(options.textColor || "#FFFFFF"),
      selectedDescriptionColor: options.selectedDescriptionColor || "#FFFFFF",
      backgroundColor: options.tabBarBackgroundColor || options.backgroundColor || "transparent",
      showDescription: options.showDescription ?? true,
      showUnderline: options.showUnderline ?? true,
      showScrollArrows: options.showScrollArrows ?? true,
    })

    this.tabSelectElement.on(TabsComponentEvents.SELECTION_CHANGED, (index: number) => {
      this.switchToTab(index)
    })

    this.add(this.tabSelectElement)

    this.frameCallback = async (deltaMs) => {
      this.update(deltaMs)
    }
    this.renderer.setFrameCallback(this.frameCallback)
  }

  public addTab(tabObject: TabObject): Tab {
    const tabGroup = new GroupComponent(`${this.id}-tab-${this.tabs.length}`, {
      position: "absolute",
      left: 0,
      top: this.tabBarHeight,
      zIndex: this.zIndex + 50,
      visible: false,
      width: "100%",
      height: 1,
    })

    this.add(tabGroup)

    const tab: Tab = {
      title: tabObject.title,
      tabObject,
      group: tabGroup,
      initialized: false,
    }
    this.tabs.push(tab)

    this.updateTabSelectOptions()
    return tab
  }

  private updateTabSelectOptions(): void {
    const options: TabsOption[] = this.tabs.map((tab, index) => ({
      name: tab.title,
      description: `Tab ${index + 1}/${this.tabs.length} - Use Left/Right arrows to navigate | Press Ctrl+C to exit | D: toggle debug`,
      value: index,
    }))

    this.tabSelectElement.setOptions(options)

    if (this.tabs.length === 1) {
      const firstTab = this.getCurrentTab()
      firstTab.group.visible = true
      this.initializeTab(firstTab)

      if (firstTab.tabObject.show) {
        firstTab.tabObject.show()
      }
    }
  }

  private initializeTab(tab: Tab): void {
    if (!tab.initialized) {
      tab.tabObject.init(tab.group)
      tab.initialized = true
    }
  }

  public getCurrentTab(): Tab {
    return this.tabs[this.currentTabIndex]!;
  }

  public getCurrentTabGroup(): Component {
    return this.getCurrentTab().group
  }

  public switchToTab(index: number): void {
    if (index < 0 || index >= this.tabs.length) return
    if (index === this.currentTabIndex) return

    const currentTab = this.getCurrentTab()
    currentTab.group.visible = false
    if (currentTab.tabObject.hide) {
      currentTab.tabObject.hide()
    }

    this.currentTabIndex = index
    this.tabSelectElement.setSelectedIndex(index)

    const newTab = this.getCurrentTab()
    newTab.group.visible = true

    this.initializeTab(newTab)

    if (newTab.tabObject.show) {
      newTab.tabObject.show()
    }

    this.emit(TabControllerEvents.TAB_CHANGED, index, newTab)
  }

  public nextTab(): void {
    this.switchToTab((this.currentTabIndex + 1) % this.tabs.length)
  }

  public previousTab(): void {
    this.switchToTab((this.currentTabIndex - 1 + this.tabs.length) % this.tabs.length)
  }

  public update(deltaMs: number): void {
    const currentTab = this.getCurrentTab()
    if (currentTab && currentTab.tabObject.update) {
      currentTab.tabObject.update(deltaMs, currentTab.group)
    }
  }

  public getCurrentTabIndex(): number {
    return this.currentTabIndex
  }

  public getTabSelectElement(): TabsComponent {
    return this.tabSelectElement
  }

  public override focus(): void {
    this.tabSelectElement.focus()
    this.emit(RenderableEvents.FOCUSED)
  }

  public override blur(): void {
    this.tabSelectElement.blur()
    this.emit(RenderableEvents.BLURRED)
  }

  public override get focused(): boolean {
    return this.tabSelectElement.focused
  }

  public override onResize(width: number, height: number): void {
    if (this.width === width && this.height === height) return

    this.width = width
    this.height = height

    this.tabSelectElement.width = width
    this.tabSelectElement.height = this.tabBarHeight

    for (const tab of this.tabs) {
      tab.group.y = this.tabBarHeight
      tab.group.width = width
      tab.group.height = height - this.tabBarHeight
    }
  }

  protected override renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // TabController doesn't render content directly, it manages tab selection and tab content
    // The tab select element and tab content groups handle their own rendering
  }

  protected override destroySelf(): void {
    this.blur()

    if (this.frameCallback) {
      this.renderer.removeFrameCallback(this.frameCallback)
      this.frameCallback = null
    }

    for (const tab of this.tabs) {
      tab.group.destroy()
    }

    this.tabSelectElement.destroy()

    this.removeAllListeners()
  }
}
