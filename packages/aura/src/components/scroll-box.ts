import { BoxComponent, type BoxProps } from "./box.js"
import { RenderContext, type ParsedKey } from "../types.js"
import { type ScrollUnit, ScrollBarComponent, type ScrollBarProps } from "./scroll-bar.js"

// import type { VNode } from "./composition/vnode.js"
import type { MouseEvent } from "../renderer/renderer.js"
import type { Component, ComponentProps } from "../component.js"

class ContentComponent extends BoxComponent {
  private viewport: BoxComponent

  constructor(ctx: RenderContext, viewport: BoxComponent, options: ComponentProps<BoxComponent>) {
    super(ctx, options)
    this.viewport = viewport
  }

  protected shouldRenderChild(child: Component): boolean {
    const viewportLeft = this.viewport.x
    const viewportTop = this.viewport.y
    const viewportRight = this.viewport.x + this.viewport.width
    const viewportBottom = this.viewport.y + this.viewport.height

    const childLeft = child.x
    const childTop = child.y
    const childRight = child.x + child.width
    const childBottom = child.y + child.height

    // Check if child intersects with viewport (with some padding for safety)
    const padding = 10
    const intersects =
      childLeft < viewportRight + padding &&
      childRight > viewportLeft - padding &&
      childTop < viewportBottom + padding &&
      childBottom > viewportTop - padding

    return intersects
  }
}

export interface ScrollBoxProps extends BoxProps<ScrollBoxComponent> {
  rootOptions?: BoxProps
  wrapperOptions?: BoxProps
  viewportOptions?: BoxProps
  contentOptions?: BoxProps
  scrollbarOptions?: Omit<ScrollBarProps, "orientation">
  verticalScrollbarOptions?: Omit<ScrollBarProps, "orientation">
  horizontalScrollbarOptions?: Omit<ScrollBarProps, "orientation">
}

export class ScrollBoxComponent extends BoxComponent {
  public readonly wrapper: BoxComponent
  public readonly viewport: BoxComponent
  public readonly content: ContentComponent
  public readonly horizontalScrollBar: ScrollBarComponent
  public readonly verticalScrollBar: ScrollBarComponent

  protected focusable: boolean = true

  get scrollTop(): number {
    return this.verticalScrollBar.scrollPosition
  }

  set scrollTop(value: number) {
    this.verticalScrollBar.scrollPosition = value
  }

  get scrollLeft(): number {
    return this.horizontalScrollBar.scrollPosition
  }

  set scrollLeft(value: number) {
    this.horizontalScrollBar.scrollPosition = value
  }

  get scrollWidth(): number {
    return this.horizontalScrollBar.scrollSize
  }

  get scrollHeight(): number {
    return this.verticalScrollBar.scrollSize
  }

  constructor(
    ctx: RenderContext,
    {
      wrapperOptions,
      viewportOptions,
      contentOptions,
      rootOptions,
      scrollbarOptions,
      verticalScrollbarOptions,
      horizontalScrollbarOptions,
      ...options
    }: ScrollBoxProps,
  ) {
    // Root
    super(ctx, {
      flexShrink: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
      ...(options as BoxProps),
      ...(rootOptions as BoxProps),
    })

    this.wrapper = new BoxComponent(ctx, {
      flexDirection: "column",
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: "auto",
      maxHeight: "100%",
      maxWidth: "100%",
      ...wrapperOptions,
    })
    super.add(this.wrapper)

    this.viewport = new BoxComponent(ctx, {
      flexDirection: "column",
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: "auto",
      minWidth: 0,
      minHeight: 0,
      maxHeight: "100%",
      maxWidth: "100%",
      overflow: "scroll",
      onSizeChange: () => {
        this.recalculateBarProps()
      },
      ...viewportOptions,
    })
    this.wrapper.add(this.viewport)

    this.content = new ContentComponent(ctx, this.viewport, {
      minWidth: "100%",
      minHeight: "100%",
      alignSelf: "flex-start",
      onSizeChange: () => {
        this.recalculateBarProps()
      },
      ...contentOptions,
    })
    this.viewport.add(this.content)

    this.verticalScrollBar = new ScrollBarComponent(ctx, {
      ...scrollbarOptions,
      ...verticalScrollbarOptions,
      arrowOptions: {
        ...scrollbarOptions?.arrowOptions,
        ...verticalScrollbarOptions?.arrowOptions,
      },
      orientation: "vertical",
      onChange: (position) => {
        this.content.translateY = -position
      },
    })
    super.add(this.verticalScrollBar)

    this.horizontalScrollBar = new ScrollBarComponent(ctx, {
      ...scrollbarOptions,
      ...horizontalScrollbarOptions,
      arrowOptions: {
        ...scrollbarOptions?.arrowOptions,
        ...horizontalScrollbarOptions?.arrowOptions,
      },
      orientation: "horizontal",
      onChange: (position) => {
        this.content.translateX = -position
      },
    })
    this.wrapper.add(this.horizontalScrollBar)

    this.recalculateBarProps()
  }

  public scrollBy(delta: number | { x: number; y: number }, unit: ScrollUnit = "absolute"): void {
    if (typeof delta === "number") {
      this.verticalScrollBar.scrollBy(delta, unit)
    } else {
      this.verticalScrollBar.scrollBy(delta.y, unit)
      this.horizontalScrollBar.scrollBy(delta.x, unit)
    }
  }

  public scrollTo(position: number | { x: number; y: number }): void {
    if (typeof position === "number") {
      this.scrollTop = position
    } else {
      this.scrollTop = position.y
      this.scrollLeft = position.x
    }
  }

  public add(obj: Component/* | VNode<any, any[]>*/, index?: number): number {
    return this.content.add(obj, index)
  }

  public remove(id: string): void {
    this.content.remove(id)
  }

  protected onMouseEvent(event: MouseEvent): void {
    if (event.type === "scroll") {
      let dir = event.scroll?.direction
      if (event.modifiers.shift)
        dir = dir === "up" ? "left" : dir === "down" ? "right" : dir === "right" ? "down" : "up"

      if (dir === "up") this.scrollTop -= event.scroll?.delta ?? 0
      else if (dir === "down") this.scrollTop += event.scroll?.delta ?? 0
      else if (dir === "left") this.scrollLeft -= event.scroll?.delta ?? 0
      else if (dir === "right") this.scrollLeft += event.scroll?.delta ?? 0
    }
  }

  public handleKeyPress(key: ParsedKey | string): boolean {
    if (this.verticalScrollBar.handleKeyPress(key)) return true
    if (this.horizontalScrollBar.handleKeyPress(key)) return true
    return false
  }

  private recalculateBarProps(): void {
    this.verticalScrollBar.scrollSize = this.content.height
    this.verticalScrollBar.viewportSize = this.viewport.height
    this.horizontalScrollBar.scrollSize = this.content.width
    this.horizontalScrollBar.viewportSize = this.viewport.width
  }

  // Setters for reactive properties
  public set rootOptions(options: ScrollBoxProps["rootOptions"]) {
    Object.assign(this, options)
    this.requestRender()
  }

  public set wrapperOptions(options: ScrollBoxProps["wrapperOptions"]) {
    Object.assign(this.wrapper, options)
    this.requestRender()
  }

  public set viewportOptions(options: ScrollBoxProps["viewportOptions"]) {
    Object.assign(this.viewport, options)
    this.requestRender()
  }

  public set contentOptions(options: ScrollBoxProps["contentOptions"]) {
    Object.assign(this.content, options)
    this.requestRender()
  }

  public set scrollbarOptions(options: ScrollBoxProps["scrollbarOptions"]) {
    Object.assign(this.verticalScrollBar, options)
    Object.assign(this.horizontalScrollBar, options)
    this.requestRender()
  }

  public set verticalScrollbarOptions(options: ScrollBoxProps["verticalScrollbarOptions"]) {
    Object.assign(this.verticalScrollBar, options)
    this.requestRender()
  }

  public set horizontalScrollbarOptions(options: ScrollBoxProps["horizontalScrollbarOptions"]) {
    Object.assign(this.horizontalScrollBar, options)
    this.requestRender()
  }
}