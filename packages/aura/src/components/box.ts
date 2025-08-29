import { Edge } from "yoga-layout"

import { RGBA, Color, parseColor } from "../lib/colors.js"
import { useTheme } from "../theme/context.js"
import { Component, type ComponentProps } from "../component.js"
import {
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

export interface BoxProps extends ComponentProps {
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
  // Theme prop removed - using global theme

  protected _defaultOptions = {
    backgroundColor: "transparent",
    borderStyle: "single",
    border: false,
    borderColor: "#FFFFFF",
    shouldFill: true,
    titleAlignment: "left",
    focusedBorderColor: "#00AAFF",
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

    this.applyYogaBorders()
  }

  public get customBorderChars(): BorderCharacters | undefined {
    return this._customBorderCharsObj
  }

  public set customBorderChars(value: BorderCharacters | undefined) {
    this._customBorderCharsObj = value
    this._customBorderChars = value ? borderCharsToArray(value) : undefined
    this.needsUpdate()
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
      this.needsUpdate()
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
      this.needsUpdate()
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
      this.needsUpdate()
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
      this.needsUpdate()
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
        this.needsUpdate()
      }
    }
  }

  public get title(): string | undefined {
    return this._title
  }

  public set title(value: string | undefined) {
    if (this._title !== value) {
      this._title = value
      this.needsUpdate()
    }
  }

  public get titleAlignment(): "left" | "center" | "right" {
    return this._titleAlignment
  }

  public set titleAlignment(value: "left" | "center" | "right") {
    if (this._titleAlignment !== value) {
      this._titleAlignment = value
      this.needsUpdate()
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
  }

  private applyYogaBorders(): void {
    const node = this.layoutNode.yogaNode
    node.setBorder(Edge.Left, this.borderSides.left ? 1 : 0)
    node.setBorder(Edge.Right, this.borderSides.right ? 1 : 0)
    node.setBorder(Edge.Top, this.borderSides.top ? 1 : 0)
    node.setBorder(Edge.Bottom, this.borderSides.bottom ? 1 : 0)
    this.needsUpdate()
  }
}