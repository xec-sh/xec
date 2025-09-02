
import { stringWidth } from "../utils.js"
import { useTheme } from "../theme/context.js"
import { OptimizedBuffer } from "../renderer/buffer.js"
import { RGBA, parseColor, type Color } from "../lib/colors.js"
import { Component, type ComponentProps } from "../component.js"
import { fonts, measureText, renderFontToFrameBuffer } from "../lib/ascii.font.js"

// SelectTheme import removed - using global theme only
import type { ParsedKey, RenderContext } from "../types.js"

export interface SelectOption {
  name: string
  description: string
  value?: any
}

export enum DescriptionTruncate {
  END = "end",        // Show start, add ellipsis at end: "Long text..."
  START = "start",    // Show end, add ellipsis at start: "...ext value"
  MIDDLE = "middle",  // Show start and end, add ellipsis in middle: "Long...value"
  NONE = "none"       // No truncation (default)
}

export interface SelectProps extends ComponentProps {
  options?: SelectOption[]

  // Color properties - can be theme tokens or direct colors
  textColor?: Color
  focusedTextColor?: Color
  selectedTextColor?: Color
  backgroundColor?: Color
  focusedBackgroundColor?: Color
  selectedBackgroundColor?: Color
  descriptionColor?: Color
  focusedDescriptionColor?: Color
  selectedDescriptionColor?: Color
  showDescription?: boolean
  descriptionTruncate?: DescriptionTruncate

  // Behavior properties
  showScrollIndicator?: boolean
  wrapSelection?: boolean

  font?: keyof typeof fonts
  itemSpacing?: number
  fastScrollStep?: number
  indicator?: string

}

export enum SelectComponentEvents {
  SELECTION_CHANGED = "selectionChanged",
  ITEM_SELECTED = "itemSelected",
}

export class SelectComponent extends Component {
  protected focusable: boolean = true

  private _options: SelectOption[] = []
  private selectedIndex: number = 0;
  private scrollOffset: number = 0;
  private maxVisibleItems: number;
  private _isAutoHeight: boolean = false;

  private _backgroundColor: RGBA;
  private _textColor: RGBA;
  private _focusedBackgroundColor: RGBA;
  private _focusedTextColor: RGBA;
  private _selectedBackgroundColor: RGBA;
  private _selectedTextColor: RGBA;
  private _descriptionColor: RGBA;
  private _focusedDescriptionColor: RGBA;
  private _selectedDescriptionColor: RGBA;
  private _disabledBackgroundColor?: RGBA;
  private _disabledTextColor?: RGBA;
  private _showScrollIndicator: boolean;
  private _wrapSelection: boolean;
  private _showDescription: boolean;
  private _font?: keyof typeof fonts;
  private _itemSpacing: number;
  private linesPerItem: number;
  private fontHeight: number;
  private _fastScrollStep: number;
  private _indicator?: string;
  private _descriptionTruncate: DescriptionTruncate;

  protected _defaultOptions = {
    backgroundColor: "transparent",
    textColor: "#FFFFFF",
    focusedBackgroundColor: "transparent",
    focusedTextColor: "#FFFFFF",
    selectedBackgroundColor: "#334455",
    selectedTextColor: "#FFFF00",
    descriptionColor: "#888888",
    focusedDescriptionColor: "#BBBBBB",
    selectedDescriptionColor: "#CCCCCC",
    showScrollIndicator: false,
    wrapSelection: false,
    showDescription: true,
    itemSpacing: 0,
    fastScrollStep: 5,
    descriptionTruncate: DescriptionTruncate.NONE,
  } satisfies Partial<SelectProps>

  constructor(ctx: RenderContext, options: SelectProps) {
    // Calculate lines per item early to configure proper auto sizing
    const showDescription = options.showDescription ?? true
    const font = options.font
    const itemSpacing = options.itemSpacing || 0
    const fontHeight = font ? measureText({ text: "A", font }).height : 1
    const linesPerItem = (showDescription
      ? font
        ? fontHeight + 1
        : 2
      : font
        ? fontHeight
        : 1) + itemSpacing

    // Configure auto height settings before calling super
    const configuredOptions = { ...options, buffered: true }

    // Track if height is auto for later use
    const _isAutoHeight = options.height === 'auto' || options.height === undefined

    // If height is auto, configure yoga-layout properties for proper sizing
    if (_isAutoHeight) {
      const optionCount = options.options?.length || 0
      if (optionCount > 0) {
        // Set minHeight to show at least one item (or the configured minHeight)
        configuredOptions.minHeight = options.minHeight || linesPerItem

        // DON'T set minHeight to full content height - this causes overflow!
        // Instead, let flex properties handle the sizing within available space

        // Enable flex properties for proper auto sizing
        if (configuredOptions.flexGrow === undefined) {
          configuredOptions.flexGrow = 1
        }
        if (configuredOptions.flexShrink === undefined) {
          configuredOptions.flexShrink = 1
        }

        // Note: Scrolling is handled internally by the component using scrollOffset and maxVisibleItems
      }
    }

    super(ctx, configuredOptions)

    this._isAutoHeight = _isAutoHeight;

    // Get theme and resolve colors
    const theme = useTheme()

    // Use global theme instead of theme prop

    // Resolve colors from props with theme fallbacks
    const selectTheme = theme.components?.select

    // Helper function to resolve color
    const resolveColorValue = (value: Color | undefined, fallback?: string): RGBA => {
      if (value) {
        try {
          return theme.resolveColor(value)
        } catch {
          return parseColor(value)
        }
      }
      return parseColor(fallback || this._defaultOptions.backgroundColor)
    }

    // Resolve colors from props with theme fallbacks
    this._backgroundColor = resolveColorValue(
      options.backgroundColor,
      selectTheme?.background ? theme.resolveColor(selectTheme.background).toHex() : this._defaultOptions.backgroundColor
    )

    this._textColor = resolveColorValue(
      options.textColor,
      selectTheme?.text ? theme.resolveColor(selectTheme.text).toHex() : this._defaultOptions.textColor
    )

    // Resolve focused state colors
    this._focusedBackgroundColor = resolveColorValue(
      options.focusedBackgroundColor,
      selectTheme?.states?.focused?.background
        ? theme.resolveColor(selectTheme.states.focused.background).toHex()
        : this._defaultOptions.focusedBackgroundColor
    )

    this._focusedTextColor = resolveColorValue(
      options.focusedTextColor,
      selectTheme?.states?.focused?.foreground
        ? theme.resolveColor(selectTheme.states.focused.foreground).toHex()
        : this._defaultOptions.focusedTextColor
    )

    // Resolve selected state colors
    this._selectedBackgroundColor = resolveColorValue(
      options.selectedBackgroundColor,
      selectTheme?.states?.selected?.background
        ? theme.resolveColor(selectTheme.states.selected.background).toHex()
        : this._defaultOptions.selectedBackgroundColor
    )

    this._selectedTextColor = resolveColorValue(
      options.selectedTextColor,
      selectTheme?.states?.selected?.foreground
        ? theme.resolveColor(selectTheme.states.selected.foreground).toHex()
        : this._defaultOptions.selectedTextColor
    )

    // Resolve description colors
    this._descriptionColor = resolveColorValue(
      options.descriptionColor,
      selectTheme?.elements?.description?.text
        ? theme.resolveColor(selectTheme.elements.description.text).toHex()
        : this._defaultOptions.descriptionColor
    )

    this._focusedDescriptionColor = resolveColorValue(
      options.focusedDescriptionColor,
      selectTheme?.elements?.description?.focusedText
        ? theme.resolveColor(selectTheme.elements.description.focusedText).toHex()
        : this._defaultOptions.focusedDescriptionColor
    )

    this._selectedDescriptionColor = resolveColorValue(
      options.selectedDescriptionColor,
      selectTheme?.elements?.description?.selectedText
        ? theme.resolveColor(selectTheme.elements.description.selectedText).toHex()
        : this._defaultOptions.selectedDescriptionColor
    )

    // Resolve disabled state colors
    this._disabledBackgroundColor = selectTheme?.states?.disabled?.background
      ? theme.resolveColor(selectTheme.states.disabled.background)
      : undefined

    this._disabledTextColor = selectTheme?.states?.disabled?.foreground
      ? theme.resolveColor(selectTheme.states.disabled.foreground)
      : undefined


    this._options = options.options || []

    this._showScrollIndicator = options.showScrollIndicator ?? this._defaultOptions.showScrollIndicator
    this._wrapSelection = options.wrapSelection ?? this._defaultOptions.wrapSelection
    this._showDescription = showDescription
    this._font = font
    this._itemSpacing = itemSpacing

    this.fontHeight = fontHeight
    this.linesPerItem = linesPerItem

    // For auto height, defer maxVisibleItems calculation until we have actual dimensions
    if (this._isAutoHeight && this.height === 0) {
      // Use a reasonable default for initial max visible items, not the full option count
      // This prevents the component from trying to show all items at once
      this.maxVisibleItems = Math.max(1, Math.min(10, this._options.length || 1))
    } else {
      this.maxVisibleItems = Math.max(1, Math.floor(this.height / this.linesPerItem))
    }

    this._fastScrollStep = options.fastScrollStep || this._defaultOptions.fastScrollStep
    this._indicator = options.indicator;
    this._descriptionTruncate = options.descriptionTruncate || this._defaultOptions.descriptionTruncate

    this.requestRender() // Initial render needed
  }

  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    if (!this.visible || !this.frameBuffer) return

    if (this.isDirty) {
      this.refreshFrameBuffer()
    }
  }

  private truncateText(text: string, maxWidth: number, truncate: DescriptionTruncate): string {
    if (truncate === DescriptionTruncate.NONE || maxWidth <= 0) {
      return text
    }

    const textWidth = stringWidth(text)
    if (textWidth <= maxWidth) {
      return text
    }

    const ellipsis = "…" // Unicode ellipsis character
    const ellipsisWidth = 1

    if (maxWidth <= ellipsisWidth) {
      return ellipsis
    }

    const availableWidth = maxWidth - ellipsisWidth

    // Helper to slice text to approximate width
    const sliceToWidth = (str: string, targetWidth: number, fromEnd: boolean = false): string => {
      let result = ""
      let currentWidth = 0
      const chars = Array.from(str)

      if (fromEnd) {
        for (let i = chars.length - 1; i >= 0; i--) {
          const charWidth = stringWidth(chars[i])
          if (currentWidth + charWidth > targetWidth) break
          result = chars[i] + result
          currentWidth += charWidth
        }
      } else {
        for (const char of chars) {
          const charWidth = stringWidth(char)
          if (currentWidth + charWidth > targetWidth) break
          result += char
          currentWidth += charWidth
        }
      }

      return result
    }

    switch (truncate) {
      case DescriptionTruncate.END: {
        // Show start, add ellipsis at end
        const start = sliceToWidth(text, availableWidth)
        return start + ellipsis
      }

      case DescriptionTruncate.START: {
        // Show end, add ellipsis at start
        const end = sliceToWidth(text, availableWidth, true)
        return ellipsis + end
      }

      case DescriptionTruncate.MIDDLE: {
        // Show start and end, add ellipsis in middle
        const halfWidth = Math.floor(availableWidth / 2)
        const start = sliceToWidth(text, halfWidth)
        const end = sliceToWidth(text, availableWidth - stringWidth(start), true)
        return start + ellipsis + end
      }

      default:
        return text
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

    const visibleOptions = this._options.slice(this.scrollOffset, this.scrollOffset + this.maxVisibleItems)

    for (let i = 0; i < visibleOptions.length; i++) {
      const actualIndex = this.scrollOffset + i
      const option = visibleOptions[i]
      const isSelected = actualIndex === this.selectedIndex
      const itemY = contentY + i * this.linesPerItem

      // Check if the item would exceed the available height
      if (itemY + this.linesPerItem > contentY + contentHeight) break

      if (isSelected) {
        this.frameBuffer.fillRect(contentX, itemY, contentWidth, this.linesPerItem - this._itemSpacing, this._selectedBackgroundColor)
      }

      const indicatorWidth = this._indicator ? stringWidth(this._indicator) : 0;
      const indicator = isSelected ? (this._indicator ?? "") : " ".repeat(indicatorWidth);

      const nameContent = `${indicator}${option.name}`
      let baseTextColor = this._textColor
      if (this._disabled) {
        baseTextColor = this._disabledTextColor || this._textColor
      } else if (this._focused) {
        baseTextColor = this._focusedTextColor
      }
      const nameColor = isSelected && !this._disabled ? this._selectedTextColor : baseTextColor
      let descX = contentX + 1 + indicatorWidth;

      if (this._font) {
        this.frameBuffer.drawText(indicator, contentX + 1, itemY, nameColor)
        renderFontToFrameBuffer(this.frameBuffer, {
          text: option.name,
          x: contentX + 1 + indicatorWidth,
          y: itemY,
          fg: nameColor,
          bg: isSelected ? this._selectedBackgroundColor : bgColor,
          font: this._font,
        })
        descX = contentX + 1 + indicatorWidth
      } else {
        this.frameBuffer.drawText(nameContent, contentX + 1, itemY, nameColor)
      }

      if (this._showDescription && itemY + this.fontHeight < contentY + contentHeight) {
        let descColor = this._descriptionColor
        if (isSelected) {
          descColor = this._selectedDescriptionColor
        } else if (this._focused) {
          descColor = this._focusedDescriptionColor
        }

        // Calculate available width for description
        const availableWidth = contentWidth - descX - 1
        const truncatedDescription = this.truncateText(option.description, availableWidth, this._descriptionTruncate)

        this.frameBuffer.drawText(truncatedDescription, descX, itemY + this.fontHeight, descColor)
      }
    }

    if (this._showScrollIndicator && this._focused && this._options.length > this.maxVisibleItems) {
      this.renderScrollIndicatorToFrameBuffer(contentX, contentY, contentWidth, contentHeight)
    }
  }

  private renderScrollIndicatorToFrameBuffer(
    contentX: number,
    contentY: number,
    contentWidth: number,
    contentHeight: number,
  ): void {
    if (!this.frameBuffer) return

    const scrollPercent = this.selectedIndex / Math.max(1, this._options.length - 1)
    const indicatorHeight = Math.max(1, contentHeight - 2)
    const indicatorY = contentY + 1 + Math.floor(scrollPercent * indicatorHeight)
    const indicatorX = contentX + contentWidth - 1

    this.frameBuffer.drawText("█", indicatorX, indicatorY, parseColor("#666666"))
  }

  public get options(): SelectOption[] {
    return this._options
  }

  public set options(options: SelectOption[]) {
    this._options = options
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, options.length - 1))

    // If height is auto, ensure proper min height but don't force full content height
    if (this._isAutoHeight) {
      const optionCount = options.length
      if (optionCount > 0) {
        // Always keep minHeight to at least show one item
        // Don't set it to full content height to avoid overflow
        this.layoutNode.yogaNode.setMinHeight(this.linesPerItem)

        // Recalculate maxVisibleItems based on actual height
        if (this.height > 0) {
          this.maxVisibleItems = Math.max(1, Math.floor(this.height / this.linesPerItem))
        } else {
          // If no height yet, use a reasonable default
          this.maxVisibleItems = Math.max(1, Math.min(10, optionCount))
        }
      }
    }

    this.updateScrollOffset()
    this.requestRender()
  }

  public getSelectedOption(): SelectOption | null {
    return this._options[this.selectedIndex] || null
  }

  public getSelectedIndex(): number {
    return this.selectedIndex
  }

  public moveUp(steps: number = 1): void {
    const newIndex = this.selectedIndex - steps

    if (newIndex >= 0) {
      this.selectedIndex = newIndex
    } else if (this._wrapSelection && this._options.length > 0) {
      this.selectedIndex = this._options.length - 1
    } else {
      this.selectedIndex = 0
    }

    this.updateScrollOffset()
    this.requestRender()
    this.emit(SelectComponentEvents.SELECTION_CHANGED, this.selectedIndex, this.getSelectedOption())
  }

  public moveDown(steps: number = 1): void {
    const newIndex = this.selectedIndex + steps

    if (newIndex < this._options.length) {
      this.selectedIndex = newIndex
    } else if (this._wrapSelection && this._options.length > 0) {
      this.selectedIndex = 0
    } else {
      this.selectedIndex = this._options.length - 1
    }

    this.updateScrollOffset()
    this.requestRender()
    this.emit(SelectComponentEvents.SELECTION_CHANGED, this.selectedIndex, this.getSelectedOption())
  }

  public selectCurrent(): void {
    const selected = this.getSelectedOption()
    if (selected) {
      this.emit(SelectComponentEvents.ITEM_SELECTED, this.selectedIndex, selected)
    }
  }

  public setSelectedIndex(index: number): void {
    if (index >= 0 && index < this._options.length) {
      this.selectedIndex = index
      this.updateScrollOffset()
      this.requestRender()
      this.emit(SelectComponentEvents.SELECTION_CHANGED, this.selectedIndex, this.getSelectedOption())
    }
  }

  private updateScrollOffset(): void {
    if (!this._options) return

    const halfVisible = Math.floor(this.maxVisibleItems / 2)
    const newScrollOffset = Math.max(
      0,
      Math.min(this.selectedIndex - halfVisible, this._options.length - this.maxVisibleItems),
    )

    if (newScrollOffset !== this.scrollOffset) {
      this.scrollOffset = newScrollOffset
      this.requestRender()
    }
  }

  protected onResize(width: number, height: number): void {
    this.maxVisibleItems = Math.max(1, Math.floor(height / this.linesPerItem))
    this.updateScrollOffset()
    this.requestRender()
  }

  public handleKeyPress(key: ParsedKey | string): boolean {
    // Don't handle keyboard input when disabled
    if (this._disabled) return false

    const keyName = typeof key === "string" ? key : key.name
    const isShift = typeof key !== "string" && key.shift

    switch (keyName) {
      case "up":
      case "k":
        this.moveUp(isShift ? this._fastScrollStep : 1)
        return true
      case "down":
      case "j":
        this.moveDown(isShift ? this._fastScrollStep : 1)
        return true
      case "return":
      case "enter":
        this.selectCurrent()
        return true;
      default:
    }

    return false
  }

  public get showScrollIndicator(): boolean {
    return this._showScrollIndicator
  }

  public set showScrollIndicator(show: boolean) {
    this._showScrollIndicator = show
    this.requestRender()
  }

  public get showDescription(): boolean {
    return this._showDescription
  }

  public set showDescription(show: boolean) {
    if (this._showDescription !== show) {
      this._showDescription = show
      this.linesPerItem = this._showDescription
        ? this._font
          ? this.fontHeight + 1
          : 2
        : this._font
          ? this.fontHeight
          : 1
      this.linesPerItem += this._itemSpacing

      this.maxVisibleItems = Math.max(1, Math.floor(this.height / this.linesPerItem))
      this.updateScrollOffset()
      this.requestRender()
    }
  }

  public get wrapSelection(): boolean {
    return this._wrapSelection
  }

  public set wrapSelection(wrap: boolean) {
    this._wrapSelection = wrap
  }

  public set backgroundColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.backgroundColor, themeResolver)
    if (this._backgroundColor !== newColor) {
      this._backgroundColor = newColor
      this.requestRender()
    }
  }

  public set textColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.textColor, themeResolver)
    if (this._textColor !== newColor) {
      this._textColor = newColor
      this.requestRender()
    }
  }

  public set focusedBackgroundColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.focusedBackgroundColor, themeResolver)
    if (this._focusedBackgroundColor !== newColor) {
      this._focusedBackgroundColor = newColor
      this.requestRender()
    }
  }

  public set focusedTextColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.focusedTextColor, themeResolver)
    if (this._focusedTextColor !== newColor) {
      this._focusedTextColor = newColor
      this.requestRender()
    }
  }

  public set selectedBackgroundColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.selectedBackgroundColor, themeResolver)
    if (this._selectedBackgroundColor !== newColor) {
      this._selectedBackgroundColor = newColor
      this.requestRender()
    }
  }

  public set selectedTextColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.selectedTextColor, themeResolver)
    if (this._selectedTextColor !== newColor) {
      this._selectedTextColor = newColor
      this.requestRender()
    }
  }

  public set descriptionColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.descriptionColor, themeResolver)
    if (this._descriptionColor !== newColor) {
      this._descriptionColor = newColor
      this.requestRender()
    }
  }

  public set focusedDescriptionColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.focusedDescriptionColor, themeResolver)
    if (this._focusedDescriptionColor !== newColor) {
      this._focusedDescriptionColor = newColor
      this.requestRender()
    }
  }

  public set selectedDescriptionColor(value: Color) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.selectedDescriptionColor, themeResolver)
    if (this._selectedDescriptionColor !== newColor) {
      this._selectedDescriptionColor = newColor
      this.requestRender()
    }
  }

  public set font(font: keyof typeof fonts) {
    this._font = font
    this.fontHeight = measureText({ text: "A", font: this._font }).height
    this.linesPerItem = this._showDescription
      ? this._font
        ? this.fontHeight + 1
        : 2
      : this._font
        ? this.fontHeight
        : 1
    this.linesPerItem += this._itemSpacing
    this.maxVisibleItems = Math.max(1, Math.floor(this.height / this.linesPerItem))
    this.updateScrollOffset()
    this.requestRender()
  }

  public set itemSpacing(spacing: number) {
    this._itemSpacing = spacing
    this.linesPerItem = this._showDescription
      ? this._font
        ? this.fontHeight + 1
        : 2
      : this._font
        ? this.fontHeight
        : 1
    this.linesPerItem += this._itemSpacing
    this.maxVisibleItems = Math.max(1, Math.floor(this.height / this.linesPerItem))
    this.updateScrollOffset()
    this.requestRender()
  }

  public set fastScrollStep(step: number) {
    this._fastScrollStep = step
  }

  public get indicator(): string | undefined {
    return this._indicator
  }

  public set indicator(value: string) {
    if (this._indicator !== value) {
      this._indicator = value
      this.requestRender()
    }
  }

  public get descriptionTruncate(): DescriptionTruncate {
    return this._descriptionTruncate
  }

  public set descriptionTruncate(value: DescriptionTruncate) {
    if (this._descriptionTruncate !== value) {
      this._descriptionTruncate = value
      this.requestRender()
    }
  }
}