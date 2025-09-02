import { MouseEvent } from "../renderer/renderer.js"
import { BoxComponent, type BoxProps } from "./box.js"
import { RenderContext, type ParsedKey } from "../types.js"
import { type ScrollUnit, ScrollBarComponent, type ScrollBarProps } from "./scroll-bar.js"

export interface ScrollBoxProps extends BoxProps<ScrollBarComponent> {
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
  public readonly content: BoxComponent
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
    this.add(this.wrapper)

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

    this.content = new BoxComponent(ctx, {
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
      orientation: "vertical",
      onChange: (position) => {
        this.content.translateY = -position
      },
    })
    this.add(this.verticalScrollBar)

    this.horizontalScrollBar = new ScrollBarComponent(ctx, {
      ...scrollbarOptions,
      ...horizontalScrollbarOptions,
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
}
