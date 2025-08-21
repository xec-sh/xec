import { Edge } from "yoga-layout"

import { RGBA } from "../types.js"
import { parseColor } from "../utils.js"
import { Component, type ComponentProps } from "../component.js"
import {
  getBorderSides,
  type BorderStyle,
  type BorderSides,
  borderCharsToArray,
  type BorderCharacters,
  type BorderSidesConfig,
} from "../lib/index.js"

import type { ColorInput } from "../types.js"
import type { OptimizedBuffer } from "../renderer/buffer.js"

export interface BoxProps extends ComponentProps {
  backgroundColor?: string | RGBA
  borderStyle?: BorderStyle
  border?: boolean | BorderSides[]
  borderColor?: string | RGBA
  customBorderChars?: BorderCharacters
  shouldFill?: boolean
  title?: string
  titleAlignment?: "left" | "center" | "right"
  focusedBorderColor?: ColorInput
}

export class BoxComponent extends Component {
  protected _backgroundColor: RGBA
  protected _border: boolean | BorderSides[]
  protected _borderStyle: BorderStyle
  protected _borderColor: RGBA
  protected _focusedBorderColor: RGBA
  protected customBorderChars?: Uint32Array
  protected borderSides: BorderSidesConfig
  public shouldFill: boolean
  protected _title?: string
  protected _titleAlignment: "left" | "center" | "right"

  constructor(id: string, options: BoxProps) {
    super(id, options)

    this._backgroundColor = parseColor(options.backgroundColor || "transparent")
    this._border = options.border ?? true
    this._borderStyle = options.borderStyle || "single"
    this._borderColor = parseColor(options.borderColor || "#FFFFFF")
    this._focusedBorderColor = parseColor(options.focusedBorderColor || "#00AAFF")
    this.customBorderChars = options.customBorderChars ? borderCharsToArray(options.customBorderChars) : undefined
    this.borderSides = getBorderSides(this._border)
    this.shouldFill = options.shouldFill ?? true
    this._title = options.title
    this._titleAlignment = options.titleAlignment || "left"

    this.applyYogaBorders()
  }

  public get backgroundColor(): RGBA {
    return this._backgroundColor
  }

  public set backgroundColor(value: RGBA | string | undefined) {
    if (value) {
      const newColor = parseColor(value)
      if (this._backgroundColor !== newColor) {
        this._backgroundColor = newColor
        this.needsUpdate()
      }
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
    if (this._borderStyle !== value) {
      this._borderStyle = value
      this.customBorderChars = undefined
      this.needsUpdate()
    }
  }

  public get borderColor(): RGBA {
    return this._borderColor
  }

  public set borderColor(value: RGBA | string) {
    const newColor = parseColor(value)
    if (this._borderColor !== newColor) {
      this._borderColor = newColor
      this.needsUpdate()
    }
  }

  public get focusedBorderColor(): RGBA {
    return this._focusedBorderColor
  }

  public set focusedBorderColor(value: RGBA | string) {
    const newColor = parseColor(value)
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
    const currentBorderColor = this._focused ? this._focusedBorderColor : this._borderColor

    buffer.drawBox({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      borderStyle: this._borderStyle,
      customBorderChars: this.customBorderChars,
      border: this._border,
      borderColor: currentBorderColor,
      backgroundColor: this._backgroundColor,
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
    this.requestLayout()
  }
}
