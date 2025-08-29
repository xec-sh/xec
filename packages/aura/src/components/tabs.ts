import { useTheme } from "../theme/context.js"
import { OptimizedBuffer } from "../renderer/buffer.js"
import { RGBA, parseColor, type Color } from "../lib/colors.js"
import { Component, type ComponentProps } from "../component.js"

// TabsTheme import removed - using global theme only
import type { ParsedKey, RenderContext } from "../types.js"

export interface TabsOption {
  name: string
  description: string
  value?: any
}

export interface TabsProps extends Omit<ComponentProps, "height"> {
  height?: number

  // Color properties - can be theme tokens or direct colors
  options?: TabsOption[]
  tabWidth?: number
  backgroundColor?: Color
  textColor?: Color
  focusedBackgroundColor?: Color
  focusedTextColor?: Color
  selectedBackgroundColor?: Color
  selectedTextColor?: Color
  selectedDescriptionColor?: Color
  showScrollArrows?: boolean
  showDescription?: boolean
  showUnderline?: boolean
  wrapSelection?: boolean
}

export enum TabsComponentEvents {
  SELECTION_CHANGED = "selectionChanged",
  ITEM_SELECTED = "itemSelected",
}

function calculateDynamicHeight(showUnderline: boolean, showDescription: boolean): number {
  let height = 1

  if (showUnderline) {
    height += 1
  }

  if (showDescription) {
    height += 1
  }

  return height
}

export class TabsComponent extends Component {
  protected focusable: boolean = true

  private _options: TabsOption[] = []
  private selectedIndex: number = 0
  private scrollOffset: number = 0
  private _tabWidth: number
  private maxVisibleTabs: number

  private _backgroundColor: RGBA
  private _textColor: RGBA
  private _focusedBackgroundColor: RGBA
  private _focusedTextColor: RGBA
  private _selectedBackgroundColor: RGBA
  private _selectedTextColor: RGBA
  private _selectedDescriptionColor: RGBA
  private _disabledBackgroundColor?: RGBA
  private _disabledTextColor?: RGBA
  private _showScrollArrows: boolean
  private _showDescription: boolean
  private _showUnderline: boolean
  private _wrapSelection: boolean

  constructor(ctx: RenderContext, options: TabsProps) {
    const calculatedHeight = calculateDynamicHeight(options.showUnderline ?? true, options.showDescription ?? true)

    super(ctx, { ...options, height: calculatedHeight, buffered: true })

    // Get theme and resolve colors
    const themeContext = useTheme()

    // Use global theme instead of theme prop

    // Resolve colors from props with theme fallbacks
    const tabsTheme = themeContext.components?.tabs

    // Helper function to resolve color
    const resolveColorValue = (value: Color | undefined, fallback?: string): RGBA => {
      if (value) {
        try {
          return themeContext.resolveColor(value)
        } catch {
          return parseColor(value)
        }
      }
      return parseColor(fallback || "transparent")
    }

    // Resolve colors from props with theme fallbacks
    this._backgroundColor = resolveColorValue(
      options.backgroundColor,
      tabsTheme?.background ? themeContext.resolveColor(tabsTheme.background).toHex() : "transparent"
    )

    this._textColor = resolveColorValue(
      options.textColor,
      tabsTheme?.foreground ? themeContext.resolveColor(tabsTheme.foreground).toHex() : "#FFFFFF"
    )

    // Resolve focused/hover state colors
    this._focusedBackgroundColor = resolveColorValue(
      options.focusedBackgroundColor || options.backgroundColor,
      tabsTheme?.states?.hover?.background
        ? themeContext.resolveColor(tabsTheme.states.hover.background).toHex()
        : "#1a1a1a"
    )

    this._focusedTextColor = resolveColorValue(
      options.focusedTextColor || options.textColor,
      tabsTheme?.states?.hover?.foreground
        ? themeContext.resolveColor(tabsTheme.states.hover.foreground).toHex()
        : "#FFFFFF"
    )

    // Resolve active/selected state colors
    this._selectedBackgroundColor = resolveColorValue(
      options.selectedBackgroundColor,
      tabsTheme?.states?.active?.background
        ? themeContext.resolveColor(tabsTheme.states.active.background).toHex()
        : "#334455"
    )

    this._selectedTextColor = resolveColorValue(
      options.selectedTextColor,
      tabsTheme?.states?.active?.foreground
        ? themeContext.resolveColor(tabsTheme.states.active.foreground).toHex()
        : "#FFFF00"
    )

    // Description color
    this._selectedDescriptionColor = parseColor(options.selectedDescriptionColor || "#CCCCCC")

    // Resolve disabled state colors
    this._disabledBackgroundColor = tabsTheme?.states?.disabled?.background
      ? themeContext.resolveColor(tabsTheme.states.disabled.background)
      : undefined

    this._disabledTextColor = tabsTheme?.states?.disabled?.foreground
      ? themeContext.resolveColor(tabsTheme.states.disabled.foreground)
      : undefined


    this._options = options.options || []
    this._tabWidth = options.tabWidth || 20
    this._showDescription = options.showDescription ?? true
    this._showUnderline = options.showUnderline ?? true
    this._showScrollArrows = options.showScrollArrows ?? true
    this._wrapSelection = options.wrapSelection ?? false

    this.maxVisibleTabs = Math.max(1, Math.floor(this.width / this._tabWidth))
  }

  private calculateDynamicHeight(): number {
    return calculateDynamicHeight(this._showUnderline, this._showDescription)
  }

  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.refreshFrameBuffer()
    }
  }

  private refreshFrameBuffer(): void {
    if (!this.frameBuffer || this._options.length === 0) return

    // Apply state-based colors
    let bgColor = this._backgroundColor
    if (this._disabled) {
      bgColor = this._disabledBackgroundColor || this._backgroundColor
    } else if (this._focused) {
      bgColor = this._focusedBackgroundColor
    }

    this.frameBuffer.clear(bgColor)

    const contentX = 0
    const contentY = 0
    const contentWidth = this.width
    const contentHeight = this.height

    const visibleOptions = this._options.slice(this.scrollOffset, this.scrollOffset + this.maxVisibleTabs)

    // Render tab names
    for (let i = 0; i < visibleOptions.length; i++) {
      const actualIndex = this.scrollOffset + i
      const option = visibleOptions[i]
      const isSelected = actualIndex === this.selectedIndex
      const tabX = contentX + i * this._tabWidth

      if (tabX >= contentX + contentWidth) break

      const actualTabWidth = Math.min(this._tabWidth, contentWidth - i * this._tabWidth)

      if (isSelected) {
        this.frameBuffer.fillRect(tabX, contentY, actualTabWidth, 1, this._selectedBackgroundColor)
      }

      let baseTextColor = this._textColor
      if (this._disabled) {
        baseTextColor = this._disabledTextColor || this._textColor
      } else if (this._focused) {
        baseTextColor = this._focusedTextColor
      }
      const nameColor = isSelected && !this._disabled ? this._selectedTextColor : baseTextColor
      const nameContent = this.truncateText(option.name, actualTabWidth - 2)
      this.frameBuffer.drawText(nameContent, tabX + 1, contentY, nameColor)

      if (isSelected && this._showUnderline && contentHeight >= 2) {
        const underlineY = contentY + 1
        const underlineBg = isSelected ? this._selectedBackgroundColor : bgColor
        this.frameBuffer.drawText("▬".repeat(actualTabWidth), tabX, underlineY, nameColor, underlineBg)
      }
    }

    if (this._showDescription && contentHeight >= (this._showUnderline ? 3 : 2)) {
      const selectedOption = this.getSelectedOption()
      if (selectedOption) {
        const descriptionY = contentY + (this._showUnderline ? 2 : 1)
        const descColor = this._selectedDescriptionColor
        const descContent = this.truncateText(selectedOption.description, contentWidth - 2)
        this.frameBuffer.drawText(descContent, contentX + 1, descriptionY, descColor)
      }
    }

    if (this._showScrollArrows && this._options.length > this.maxVisibleTabs) {
      this.renderScrollArrowsToFrameBuffer(contentX, contentY, contentWidth, contentHeight)
    }
  }

  private truncateText(text: string | undefined, maxWidth: number): string {
    if (!text) return ""
    if (text.length <= maxWidth) return text
    return text.substring(0, Math.max(0, maxWidth - 1)) + "…"
  }

  private renderScrollArrowsToFrameBuffer(
    contentX: number,
    contentY: number,
    contentWidth: number,
    contentHeight: number,
  ): void {
    if (!this.frameBuffer) return

    const hasMoreLeft = this.scrollOffset > 0
    const hasMoreRight = this.scrollOffset + this.maxVisibleTabs < this._options.length

    if (hasMoreLeft) {
      this.frameBuffer.drawText("‹", contentX, contentY, parseColor("#AAAAAA"))
    }

    if (hasMoreRight) {
      this.frameBuffer.drawText("›", contentX + contentWidth - 1, contentY, parseColor("#AAAAAA"))
    }
  }

  public setOptions(options: TabsOption[]): void {
    this._options = options
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, options.length - 1))
    this.updateScrollOffset()
    this.needsUpdate()
  }

  public getSelectedOption(): TabsOption | null {
    return this._options[this.selectedIndex] || null
  }

  public getSelectedIndex(): number {
    return this.selectedIndex
  }

  public moveLeft(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--
    } else if (this._wrapSelection && this._options.length > 0) {
      this.selectedIndex = this._options.length - 1
    } else {
      return
    }

    this.updateScrollOffset()
    this.needsUpdate()
    this.emit(TabsComponentEvents.SELECTION_CHANGED, this.selectedIndex, this.getSelectedOption())
  }

  public moveRight(): void {
    if (this.selectedIndex < this._options.length - 1) {
      this.selectedIndex++
    } else if (this._wrapSelection && this._options.length > 0) {
      this.selectedIndex = 0
    } else {
      return
    }

    this.updateScrollOffset()
    this.needsUpdate()
    this.emit(TabsComponentEvents.SELECTION_CHANGED, this.selectedIndex, this.getSelectedOption())
  }

  public selectCurrent(): void {
    const selected = this.getSelectedOption()
    if (selected) {
      this.emit(TabsComponentEvents.ITEM_SELECTED, this.selectedIndex, selected)
    }
  }

  public setSelectedIndex(index: number): void {
    if (index >= 0 && index < this._options.length) {
      this.selectedIndex = index
      this.updateScrollOffset()
      this.needsUpdate()
      this.emit(TabsComponentEvents.SELECTION_CHANGED, this.selectedIndex, this.getSelectedOption())
    }
  }

  private updateScrollOffset(): void {
    const halfVisible = Math.floor(this.maxVisibleTabs / 2)
    const newScrollOffset = Math.max(
      0,
      Math.min(this.selectedIndex - halfVisible, this._options.length - this.maxVisibleTabs),
    )

    if (newScrollOffset !== this.scrollOffset) {
      this.scrollOffset = newScrollOffset
      this.needsUpdate()
    }
  }

  protected onResize(width: number, height: number): void {
    this.maxVisibleTabs = Math.max(1, Math.floor(width / this._tabWidth))
    this.updateScrollOffset()
    this.needsUpdate()
  }

  public setTabWidth(tabWidth: number): void {
    if (this._tabWidth === tabWidth) return

    this._tabWidth = tabWidth
    this.maxVisibleTabs = Math.max(1, Math.floor(this.width / this._tabWidth))

    this.updateScrollOffset()
    this.needsUpdate()
  }

  public getTabWidth(): number {
    return this._tabWidth
  }

  public handleKeyPress(key: ParsedKey | string): boolean {
    // Don't handle keyboard input when disabled
    if (this._disabled) return false

    const keyName = typeof key === "string" ? key : key.name

    switch (keyName) {
      case "left":
      case "[":
        this.moveLeft()
        return true
      case "right":
      case "]":
        this.moveRight()
        return true
      case "return":
      case "enter":
        this.selectCurrent()
        return true
      default:
        return false
    }

    return false
  }

  public get options(): TabsOption[] {
    return this._options
  }

  public set options(options: TabsOption[]) {
    this._options = options
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, options.length - 1))
    this.updateScrollOffset()
    this.needsUpdate()
  }

  public set backgroundColor(color: Color) {
    this._backgroundColor = parseColor(color)
    this.needsUpdate()
  }

  public set textColor(color: Color) {
    this._textColor = parseColor(color)
    this.needsUpdate()
  }

  public set focusedBackgroundColor(color: Color) {
    this._focusedBackgroundColor = parseColor(color)
    this.needsUpdate()
  }

  public set focusedTextColor(color: Color) {
    this._focusedTextColor = parseColor(color)
    this.needsUpdate()
  }

  public set selectedBackgroundColor(color: Color) {
    this._selectedBackgroundColor = parseColor(color)
    this.needsUpdate()
  }

  public set selectedTextColor(color: Color) {
    this._selectedTextColor = parseColor(color)
    this.needsUpdate()
  }

  public set selectedDescriptionColor(color: Color) {
    this._selectedDescriptionColor = parseColor(color)
    this.needsUpdate()
  }

  public get showDescription(): boolean {
    return this._showDescription
  }

  public set showDescription(show: boolean) {
    if (this._showDescription !== show) {
      this._showDescription = show
      const newHeight = this.calculateDynamicHeight()
      this.height = newHeight
      this.needsUpdate()
    }
  }

  public get showUnderline(): boolean {
    return this._showUnderline
  }

  public set showUnderline(show: boolean) {
    if (this._showUnderline !== show) {
      this._showUnderline = show
      const newHeight = this.calculateDynamicHeight()
      this.height = newHeight
      this.needsUpdate()
    }
  }

  public get showScrollArrows(): boolean {
    return this._showScrollArrows
  }

  public set showScrollArrows(show: boolean) {
    if (this._showScrollArrows !== show) {
      this._showScrollArrows = show
      this.needsUpdate()
    }
  }

  public get wrapSelection(): boolean {
    return this._wrapSelection
  }

  public set wrapSelection(wrap: boolean) {
    this._wrapSelection = wrap
  }

  public get tabWidth(): number {
    return this._tabWidth
  }

  public set tabWidth(tabWidth: number) {
    if (this._tabWidth === tabWidth) return

    this._tabWidth = tabWidth
    this.maxVisibleTabs = Math.max(1, Math.floor(this.width / this._tabWidth))

    this.updateScrollOffset()
    this.needsUpdate()
  }
}