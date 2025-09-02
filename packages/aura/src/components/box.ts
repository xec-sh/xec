import { Edge, Gutter, FlexDirection } from "yoga-layout"

import { useTheme } from "../theme/context.js"
import { RGBA, Color, parseColor } from "../lib/colors.js"
import { Component, isValidPercentage, type ComponentProps } from "../component.js"
import {
  BorderChars,
  getBorderSides,
  type BorderSides,
  type BorderStyle,
  borderCharsToArray,
  type BorderCharacters,
  type BorderSidesConfig,
} from "../lib/index.js"

import type { RenderContext } from "../types.js"
// BoxTheme import removed - using global theme only
import type { OptimizedBuffer } from "../renderer/buffer.js"

export interface BoxProps<TComponent extends Component = BoxComponent> extends ComponentProps<TComponent> {
  // Color properties - can be theme tokens or direct colors
  backgroundColor?: string | RGBA;
  borderStyle?: BorderStyle;
  border?: boolean | BorderSides[];
  borderColor?: string | RGBA;
  customBorderChars?: BorderCharacters;
  shouldFill?: boolean;
  title?: string;
  titleAlignment?: "left" | "center" | "right";
  focusedBorderColor?: Color;
  gap?: number | `${number}%`;
  rowGap?: number | `${number}%`;
  columnGap?: number | `${number}%`;
  filledGaps?: boolean;
}

function isGapType(value: any): value is number | undefined {
  if (value === undefined) {
    return true
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return true
  }
  return isValidPercentage(value)
}

export class BoxComponent extends Component {
  protected focusable: boolean = true;
  protected _backgroundColor: RGBA
  protected _border: boolean | BorderSides[]
  protected _borderStyle: BorderStyle
  protected _borderColor: RGBA
  protected _focusedBorderColor: RGBA
  protected _disabledBackgroundColor?: RGBA
  protected _disabledBorderColor?: RGBA
  private _customBorderCharsObj: BorderCharacters | undefined
  protected _customBorderChars?: Uint32Array
  protected borderSides: BorderSidesConfig
  public shouldFill: boolean
  protected _title?: string
  protected _titleAlignment: "left" | "center" | "right"
  protected _filledGaps: boolean

  protected _defaultOptions = {
    backgroundColor: "transparent",
    borderStyle: "single",
    border: false,
    borderColor: "#FFFFFF",
    shouldFill: true,
    titleAlignment: "left",
    focusedBorderColor: "#00AAFF",
    filledGaps: false,
  } satisfies Partial<BoxProps>

  constructor(ctx: RenderContext, options: BoxProps) {
    super(ctx, options)

    // Get theme and resolve colors
    const theme = useTheme()

    // Create theme resolver function
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }

    // Get component theme from global theme
    const componentTheme = theme.components?.box

    // Helper function to resolve color (tries theme token first, then direct color)
    const resolveColorValue = (value: Color | string | undefined, defaultValue: string): RGBA => {
      if (!value) value = defaultValue
      try {
        // Try as theme token first
        return theme.resolveColor(value)
      } catch {
        // Fall back to parsing as direct color
        return parseColor(value, themeResolver)
      }
    }

    // Resolve background color
    this._backgroundColor = options.backgroundColor
      ? resolveColorValue(options.backgroundColor, this._defaultOptions.backgroundColor)
      : componentTheme?.background
        ? theme.resolveColor(componentTheme.background)
        : parseColor(this._defaultOptions.backgroundColor, themeResolver)

    // Resolve border color
    this._borderColor = options.borderColor
      ? resolveColorValue(options.borderColor, this._defaultOptions.borderColor)
      : componentTheme?.border
        ? theme.resolveColor(componentTheme.border)
        : parseColor(this._defaultOptions.borderColor, themeResolver)

    // Resolve focused border color
    this._focusedBorderColor = options.focusedBorderColor
      ? resolveColorValue(options.focusedBorderColor, this._defaultOptions.focusedBorderColor)
      : componentTheme?.states?.focused?.border
        ? theme.resolveColor(componentTheme.states.focused.border)
        : parseColor(this._defaultOptions.focusedBorderColor, themeResolver)

    // Resolve disabled state colors from component theme
    this._disabledBackgroundColor = componentTheme?.states?.disabled?.background
      ? theme.resolveColor(componentTheme.states.disabled.background)
      : undefined

    this._disabledBorderColor = componentTheme?.states?.disabled?.border
      ? theme.resolveColor(componentTheme.states.disabled.border)
      : undefined

    // Apply border style
    this._borderStyle = options.borderStyle || this._defaultOptions.borderStyle

    this._border = options.border ?? this._defaultOptions.border
    this._customBorderCharsObj = options.customBorderChars
    this._customBorderChars = this._customBorderCharsObj ? borderCharsToArray(this._customBorderCharsObj) : undefined
    this.borderSides = getBorderSides(this._border)
    this.shouldFill = options.shouldFill ?? this._defaultOptions.shouldFill
    this._title = options.title
    this._titleAlignment = options.titleAlignment || this._defaultOptions.titleAlignment
    this._filledGaps = options.filledGaps ?? this._defaultOptions.filledGaps

    this.applyYogaBorders()

    const hasInitialGapProps =
      options.gap !== undefined || options.rowGap !== undefined || options.columnGap !== undefined
    if (hasInitialGapProps) {
      this.applyYogaGap(options)
    }
  }

  public get customBorderChars(): BorderCharacters | undefined {
    return this._customBorderCharsObj
  }

  public set customBorderChars(value: BorderCharacters | undefined) {
    this._customBorderCharsObj = value
    this._customBorderChars = value ? borderCharsToArray(value) : undefined
    this.requestRender()
  }

  public get backgroundColor(): RGBA {
    return this._backgroundColor
  }

  public set backgroundColor(value: RGBA | string | undefined) {
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

  public get border(): boolean | BorderSides[] {
    return this._border
  }

  public set border(value: boolean | BorderSides[]) {
    if (this._border !== value) {
      this._border = value
      this.borderSides = getBorderSides(value)
      this.applyYogaBorders()
      this.requestRender()
    }
  }

  public get borderStyle(): BorderStyle {
    return this._borderStyle
  }

  public set borderStyle(value: BorderStyle) {
    const _value = value ?? this._defaultOptions.borderStyle
    if (this._borderStyle !== _value) {
      this._borderStyle = _value
      this._customBorderChars = undefined
      this.requestRender()
    }
  }

  public get borderColor(): RGBA {
    return this._borderColor
  }

  public set borderColor(value: RGBA | string) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.borderColor, themeResolver)
    if (this._borderColor !== newColor) {
      this._borderColor = newColor
      this.requestRender()
    }
  }

  public get focusedBorderColor(): RGBA {
    return this._focusedBorderColor
  }

  public set focusedBorderColor(value: RGBA | string) {
    const theme = useTheme()
    const themeResolver = (token: string): RGBA | null => {
      try {
        return theme.resolveColor(token)
      } catch {
        return null
      }
    }
    const newColor = parseColor(value ?? this._defaultOptions.focusedBorderColor, themeResolver)
    if (this._focusedBorderColor !== newColor) {
      this._focusedBorderColor = newColor
      if (this._focused) {
        this.requestRender()
      }
    }
  }

  public get title(): string | undefined {
    return this._title
  }

  public set title(value: string | undefined) {
    if (this._title !== value) {
      this._title = value
      this.requestRender()
    }
  }

  public get titleAlignment(): "left" | "center" | "right" {
    return this._titleAlignment
  }

  public set titleAlignment(value: "left" | "center" | "right") {
    if (this._titleAlignment !== value) {
      this._titleAlignment = value
      this.requestRender()
    }
  }

  public get filledGaps(): boolean {
    return this._filledGaps
  }

  public set filledGaps(value: boolean) {
    if (this._filledGaps !== value) {
      this._filledGaps = value
      this.requestRender()
    }
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    // Determine current state and colors
    let currentBackgroundColor = this._backgroundColor
    let currentBorderColor = this._borderColor

    // Apply state-based colors
    if (this._disabled) {
      currentBackgroundColor = this._disabledBackgroundColor || this._backgroundColor
      currentBorderColor = this._disabledBorderColor || this._borderColor
    } else if (this._focused) {
      currentBorderColor = this._focusedBorderColor
    }

    buffer.drawBox({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      borderStyle: this._borderStyle,
      customBorderChars: this._customBorderChars,
      border: this._border,
      borderColor: currentBorderColor,
      backgroundColor: currentBackgroundColor,
      shouldFill: this.shouldFill,
      title: this._title,
      titleAlignment: this._titleAlignment,
    })

    // Draw dividers between children if filledGaps is enabled
    if (this._filledGaps) {
      this.renderGapDividers(buffer, currentBorderColor)
    }
  }

  private renderGapDividers(buffer: OptimizedBuffer, color: RGBA): void {
    const children = this.getChildren()
    if (children.length <= 1) return

    const flexDirection = this.layoutNode.yogaNode.getFlexDirection()
    const borderChars = this._customBorderCharsObj || BorderChars[this._borderStyle]

    // Adjust positions based on borders
    const borderOffset = this._border ? 1 : 0

    if (flexDirection === FlexDirection.Column || flexDirection === FlexDirection.ColumnReverse) {
      // Draw horizontal dividers between vertically stacked children
      for (let i = 0; i < children.length - 1; i++) {
        const child = children[i]
        const nextChild = children[i + 1]

        // Calculate divider Y position (between current child bottom and next child top)
        const dividerY = this.y + child.y + child.height
        const dividerX = this.x + borderOffset
        const dividerWidth = this.width - (borderOffset * 2)

        // Only draw if there's actually a gap
        if (nextChild.y > child.y + child.height) {
          // Draw horizontal line
          for (let x = 0; x < dividerWidth; x++) {
            buffer.drawText(borderChars.horizontal, dividerX + x, dividerY, color)
          }

          // Draw junction characters at the edges if box has borders
          if (this.borderSides.left) {
            buffer.drawText(borderChars.leftT, this.x, dividerY, color)
          }
          if (this.borderSides.right) {
            buffer.drawText(borderChars.rightT, this.x + this.width - 1, dividerY, color)
          }
        }
      }
    } else if (flexDirection === FlexDirection.Row || flexDirection === FlexDirection.RowReverse) {
      // Draw vertical dividers between horizontally arranged children
      for (let i = 0; i < children.length - 1; i++) {
        const child = children[i]
        const nextChild = children[i + 1]

        // Calculate divider X position (between current child right and next child left)
        const dividerX = this.x + child.x + child.width
        const dividerY = this.y + borderOffset
        const dividerHeight = this.height - (borderOffset * 2)

        // Only draw if there's actually a gap
        if (nextChild.x > child.x + child.width) {
          // Draw vertical line
          for (let y = 0; y < dividerHeight; y++) {
            buffer.drawText(borderChars.vertical, dividerX, dividerY + y, color)
          }

          // Draw junction characters at the edges if box has borders
          if (this.borderSides.top) {
            buffer.drawText(borderChars.topT, dividerX, this.y, color)
          }
          if (this.borderSides.bottom) {
            buffer.drawText(borderChars.bottomT, dividerX, this.y + this.height - 1, color)
          }
        }
      }
    }
  }

  private applyYogaBorders(): void {
    const node = this.layoutNode.yogaNode
    node.setBorder(Edge.Left, this.borderSides.left ? 1 : 0)
    node.setBorder(Edge.Right, this.borderSides.right ? 1 : 0)
    node.setBorder(Edge.Top, this.borderSides.top ? 1 : 0)
    node.setBorder(Edge.Bottom, this.borderSides.bottom ? 1 : 0)
    this.requestRender()
  }

  private applyYogaGap(props: BoxProps): void {
    const node = this.layoutNode.yogaNode

    if (isGapType(props.gap)) {
      node.setGap(Gutter.All, props.gap)
    }

    if (isGapType(props.rowGap)) {
      node.setGap(Gutter.Row, props.rowGap)
    }

    if (isGapType(props.columnGap)) {
      node.setGap(Gutter.Column, props.columnGap)
    }
  }

  public set gap(gap: number | `${number}%` | undefined) {
    if (isGapType(gap)) {
      this.layoutNode.yogaNode.setGap(Gutter.All, gap)
      this.requestRender()
    }
  }

  public set rowGap(rowGap: number | `${number}%` | undefined) {
    if (isGapType(rowGap)) {
      this.layoutNode.yogaNode.setGap(Gutter.Row, rowGap)
      this.requestRender()
    }
  }

  public set columnGap(columnGap: number | `${number}%` | undefined) {
    if (isGapType(columnGap)) {
      this.layoutNode.yogaNode.setGap(Gutter.Column, columnGap)
      this.requestRender()
    }
  }
}