import { type BoxProps } from "./box.js"
import { stringWidth } from "../utils.js"
import { RGBA, Color, parseColor } from "../lib/colors.js"
import { SliderProps, SliderComponent } from "./slider.js"
import { Component, ComponentProps } from "../component.js"

import type { OptimizedBuffer } from "../renderer/buffer.js"
import type { Timeout, ParsedKey, RenderContext } from "../types.js"

export interface ScrollBarProps extends ComponentProps<ScrollBarComponent> {
  orientation: "vertical" | "horizontal"
  showArrows?: boolean
  trackOptions?: Partial<SliderProps>
  arrowOptions?: Omit<ArrowProps, "direction">
  onChange?: (position: number) => void
}

export type ScrollUnit = "absolute" | "viewport" | "content" | "step"

export class ScrollBarComponent extends Component {
  public readonly slider: SliderComponent
  public readonly startArrow: ArrowComponent
  public readonly endArrow: ArrowComponent
  public readonly orientation: "vertical" | "horizontal"

  protected focusable: boolean = true

  private _scrollSize = 0
  private _scrollPosition = 0
  private _viewportSize = 0
  private _showArrows = false
  private _manualVisibility = false

  private _onChange: ((position: number) => void) | undefined

  scrollStep: number | undefined | null = null

  get visible(): boolean {
    return super.visible
  }

  set visible(value: boolean) {
    this._manualVisibility = true
    super.visible = value
  }

  public resetVisibilityControl(): void {
    this._manualVisibility = false
    this.recalculateVisibility()
  }

  get scrollSize(): number {
    return this._scrollSize
  }

  get scrollPosition(): number {
    return this._scrollPosition
  }

  get viewportSize(): number {
    return this._viewportSize
  }

  set scrollSize(value: number) {
    if (value === this.scrollSize) return
    this._scrollSize = value
    this.recalculateVisibility()
    this.scrollPosition = this.scrollPosition
  }

  set scrollPosition(value: number) {
    const newPosition = Math.round(Math.min(Math.max(0, value), this.scrollSize - this.viewportSize))
    if (newPosition !== this._scrollPosition) {
      this._scrollPosition = newPosition
      this.updateSliderFromScrollState()
      this._onChange?.(newPosition)
      this.emit("change", { position: newPosition })
    }
  }

  set viewportSize(value: number) {
    if (value === this.viewportSize) return
    this._viewportSize = value
    this.recalculateVisibility()
    this.scrollPosition = this.scrollPosition
  }

  get showArrows(): boolean {
    return this._showArrows
  }

  set showArrows(value: boolean) {
    if (value === this._showArrows) return
    this._showArrows = value
    this.startArrow.visible = value
    this.endArrow.visible = value
  }

  constructor(
    ctx: RenderContext,
    { trackOptions, arrowOptions, orientation, showArrows = false, ...options }: ScrollBarProps,
  ) {
    super(ctx, {
      flexDirection: orientation === "vertical" ? "column" : "row",
      alignSelf: "stretch",
      alignItems: "stretch",
      ...(options as BoxProps),
    })

    this._onChange = options.onChange

    this.orientation = orientation
    this._showArrows = showArrows

    this.slider = new SliderComponent(ctx, {
      orientation,
      onChange: (position) => {
        const scrollRange = Math.max(0, this._scrollSize - this._viewportSize)
        this._scrollPosition = Math.round(position * scrollRange)
        this._onChange?.(this._scrollPosition)
        this.emit("change", { position: this._scrollPosition })
      },
      ...(orientation === "vertical"
        ? {
          width: 2,
          height: "100%",
          marginLeft: "auto",
        }
        : {
          width: "100%",
          height: 1,
          marginTop: "auto",
        }),
      flexGrow: 1,
      flexShrink: 1,
      ...trackOptions,
    })

    this.updateSliderFromScrollState()

    const arrowOpts = arrowOptions
      ? {
        foregroundColor: arrowOptions.backgroundColor,
        backgroundColor: arrowOptions.backgroundColor,
        attributes: arrowOptions.attributes,
        ...arrowOptions,
      }
      : {}

    this.startArrow = new ArrowComponent(ctx, {
      alignSelf: "center",
      visible: this.showArrows,
      direction: this.orientation === "vertical" ? "up" : "left",
      height: this.orientation === "vertical" ? 1 : 1,
      ...arrowOpts,
    })

    this.endArrow = new ArrowComponent(ctx, {
      alignSelf: "center",
      visible: this.showArrows,
      direction: this.orientation === "vertical" ? "down" : "right",
      height: this.orientation === "vertical" ? 1 : 1,
      ...arrowOpts,
    })

    this.add(this.startArrow)
    this.add(this.slider)
    this.add(this.endArrow)

    let startArrowMouseTimeout = undefined as Timeout
    let endArrowMouseTimeout = undefined as Timeout

    this.startArrow.onMouseDown = (event) => {
      event.preventDefault()
      this.scrollBy(-0.5, "viewport")

      startArrowMouseTimeout = setTimeout(() => {
        this.scrollBy(-0.5, "viewport")

        startArrowMouseTimeout = setInterval(() => {
          this.scrollBy(-0.2, "viewport")
        }, 200)
      }, 500)
    }

    this.startArrow.onMouseUp = (event) => {
      event.preventDefault()
      clearInterval(startArrowMouseTimeout!)
    }

    this.endArrow.onMouseDown = (event) => {
      event.preventDefault()
      this.scrollBy(0.5, "viewport")

      endArrowMouseTimeout = setTimeout(() => {
        this.scrollBy(0.5, "viewport")

        endArrowMouseTimeout = setInterval(() => {
          this.scrollBy(0.2, "viewport")
        }, 200)
      }, 500)
    }

    this.endArrow.onMouseUp = (event) => {
      event.preventDefault()
      clearInterval(endArrowMouseTimeout!)
    }
  }

  public set arrowOptions(options: ScrollBarProps["arrowOptions"]) {
    Object.assign(this.startArrow, options)
    Object.assign(this.endArrow, options)
    this.requestRender()
  }

  public set trackOptions(options: ScrollBarProps["trackOptions"]) {
    Object.assign(this.slider, options)
    this.requestRender()
  }

  private updateSliderFromScrollState(): void {
    const trackSize = this.orientation === "vertical" ? this.slider.height : this.slider.width
    const scrollRange = Math.max(0, this._scrollSize - this._viewportSize)

    if (scrollRange === 0) {
      this.slider.thumbSize = trackSize
      this.slider.thumbPosition = 0
    } else {
      const sizeRatio = this._viewportSize / this._scrollSize
      this.slider.thumbSize = Math.max(1, Math.round(sizeRatio * trackSize))

      const positionRatio = this._scrollPosition / scrollRange
      this.slider.thumbPosition = Math.max(0, Math.min(1, positionRatio))
    }
  }

  public scrollBy(delta: number, unit: ScrollUnit = "absolute"): void {
    const multiplier =
      unit === "viewport"
        ? this.viewportSize
        : unit === "content"
          ? this.scrollSize
          : unit === "step"
            ? (this.scrollStep ?? 1)
            : 1

    const resolvedDelta = multiplier * delta
    this.scrollPosition += resolvedDelta
  }

  private recalculateVisibility(): void {
    if (!this._manualVisibility) {
      const sizeRatio = this.scrollSize <= this.viewportSize ? 1 : this.viewportSize / this.scrollSize
      super.visible = sizeRatio < 1
    }
  }

  public handleKeyPress(key: ParsedKey | string): boolean {
    const keyName = typeof key === "string" ? key : key.name

    switch (keyName) {
      case "left":
      case "h":
        if (this.orientation !== "horizontal") return false
        this.scrollBy(-1 / 5, "viewport")
        return true
      case "right":
      case "l":
        if (this.orientation !== "horizontal") return false
        this.scrollBy(1 / 5, "viewport")
        return true
      case "up":
      case "k":
        if (this.orientation !== "vertical") return false
        this.scrollBy(-1 / 5, "viewport")
        return true
      case "down":
      case "j":
        if (this.orientation !== "vertical") return false
        this.scrollBy(1 / 5, "viewport")
        return true
      case "pageup":
        this.scrollBy(-1 / 2, "viewport")
        return true
      case "pagedown":
        this.scrollBy(1 / 2, "viewport")
        return true
      case "home":
        this.scrollBy(-1, "content")
        return true
      case "end":
        this.scrollBy(1, "content")
        return true
      default:
    }

    return false
  }
}

export interface ArrowProps extends ComponentProps<ArrowComponent> {
  direction: "up" | "down" | "left" | "right"
  foregroundColor?: Color
  backgroundColor?: Color
  attributes?: number
  arrowChars?: {
    up?: string
    down?: string
    left?: string
    right?: string
  }
}

export class ArrowComponent extends Component {
  private _direction: "up" | "down" | "left" | "right"
  private _foregroundColor: RGBA
  private _backgroundColor: RGBA
  private _attributes: number
  private _arrowChars: {
    up: string
    down: string
    left: string
    right: string
  }

  constructor(ctx: RenderContext, options: ArrowProps) {
    super(ctx, options)
    this._direction = options.direction
    this._foregroundColor = options.foregroundColor ? parseColor(options.foregroundColor) : RGBA.fromValues(1, 1, 1, 1)
    this._backgroundColor = options.backgroundColor ? parseColor(options.backgroundColor) : RGBA.fromValues(0, 0, 0, 0)
    this._attributes = options.attributes ?? 0

    this._arrowChars = {
      up: "◢◣",
      down: "◥◤",
      left: " ◀ ",
      right: " ▶ ",
      ...options.arrowChars,
    }

    if (!options.width) {
      this.width = stringWidth(this.getArrowChar())
    }
  }

  get direction(): "up" | "down" | "left" | "right" {
    return this._direction
  }

  set direction(value: "up" | "down" | "left" | "right") {
    if (this._direction !== value) {
      this._direction = value
      this.requestRender()
    }
  }

  get foregroundColor(): RGBA {
    return this._foregroundColor
  }

  set foregroundColor(value: Color) {
    if (this._foregroundColor !== value) {
      this._foregroundColor = parseColor(value)
      this.requestRender()
    }
  }

  get backgroundColor(): RGBA {
    return this._backgroundColor
  }

  set backgroundColor(value: Color) {
    if (this._backgroundColor !== value) {
      this._backgroundColor = parseColor(value)
      this.requestRender()
    }
  }

  get attributes(): number {
    return this._attributes
  }

  set attributes(value: number) {
    if (this._attributes !== value) {
      this._attributes = value
      this.requestRender()
    }
  }

  set arrowChars(value: ArrowProps["arrowChars"]) {
    this._arrowChars = {
      ...this._arrowChars,
      ...value,
    }
    this.requestRender()
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    const char = this.getArrowChar()
    buffer.drawText(char, this.x, this.y, this._foregroundColor, this._backgroundColor, this._attributes)
  }

  private getArrowChar(): string {
    switch (this._direction) {
      case "up":
        return this._arrowChars.up
      case "down":
        return this._arrowChars.down
      case "left":
        return this._arrowChars.left
      case "right":
        return this._arrowChars.right
      default:
        return "?"
    }
  }
}