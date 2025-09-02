import { EventEmitter } from "events"
import Yoga, { Edge, Display, Direction, type Config, FlexDirection } from "yoga-layout"

import { MouseEvent } from "./renderer/renderer.js"
import { MouseEventType } from "./lib/parse.mouse.js"
import { OptimizedBuffer } from "./renderer/buffer.js"
import { getKeyHandler, type KeyHandler } from "./lib/key-handler.js"
import { TrackedNode, createTrackedNode } from "./lib/tracked-node.js"
import {
  parseWrap,
  parseAlign,
  parseJustify,
  parseOverflow,
  type WrapString,
  type AlignString,
  parsePositionType,
  parseFlexDirection,
  type JustifyString,
  type OverflowString,
  type PositionTypeString,
  type FlexDirectionString,
} from "./lib/yoga.options.js"

import type { ParsedKey, RenderContext, SelectionState } from "./types.js"

export enum LayoutEvents {
  LAYOUT_CHANGED = "layout-changed",
  ADDED = "added",
  REMOVED = "removed",
  RESIZED = "resized",
}

export enum RenderableEvents {
  FOCUSED = "focused",
  BLURRED = "blurred",
}

export interface Position {
  top?: number | "auto" | `${number}%`
  right?: number | "auto" | `${number}%`
  bottom?: number | "auto" | `${number}%`
  left?: number | "auto" | `${number}%`
}

export interface LayoutProps {
  flexGrow?: number
  flexShrink?: number
  flexDirection?: FlexDirectionString
  flexWrap?: WrapString
  alignItems?: AlignString
  justifyContent?: JustifyString
  alignSelf?: AlignString
  flexBasis?: number | "auto" | undefined
  position?: PositionTypeString
  overflow?: OverflowString
  top?: number | "auto" | `${number}%`
  right?: number | "auto" | `${number}%`
  bottom?: number | "auto" | `${number}%`
  left?: number | "auto" | `${number}%`
  minWidth?: number | "auto" | `${number}%`
  minHeight?: number | "auto" | `${number}%`
  maxWidth?: number | "auto" | `${number}%`
  maxHeight?: number | "auto" | `${number}%`
  margin?: number | "auto" | `${number}%`
  marginTop?: number | "auto" | `${number}%`
  marginRight?: number | "auto" | `${number}%`
  marginBottom?: number | "auto" | `${number}%`
  marginLeft?: number | "auto" | `${number}%`
  padding?: number | `${number}%`
  paddingTop?: number | `${number}%`
  paddingRight?: number | `${number}%`
  paddingBottom?: number | `${number}%`
  paddingLeft?: number | `${number}%`
  enableLayout?: boolean
}

export interface ComponentProps<T extends Component = Component> extends Partial<LayoutProps> {
  id?: string;
  width?: number | "auto" | `${number}%`
  height?: number | "auto" | `${number}%`
  zIndex?: number
  visible?: boolean
  buffered?: boolean;
  live?: boolean
  disabled?: boolean

  // hooks for custom render logic
  renderBefore?: (this: T, buffer: OptimizedBuffer, deltaTime: number) => void
  renderAfter?: (this: T, buffer: OptimizedBuffer, deltaTime: number) => void

  // catch all
  onMouse?: (this: T, event: MouseEvent) => void

  onMouseDown?: (this: T, event: MouseEvent) => void
  onMouseUp?: (this: T, event: MouseEvent) => void
  onMouseMove?: (this: T, event: MouseEvent) => void
  onMouseDrag?: (this: T, event: MouseEvent) => void
  onMouseDragEnd?: (this: T, event: MouseEvent) => void
  onMouseDrop?: (this: T, event: MouseEvent) => void
  onMouseOver?: (this: T, event: MouseEvent) => void
  onMouseOut?: (this: T, event: MouseEvent) => void
  onMouseScroll?: (this: T, event: MouseEvent) => void

  onKeyDown?: (key: ParsedKey) => void

  onSizeChange?: (this: T) => void
}

function validateProps(id: string, props: ComponentProps): void {
  if (typeof props.width === "number") {
    if (props.width < 0) {
      throw new TypeError(`Invalid width for Component ${id}: ${props.width}`)
    }
  }
  if (typeof props.height === "number") {
    if (props.height < 0) {
      throw new TypeError(`Invalid height for Component ${id}: ${props.height}`)
    }
  }
}

export function isValidPercentage(value: any): value is `${number}%` {
  if (typeof value === "string" && value.endsWith("%")) {
    const numPart = value.slice(0, -1)
    const num = parseFloat(numPart)
    return !Number.isNaN(num)
  }
  return false
}

export function isMarginType(value: any): value is number | "auto" | `${number}%` {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return true
  }
  if (value === "auto") {
    return true
  }
  return isValidPercentage(value)
}

export function isPaddingType(value: any): value is number | `${number}%` {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return true
  }
  return isValidPercentage(value)
}

export function isPositionType(value: any): value is number | "auto" | `${number}%` {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return true
  }
  if (value === "auto") {
    return true
  }
  return isValidPercentage(value)
}

export function isPositionTypeType(value: any): value is PositionTypeString {
  return value === "relative" || value === "absolute"
}

export function isOverflowType(value: any): value is OverflowString {
  return value === "visible" || value === "hidden" || value === "scroll"
}

export function isDimensionType(value: any): value is number | "auto" | `${number}%` {
  return isPositionType(value)
}

export function isFlexBasisType(value: any): value is number | "auto" | undefined {
  if (value === undefined || value === "auto") {
    return true
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return true
  }
  return false
}

export function isSizeType(value: any): value is number | `${number}%` | undefined {
  if (value === undefined) {
    return true
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return true
  }
  return isValidPercentage(value)
}

export abstract class Component extends EventEmitter {
  private static componentNumber = 1;
  static componentsByNumber: Map<number, Component> = new Map()

  public readonly id: string
  public readonly num: number
  protected _ctx: RenderContext;
  protected _translateX: number = 0
  protected _translateY: number = 0
  protected _x: number = 0
  protected _y: number = 0
  protected _width: number | "auto" | `${number}%`
  protected _height: number | "auto" | `${number}%`
  protected _widthValue: number = 0
  protected _heightValue: number = 0
  private _zIndex: number
  protected _visible: boolean
  public selectable: boolean = false
  protected buffered: boolean
  protected frameBuffer: OptimizedBuffer | null = null
  private _dirty: boolean = false

  protected focusable: boolean = false
  protected _focused: boolean = false
  protected _disabled: boolean = false
  protected keyHandler: KeyHandler = getKeyHandler()
  protected keypressHandler: ((key: ParsedKey) => void) | null = null;
  private _live: boolean = false
  protected _liveCount: number = 0

  private _sizeChangeListener: (() => void) | undefined = undefined
  private _mouseListener: ((event: MouseEvent) => void) | null = null
  private _mouseListeners: Partial<Record<MouseEventType, (event: MouseEvent) => void>> = {}
  private _keyListeners: Partial<Record<"down", (key: ParsedKey) => void>> = {}

  protected layoutNode: TrackedNode
  protected _positionType: PositionTypeString = "relative"
  protected _overflow: OverflowString = "visible"
  protected _position: Position = {}

  private componentMap: Map<string, Component> = new Map()
  private children: Component[] = []
  private needsZIndexSort: boolean = false
  public parent: Component | null = null

  public renderBefore?: (this: Component, buffer: OptimizedBuffer, deltaTime: number) => void
  public renderAfter?: (this: Component, buffer: OptimizedBuffer, deltaTime: number) => void

  constructor(ctx: RenderContext, options: ComponentProps<any>) {
    super();
    this.num = Component.componentNumber++;
    this.id = options.id ?? `component-${this.num}`
    this._ctx = ctx
    Component.componentsByNumber.set(this.num, this);

    validateProps(this.id, options);

    this.renderBefore = options.renderBefore
    this.renderAfter = options.renderAfter

    this._width = options.width ?? "auto"
    this._height = options.height ?? "auto";

    if (typeof this._width === "number") {
      this._widthValue = this._width;
    }
    if (typeof this._height === "number") {
      this._heightValue = this._height;
    }

    this._zIndex = options.zIndex ?? 0;
    this._visible = options.visible !== false;
    this._disabled = options.disabled ?? false;
    this.buffered = options.buffered ?? false;
    this._live = options.live ?? false
    this._liveCount = this._live && this._visible ? 1 : 0

    this.layoutNode = createTrackedNode({ renderable: this } as any);
    this.layoutNode.yogaNode.setDisplay(this._visible ? Display.Flex : Display.None);
    this.setupYogaProperties(options);

    this.applyEventOptions(options);

    if (this.buffered) {
      this.createFrameBuffer();
    }
  }

  public get ctx(): RenderContext {
    return this._ctx
  }

  public get visible(): boolean {
    return this._visible
  }

  public set visible(value: boolean) {
    if (this._visible === value) return

    const wasVisible = this._visible
    this._visible = value
    this.layoutNode.yogaNode.setDisplay(value ? Display.Flex : Display.None);

    if (this._live) {
      if (!wasVisible && value) {
        this.propagateLiveCount(1)
      } else if (wasVisible && !value) {
        this.propagateLiveCount(-1)
      }
    }

    if (this._focused) {
      this.blur()
    }
    this.requestRender()
  }

  public hasSelection(): boolean {
    return false
  }

  public onSelectionChanged(selection: SelectionState | null): boolean {
    // Default implementation: do nothing
    // Override this method to provide custom selection handling
    return false
  }

  public getSelectedText(): string {
    return ""
  }

  public shouldStartSelection(x: number, y: number): boolean {
    return false
  }

  public focus(): void {
    if (this._focused || !this.focusable || this._disabled) return

    this._focused = true
    this.requestRender()

    this.keypressHandler = (key: ParsedKey) => {
      this._keyListeners["down"]?.(key)
      if (this.handleKeyPress) {
        this.handleKeyPress(key)
      }
    }

    this.keyHandler.on("keypress", this.keypressHandler)
    this.emit(RenderableEvents.FOCUSED)
  }

  public blur(): void {
    if (!this._focused || !this.focusable) return

    this._focused = false
    this.requestRender()

    if (this.keypressHandler) {
      this.keyHandler.off("keypress", this.keypressHandler)
      this.keypressHandler = null
    }

    this.emit(RenderableEvents.BLURRED)
  }

  public get focused(): boolean {
    return this._focused
  }

  public get disabled(): boolean {
    return this._disabled
  }

  public set disabled(value: boolean) {
    if (this._disabled === value) return

    this._disabled = value

    // If becoming disabled while focused, blur
    if (value && this._focused) {
      this.blur()
    }

    this.requestRender()
  }

  public get live(): boolean {
    return this._live
  }

  public get liveCount(): number {
    return this._liveCount
  }

  public set live(value: boolean) {
    if (this._live === value) return

    this._live = value

    if (this._visible) {
      const delta = value ? 1 : -1
      this.propagateLiveCount(delta)
    }
  }

  protected propagateLiveCount(delta: number): void {
    this._liveCount += delta
    this.parent?.propagateLiveCount(delta)
  }

  public handleKeyPress?(key: ParsedKey | string): boolean

  protected get isDirty(): boolean {
    return this._dirty
  }

  private markClean(): void {
    this._dirty = false
  }

  public requestRender() {
    this._dirty = true
    this._ctx.requestRender()
  }

  public get translateX(): number {
    return this._translateX
  }

  public set translateX(value: number) {
    if (this._translateX === value) return
    this._translateX = value
    this.requestRender()
  }

  public get translateY(): number {
    return this._translateY
  }

  public set translateY(value: number) {
    if (this._translateY === value) return
    this._translateY = value
    this.requestRender()
  }

  public get x(): number {
    if (this.parent && this._positionType === "relative") {
      return this.parent.x + this._x + this._translateX
    }
    return this._x + this._translateX
  }

  public set x(value: number) {
    this.left = value
  }

  public get top(): number | "auto" | `${number}%` | undefined {
    return this._position.top
  }

  public set top(value: number | "auto" | `${number}%` | undefined) {
    if (isPositionType(value) || value === undefined) {
      this.setPosition({ top: value })
    }
  }

  public get right(): number | "auto" | `${number}%` | undefined {
    return this._position.right
  }

  public set right(value: number | "auto" | `${number}%` | undefined) {
    if (isPositionType(value) || value === undefined) {
      this.setPosition({ right: value })
    }
  }

  public get bottom(): number | "auto" | `${number}%` | undefined {
    return this._position.bottom
  }

  public set bottom(value: number | "auto" | `${number}%` | undefined) {
    if (isPositionType(value) || value === undefined) {
      this.setPosition({ bottom: value })
    }
  }

  public get left(): number | "auto" | `${number}%` | undefined {
    return this._position.left
  }

  public set left(value: number | "auto" | `${number}%` | undefined) {
    if (isPositionType(value) || value === undefined) {
      this.setPosition({ left: value })
    }
  }

  public get y(): number {
    if (this.parent && this._positionType === "relative") {
      return this.parent.y + this._y + this._translateY
    }
    return this._y + this._translateY
  }

  public set y(value: number) {
    this.top = value
  }

  public get width(): number {
    return this._widthValue
  }

  public set width(value: number | "auto" | `${number}%`) {
    if (isDimensionType(value)) {
      this._width = value
      this.layoutNode.setWidth(value)
      this.requestRender()
    }
  }

  public get height(): number {
    return this._heightValue
  }

  public set height(value: number | "auto" | `${number}%`) {
    if (isDimensionType(value)) {
      this._height = value
      this.layoutNode.setHeight(value)
      this.requestRender()
    }
  }

  public get zIndex(): number {
    return this._zIndex
  }

  public set zIndex(value: number) {
    if (this._zIndex !== value) {
      this._zIndex = value
      this.parent?.requestZIndexSort()
    }
  }

  public requestZIndexSort(): void {
    this.needsZIndexSort = true
  }

  private ensureZIndexSorted(): void {
    if (this.needsZIndexSort) {
      this.children.sort((a, b) => (a.zIndex > b.zIndex ? 1 : a.zIndex < b.zIndex ? -1 : 0))
      this.needsZIndexSort = false
    }
  }

  private setupYogaProperties(options: ComponentProps): void {
    const node = this.layoutNode.yogaNode

    if (isFlexBasisType(options.flexBasis)) {
      node.setFlexBasis(options.flexBasis)
    }

    if (isSizeType(options.minWidth)) {
      node.setMinWidth(options.minWidth)
    }
    if (isSizeType(options.minHeight)) {
      node.setMinHeight(options.minHeight)
    }

    if (options.flexGrow !== undefined) {
      node.setFlexGrow(options.flexGrow)
    } else {
      node.setFlexGrow(0)
    }

    if (options.flexShrink !== undefined) {
      node.setFlexShrink(options.flexShrink)
    } else {
      const shrinkValue = options.flexGrow && options.flexGrow > 0 ? 1 : 0
      node.setFlexShrink(shrinkValue)
    }

    if (options.flexDirection !== undefined) {
      node.setFlexDirection(parseFlexDirection(options.flexDirection))
    }
    if (options.flexWrap !== undefined) {
      node.setFlexWrap(parseWrap(options.flexWrap))
    }
    if (options.alignItems !== undefined) {
      node.setAlignItems(parseAlign(options.alignItems))
    }
    if (options.justifyContent !== undefined) {
      node.setJustifyContent(parseJustify(options.justifyContent))
    }
    if (options.alignSelf !== undefined) {
      node.setAlignSelf(parseAlign(options.alignSelf))
    }

    if (isDimensionType(options.width)) {
      this._width = options.width
      this.layoutNode.setWidth(options.width)
    }
    if (isDimensionType(options.height)) {
      this._height = options.height
      this.layoutNode.setHeight(options.height)
    }

    this._positionType = options.position === "absolute" ? "absolute" : "relative"
    if (this._positionType !== "relative") {
      node.setPositionType(parsePositionType(this._positionType))
    }

    this._overflow = options.overflow === "hidden" ? "hidden" : options.overflow === "scroll" ? "scroll" : "visible"
    if (this._overflow !== "visible") {
      node.setOverflow(parseOverflow(this._overflow))
    }

    // TODO: flatten position properties internally as well
    const hasPositionProps =
      options.top !== undefined ||
      options.right !== undefined ||
      options.bottom !== undefined ||
      options.left !== undefined
    if (hasPositionProps) {
      this._position = {
        top: options.top,
        right: options.right,
        bottom: options.bottom,
        left: options.left,
      }
      this.updateYogaPosition(this._position)
    }

    if (isSizeType(options.maxWidth)) {
      node.setMaxWidth(options.maxWidth)
    }
    if (isSizeType(options.maxHeight)) {
      node.setMaxHeight(options.maxHeight)
    }

    this.setupMarginAndPadding(options)
  }

  private setupMarginAndPadding(options: ComponentProps): void {
    const node = this.layoutNode.yogaNode

    if (isMarginType(options.margin)) {
      node.setMargin(Edge.Top, options.margin)
      node.setMargin(Edge.Right, options.margin)
      node.setMargin(Edge.Bottom, options.margin)
      node.setMargin(Edge.Left, options.margin)
    }

    if (isMarginType(options.marginTop)) {
      node.setMargin(Edge.Top, options.marginTop)
    }
    if (isMarginType(options.marginRight)) {
      node.setMargin(Edge.Right, options.marginRight)
    }
    if (isMarginType(options.marginBottom)) {
      node.setMargin(Edge.Bottom, options.marginBottom)
    }
    if (isMarginType(options.marginLeft)) {
      node.setMargin(Edge.Left, options.marginLeft)
    }

    if (isPaddingType(options.padding)) {
      node.setPadding(Edge.Top, options.padding)
      node.setPadding(Edge.Right, options.padding)
      node.setPadding(Edge.Bottom, options.padding)
      node.setPadding(Edge.Left, options.padding)
    }

    if (isPaddingType(options.paddingTop)) {
      node.setPadding(Edge.Top, options.paddingTop)
    }
    if (isPaddingType(options.paddingRight)) {
      node.setPadding(Edge.Right, options.paddingRight)
    }
    if (isPaddingType(options.paddingBottom)) {
      node.setPadding(Edge.Bottom, options.paddingBottom)
    }
    if (isPaddingType(options.paddingLeft)) {
      node.setPadding(Edge.Left, options.paddingLeft)
    }
  }

  set position(positionType: PositionTypeString) {
    if (!isPositionTypeType(positionType) || this._positionType === positionType) return

    this._positionType = positionType
    this.layoutNode.yogaNode.setPositionType(parsePositionType(positionType))
    this.requestRender()
  }

  set overflow(overflow: OverflowString) {
    if (!isOverflowType(overflow) || this._overflow === overflow) return

    this._overflow = overflow
    this.layoutNode.yogaNode.setOverflow(parseOverflow(overflow))
    this.requestRender()
  }

  public setPosition(position: Position): void {
    this._position = { ...this._position, ...position }
    this.updateYogaPosition(position)
  }

  private updateYogaPosition(position: Position): void {
    const node = this.layoutNode.yogaNode
    const { top, right, bottom, left } = position

    if (isPositionType(top)) {
      if (top === "auto") {
        node.setPositionAuto(Edge.Top)
      } else {
        node.setPosition(Edge.Top, top)
      }
    }
    if (isPositionType(right)) {
      if (right === "auto") {
        node.setPositionAuto(Edge.Right)
      } else {
        node.setPosition(Edge.Right, right)
      }
    }
    if (isPositionType(bottom)) {
      if (bottom === "auto") {
        node.setPositionAuto(Edge.Bottom)
      } else {
        node.setPosition(Edge.Bottom, bottom)
      }
    }
    if (isPositionType(left)) {
      if (left === "auto") {
        node.setPositionAuto(Edge.Left)
      } else {
        node.setPosition(Edge.Left, left)
      }
    }
    this.requestRender()
  }

  public set flexGrow(grow: number) {
    this.layoutNode.yogaNode.setFlexGrow(grow)
    this.requestRender()
  }

  public set flexShrink(shrink: number) {
    this.layoutNode.yogaNode.setFlexShrink(shrink)
    this.requestRender()
  }

  public set flexDirection(direction: FlexDirectionString) {
    this.layoutNode.yogaNode.setFlexDirection(parseFlexDirection(direction))
    this.requestRender()
  }

  public set flexWrap(wrap: WrapString) {
    this.layoutNode.yogaNode.setFlexWrap(parseWrap(wrap))
    this.requestRender()
  }

  public set alignItems(alignItems: AlignString) {
    this.layoutNode.yogaNode.setAlignItems(parseAlign(alignItems))
    this.requestRender()
  }

  public set justifyContent(justifyContent: JustifyString) {
    this.layoutNode.yogaNode.setJustifyContent(parseJustify(justifyContent))
    this.requestRender()
  }

  public set alignSelf(alignSelf: AlignString) {
    this.layoutNode.yogaNode.setAlignSelf(parseAlign(alignSelf))
    this.requestRender()
  }

  public set flexBasis(basis: number | "auto" | undefined) {
    if (isFlexBasisType(basis)) {
      this.layoutNode.yogaNode.setFlexBasis(basis)
      this.requestRender()
    }
  }

  public set minWidth(minWidth: number | `${number}%` | undefined) {
    if (isSizeType(minWidth)) {
      this.layoutNode.yogaNode.setMinWidth(minWidth)
      this.requestRender()
    }
  }

  public set maxWidth(maxWidth: number | `${number}%` | undefined) {
    if (isSizeType(maxWidth)) {
      this.layoutNode.yogaNode.setMaxWidth(maxWidth)
      this.requestRender()
    }
  }

  public set minHeight(minHeight: number | `${number}%` | undefined) {
    if (isSizeType(minHeight)) {
      this.layoutNode.yogaNode.setMinHeight(minHeight)
      this.requestRender()
    }
  }

  public set maxHeight(maxHeight: number | `${number}%` | undefined) {
    if (isSizeType(maxHeight)) {
      this.layoutNode.yogaNode.setMaxHeight(maxHeight)
      this.requestRender()
    }
  }

  public set margin(margin: number | "auto" | `${number}%` | undefined) {
    if (isMarginType(margin)) {
      const node = this.layoutNode.yogaNode
      node.setMargin(Edge.Top, margin)
      node.setMargin(Edge.Right, margin)
      node.setMargin(Edge.Bottom, margin)
      node.setMargin(Edge.Left, margin)
      this.requestRender()
    }
  }

  public set marginTop(margin: number | "auto" | `${number}%` | undefined) {
    if (isMarginType(margin)) {
      this.layoutNode.yogaNode.setMargin(Edge.Top, margin)
      this.requestRender()
    }
  }

  public set marginRight(margin: number | "auto" | `${number}%` | undefined) {
    if (isMarginType(margin)) {
      this.layoutNode.yogaNode.setMargin(Edge.Right, margin)
      this.requestRender()
    }
  }

  public set marginBottom(margin: number | "auto" | `${number}%` | undefined) {
    if (isMarginType(margin)) {
      this.layoutNode.yogaNode.setMargin(Edge.Bottom, margin)
      this.requestRender()
    }
  }

  public set marginLeft(margin: number | "auto" | `${number}%` | undefined) {
    if (isMarginType(margin)) {
      this.layoutNode.yogaNode.setMargin(Edge.Left, margin)
      this.requestRender()
    }
  }

  public set padding(padding: number | `${number}%` | undefined) {
    if (isPaddingType(padding)) {
      const node = this.layoutNode.yogaNode
      node.setPadding(Edge.Top, padding)
      node.setPadding(Edge.Right, padding)
      node.setPadding(Edge.Bottom, padding)
      node.setPadding(Edge.Left, padding)
      this.requestRender()
    }
  }

  public set paddingTop(padding: number | `${number}%` | undefined) {
    if (isPaddingType(padding)) {
      this.layoutNode.yogaNode.setPadding(Edge.Top, padding)
      this.requestRender()
    }
  }

  public set paddingRight(padding: number | `${number}%` | undefined) {
    if (isPaddingType(padding)) {
      this.layoutNode.yogaNode.setPadding(Edge.Right, padding)
      this.requestRender()
    }
  }

  public set paddingBottom(padding: number | `${number}%` | undefined) {
    if (isPaddingType(padding)) {
      this.layoutNode.yogaNode.setPadding(Edge.Bottom, padding)
      this.requestRender()
    }
  }

  public set paddingLeft(padding: number | `${number}%` | undefined) {
    if (isPaddingType(padding)) {
      this.layoutNode.yogaNode.setPadding(Edge.Left, padding)
      this.requestRender()
    }
  }

  public getLayoutNode(): TrackedNode {
    return this.layoutNode
  }

  public updateFromLayout(): void {
    const layout = this.layoutNode.yogaNode.getComputedLayout()

    this._x = layout.left
    this._y = layout.top

    const newWidth = Math.max(layout.width, 1)
    const newHeight = Math.max(layout.height, 1)
    const sizeChanged = this.width !== newWidth || this.height !== newHeight

    this._widthValue = newWidth
    this._heightValue = newHeight

    if (sizeChanged) {
      this.onLayoutResize(newWidth, newHeight)
    }
  }

  protected onLayoutResize(width: number, height: number): void {
    if (this._visible) {
      this.handleFrameBufferResize(width, height)
      this.onResize(width, height)
      this.requestRender()
    }
  }

  protected handleFrameBufferResize(width: number, height: number): void {
    if (!this.buffered) return

    if (width <= 0 || height <= 0) {
      return
    }

    if (this.frameBuffer) {
      this.frameBuffer.resize(width, height)
    } else {
      this.createFrameBuffer()
    }
  }

  protected createFrameBuffer(): void {
    const w = this.width
    const h = this.height

    if (w <= 0 || h <= 0) {
      return
    }

    try {
      this.frameBuffer = OptimizedBuffer.create(w, h, {
        respectAlpha: true,
      })
    } catch (error) {
      console.error(`Failed to create frame buffer for ${this.id}:`, error)
      this.frameBuffer = null
    }
  }

  protected onResize(width: number, height: number): void {
    this.onSizeChange?.()
    this.emit("resize")
    // Override in subclasses for additional resize logic
  }

  private replaceParent(obj: Component) {
    if (obj.parent) {
      obj.parent.remove(obj.id)
    }
    obj.parent = this
  }

  public add(obj: Component, index?: number): number {
    if (this.componentMap.has(obj.id)) {
      console.warn(`A component with id ${obj.id} already exists in ${this.id}, removing it`)
      this.remove(obj.id)
    }

    this.replaceParent(obj)

    const childLayoutNode = obj.getLayoutNode()
    let insertedIndex: number
    if (index !== undefined) {
      this.children.splice(index, 0, obj)
      insertedIndex = this.layoutNode.insertChild(childLayoutNode, index)
    } else {
      this.children.push(obj)
      insertedIndex = this.layoutNode.addChild(childLayoutNode)
    }
    this.needsZIndexSort = true
    this.componentMap.set(obj.id, obj)

    if (obj._liveCount > 0) {
      this.propagateLiveCount(obj._liveCount)
    }

    this.requestRender()

    this.emit("child:added", obj)

    return insertedIndex
  }

  insertBefore(obj: Component, anchor?: Component): number {
    if (!anchor) {
      return this.add(obj)
    }

    if (!this.componentMap.has(anchor.id)) {
      throw new Error("Anchor does not exist")
    }

    const anchorIndex = this.children.indexOf(anchor)
    if (anchorIndex === -1) {
      throw new Error("Anchor does not exist")
    }

    return this.add(obj, anchorIndex)
  }

  public getRenderable(id: string): Component | undefined {
    return this.componentMap.get(id)
  }

  public remove(id: string): void {
    if (!id) {
      return
    }
    if (this.componentMap.has(id)) {
      const obj = this.componentMap.get(id)
      if (obj) {
        if (obj._liveCount > 0) {
          this.propagateLiveCount(-obj._liveCount)
        }

        const childLayoutNode = obj.getLayoutNode()
        this.layoutNode.removeChild(childLayoutNode)
        this.requestRender()

        obj.onRemove()
        obj.parent = null
      }
      this.componentMap.delete(id)

      const index = this.children.findIndex((c) => c.id === id)
      if (index !== -1) {
        this.children.splice(index, 1)
      }
      this.emit("child:removed", id)
    }
  }

  protected onRemove(): void {
    // Default implementation: do nothing
    // Override this method to provide custom removal logic
  }

  public getChildren(): Component[] {
    return [...this.children]
  }

  /**
   * Find a descendant component by ID
   * @param id - The ID to search for
   * @returns The component if found, undefined otherwise
   */
  public findDescendantById(id: string): Component | undefined {
    // Check direct children first
    for (const child of this.children) {
      if (child.id === id) {
        return child;
      }
    }

    // Recursively check descendants
    for (const child of this.children) {
      const found = child.findDescendantById(id);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  public render(buffer: OptimizedBuffer, deltaTime: number): void {
    if (!this.visible) return;

    this.beforeRender();
    this.updateFromLayout();

    const renderBuffer = this.buffered && this.frameBuffer ? this.frameBuffer : buffer;

    if (this.renderBefore) {
      this.renderBefore.call(this, renderBuffer, deltaTime)
    }

    this.renderSelf(renderBuffer, deltaTime);

    if (this.renderAfter) {
      this.renderAfter.call(this, renderBuffer, deltaTime)
    }

    this.markClean();
    this._ctx.addToHitGrid(this.x, this.y, this.width, this.height, this.num);
    this.ensureZIndexSorted();

    for (const child of this.children) {
      child.render(renderBuffer, deltaTime);
    }

    if (this.buffered && this.frameBuffer) {
      buffer.drawFrameBuffer(this.x, this.y, this.frameBuffer)
    }
  }

  protected beforeRender(): void {
    // Default implementation: do nothing
    // Override this method to provide custom rendering
  }

  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // Default implementation: do nothing
    // Override this method to provide custom rendering
  }

  public destroy(): void {
    if (this.parent) {
      this.parent.remove(this.id)
    }

    if (this.frameBuffer) {
      this.frameBuffer.destroy()
      this.frameBuffer = null
    }

    for (const child of this.children) {
      child.parent = null
      child.destroy()
    }

    this.children = []
    this.componentMap.clear()
    Component.componentsByNumber.delete(this.num)

    this.layoutNode.destroy()
    this.blur()
    this.removeAllListeners()

    this.destroySelf()
  }

  public destroyRecursively(): void {
    this.destroy()
    for (const child of this.children) {
      child.destroyRecursively()
    }
  }

  protected destroySelf(): void {
    // Default implementation: do nothing else
    // Override this method to provide custom cleanup
  }

  public processMouseEvent(event: MouseEvent): void {
    this._mouseListener?.call(this, event)
    this._mouseListeners[event.type]?.(event)
    this.onMouseEvent(event)

    if (this.parent && !event.defaultPrevented) {
      this.parent.processMouseEvent(event)
    }
  }

  protected onMouseEvent(event: MouseEvent): void {
    // Default implementation: do nothing
    // Override this method to provide custom event handling
  }

  public set onMouse(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListener = handler
    else this._mouseListener = null
  }

  public set onMouseDown(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["down"] = handler
    else delete this._mouseListeners["down"]
  }

  public set onMouseUp(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["up"] = handler
    else delete this._mouseListeners["up"]
  }

  public set onMouseMove(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["move"] = handler
    else delete this._mouseListeners["move"]
  }

  public set onMouseDrag(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["drag"] = handler
    else delete this._mouseListeners["drag"]
  }

  public set onMouseDragEnd(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["drag-end"] = handler
    else delete this._mouseListeners["drag-end"]
  }

  public set onMouseDrop(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["drop"] = handler
    else delete this._mouseListeners["drop"]
  }

  public set onMouseOver(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["over"] = handler
    else delete this._mouseListeners["over"]
  }

  public set onMouseOut(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["out"] = handler
    else delete this._mouseListeners["out"]
  }

  public set onMouseScroll(handler: ((event: MouseEvent) => void) | undefined) {
    if (handler) this._mouseListeners["scroll"] = handler
    else delete this._mouseListeners["scroll"]
  }

  public set onKeyDown(handler: ((key: ParsedKey) => void) | undefined) {
    if (handler) this._keyListeners["down"] = handler
    else delete this._keyListeners["down"]
  }

  public get onKeyDown(): ((key: ParsedKey) => void) | undefined {
    return this._keyListeners["down"]
  }

  public set onSizeChange(handler: (() => void) | undefined) {
    this._sizeChangeListener = handler
  }
  public get onSizeChange(): (() => void) | undefined {
    return this._sizeChangeListener
  }

  private applyEventOptions(options: ComponentProps): void {
    if (options.onMouseDown) this.onMouseDown = options.onMouseDown
    if (options.onMouseUp) this.onMouseUp = options.onMouseUp
    if (options.onMouseMove) this.onMouseMove = options.onMouseMove
    if (options.onMouseDrag) this.onMouseDrag = options.onMouseDrag
    if (options.onMouseDragEnd) this.onMouseDragEnd = options.onMouseDragEnd
    if (options.onMouseDrop) this.onMouseDrop = options.onMouseDrop
    if (options.onMouseOver) this.onMouseOver = options.onMouseOver
    if (options.onMouseOut) this.onMouseOut = options.onMouseOut
    if (options.onMouseScroll) this.onMouseScroll = options.onMouseScroll
    if (options.onKeyDown) this.onKeyDown = options.onKeyDown
    if (options.onSizeChange) this.onSizeChange = options.onSizeChange
  }
}

export class RootComponent extends Component {
  private yogaConfig: Config;

  constructor(ctx: RenderContext) {
    super(ctx, { id: "__root__", zIndex: 0, visible: true, width: ctx.width, height: ctx.height, enableLayout: true })

    this.yogaConfig = Yoga.Config.create()
    this.yogaConfig.setUseWebDefaults(false)
    this.yogaConfig.setPointScaleFactor(1)

    if (this.layoutNode) {
      this.layoutNode.destroy();
    }

    this.layoutNode = createTrackedNode({}, this.yogaConfig);
    this.layoutNode.setWidth(ctx.width)
    this.layoutNode.setHeight(ctx.height)
    this.layoutNode.yogaNode.setFlexDirection(FlexDirection.Column);

    this.calculateLayout();
  }

  protected propagateLiveCount(delta: number): void {
    const oldCount = this._liveCount
    this._liveCount += delta

    if (oldCount === 0 && this._liveCount > 0) {
      this._ctx.requestLive()
    } else if (oldCount > 0 && this._liveCount === 0) {
      this._ctx.dropLive()
    }
  }

  public calculateLayout(): number {
    this.layoutNode.yogaNode.calculateLayout(this.width, 'auto', Direction.LTR);
    this.emit(LayoutEvents.LAYOUT_CHANGED);
    return this.layoutNode.yogaNode.getComputedHeight();
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    this.emit(LayoutEvents.RESIZED, { width, height });
  }

  protected beforeRender(): void {
    if (this.layoutNode.yogaNode.isDirty()) {
      this.calculateLayout();
    }
  }

  protected destroySelf(): void {
    if (this.layoutNode) {
      this.layoutNode.destroy();
    }

    try {
      this.yogaConfig.free();
    } catch (error) {
      // Config might already be freed
    }

    super.destroySelf();
  }
}
